#include "ST25DVSensor.h"
#include <vl53l4cd_class.h>
#include <Wire.h>

#define SerialDebug      Serial
#define SerialESP        Serial2

#define DEV_I2C Wire

#define LED1_PIN D7
#define LED2_PIN D6

ST25DV st25dv(12, -1, &DEV_I2C);
VL53L4CD sensor(&DEV_I2C, -1);

String lastUUID = "";

void setup() {
  SerialDebug.begin(115200);
  SerialESP.begin(115200);
  delay(500);

  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);

  DEV_I2C.begin();
  DEV_I2C.setClock(100000);

  if(st25dv.begin() == 0) {
    SerialDebug.println("NFC Init OK");
  } else {
    SerialDebug.println("NFC Init FAILED");
    while(1);
  }

  if(sensor.begin() != 0) {
    SerialDebug.println("ToF Init FAILED");
    while(1);
  }

  sensor.VL53L4CD_StartRanging();

  SerialDebug.println("Sistema pronto...");
}

void loop() {
  uint8_t ready = 0;
  VL53L4CD_Result_t result;

  sensor.VL53L4CD_CheckForDataReady(&ready);

  if(ready) {
    sensor.VL53L4CD_GetResult(&result);
    sensor.VL53L4CD_ClearInterrupt();

    uint16_t distance = result.distance_mm;


    // --- LED ---
    if(distance > 70 && distance < 500) {
      digitalWrite(LED1_PIN, HIGH);
      digitalWrite(LED2_PIN, HIGH);
    } else {
      digitalWrite(LED1_PIN, LOW);
      digitalWrite(LED2_PIN, LOW);
    }
  }

  // NFC invariato
  String uuidRead;

  if(st25dv.readURI(&uuidRead)) {
    delay(200);
    return;
  }

  uuidRead.trim();

  if(uuidRead.length() > 0) {

    if(uuidRead.startsWith("https://")) {
      uuidRead = uuidRead.substring(8);
    } else if(uuidRead.startsWith("http://")) {
      uuidRead = uuidRead.substring(7);
    }

    if(uuidRead != lastUUID) {
      lastUUID = uuidRead;
      SerialESP.println(uuidRead);
    }
  }

  delay(200);
}