// AuthLog K10 gateway v2: persistent configuration
//
// The Wi-Fi network and the owner's key survive power cycles in the ESP32's
// NVS flash. The key itself is never stored: only its SHA-256, which is enough
// to recognise it and useless to anyone who reads the flash.

#ifndef CONFIG_STORE_H
#define CONFIG_STORE_H

#include <Arduino.h>

constexpr size_t OWNER_KEY_HEX_LENGTH = 64;  // 32 random bytes, hex-encoded
constexpr size_t MAX_SSID_LENGTH      = 32;  // 802.11 limit
constexpr size_t MAX_PASSWORD_LENGTH  = 63;  // WPA2 passphrase limit

struct WifiConfig {
  String ssid;
  String password;
};

void configBegin();

bool isClaimed();

// Fails if the device already has an owner: ownership is first-come, once.
bool claimOwnership(const String& ownerKeyHex);

// Constant-time comparison against the stored hash.
bool isOwnerKey(const String& ownerKeyHex);

bool hasWifiConfig();
WifiConfig loadWifiConfig();
void saveWifiConfig(const WifiConfig& config);

// Forgets owner, Wi-Fi and every Bluetooth bond: the device behaves as new.
void factoryReset();

#endif  // CONFIG_STORE_H
