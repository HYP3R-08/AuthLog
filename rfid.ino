#include "ST25DVSensor.h"

#define SerialDebug      Serial
#define SerialESP        Serial2   // UART verso ESP8266

// I2C setup per la Nucleo
#define DEV_I2C         Wire
ST25DV st25dv(12, -1, &DEV_I2C);

String lastUUID = "";  // memorizza l'ultimo UUID inviato

void setup() {
  SerialDebug.begin(115200);  // debug USB
  SerialESP.begin(115200);    // UART verso ESP8266
  delay(500);

  if(st25dv.begin() == 0) {
    SerialDebug.println("System Init done!");
  } else {
    SerialDebug.println("System Init failed!");
    while(1);
  }

  SerialDebug.println("Sistema pronto, avvicina il tag o scrivi dal telefono...");
}

void loop() {
  String uuidRead;

  // Legge l'UUID / stringa scritta dal telefono
  if(st25dv.readURI(&uuidRead)) {
    SerialDebug.println("Read failed!");
    delay(500);
    return;
  }

  uuidRead.trim();  // rimuove spazi o newline residui

  if(uuidRead.length() > 0) {
    // Rimuove https:// se presente
    if(uuidRead.startsWith("https://")) {
      uuidRead = uuidRead.substring(8);
    } else if(uuidRead.startsWith("http://")) {
      uuidRead = uuidRead.substring(7);
    }

    // Controlla se è lo stesso UUID dell'ultima lettura
    if(uuidRead != lastUUID) {
      lastUUID = uuidRead;  // aggiorna l'ultimo UUID inviato

      // Invia l'UUID via UART alla ESP8266
      SerialESP.println(uuidRead);
    }
  }

  delay(500);
}
