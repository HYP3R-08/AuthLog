#include "setup_mode.h"

#include <ArduinoJson.h>

#include "config_store.h"
#include "provisioning.h"
#include "verifier.h"

namespace {

constexpr size_t MIN_PASSWORD_LENGTH = 8;  // WPA2 minimum; empty means open network

String deviceName;

String makeDeviceName() {
  // The last two bytes of the MAC tell boards apart without exposing it whole.
  const uint64_t mac = ESP.getEfuseMac();
  char name[16];
  snprintf(name, sizeof(name), "AuthLog-%02X%02X",
           static_cast<uint8_t>(mac >> 32), static_cast<uint8_t>(mac >> 40));
  return String(name);
}

bool isValidWifi(const String& ssid, const String& password) {
  if (ssid.length() == 0 || ssid.length() > MAX_SSID_LENGTH) {
    return false;
  }
  const size_t passLength = password.length();
  return passLength == 0 || (passLength >= MIN_PASSWORD_LENGTH && passLength <= MAX_PASSWORD_LENGTH);
}

SetupEvent rejected(const char* reason) {
  Serial.printf("setup: rejected (%s)\n", reason);
  publishSetupStatus(reason);
  return {SetupOutcome::Rejected, ""};
}

SetupEvent handleClaim(const String& key) {
  if (isClaimed()) {
    return rejected("already_claimed");
  }
  if (!claimOwnership(key)) {
    return rejected("invalid_key");
  }
  Serial.println(F("setup: claimed"));
  publishSetupStatus("claimed");
  return {SetupOutcome::Claimed, ""};
}

SetupEvent handleWifi(const String& key, const String& ssid, const String& password) {
  if (!isOwnerKey(key)) {
    return rejected("not_owner");
  }
  if (!isValidWifi(ssid, password)) {
    return rejected("invalid_wifi");
  }
  saveWifiConfig({ssid, password});
  networkBegin(ssid, password);
  Serial.printf("setup: Wi-Fi set to \"%s\"\n", ssid.c_str());  // never the password
  publishSetupStatus("wifi_saved");
  return {SetupOutcome::WifiSaved, ssid};
}

}  // namespace

void setupModeBegin() {
  configBegin();
  deviceName = makeDeviceName();
  provisioningBegin(deviceName);

  if (hasWifiConfig()) {
    const WifiConfig config = loadWifiConfig();
    networkBegin(config.ssid, config.password);
  } else {
    networkStop();
  }
  publishSetupStatus("ready");
}

const String& setupDeviceName() {
  return deviceName;
}

bool needsSetup() {
  return !isClaimed() || !hasWifiConfig();
}

SetupEvent setupModePoll() {
  String raw;
  if (!takeCommand(raw)) {
    return {SetupOutcome::None, ""};
  }

  JsonDocument command;
  if (deserializeJson(command, raw) || !command["op"].is<const char*>()) {
    return rejected("malformed");
  }
  const String op = command["op"].as<const char*>();
  const String key = command["key"] | "";

  if (op == "claim") {
    return handleClaim(key);
  }
  if (op == "wifi") {
    return handleWifi(key, command["ssid"] | "", command["pass"] | "");
  }
  if (op == "status") {
    publishSetupStatus("ok");
    return {SetupOutcome::None, ""};
  }
  return rejected("unknown_op");
}

void publishSetupStatus(const char* result) {
  JsonDocument status;
  status["claimed"] = isClaimed();
  status["wifi"] = networkStateName();
  status["ssid"] = hasWifiConfig() ? loadWifiConfig().ssid : String();
  status["result"] = result;
  String json;
  serializeJson(status, json);
  publishStatus(json);
}

void setupFactoryReset() {
  factoryReset();
  networkStop();
}
