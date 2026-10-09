// AuthLog K10 gateway v2: admin setup over Bluetooth
//
// Ownership and Wi-Fi rules, on top of the transport in provisioning.h:
//   - the first app to send a valid "claim" becomes the owner, once;
//   - only a command carrying the owner's key may change the Wi-Fi;
//   - holding A + B at power-on forgets owner and network (factory reset).
//
// Commands (JSON, written to the command characteristic):
//   {"op":"claim","key":"<64 hex>"}
//   {"op":"wifi","key":"<64 hex>","ssid":"<1-32>","pass":"<empty or 8-63>"}
//   {"op":"status"}
// Every command is answered on the status characteristic:
//   {"claimed":bool,"wifi":"none|connecting|connected|failed","ssid":"...","result":"..."}

#ifndef SETUP_MODE_H
#define SETUP_MODE_H

#include <Arduino.h>

enum class SetupOutcome : uint8_t {
  None,       // no command was waiting
  Claimed,
  WifiSaved,  // detail holds the new SSID
  Rejected,   // wrong key, already claimed or malformed: nothing changed
};

struct SetupEvent {
  SetupOutcome outcome;
  String detail;
};

// Loads the stored configuration, starts Bluetooth and, if a network is
// stored, starts Wi-Fi.
void setupModeBegin();

// "AuthLog-XXXX", unique per board: what the admin looks for in the app.
const String& setupDeviceName();

// True until the device has both an owner and a network.
bool needsSetup();

// Handles at most one pending command. Call from loop().
SetupEvent setupModePoll();

// Re-sends the status, e.g. when the Wi-Fi state changes.
void publishSetupStatus(const char* result);

// Erases owner, network and Bluetooth bonds. Call after setupModeBegin().
void setupFactoryReset();

#endif  // SETUP_MODE_H
