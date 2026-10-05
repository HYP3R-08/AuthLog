// AuthLog — STM32 reader
//
// Detects presence with a Time-of-Flight sensor, reads a UUID from an NFC tag,
// asks the gateway (ESP8266 or UNIHIKER K10) to verify it, and drives the LEDs
// and the lock according to the verdict.
//
// This board owns every physical output. The gateway only answers the question
// "is this UUID authorized?" — it never actuates anything itself.
//
// Wire protocol (UART to the gateway, 115200 8N1):
//   out  UUID:<36-char uuid>\n
//   out  PRESENCE:NEAR\n | PRESENCE:AWAY\n   (someone entered / left the ToF window)
//   in   AUTH:OK\n | AUTH:NO\n | AUTH:ERR\n
//
// The PRESENCE lines let a gateway with a screen greet the person before they
// present the phone. A gateway without one ignores them: both gateways act only
// on lines that start with "UUID:".
//
// AUTH:ERR (could not verify) is deliberately not treated as AUTH:NO: the lock
// stays shut either way, but the operator sees a different signal, because
// "denied" and "broken" are different problems.

#include "ST25DVSensor.h"
#include <vl53l4cd_class.h>
#include <Wire.h>

#define SerialDebug      Serial
#define DEV_I2C          Wire

// On the Nucleo-F401RE, `Serial` IS `Serial2`: both are USART2 on PA2/PA3,
// wired to the ST-LINK USB port. Using it for the gateway sends the UUID to the
// PC instead of the ESP8266. USART6 on PA11 (TX) / PA12 (RX) is free: the pins
// sit on the morpho connector CN10, away from the shields' Arduino headers.
HardwareSerial SerialGateway(PA12, PA11);  // (RX, TX)

namespace {

constexpr uint32_t SERIAL_BAUD              = 115200;
constexpr uint32_t I2C_CLOCK_HZ             = 100000;
constexpr int      ST25DV_GPO_PIN           = 12;

constexpr uint8_t  LED_GRANTED_PIN          = D7;
constexpr uint8_t  LED_DENIED_PIN           = D6;
// Not wired on the prototype, which drives the LEDs only. Check this against
// the build before connecting a relay to it.
constexpr uint8_t  LOCK_RELAY_PIN           = D5;

// Presence window. Below the minimum the reading is unreliable; above the
// maximum the person is walking past rather than presenting a tag. Both values
// were tuned on the prototype enclosure and should be re-measured if the reader
// is remounted.
constexpr uint16_t PRESENCE_MIN_MM          = 70;
constexpr uint16_t PRESENCE_MAX_MM          = 500;

constexpr uint32_t LOCK_OPEN_MS             = 3000;
constexpr uint32_t VERDICT_DISPLAY_MS       = 2000;
constexpr uint32_t VERDICT_TIMEOUT_MS       = 15000;
// A tag is accepted again only after this long, so that leaving it on the
// reader does not retrigger. Without it a UUID could never be presented twice.
constexpr uint32_t TAG_COOLDOWN_MS          = 5000;
constexpr uint32_t POLL_INTERVAL_MS         = 100;
constexpr uint32_t ERROR_BLINK_INTERVAL_MS  = 250;
// How long a presence reading stays valid. The sensor only publishes a sample
// every timing budget, so requiring a fresh one on the same poll that reads the
// tag would drop taps that happen between samples.
constexpr uint32_t PRESENCE_HOLD_MS         = 1000;

constexpr uint8_t  UUID_LENGTH              = 36;
constexpr size_t   LINE_BUFFER_SIZE         = 32;  // "AUTH:" + verdict + slack

const char PROTOCOL_UUID_PREFIX[] = "UUID:";
const char RESPONSE_GRANTED[]     = "AUTH:OK";
const char RESPONSE_DENIED[]      = "AUTH:NO";
const char RESPONSE_ERROR[]       = "AUTH:ERR";
const char EVENT_PRESENCE_NEAR[]  = "PRESENCE:NEAR";
const char EVENT_PRESENCE_AWAY[]  = "PRESENCE:AWAY";

enum class State : uint8_t {
  Idle,           // waiting for someone to show up
  AwaitingVerdict,
  ShowingGranted,
  ShowingDenied,
  Cooldown,
};

ST25DV st25dv(ST25DV_GPO_PIN, -1, &DEV_I2C);
VL53L4CD tofSensor(&DEV_I2C, -1);

State state = State::Idle;
uint32_t stateEnteredAt = 0;
String lastUuid = "";
bool tagConsumed = false;
char lineBuffer[LINE_BUFFER_SIZE];
size_t lineLength = 0;

bool presenceDetected = false;
uint32_t presenceSeenAt = 0;
bool presenceReported = false;

void enterState(State next) {
  state = next;
  stateEnteredAt = millis();
}

bool stateElapsed(uint32_t ms) {
  return millis() - stateEnteredAt >= ms;
}

void setOutputs(bool granted, bool denied, bool lockOpen) {
  digitalWrite(LED_GRANTED_PIN, granted ? HIGH : LOW);
  digitalWrite(LED_DENIED_PIN, denied ? HIGH : LOW);
  digitalWrite(LOCK_RELAY_PIN, lockOpen ? HIGH : LOW);
}

// Hardware that failed to initialise cannot be recovered from software, but the
// device must still say so: a board that is merely dark is indistinguishable
// from a board with no power. Blink both LEDs forever instead of halting
// silently.
void haltWithErrorSignal(const char* reason) {
  SerialDebug.print(F("fatal: "));
  SerialDebug.println(reason);

  setOutputs(false, false, false);
  for (;;) {
    digitalWrite(LED_GRANTED_PIN, HIGH);
    digitalWrite(LED_DENIED_PIN, HIGH);
    delay(ERROR_BLINK_INTERVAL_MS);
    digitalWrite(LED_GRANTED_PIN, LOW);
    digitalWrite(LED_DENIED_PIN, LOW);
    delay(ERROR_BLINK_INTERVAL_MS);
  }
}

// Consumes a ToF sample when one is available and records the result. Called
// every poll; the sensor decides how often it actually has something to say.
void updatePresence() {
  uint8_t ready = 0;
  tofSensor.VL53L4CD_CheckForDataReady(&ready);
  if (!ready) {
    return;
  }

  VL53L4CD_Result_t result;
  tofSensor.VL53L4CD_GetResult(&result);
  tofSensor.VL53L4CD_ClearInterrupt();

  const uint16_t distance = result.distance_mm;
  presenceDetected = distance > PRESENCE_MIN_MM && distance < PRESENCE_MAX_MM;
  presenceSeenAt = millis();
}

// True while the last in-range sample is still recent. Decoupled from the
// sensor's cadence so a tag presented between two samples is not ignored.
bool isPersonPresent() {
  return presenceDetected && (millis() - presenceSeenAt < PRESENCE_HOLD_MS);
}

// Sends one line per change, not one per poll: the gateway only needs to know
// when someone arrives or leaves, and a line every 100 ms would flood the UART
// it also uses for verdicts.
void reportPresenceChange() {
  const bool present = isPersonPresent();
  if (present == presenceReported) {
    return;
  }
  presenceReported = present;
  SerialGateway.println(present ? EVENT_PRESENCE_NEAR : EVENT_PRESENCE_AWAY);
}

bool isValidUuid(const String& uuid) {
  if (uuid.length() != UUID_LENGTH) {
    return false;
  }
  for (uint8_t i = 0; i < UUID_LENGTH; i++) {
    const char c = uuid[i];
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (c != '-') return false;
    } else if (!isHexadecimalDigit(c)) {
      return false;
    }
  }
  return true;
}

// Returns an empty string when there is no tag or the tag is unusable. The tag
// is written by a phone, so its content is untrusted: validate before sending.
String readTagUuid() {
  String uri;
  if (st25dv.readURI(&uri) != 0) {
    return "";
  }

  uri.trim();
  if (uri.startsWith("https://")) {
    uri = uri.substring(8);
  } else if (uri.startsWith("http://")) {
    uri = uri.substring(7);
  }

  return isValidUuid(uri) ? uri : "";
}

// The "tag" is the ST25DV's own EEPROM: the phone writes the UUID into it and
// it stays there after the phone leaves. Unless it is overwritten, every later
// presence reading would find the same UUID and send it again. Replacing it
// with a value that fails isValidUuid() makes each phone write count once.
bool consumeTag() {
  return st25dv.writeURI("https://", "consumed", "") == 0;
}

void requestVerification(const String& uuid) {
  SerialGateway.print(PROTOCOL_UUID_PREFIX);
  SerialGateway.println(uuid);
}

void handleVerdict(const char* line) {
  if (strcmp(line, RESPONSE_GRANTED) == 0) {
    setOutputs(true, false, true);
    enterState(State::ShowingGranted);
  } else if (strcmp(line, RESPONSE_DENIED) == 0) {
    setOutputs(false, true, false);
    enterState(State::ShowingDenied);
  } else if (strcmp(line, RESPONSE_ERROR) == 0) {
    // Verification failed. The lock stays shut, and the red LED reports it —
    // but the debug line distinguishes it from a genuine rejection.
    SerialDebug.println(F("gateway could not verify"));
    setOutputs(false, true, false);
    enterState(State::ShowingDenied);
  }
}

void pollGateway() {
  while (SerialGateway.available()) {
    const char c = static_cast<char>(SerialGateway.read());

    if (c == '\r') {
      continue;
    }
    if (c == '\n') {
      lineBuffer[lineLength] = '\0';
      if (lineLength > 0 && state == State::AwaitingVerdict) {
        handleVerdict(lineBuffer);
      }
      lineLength = 0;
      continue;
    }
    if (lineLength < LINE_BUFFER_SIZE - 1) {
      lineBuffer[lineLength++] = c;
    } else {
      lineLength = 0;  // overflow: drop the whole line
    }
  }
}

void runStateMachine() {
  switch (state) {
    case State::Idle: {
      if (!isPersonPresent()) {
        return;
      }
      const String uuid = readTagUuid();
      if (uuid.length() == 0 || uuid == lastUuid) {
        return;
      }
      lastUuid = uuid;
      tagConsumed = consumeTag();
      if (!tagConsumed) {
        // Typically the phone is still holding the RF interface. lastUuid then
        // stays set past the cooldown, so the stale UUID is not resent.
        SerialDebug.println(F("could not clear tag"));
      }
      requestVerification(uuid);
      enterState(State::AwaitingVerdict);
      break;
    }

    case State::AwaitingVerdict:
      // The gateway may be rebooting or offline. Never wait forever.
      if (stateElapsed(VERDICT_TIMEOUT_MS)) {
        SerialDebug.println(F("gateway timeout"));
        setOutputs(false, true, false);
        enterState(State::ShowingDenied);
      }
      break;

    case State::ShowingGranted:
      if (stateElapsed(LOCK_OPEN_MS)) {
        setOutputs(false, false, false);
        enterState(State::Cooldown);
      }
      break;

    case State::ShowingDenied:
      if (stateElapsed(VERDICT_DISPLAY_MS)) {
        setOutputs(false, false, false);
        enterState(State::Cooldown);
      }
      break;

    case State::Cooldown:
      if (stateElapsed(TAG_COOLDOWN_MS)) {
        if (tagConsumed) {
          lastUuid = "";  // the same UUID may be written and presented again
        }
        enterState(State::Idle);
      }
      break;
  }
}

}  // namespace

void setup() {
  SerialDebug.begin(SERIAL_BAUD);
  SerialGateway.begin(SERIAL_BAUD);
  delay(500);

  pinMode(LED_GRANTED_PIN, OUTPUT);
  pinMode(LED_DENIED_PIN, OUTPUT);
  pinMode(LOCK_RELAY_PIN, OUTPUT);
  setOutputs(false, false, false);

  DEV_I2C.begin();
  DEV_I2C.setClock(I2C_CLOCK_HZ);

  if (st25dv.begin() != 0) {
    haltWithErrorSignal("NFC init failed");
  }
  if (tofSensor.begin() != 0) {
    haltWithErrorSignal("ToF init failed");
  }
  tofSensor.VL53L4CD_StartRanging();

  SerialDebug.println(F("reader ready"));
  enterState(State::Idle);
}

void loop() {
  updatePresence();
  reportPresenceChange();
  pollGateway();
  runStateMachine();
  delay(POLL_INTERVAL_MS);
}
