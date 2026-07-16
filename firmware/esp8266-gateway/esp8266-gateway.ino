// AuthLog — ESP8266 gateway
//
// Receives a UUID from the STM32 reader over UART, asks the Supabase Edge
// Function whether that UUID is authorized, and reports the verdict back to the
// STM32, which owns the lock and the LEDs.
//
// The gateway holds no Supabase credential: it authenticates to the Edge
// Function with a per-device token, and the function keeps the privileged key
// server-side.
//
// Wire protocol (UART, 115200 8N1, shared with the STM32):
//   in   UUID:<36-char uuid>\n
//   out  AUTH:OK\n | AUTH:NO\n | AUTH:ERR\n
//
// AUTH:NO means "verified, not authorized". AUTH:ERR means "could not verify" —
// the STM32 must not treat the two alike.

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>
#include <time.h>

#include "secrets.h"

// Set to 1 to print diagnostics. Off by default: the STM32 shares this UART and
// only expects AUTH: lines.
#define ENABLE_DEBUG_LOG 0

#if ENABLE_DEBUG_LOG
  #define DEBUG_LOG(x)   Serial.println(x)
#else
  #define DEBUG_LOG(x)   do {} while (0)
#endif

namespace {

constexpr uint32_t SERIAL_BAUD             = 115200;
constexpr uint8_t  UUID_LENGTH             = 36;
constexpr size_t   LINE_BUFFER_SIZE        = 64;   // "UUID:" + 36 chars + slack
constexpr size_t   REQUEST_BODY_SIZE       = 64;

constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 30000;
constexpr uint32_t HTTP_TIMEOUT_MS         = 10000;
constexpr uint32_t NTP_SYNC_TIMEOUT_MS     = 20000;
constexpr uint32_t WIFI_POLL_INTERVAL_MS   = 500;

// BearSSL defaults to a 16 kB receive buffer, which this chip cannot reliably
// spare once Wi-Fi is up: the handshake fails with an out-of-memory error
// rather than a TLS one. 1 kB is enough here because the responses are a few
// dozen bytes; raise it if the endpoint ever sends a larger certificate chain
// or body.
constexpr uint16_t TLS_RX_BUFFER_BYTES     = 1024;
constexpr uint16_t TLS_TX_BUFFER_BYTES     = 1024;

// TLS certificate validation compares notAfter against the clock, so the clock
// has to be real before the first HTTPS request.
constexpr time_t   MIN_VALID_EPOCH         = 1700000000;  // 2023-11-14

const char PROTOCOL_UUID_PREFIX[] = "UUID:";
const char RESPONSE_GRANTED[]     = "AUTH:OK";
const char RESPONSE_DENIED[]      = "AUTH:NO";
const char RESPONSE_ERROR[]       = "AUTH:ERR";

BearSSL::X509List rootCert(SUPABASE_ROOT_CA);
char lineBuffer[LINE_BUFFER_SIZE];
size_t lineLength = 0;

// A UUID is 36 characters: 8-4-4-4-12 hex digits separated by hyphens. The tag
// content is attacker-controlled — anyone can write an NFC tag — so it is
// rejected here, before it can reach a URL or a JSON body.
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

bool connectToWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startedAt > WIFI_CONNECT_TIMEOUT_MS) {
      return false;
    }
    delay(WIFI_POLL_INTERVAL_MS);
  }
  return true;
}

bool synchronizeClock() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  const uint32_t startedAt = millis();
  while (time(nullptr) < MIN_VALID_EPOCH) {
    if (millis() - startedAt > NTP_SYNC_TIMEOUT_MS) {
      return false;
    }
    delay(WIFI_POLL_INTERVAL_MS);
  }
  return true;
}

// Returns true if a verdict was obtained. `authorized` is only meaningful then;
// on false the caller reports AUTH:ERR rather than guessing.
bool requestVerdict(const char* uuid, bool& authorized) {
  if (WiFi.status() != WL_CONNECTED && !connectToWifi()) {
    DEBUG_LOG(F("wifi unavailable"));
    return false;
  }

  BearSSL::WiFiClientSecure client;
  client.setTrustAnchors(&rootCert);
  client.setBufferSizes(TLS_RX_BUFFER_BYTES, TLS_TX_BUFFER_BYTES);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, VERIFY_ENDPOINT)) {
    DEBUG_LOG(F("http begin failed"));
    return false;
  }

  http.addHeader(F("Content-Type"), F("application/json"));
  http.addHeader(F("X-Device-Token"), DEVICE_TOKEN);

  // uuid passed isValidUuid(), so it holds no character that could break out of
  // the JSON string.
  char body[REQUEST_BODY_SIZE];
  snprintf(body, sizeof(body), "{\"uuid\":\"%s\"}", uuid);

  const int status = http.POST(body);
  if (status != HTTP_CODE_OK) {
    DEBUG_LOG(status);
    http.end();
    return false;
  }

  JsonDocument response;
  const DeserializationError parseError = deserializeJson(response, http.getStream());
  http.end();

  if (parseError) {
    DEBUG_LOG(parseError.c_str());
    return false;
  }
  if (!response["authorized"].is<bool>()) {
    DEBUG_LOG(F("malformed response"));
    return false;
  }

  authorized = response["authorized"].as<bool>();
  return true;
}

void handleLine(char* line) {
  const size_t prefixLength = strlen(PROTOCOL_UUID_PREFIX);
  if (strncmp(line, PROTOCOL_UUID_PREFIX, prefixLength) != 0) {
    return;  // not addressed to us
  }

  const char* uuid = line + prefixLength;
  if (!isValidUuid(uuid)) {
    DEBUG_LOG(F("rejected malformed uuid"));
    Serial.println(RESPONSE_DENIED);
    return;
  }

  bool authorized = false;
  if (!requestVerdict(uuid, authorized)) {
    Serial.println(RESPONSE_ERROR);
    return;
  }

  Serial.println(authorized ? RESPONSE_GRANTED : RESPONSE_DENIED);
}

// Reads one newline-terminated line without blocking. Over-long lines are
// discarded rather than silently truncated into a different UUID.
void pollSerial() {
  while (Serial.available()) {
    const char c = static_cast<char>(Serial.read());

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
      lineLength = 0;  // overflow: drop the whole line
    }
  }
}

}  // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);

  // A gateway that cannot reach the network is useless, and a device stuck in
  // setup() is undiagnosable in the field. Reboot and retry instead.
  if (!connectToWifi()) {
    DEBUG_LOG(F("wifi timeout, restarting"));
    ESP.restart();
  }
  if (!synchronizeClock()) {
    DEBUG_LOG(F("ntp timeout, restarting"));
    ESP.restart();
  }

  DEBUG_LOG(F("gateway ready"));
}

void loop() {
  pollSerial();
}
