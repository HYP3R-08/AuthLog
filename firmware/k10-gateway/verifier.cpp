#include "verifier.h"

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include "secrets.h"

namespace {

constexpr uint32_t WIFI_RETRY_TIMEOUT_MS = 8000;
constexpr uint32_t NTP_SYNC_TIMEOUT_MS   = 15000;
constexpr int32_t  HTTP_TIMEOUT_MS       = 10000;
constexpr uint32_t POLL_INTERVAL_MS      = 200;
constexpr size_t   REQUEST_BODY_SIZE     = 64;
constexpr size_t   MAX_NAME_BYTES        = 20;

// Certificate validation compares the validity dates against the clock, so the
// clock has to be real before the first HTTPS request.
constexpr time_t   MIN_VALID_EPOCH       = 1700000000;  // 2023-11-14

bool clockSynced = false;

bool waitForWifi(uint32_t timeoutMs) {
  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startedAt > timeoutMs) {
      return false;
    }
    delay(POLL_INTERVAL_MS);
  }
  return true;
}

bool syncClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const uint32_t startedAt = millis();
  while (time(nullptr) < MIN_VALID_EPOCH) {
    if (millis() - startedAt > NTP_SYNC_TIMEOUT_MS) {
      return false;
    }
    delay(POLL_INTERVAL_MS);
  }
  return true;
}

// The name is shown on screen and comes from the network: cap its length, and
// cut on a character boundary so a multi-byte letter is never split in half.
String boundedName(const char* raw) {
  String name = raw ? String(raw) : String();
  name.trim();
  if (name.length() <= MAX_NAME_BYTES) {
    return name;
  }
  size_t cut = MAX_NAME_BYTES;
  while (cut > 0 && (static_cast<uint8_t>(name[cut]) & 0xC0) == 0x80) {
    cut--;
  }
  return name.substring(0, cut);
}

VerifyResult parseResponse(const String& payload) {
  JsonDocument response;
  if (deserializeJson(response, payload)) {
    Serial.println(F("verify: malformed JSON"));
    return {Verdict::Error, ""};
  }
  if (!response["authorized"].is<bool>()) {
    Serial.println(F("verify: missing 'authorized'"));
    return {Verdict::Error, ""};
  }
  if (!response["authorized"].as<bool>()) {
    return {Verdict::Denied, ""};
  }
  return {Verdict::Granted, boundedName(response["name"] | "")};
}

}  // namespace

void networkBegin() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

bool networkMaintain() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  if (!clockSynced) {
    clockSynced = syncClock();
    Serial.println(clockSynced ? F("clock synced") : F("clock sync failed"));
  }
  return clockSynced;
}

VerifyResult verifyUuid(const char* uuid) {
  if (!networkMaintain()) {
    WiFi.reconnect();
    if (!waitForWifi(WIFI_RETRY_TIMEOUT_MS) || !networkMaintain()) {
      Serial.println(F("verify: network unavailable"));
      return {Verdict::Error, ""};
    }
  }

  WiFiClientSecure client;
  client.setCACert(SUPABASE_ROOT_CA);

  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, VERIFY_ENDPOINT)) {
    Serial.println(F("verify: http begin failed"));
    return {Verdict::Error, ""};
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  // uuid has passed isValidUuid() in the caller, so it holds no character that
  // could break out of the JSON string.
  char body[REQUEST_BODY_SIZE];
  snprintf(body, sizeof(body), "{\"uuid\":\"%s\"}", uuid);

  const int status = http.POST(String(body));
  if (status != HTTP_CODE_OK) {
    Serial.printf("verify: HTTP %d\n", status);
    http.end();
    return {Verdict::Error, ""};
  }

  // getString() reassembles a chunked body, which the endpoint sends.
  const String payload = http.getString();
  http.end();
  return parseResponse(payload);
}
