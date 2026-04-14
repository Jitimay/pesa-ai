# Pesa AI — ESP32 Hardware Bridge

This folder contains the Arduino firmware for the **LilyGO TTGO T-Call ESP32** with onboard **SIM800H** GSM modem.

## How it works

```
Real SMS arrives on SIM card
        ↓
SIM800H modem (AT commands)
        ↓
ESP32 reads via HardwareSerial
        ↓
USB Serial → PC (115200 baud)
        ↓
Node.js bridge (scripts/serial-bridge.js)
        ↓
POST /api/sms-webhook (Pesa AI)
        ↓
Groq AI parses intent + fraud check
        ↓
Reply sent back over USB → ESP32 → SMS to sender
        ↓
UI shows event live → user confirms → on-chain HSP payment
```

## Hardware

| Component | Details |
|-----------|---------|
| Board | LilyGO TTGO T-Call ESP32 v1.3 or v1.4 |
| Modem | SIM800H (onboard) |
| SIM | Any GSM SIM with SMS enabled |
| Connection | USB-C to laptop |

## Pin mapping (pre-wired on T-Call)

| Signal | GPIO |
|--------|------|
| MODEM_PWKEY | 4 |
| MODEM_RST | 5 |
| MODEM_POWER_ON | 23 |
| MODEM_TX | 27 |
| MODEM_RX | 26 |

## Arduino IDE setup

1. Install **ESP32 board package**
   - File → Preferences → Additional boards URL:
   - `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools → Board Manager → search "esp32" → install

2. Select board: **Tools → Board → ESP32 Arduino → ESP32 Dev Module**

3. Set upload speed: **115200**

4. Open `PesaAI_SMS_Bridge/PesaAI_SMS_Bridge.ino`

5. Upload to board

## Running the bridge

```bash
# From project root
npm install
npm run dev          # Terminal 1 — Pesa AI app on localhost:3000
npm run bridge       # Terminal 2 — USB serial bridge
```

Default serial port is `/dev/ttyUSB0` (Linux). Override:

```bash
SERIAL_PORT=/dev/ttyUSB1 npm run bridge        # Linux alternate
SERIAL_PORT=/dev/tty.usbserial-0001 npm run bridge  # macOS
```

## Serial protocol

The ESP32 and bridge communicate over USB using simple prefixed lines:

| Direction | Format | Description |
|-----------|--------|-------------|
| ESP32 → PC | `SMS_EVENT:{"sender":"+25761234567","message":"..."}` | Incoming SMS |
| PC → ESP32 | `SMS_REPLY:+25761234567:Reply text here` | AI reply to send |

## Demo flow

1. Send SMS to your SIM number from any phone
2. ESP32 receives it → forwards to bridge → Pesa AI parses intent
3. AI reply sent back as SMS to the sender
4. Pesa AI UI shows the event live in the 📡 Live SMS Terminal
5. Click **"Confirm & Pay on-chain"** → MetaMask → real HSP transfer on HashKey Chain
6. Transaction visible on [testnet-explorer.hsk.xyz](https://testnet-explorer.hsk.xyz)

## Supported SMS commands

| Language | Example |
|----------|---------|
| English | `SEND 10 HSP TO 0x742d35Cc...` |
| Kirundi | `Ohereza 10 HSP kuri 0x742d35Cc...` |
| French | `Envoyer 10 HSP à 0x742d35Cc...` |
| Swahili | `Tuma 10 HSP kwa 0x742d35Cc...` |
| Natural | `Ndungikira mama 5 HSP` |
| Query | `CHECK BALANCE` / `HISTORY` / `HELP` |
