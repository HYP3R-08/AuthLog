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

// Starts connecting in the background; returns immediately.
void networkBegin();

// Call every loop. Synchronises the clock the first time Wi-Fi is up (TLS
// needs a real date to check certificates) and reports whether a request
// could be made right now.
bool networkMaintain();

VerifyResult verifyUuid(const char* uuid);

#endif  // VERIFIER_H
