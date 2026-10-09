#include "provisioning.h"

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLESecurity.h>

namespace {

// The MTU fits a typical wifi command in one packet. A password full of
// characters that JSON escapes can exceed it: the phone then splits the write
// (a long write) and the BLE stack reassembles it, up to MAX_COMMAND_SIZE.
constexpr uint16_t BLE_MTU          = 256;
constexpr size_t   MAX_COMMAND_SIZE = 512;

constexpr esp_gatt_perm_t ENCRYPTED_RW =
    ESP_GATT_PERM_READ_ENC_MITM | ESP_GATT_PERM_WRITE_ENC_MITM;

BLECharacteristic* statusChar = nullptr;

// Hand-off between the BLE task and loop(), guarded by a spinlock. A fixed
// buffer, not a String: allocating inside a critical section can deadlock.
portMUX_TYPE handoffLock = portMUX_INITIALIZER_UNLOCKED;
char pendingCommand[MAX_COMMAND_SIZE + 1];
size_t pendingCommandLength = 0;
bool hasPendingCommand = false;
PairingEvent pendingPairing = PairingEvent::None;
uint32_t pendingPasskey = 0;

void queuePairingEvent(PairingEvent event, uint32_t passkey = 0) {
  portENTER_CRITICAL(&handoffLock);
  pendingPairing = event;
  pendingPasskey = passkey;
  portEXIT_CRITICAL(&handoffLock);
}

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    const std::string value = characteristic->getValue();
    if (value.empty() || value.size() > MAX_COMMAND_SIZE) {
      return;  // oversized writes are dropped, never truncated into JSON
    }
    portENTER_CRITICAL(&handoffLock);
    memcpy(pendingCommand, value.data(), value.size());
    pendingCommand[value.size()] = '\0';
    pendingCommandLength = value.size();
    hasPendingCommand = true;
    portEXIT_CRITICAL(&handoffLock);
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer* server) override {
    // One phone at a time; advertise again so the next one can connect.
    server->getAdvertising()->start();
  }
};

class SecurityCallbacks : public BLESecurityCallbacks {
  // Display-only device: the K10 shows the code, the phone types it.
  uint32_t onPassKeyRequest() override { return 0; }
  void onPassKeyNotify(uint32_t passkey) override {
    queuePairingEvent(PairingEvent::ShowPasskey, passkey);
  }
  bool onConfirmPIN(uint32_t) override { return false; }
  bool onSecurityRequest() override { return true; }
  void onAuthenticationComplete(esp_ble_auth_cmpl_t result) override {
    queuePairingEvent(result.success ? PairingEvent::Succeeded : PairingEvent::Failed);
  }
};

void configureSecurity() {
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT_MITM);
  BLEDevice::setSecurityCallbacks(new SecurityCallbacks());

  BLESecurity* security = new BLESecurity();
  security->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_MITM_BOND);
  security->setCapability(ESP_IO_CAP_OUT);
  security->setKeySize(16);
  security->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
  security->setRespEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
}

}  // namespace

void provisioningBegin(const String& deviceName) {
  BLEDevice::init(deviceName.c_str());
  BLEDevice::setMTU(BLE_MTU);
  configureSecurity();

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(PROVISIONING_SERVICE_UUID);

  BLECharacteristic* commandChar = service->createCharacteristic(
      COMMAND_CHAR_UUID, BLECharacteristic::PROPERTY_WRITE);
  commandChar->setAccessPermissions(ENCRYPTED_RW);
  commandChar->setCallbacks(new CommandCallbacks());

  statusChar = service->createCharacteristic(
      STATUS_CHAR_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->setAccessPermissions(ENCRYPTED_RW);
  BLE2902* notifyConfig = new BLE2902();
  notifyConfig->setAccessPermissions(ENCRYPTED_RW);
  statusChar->addDescriptor(notifyConfig);

  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(PROVISIONING_SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

bool takeCommand(String& raw) {
  char copy[MAX_COMMAND_SIZE + 1];
  portENTER_CRITICAL(&handoffLock);
  const bool ready = hasPendingCommand;
  if (ready) {
    memcpy(copy, pendingCommand, pendingCommandLength + 1);
    hasPendingCommand = false;
  }
  portEXIT_CRITICAL(&handoffLock);
  if (ready) {
    raw = String(copy);  // allocation happens outside the critical section
  }
  return ready;
}

PairingEvent takePairingEvent(uint32_t& passkey) {
  portENTER_CRITICAL(&handoffLock);
  const PairingEvent event = pendingPairing;
  passkey = pendingPasskey;
  pendingPairing = PairingEvent::None;
  portEXIT_CRITICAL(&handoffLock);
  return event;
}

void publishStatus(const String& json) {
  if (!statusChar) {
    return;
  }
  statusChar->setValue(std::string(json.c_str()));
  statusChar->notify();
}
