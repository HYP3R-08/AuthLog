// AuthLog: UNIHIKER K10 gateway
//
// Drop-in replacement for the ESP8266 gateway, with a screen and a speaker.
// It speaks the same UART protocol to the STM32 reader, calls the same Edge
// Function, and adds what the ESP8266 could not: it tells the person what is
// happening.
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

#include "unihiker_k10.h"
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

const char PROTOCOL_UUID_PREFIX[] = "UUID:";
const char EVENT_PRESENCE_NEAR[]  = "PRESENCE:NEAR";
const char EVENT_PRESENCE_AWAY[]  = "PRESENCE:AWAY";
const char RESPONSE_GRANTED[]     = "AUTH:OK";
const char RESPONSE_DENIED[]      = "AUTH:NO";
const char RESPONSE_ERROR[]       = "AUTH:ERR";

UNIHIKER_K10 k10;
HardwareSerial& reader = Serial1;

char lineBuffer[LINE_BUFFER_SIZE];
size_t lineLength = 0;

bool isOnline = false;
bool isPersonNear = false;
bool isShowingResult = false;
uint32_t resultShownAt = 0;
uint32_t resultHoldMs = 0;
uint32_t bootedAt = 0;

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
  if (isShowingResult) {
    return;
  }
  if (!isOnline) {
    uiShow(millis() - bootedAt < BOOT_GRACE_MS ? Screen::Booting : Screen::Offline);
    return;
  }
  uiShow(isPersonNear ? Screen::Near : Screen::Idle);
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

void handleUuid(const char* uuid) {
  if (!isValidUuid(uuid)) {
    Serial.println(F("rejected malformed uuid"));
    reader.println(RESPONSE_DENIED);
    showResult(Screen::Denied, DENIED_SCREEN_MS);
    return;
  }

  uiShow(Screen::Verifying);
  const VerifyResult result = verifyUuid(uuid);

  // The STM32 waits for this line before it moves the lock: answer first,
  // then update the screen.
  switch (result.verdict) {
    case Verdict::Granted:
      reader.println(RESPONSE_GRANTED);
      showResult(Screen::Granted, GRANTED_SCREEN_MS, result.name);
      break;
    case Verdict::Denied:
      reader.println(RESPONSE_DENIED);
      showResult(Screen::Denied, DENIED_SCREEN_MS);
      break;
    case Verdict::Error:
      reader.println(RESPONSE_ERROR);
      showResult(Screen::Error, ERROR_SCREEN_MS);
      break;
  }
}

void handleLine(const char* line) {
  const size_t prefixLength = strlen(PROTOCOL_UUID_PREFIX);
  if (strncmp(line, PROTOCOL_UUID_PREFIX, prefixLength) == 0) {
    handleUuid(line + prefixLength);
  } else if (strcmp(line, EVENT_PRESENCE_NEAR) == 0) {
    isPersonNear = true;
    showResting();
  } else if (strcmp(line, EVENT_PRESENCE_AWAY) == 0) {
    isPersonNear = false;
    showResting();
  }
  // Anything else is not addressed to us.
}

// Reads one newline-terminated line without blocking. Over-long lines are
// discarded rather than silently truncated into a different UUID.
void pollReader() {
  while (reader.available()) {
    const char c = static_cast<char>(reader.read());
    if (c == '\r') {
      continue;
    }
    if (c == '\n') {
      lineBuffer[lineLength] = '\0';
      if (lineLength > 0) {
        handleLine(lineBuffer);
      }
      lineLength = 0;
      continue;
    }
    if (lineLength < LINE_BUFFER_SIZE - 1) {
      lineBuffer[lineLength++] = c;
    } else {
      lineLength = 0;
    }
  }
}

void trackNetwork() {
  const bool online = networkMaintain();
  if (online != isOnline) {
    isOnline = online;
    Serial.println(online ? F("network ready") : F("network lost"));
  }
  showResting();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  reader.begin(GATEWAY_BAUD, SERIAL_8N1, GATEWAY_RX_PIN, GATEWAY_TX_PIN);

  k10.begin();
  uiBegin(k10);
  bootedAt = millis();
  uiShow(Screen::Booting);

  networkBegin();
}

void loop() {
  pollReader();
  expireResult();
  trackNetwork();
  delay(10);
}
