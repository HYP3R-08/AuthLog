// AuthLog K10 gateway: network side
//
// Wi-Fi, clock and the HTTPS call to the verify-access Edge Function. The rest
// of the sketch never touches the network directly.

#ifndef VERIFIER_H
#define VERIFIER_H

#include <Arduino.h>

enum class Verdict : uint8_t {
  Granted,
  Denied,
  Error,  // could not verify: network, TLS or server failure
};

struct VerifyResult {
  Verdict verdict;
  String name;  // first name, only when granted and known
};

// Starts connecting in the background; returns immediately. Called again with
// new credentials, it drops the current network and joins the new one.
void networkBegin(const String& ssid, const String& password);

// Leaves Wi-Fi off, for a device that has no network configured yet.
void networkStop();

// "none", "connecting", "connected" or "failed": what the app shows the admin.
const char* networkStateName();

// Call every loop. Synchronises the clock the first time Wi-Fi is up (TLS
// needs a real date to check certificates) and reports whether a request
// could be made right now.
bool networkMaintain();

VerifyResult verifyUuid(const char* uuid);

#endif  // VERIFIER_H
