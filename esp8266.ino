#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>

#define WIFI_SSID       "YOUR_SSID"
#define WIFI_PASSWORD   "YOUR_PASSWORD"

// Endpoint Supabase
String TABLE_AUTH_URL = "YOUR_AUTH_URL";
String TABLE_LOGS_URL = "YOUR_LOG_URL";

// Supabase API key
String SUPABASE_API_KEY = "YOUR_API_KEY";

WiFiClientSecure client;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("Connessione al Wi-Fi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnesso al WiFi!");

  // Non verifichiamo SSL (debug)
  client.setInsecure();

  Serial.println("Pronto! Invia un UUID tramite Serial.");
}


// GET → verifica se l’UUID esiste
bool checkUUIDExists(String uuid) {
  uuid.trim();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi non connesso!");
    return false;
  }

  HTTPClient http;
  String url = TABLE_AUTH_URL + "?uuid=eq." + uuid;

  Serial.println("Richiesta a: " + url);

  if (!http.begin(client, url)) {
    Serial.println("Errore begin()");
    return false;
  }

  http.addHeader("apikey", SUPABASE_API_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_API_KEY);
  http.addHeader("Content-Type", "application/json");

  int code = http.GET();
  Serial.print("HTTP code: ");
  Serial.println(code);

  if (code == 200) {
    String response = http.getString();
    Serial.println("Risposta:");
    Serial.println(response);

    // Se la risposta contiene un array con qualcosa dentro → trovato
    if (response.length() > 5) {
      http.end();
      return true;
    }
  }

  http.end();
  return false;
}


// POST → aggiungi nuovo log
void sendLogToSupabase(String uuid) {
  HTTPClient http;

  if (!http.begin(client, TABLE_LOGS_URL)) {
    Serial.println("Errore begin() per logs");
    return;
  }

  http.addHeader("apikey", SUPABASE_API_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_API_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  // JSON per Supabase
  String json = "{\"uuid_auth\": \"" + uuid + "\"}";
  // NOTA: log_time viene generato automaticamente da Supabase

  Serial.println("Invio log: " + json);

  int code = http.POST(json);
  Serial.print("POST LOG → HTTP code: ");
  Serial.println(code);

  if (code > 0) {
    String response = http.getString();
    Serial.println("Risposta log:");
    Serial.println(response);
  }

  http.end();
}


void loop() {

  if (Serial.available()) {
    String uuid = Serial.readStringUntil('\n');
    uuid.trim();

    Serial.println("\nUUID ricevuto: " + uuid);
    // Controllo validità
    if (checkUUIDExists(uuid)) {
      Serial.println("UUID TROVATO → OK");

      // REGISTRA LOG
      sendLogToSupabase(uuid);

      Serial.println("LOG inviato.");
      Serial.println("OK");
    } 
    else {
      Serial.println("UUID NON trovato → NO");
    }

    Serial.println("\nPronto per un nuovo UUID.\n");
  }
}
