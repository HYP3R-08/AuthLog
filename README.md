# AuthLog

An IoT access-control system that identifies a user via **RFID/NFC**, verifies the credential in real time against a remote database, logs every attempt, and drives an electric lock — granting access only to authorized users.

> 🏆 3rd **"Salvatore Di Bartolo" Award** — ITIS "E. Fermi", Giarre.
> Submitted to the national STMicroelectronics *Build the Future with STM32ODE* contest.

The system combines four areas in a single architecture: embedded firmware, serial communication, networking/cloud, and mobile development. A particularly modern touch: the **smartphone itself acts as the NFC tag**, so no physical badges are needed.

📄 Full technical documentation: [`AuthLog-Documentation.pdf`](./AuthLog-Documentation.pdf)

---

## How it works

1. The user taps a **phone-written NFC tag** on the reader.
2. The **STM32** reads the UUID, manages local logic and proximity detection, and forwards the UUID to the gateway over UART (`UUID:<code>`).
3. The **ESP8266** queries the Supabase `Authorized` table over HTTPS REST. If the UUID exists it returns `OK` (and would trigger the lock); otherwise `NO`.
4. Every attempt is written to the `logs` table with an automatic timestamp.
5. A **Time-of-Flight** sensor detects user presence and gives instant visual feedback via LEDs, activating the system only when someone is actually there.

```
         NFC tag (phone)
              │
              ▼
   ST25DV reader + VL53L4CD ToF
              │  (STM32 Nucleo-64 F401RE)
              │  UART 115200 8N1
              ▼
          ESP8266 (ESP-12E)
              │  HTTPS / REST (TLS 1.2)
              ▼
   Supabase — PostgreSQL  (Authorized · logs · user)
              ▲
              │  @supabase/supabase-js
        React Native app (enrolment / login / NFC write)
```

---

## Hardware

| Component | Part | Role |
|-----------|------|------|
| Microcontroller | STM32 Nucleo-64 **F401RE** | Reads RFID, local logic, lock control, ToF over I²C |
| Wi-Fi module | **ESP8266 (ESP-12E)** | Internet connectivity, Supabase REST client |
| NFC reader | **X-NUCLEO-NFC04A1** (ST25DV) | Reads the UUID from a phone-written tag |
| Distance sensor | **X-NUCLEO-53L4A2** (VL53L4CD) | Time-of-Flight presence detection |
| Output | LEDs / relay (electric lock) | Visual feedback and door control |

STM32 ↔ ESP8266 link: **UART**, 115200 baud, 8N1 — STM32 TX → ESP8266 RX, shared GND and 3.3 V.

---

## Software

- **`rfid.ino`** — STM32 firmware (Arduino core). Reads the NFC UUID via the ST25DV library, strips any `http(s)://` prefix, runs ToF proximity detection (LED feedback), and sends the UUID to the ESP8266 over UART.
- **`esp8266.ino`** — Gateway firmware. Connects to Wi-Fi, listens on serial, and talks to Supabase via the `HTTPClient` library: a filtered `GET` on `Authorized` to validate the UUID, then a `POST` to `logs` to record the event.
- **Mobile app (React Native)** — Cross-platform (Android/iOS) app using `@supabase/supabase-js` and `@react-navigation/native`. Sign-up and login screens backed by Supabase, plus a Home screen that checks device NFC status and writes the authorized UUID to the phone's NFC tag (`handleWriteNfc()`).

---

## Data model (Supabase / PostgreSQL)

- **`user`** — accounts registered through the app (name, surname, email, password, `created_at`).
- **`Authorized`** — users cleared for access; an admin promotes a `user` to `Authorized`, keyed by the associated UUID.
- **`logs`** — one record per access attempt: `uuid_auth` (foreign key) and `log_time`.

Access is enforced with **Row Level Security**: unauthenticated clients cannot read sensitive data, and only the gateway (via its service key) may read `Authorized` and insert into `logs`. Even with the endpoint URL, a third party has no permissions on the data.

---

## Tech stack

`Embedded C/C++ (Arduino)` · `STM32` · `ESP8266` · `I²C` · `UART` · `NFC (ST25DV)` · `Time-of-Flight (VL53L4CD)` · `Supabase` · `PostgreSQL` · `REST` · `HTTPS/TLS` · `React Native` · `TypeScript`

---

## Security notes & future work

- The gateway currently authenticates to Supabase with a high-privilege **service key** embedded in firmware (cleartext, for development). In production this key should never live on a client device — the access check belongs behind a server-side endpoint (e.g. a Supabase Edge Function), so the microcontroller never holds privileged credentials.
- TLS certificate verification should be enabled on the ESP8266 (currently relaxed for debugging).
- Row Level Security policies are the real access boundary and should be reviewed for every table.

---

## Author

Cristian Francesco Pennino — [GitHub](https://github.com/HYP3R-08)
