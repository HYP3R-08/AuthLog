// AuthLog K10 gateway v2: Bluetooth provisioning
//
// A GATT service through which the admin's app claims the device and sets the
// Wi-Fi network. Both characteristics require an encrypted, MITM-protected
// link: the phone pairs by typing a 6-digit code shown on the K10's screen, so
// only someone standing in front of the device can pair, and the Wi-Fi
// password never crosses the air in clear.
//
// Bluetooth callbacks run on the BLE task. They only copy data in; everything
// else (parsing, flash writes, screen) happens in loop() via the take*()
// functions, so the two tasks never draw or write at the same time.

#ifndef PROVISIONING_H
#define PROVISIONING_H

#include <Arduino.h>

// Shared with the mobile app (mobile/lib/deviceSetup.ts).
#define PROVISIONING_SERVICE_UUID "5f1c7a10-6a2e-4c1b-9e43-0b6a1d7e0001"
#define COMMAND_CHAR_UUID         "5f1c7a10-6a2e-4c1b-9e43-0b6a1d7e0002"
#define STATUS_CHAR_UUID          "5f1c7a10-6a2e-4c1b-9e43-0b6a1d7e0003"

enum class PairingEvent : uint8_t {
  None,
  ShowPasskey,  // a phone started pairing: display the code
  Succeeded,
  Failed,
};

void provisioningBegin(const String& deviceName);

// Returns true once per command written by the app; `raw` is its JSON.
bool takeCommand(String& raw);

// Returns the latest pairing event (and the code, for ShowPasskey).
PairingEvent takePairingEvent(uint32_t& passkey);

// Sets the status characteristic and notifies a subscribed app.
void publishStatus(const String& json);

#endif  // PROVISIONING_H
