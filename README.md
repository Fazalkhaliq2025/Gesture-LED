# GestureLED — Hand-Gesture Controlled 5-LED System with Browser Web Serial

A high-performance, real-time hand-gesture controlled IoT lighting system built for the **Espressif ESP32** (Arduino Core 3.x). Powered by **MediaPipe Hands** on the web, it connects directly over the native browser **Web Serial API** (115200 baud) for ultra-low latency, zero network dropouts, and instant setup without any Wi-Fi configuration.

Includes an integrated browser firmware flasher using [esp-flasher-button](https://github.com/skr-electronics-lab/esp-flasher-button) for 1-click installation directly from GitHub Pages.

Developed by **SKR Electronics Lab (SK Raihan)**.

---

## Key Highlights

- **Direct Web Serial Control:** Real-time bi-directional UART communication straight from the browser (`navigator.serial`) at 115200 baud.
- **1-Click Browser Flasher:** Integrated `<esp-flasher-button>` lets anyone flash the compiled ESP32 firmware binary directly from Chrome or Edge.
- **100% Client-Side Privacy:** Webcam frames are processed locally inside the browser using MediaPipe Hands WASM. No video feeds or images are ever transmitted over the network.
- **ESP32 Arduino Core 3.x LEDC API:** Flicker-free 5 kHz PWM dimming and digital switching on 5 GPIOs using the new `ledcAttach` and `ledcWrite` APIs.
- **Modern Minimal UI:** Precision-tech aesthetic with flat colors, subtle borders, generous whitespace, system typography, and full dark/light mode support.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Web Browser (Client Side)                       │
│                                                                        │
│   Webcam Feed ──► MediaPipe Hands ──► Gesture Engine                   │
│                                            │                           │
│   ┌────────────────────────────────────────┴───────────────────────┐   │
│   │ Mode 1 (Palm):     MODE1:ON / MODE1:OFF   (State change only)  │   │
│   │ Mode 2 (Pinch):    MODE2:<0-255>          (Throttled ~10 Hz)   │   │
│   │ Mode 3 (Count):    MODE3:<0-5>            (Count change only)  │   │
│   └────────────────────────────────────────┬───────────────────────┘   │
│                                            │ Plain Text Frames + '\n'  │
└────────────────────────────────────────────┼───────────────────────────┘
                                             │ Web Serial API (115200 Baud)
┌────────────────────────────────────────────▼───────────────────────────┐
│                          ESP32 Microcontroller                         │
│                                                                        │
│  [Hardware UART] ──► Non-Blocking Parser ──► LEDC PWM (Core 3.x)       │
│                                               ├── GPIO 13 (LED 1)      │
│                                               ├── GPIO 14 (LED 2)      │
│                                               ├── GPIO 27 (LED 3)      │
│                                               ├── GPIO 26 (LED 4)      │
│                                               └── GPIO 25 (LED 5)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Hardware Setup

### Required Components
- 1x ESP32 WROOM-32 DevKit (30-pin or 38-pin standard `esp32dev`)
- 5x LEDs (5mm or 3mm, any color)
- 5x Current-limiting resistors (220Ω to 330Ω, 1/4W)
- 1x Solderless breadboard and jumper wires
- 1x Micro-USB data cable

### Pinout Configuration
All 5 LEDs are mapped to standard GPIOs, avoiding all strapping pins (0, 2, 4, 5, 12, 15):

| LED Number | ESP32 GPIO | Resistor | Function |
|:---:|:---:|:---:|:---|
| **LED 1** | **GPIO 13** | 220Ω – 330Ω | LEDC PWM / Digital ON-OFF |
| **LED 2** | **GPIO 14** | 220Ω – 330Ω | LEDC PWM / Digital ON-OFF |
| **LED 3** | **GPIO 27** | 220Ω – 330Ω | LEDC PWM / Digital ON-OFF |
| **LED 4** | **GPIO 26** | 220Ω – 330Ω | LEDC PWM / Digital ON-OFF |
| **LED 5** | **GPIO 25** | 220Ω – 330Ω | LEDC PWM / Digital ON-OFF |

> **Wiring:** Connect each GPIO to the Anode (long leg) of an LED. Connect the Cathode (short leg) through a resistor to the ESP32 `GND` rail.

---

## Project Structure

```
gesture-led-esp32-web/
├── platformio.ini       # PlatformIO configuration (Core 3.x, upload speed, monitor)
├── src/
│   └── main.cpp         # Firmware: LEDC PWM driver & non-blocking Serial parser
├── docs/                # GitHub Pages Root (Web App & Flasher)
│   ├── index.html       # Web dashboard with embedded esp-flasher-button
│   ├── style.css        # Minimal precision-tech styling (dark & light mode)
│   ├── app.js           # MediaPipe Hands tracking & Web Serial controller
│   ├── manifest.json    # ESP Web Tools firmware manifest
│   └── firmware/        # Pre-compiled binaries for 1-click browser flashing
│       ├── bootloader.bin
│       ├── partitions.bin
│       ├── boot_app0.bin
│       └── firmware.bin
└── README.md            # Project documentation
```

---

## Running the Web App Locally

Because the Web Serial API and Webcam both require a Secure Context (`HTTPS` or `localhost`), run a local HTTP server:

```powershell
# Navigate to docs folder
cd docs

# Start local server
python -m http.server 8000
```
Then open **`http://localhost:8000`** in Google Chrome or Microsoft Edge.

---

## Hosting on GitHub Pages

1. Push this repository to GitHub.
2. In your repository settings, go to **Pages**.
3. Under **Build and deployment**, select:
   - **Source:** Deploy from a branch
   - **Branch:** `main` / Folder: `/docs`
4. GitHub Pages will publish your site to `https://<your-username>.github.io/<repo-name>/`.
5. Anyone visiting your link can:
   - Click **"Install Firmware"** to flash their ESP32 via Web Serial in seconds.
   - Click **"Connect USB Controller"** to link the dashboard.
   - Control the LEDs using their webcam gestures immediately!

---

## Web Serial Command Protocol

Communication between the web browser and the ESP32 occurs over UART at 115200 baud via plain-text ASCII frames terminated with a newline (`\n`):

| Command Frame | Target Mode | Description | Hardware Effect |
|:---|:---:|:---|:---|
| `MODE1:ON` | Mode 1 | Open palm detected | All 5 LEDs set to full duty (255) |
| `MODE1:OFF` | Mode 1 | Closed fist detected | All 5 LEDs turned off (0) |
| `MODE2:<0-255>` | Mode 2 | Pinch distance mapped | All 5 LEDs set to PWM duty (0 to 255) |
| `MODE3:<0-5>` | Mode 3 | Finger count (0 to 5) | Exactly `N` LEDs turn on (1 to 5), rest off |

### Safety Rules
1. **Mode Switch Reset:** Whenever an incoming message prefix changes (e.g. from `MODE1` to `MODE2`), the firmware **immediately resets all 5 LEDs to OFF** before applying the new state.
2. **Defensive Validation:** Non-numeric payloads, out-of-range values, or malformed frames missing `:` are rejected without crashing, and logged to Serial.
3. **Throttling & Debounce:**
   - `MODE1`: Dispatched **only** when palm state toggles (`OPEN` ↔ `CLOSED`).
   - `MODE2`: Dispatched at a maximum rate of **10 messages per second** (100ms throttle timer).
   - `MODE3`: Dispatched **only** when finger count changes (`0` to `5`).

---

## License

This project is open-source under the [Apache License 2.0](LICENSE).
Copyright 2026 **SK Raihan (SKR Electronics Lab)**.
