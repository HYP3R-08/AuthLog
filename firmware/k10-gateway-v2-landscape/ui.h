// AuthLog K10 gateway: screen, sound and RGB feedback
//
// Every screen is drawn from scratch by uiShow(); the caller only says which one.

#ifndef UI_H
#define UI_H

#include <Arduino.h>
#include "unihiker_k10.h"

enum class Screen : uint8_t {
  Booting,    // connecting to Wi-Fi at power-on
  Offline,    // Wi-Fi lost: verdicts cannot be fetched
  Idle,       // nobody in front of the reader
  Near,       // someone is in the ToF window
  Verifying,  // UUID received, waiting for the server
  Granted,
  Denied,
  Error,      // server or network failed during a verification
  Setup,      // no owner or no Wi-Fi yet: waiting for the admin's app
  Pairing,    // a phone is pairing: show the 6-digit code
  WifiSaved,  // the admin set a new network
};

void uiBegin(UNIHIKER_K10& board);

// `detail` fills the variable part of a screen: the user's name (Granted), the
// device's Bluetooth name (Setup), the pairing code (Pairing) or the network
// name (WifiSaved). Redrawing the screen already shown is skipped, so this is
// safe to call on every state check.
void uiShow(Screen screen, const String& detail = "");

#endif  // UI_H
