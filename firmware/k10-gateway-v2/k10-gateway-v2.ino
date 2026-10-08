// AuthLog: UNIHIKER K10 gateway, v2
//
// Drop-in replacement for the ESP8266 gateway, with a screen and a speaker.
// It speaks the same UART protocol to the STM32 reader, calls the same Edge
// Function, and adds what the ESP8266 could not: it tells the person what is
// happening.
//
// v2: the Wi-Fi network is no longer compiled in. The admin sets it from the
// mobile app over Bluetooth (see setup_mode.h): on first power-on the first app
// to connect claims the device, and from then on only that owner can change
// the network. Hold A + B while powering on to reset the device to new.
//
// Wire protocol (UART, 115200 8N1, shared with the STM32):
//   in   UUID:<36-char uuid>\n
//   in   PRESENCE:NEAR\n | PRESENCE:AWAY\n
//   out  AUTH:OK\n | AUTH:NO\n | AUTH:ERR\n
//
// Wiring (edge connector):
//   K10 P0 (GPIO1, RX)  <-  STM32 PA11 (USART6 TX, CN10 pin 14)
//   K10 P1 (GPIO2, TX)  ->  STM32 PA12 (USART6 RX, CN10 pin 12)
//   K10 GND            <->  STM32 GND
// P0 and P1 are the only edge pins wired straight to the ESP32-S3; the others
// go through an I/O expander and cannot carry a UART.
//
// The USB port stays free for diagnostics: `Serial` prints there (enable
// "USB CDC On Boot" in the Tools menu to see it), never on the reader's UART.
// It also accepts the reader's own lines, so the gateway can be tested from the
// Serial Monitor with no STM32 attached: type "PRESENCE:NEAR" or "UUID:<uuid>"
// and the verdict is printed back there instead of sent to the reader.

#include "unihiker_k10.h"
#include "provisioning.h"
#include "setup_mode.h"
#include "ui.h"
#include "verifier.h"

namespace {

constexpr uint32_t GATEWAY_BAUD       = 115200;
constexpr int      GATEWAY_RX_PIN     = P0;
constexpr int      GATEWAY_TX_PIN     = P1;
constexpr uint8_t  UUID_LENGTH        = 36;
constexpr size_t   LINE_BUFFER_SIZE   = 64;   // "UUID:" + 36 chars + slack

// Long enough to read, short enough to be ready for the next person. Granted
// matches the STM32's lock-open time.
constexpr uint32_t GRANTED_SCREEN_MS  = 3000;
constexpr uint32_t DENIED_SCREEN_MS   = 2500;
constexpr uint32_t ERROR_SCREEN_MS    = 3000;
// How long the boot screen may wait for Wi-Fi before admitting it is offline.
constexpr uint32_t BOOT_GRACE_MS      = 20000;
// Someone must stay in the ToF window this long before the greeting replaces
// "Pronto", so a person walking past does not make the screen flicker.
constexpr uint32_t NEAR_CONFIRM_MS    = 1500;
constexpr uint32_t WIFI_SAVED_SCREEN_MS = 3000;
// The pairing code stays up until the phone finishes, or this long at most.
constexpr uint32_t PAIRING_TIMEOUT_MS = 60000;
// A + B must be held this long at power-on: a deliberate act, not a bump.
constexpr uint32_t FACTORY_RESET_HOLD_MS = 3000;

const char PROTOCOL_UUID_PREFIX[] = "UUID:";
const char EVENT_PRESENCE_NEAR[]  = "PRESENCE:NEAR";
const char EVENT_PRESENCE_AWAY[]  = "PRESENCE:AWAY";
const char RESPONSE_GRANTED[]     = "AUTH:OK";
const char RESPONSE_DENIED[]      = "AUTH:NO";
const char RESPONSE_ERROR[]       = "AUTH:ERR";

UNIHIKER_K10 k10;
HardwareSerial& reader = Serial1;

// One line assembler per input. The USB console gets its own, so typing a test
// line on the PC never interleaves with bytes arriving from the reader.
struct LineReader {
  Stream& input;
  Print& reply;
  const char* tag;
  char buffer[LINE_BUFFER_SIZE];
  size_t length;
};

LineReader fromReader  = {reader, reader, "reader", {0}, 0};
LineReader fromConsole = {Serial, Serial, "console", {0}, 0};

bool isOnline = false;
bool isPersonNear = false;
uint32_t nearSince = 0;
bool isShowingResult = false;
uint32_t resultShownAt = 0;
uint32_t resultHoldMs = 0;
uint32_t bootedAt = 0;
bool isPairing = false;
uint32_t pairingStartedAt = 0;
String pairingCode;

// A UUID is 8-4-4-4-12 hex digits. The tag is written by a phone, so anyone can
// put anything on it: it is rejected here before it reaches a JSON body.
bool isValidUuid(const char* uuid) {
  if (strlen(uuid) != UUID_LENGTH) {
    return false;
  }
  for (uint8_t i = 0; i < UUID_LENGTH; i++) {
    const char c = uuid[i];
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (c != '-') return false;
    } else if (!isxdigit(static_cast<unsigned char>(c))) {
      return false;
    }
  }
  return true;
}

// The screen shown whenever no verdict is on display.
void showResting() {
  if (isPairing) {
    uiShow(Screen::Pairing, pairingCode);
    return;
  }
  if (isShowingResult) {
    return;
  }
  if (needsSetup()) {
    uiShow(Screen::Setup, setupDeviceName());
    return;
  }
  if (!isOnline) {
    uiShow(millis() - bootedAt < BOOT_GRACE_MS ? Screen::Booting : Screen::Offline);
    return;
  }
  // Re-evaluated on every loop, so the greeting appears by itself once the
  // presence has lasted NEAR_CONFIRM_MS, without waiting for another event.
  const bool isConfirmedNear = isPersonNear && millis() - nearSince >= NEAR_CONFIRM_MS;
  uiShow(isConfirmedNear ? Screen::Near : Screen::Idle);
}

void showResult(Screen screen, uint32_t holdMs, const String& name = "") {
  isShowingResult = true;
  resultShownAt = millis();
  resultHoldMs = holdMs;
  uiShow(screen, name);
}

void expireResult() {
  if (isShowingResult && millis() - resultShownAt >= resultHoldMs) {
    isShowingResult = false;
    showResting();
  }
}

void handleUuid(const char* uuid, Print& reply) {
  if (!isValidUuid(uuid)) {
    Serial.println(F("rejected malformed uuid"));
    reply.println(RESPONSE_DENIED);
    showResult(Screen::Denied, DENIED_SCREEN_MS);
    return;
  }

  uiShow(Screen::Verifying);
  const VerifyResult result = verifyUuid(uuid);

  // The STM32 waits for this line before it moves the lock: answer first,
  // then update the screen.
  switch (result.verdict) {
    case Verdict::Granted:
      reply.println(RESPONSE_GRANTED);
      showResult(Screen::Granted, GRANTED_SCREEN_MS, result.name);
      break;
    case Verdict::Denied:
      reply.println(RESPONSE_DENIED);
      showResult(Screen::Denied, DENIED_SCREEN_MS);
      break;
    case Verdict::Error:
      reply.println(RESPONSE_ERROR);
      showResult(Screen::Error, ERROR_SCREEN_MS);
      break;
  }
}

void handleLine(const char* line, Print& reply) {
  const size_t prefixLength = strlen(PROTOCOL_UUID_PREFIX);
  if (strncmp(line, PROTOCOL_UUID_PREFIX, prefixLength) == 0) {
    handleUuid(line + prefixLength, reply);
  } else if (strcmp(line, EVENT_PRESENCE_NEAR) == 0) {
    if (!isPersonNear) {
      nearSince = millis();  // a repeated NEAR must not restart the wait
    }
    isPersonNear = true;
    showResting();
  } else if (strcmp(line, EVENT_PRESENCE_AWAY) == 0) {
    isPersonNear = false;
    showResting();
  }
  // Anything else is not addressed to us.
}

// Reads one newline-terminated line without blocking. Over-long lines are
// discarded rather than silently truncated into a different UUID. Every line is
// echoed to the USB console, so a silent reader shows up as silence there.
void pollLines(LineReader& source) {
  while (source.input.available()) {
    const char c = static_cast<char>(source.input.read());
    if (c == '\r') {
      continue;
    }
    if (c == '\n') {
      source.buffer[source.length] = '\0';
      if (source.length > 0) {
        Serial.printf("%s> %s\n", source.tag, source.buffer);
        handleLine(source.buffer, source.reply);
      }
      source.length = 0;
      continue;
    }
    if (source.length < LINE_BUFFER_SIZE - 1) {
      source.buffer[source.length++] = c;
    } else {
      source.length = 0;
    }
  }
}

void trackNetwork() {
  const bool online = networkMaintain();
  if (online != isOnline) {
    isOnline = online;
    Serial.println(online ? F("network ready") : F("network lost"));
    publishSetupStatus("wifi_changed");  // lets the admin's app see it connect
  }
  showResting();
}

void handleSetupCommands() {
  const SetupEvent event = setupModePoll();
  if (event.outcome == SetupOutcome::WifiSaved) {
    bootedAt = millis();  // give the new network the boot grace period
    showResult(Screen::WifiSaved, WIFI_SAVED_SCREEN_MS, event.detail);
  }
}

void handlePairing() {
  uint32_t passkey = 0;
  switch (takePairingEvent(passkey)) {
    case PairingEvent::ShowPasskey: {
      char code[8];
      snprintf(code, sizeof(code), "%06lu", static_cast<unsigned long>(passkey));
      pairingCode = code;
      isPairing = true;
      pairingStartedAt = millis();
      break;
    }
    case PairingEvent::Succeeded:
    case PairingEvent::Failed:
      isPairing = false;
      break;
    case PairingEvent::None:
      if (isPairing && millis() - pairingStartedAt >= PAIRING_TIMEOUT_MS) {
        isPairing = false;
      }
      break;
  }
}

// A + B held through power-on for FACTORY_RESET_HOLD_MS. Needs Bluetooth up,
// because the reset also forgets every paired phone.
void checkFactoryReset() {
  const uint32_t startedAt = millis();
  while (k10.buttonA->isPressed() && k10.buttonB->isPressed()) {
    if (millis() - startedAt >= FACTORY_RESET_HOLD_MS) {
      setupFactoryReset();
      Serial.println(F("factory reset done"));
      ESP.restart();
    }
    delay(50);
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  reader.begin(GATEWAY_BAUD, SERIAL_8N1, GATEWAY_RX_PIN, GATEWAY_TX_PIN);

  k10.begin();
  uiBegin(k10);
  bootedAt = millis();
  uiShow(Screen::Booting);

  setupModeBegin();
  checkFactoryReset();
}

void loop() {
  pollLines(fromReader);
  pollLines(fromConsole);
  handleSetupCommands();
  handlePairing();
  expireResult();
  trackNetwork();
  delay(10);
}
