#include "config_store.h"

#include <Preferences.h>
#include <mbedtls/sha256.h>
#include <esp_gap_ble_api.h>

namespace {

const char NAMESPACE[]     = "authlog";
const char KEY_OWNER[]     = "owner_sha256";
const char KEY_SSID[]      = "wifi_ssid";
const char KEY_PASSWORD[]  = "wifi_pass";
constexpr size_t HASH_SIZE = 32;

Preferences prefs;

bool isHexKey(const String& value) {
  if (value.length() != OWNER_KEY_HEX_LENGTH) {
    return false;
  }
  for (size_t i = 0; i < value.length(); i++) {
    if (!isxdigit(static_cast<unsigned char>(value[i]))) {
      return false;
    }
  }
  return true;
}

void hashKey(const String& ownerKeyHex, uint8_t out[HASH_SIZE]) {
  String normalised = ownerKeyHex;
  normalised.toLowerCase();
  mbedtls_sha256(reinterpret_cast<const uint8_t*>(normalised.c_str()),
                 normalised.length(), out, 0);
}

void removeAllBonds() {
  const int count = esp_ble_get_bond_device_num();
  if (count <= 0) {
    return;
  }
  esp_ble_bond_dev_t* devices =
      static_cast<esp_ble_bond_dev_t*>(malloc(sizeof(esp_ble_bond_dev_t) * count));
  if (!devices) {
    return;
  }
  int listed = count;
  if (esp_ble_get_bond_device_list(&listed, devices) == ESP_OK) {
    for (int i = 0; i < listed; i++) {
      esp_ble_remove_bond_device(devices[i].bd_addr);
    }
  }
  free(devices);
}

}  // namespace

void configBegin() {
  prefs.begin(NAMESPACE, false);
}

bool isClaimed() {
  return prefs.getBytesLength(KEY_OWNER) == HASH_SIZE;
}

bool claimOwnership(const String& ownerKeyHex) {
  if (isClaimed() || !isHexKey(ownerKeyHex)) {
    return false;
  }
  uint8_t hash[HASH_SIZE];
  hashKey(ownerKeyHex, hash);
  return prefs.putBytes(KEY_OWNER, hash, HASH_SIZE) == HASH_SIZE;
}

bool isOwnerKey(const String& ownerKeyHex) {
  if (!isClaimed() || !isHexKey(ownerKeyHex)) {
    return false;
  }
  uint8_t stored[HASH_SIZE];
  uint8_t candidate[HASH_SIZE];
  prefs.getBytes(KEY_OWNER, stored, HASH_SIZE);
  hashKey(ownerKeyHex, candidate);

  // Every byte is compared, so timing reveals nothing about a near miss.
  uint8_t difference = 0;
  for (size_t i = 0; i < HASH_SIZE; i++) {
    difference |= stored[i] ^ candidate[i];
  }
  return difference == 0;
}

bool hasWifiConfig() {
  return prefs.isKey(KEY_SSID) && prefs.getString(KEY_SSID).length() > 0;
}

WifiConfig loadWifiConfig() {
  return {prefs.getString(KEY_SSID), prefs.getString(KEY_PASSWORD)};
}

void saveWifiConfig(const WifiConfig& config) {
  prefs.putString(KEY_SSID, config.ssid);
  prefs.putString(KEY_PASSWORD, config.password);
}

void factoryReset() {
  prefs.clear();
  removeAllBonds();
}
