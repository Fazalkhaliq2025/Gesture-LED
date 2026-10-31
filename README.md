<div align="center">

# GestureLED

**Real-Time Hand-Gesture Vision Controller for ESP32 via Direct Web Serial**

[![ESP32 Arduino Core 3.x](https://img.shields.io/badge/ESP32_Core-3.x-red?style=for-the-badge&logo=espressif)](https://github.com/espressif/arduino-esp32)
[![MediaPipe Hands](https://img.shields.io/badge/MediaPipe-Hands_WASM-blue?style=for-the-badge&logo=google)](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)
[![Web Serial API](https://img.shields.io/badge/Web_Serial-115200_Baud-8b5cf6?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![Wokwi Simulator](https://img.shields.io/badge/Wokwi-Simulation-1976D2?style=for-the-badge)](https://wokwi.com/projects/479407290437929985)
[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-22c55e?style=for-the-badge&logo=github)](https://skr-electronics-lab.github.io/GestureLED/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-orange?style=for-the-badge)](LICENSE)

<br/>

### 🌐 [Launch Live Web Controller & 1-Click Browser Flasher](https://skr-electronics-lab.github.io/GestureLED/)

*No IDEs, no command line, and no Wi-Fi setup required. Flash and control straight from Chrome or Edge.*

</div>

---

## Overview

**GestureLED** is a high-performance embedded vision controller that bridges Google's **MediaPipe Hands** machine learning pipeline directly to an **Espressif ESP32** microcontroller over the native browser **Web Serial API**.

By leveraging high-speed USB-UART (115200 baud) instead of local Wi-Fi, GestureLED eliminates network latency, packet dropouts, and browser camera permission blocks—delivering instantaneous, flicker-free hardware lighting response processed 100% locally on your machine.

---

## Key Features

- **Direct Web Serial Control:** Native hardware UART communication (`navigator.serial`) at 115200 baud. Zero cloud overhead and zero network configuration.
- **1-Click In-Browser Firmware Flashing:** Integrated [`<esp-flasher-button>`](https://github.com/skr-electronics-lab/esp-flasher-button) allows flashing pre-compiled binaries directly from GitHub Pages in seconds.
- **100% Client-Side Privacy:** MediaPipe Hands runs entirely inside the browser through WebAssembly. Video feeds never leave your local machine.
- **ESP32 Arduino Core 3.x LEDC Driver:** 5 kHz flicker-free hardware PWM dimming and digital switching using modern `ledcAttach` and `ledcWrite` APIs across 5 discrete GPIOs.
- **Precision Dark Interface:** Built with clean structural lines, dark obsidian surfaces, vivid `#2BFF00` skeletal tracking, solid `#FF0000` joint nodes, and zero distracting visual clutter.

---

## Gesture Control Modes

| Mode | Gesture | Action & Hardware Behavior | Dispatched Protocol Frame |
|:---:|:---|:---|:---|
| **01** | **Palm Switch** | Open palm illuminates all 5 LEDs to 100% duty; closed fist switches all 5 LEDs OFF. | `MODE1:ON`<br/>`MODE1:OFF`<br/>*(State change only)* |
| **02** | **Pinch Dimmer** | Euclidean distance between thumb tip and index tip is mapped directly to 8-bit PWM duty (0–255). | `MODE2:<0-255>`<br/>*(Throttled at 10 Hz)* |
| **03** | **Finger Counter** | Evaluates extended fingers (0 to 5) and illuminates that exact number of LEDs sequentially. | `MODE3:<0-5>`<br/>*(Count change only)* |

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Web Browser (Client Side)                       │
│                                                                        │
│   Webcam Feed ──► MediaPipe Hands WASM ──► Gesture Classification      │
│                                                   │                    │
│   ┌───────────────────────────────────────────────┴────────────────┐   │
│   │ Mode 1 (Palm Switch):    MODE1:ON / MODE1:OFF  (Edge Trigger)  │   │
│   │ Mode 2 (Pinch Dimmer):   MODE2:<0-255>         (10 Hz Rate)    │   │
│   │ Mode 3 (Finger Counter): MODE3:<0-5>           (Edge Trigger)  │   │
│   └───────────────────────────────────────────────┬────────────────┘   │
│                                                   │ Plain Text + '\n'  │
└───────────────────────────────────────────────────┼────────────────────┘
                                                    │ Web Serial (115200 Baud)
┌───────────────────────────────────────────────────▼────────────────────┐
│                    ESP32 WROOM-32 Microcontroller                      │
│                                                                        │
│  [Hardware UART] ──► Non-Blocking Parser ──► Core 3.x LEDC PWM Driver  │
│                                               ├── GPIO 13 (LED 1)      │
│                                               ├── GPIO 14 (LED 2)      │
│                                               ├── GPIO 27 (LED 3)      │
│                                               ├── GPIO 26 (LED 4)      │
│                                               └── GPIO 25 (LED 5)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Hardware Setup

### Bill of Materials
- **1x** ESP32 WROOM-32 DevKit (standard 30-pin or 38-pin module)
- **5x** LEDs (5mm or 3mm, standard green/red forward voltage)
- **Direct Connection:** No external resistors required for standard 3.3V GPIO driving (220Ω optional for high-efficiency LEDs)
- **1x** Solderless breadboard and jumper wires
- **1x** Micro-USB data cable (ensure data lines are connected, not charge-only)

### Pinout Mapping
All 5 output channels utilize dedicated general-purpose GPIOs, strictly avoiding ESP32 strapping pins (`GPIO 0, 2, 4, 5, 12, 15`):

| LED Index | ESP32 GPIO | Connection | Functionality |
|:---:|:---:|:---:|:---|
| **LED 1** | **GPIO 13** | Direct to Anode (Return to GND) | Digital ON/OFF & 5 kHz LEDC PWM |
| **LED 2** | **GPIO 14** | Direct to Anode (Return to GND) | Digital ON/OFF & 5 kHz LEDC PWM |
| **LED 3** | **GPIO 27** | Direct to Anode (Return to GND) | Digital ON/OFF & 5 kHz LEDC PWM |
| **LED 4** | **GPIO 26** | Direct to Anode (Return to GND) | Digital ON/OFF & 5 kHz LEDC PWM |
| **LED 5** | **GPIO 25** | Direct to Anode (Return to GND) | Digital ON/OFF & 5 kHz LEDC PWM |

> **Wiring Schematic:** Connect each GPIO pin directly to the Anode (longer leg) of an LED. Connect each Cathode (shorter leg) straight to the common `GND` rail on the ESP32. ESP32 3.3V internal GPIO source impedance safely limits current (~12–18mA per pin).

---

## Web Serial Command Protocol

All commands are transmitted as standard ASCII string frames terminated by a newline (`\n`):

```
<MODE_IDENTIFIER>:<PAYLOAD>\n
```

### Safety & Parsing Rules
1. **Mode Switch Auto-Reset:** When switching to a different mode prefix (e.g. from `MODE1` to `MODE2`), the ESP32 firmware **automatically drives all 5 LEDs to 0** before applying new duty parameters.
2. **Defensive Validation:** Any malformed frames, out-of-range payloads, or unmapped prefixes are safely dropped and logged to UART without causing watchdog timeouts or panics.
3. **Bandwidth Optimization:**
   - `MODE1`: Dispatched strictly on binary state change (`OPEN` ↔ `CLOSED`).
   - `MODE2`: Dispatched throttled to ~10 frames per second (100ms interval) to prevent UART buffer overflow.
   - `MODE3`: Dispatched strictly on integer count change (`0` to `5`).

---

## Getting Started

### Option A: 1-Click Browser Flasher (Fastest)
1. Open the live dashboard: **[https://skr-electronics-lab.github.io/GestureLED/](https://skr-electronics-lab.github.io/GestureLED/)**
2. Connect your ESP32 to your PC using a USB data cable.
3. Click **"Install firmware"** in the top header and select your ESP32 COM port.
4. Once flashed, click **"Enable camera"** and **"Connect USB Serial"** to start controlling immediately.

### Option B: Build from Source with PlatformIO
Clone the repository and compile using PlatformIO CLI or VSCode:

```powershell
# Clone the repository
git clone https://github.com/skr-electronics-lab/GestureLED.git
cd GestureLED

# Build and upload firmware to ESP32
pio run --target upload

# Open serial monitor
pio device monitor -b 115200
```

### Option C: Run Web Controller Locally
Both the Web Serial API and Camera `getUserMedia` require a secure context (`HTTPS` or `localhost`):

```powershell
# Serve the web controller locally
cd docs
python -m http.server 8000
```
Then visit **`http://localhost:8000`** in Google Chrome or Microsoft Edge.

---

## Project Structure

```
GestureLED/
├── platformio.ini         # PlatformIO build configuration (Core 3.x, 115200 baud)
├── partitions.csv         # Flash partition table
├── src/
│   └── main.cpp           # Firmware: Non-blocking Serial parser & LEDC PWM engine
├── docs/                  # GitHub Pages Root (Web App & Flasher)
│   ├── index.html         # Web application shell & esp-flasher-button integration
│   ├── style.css          # Precision-tech dark interface system
│   ├── app.js             # MediaPipe Hands tracking & Web Serial manager
│   ├── favicon.svg        # Vector project icon
│   ├── manifest.json      # Firmware manifest for browser flashing
│   └── firmware/          # Pre-compiled binaries for 1-click installation
│       ├── bootloader.bin
│       ├── partitions.bin
│       ├── boot_app0.bin
│       └── firmware.bin
└── README.md              # Project documentation
```

---

## Author & Credits

Developed by **SK Raihan (SKR Electronics Lab)**.

- **GitHub:** [@skr-electronics-lab](https://github.com/skr-electronics-lab)
- **YouTube:** [@skr_electronics_lab](https://youtube.com/@skr_electronics_lab)
- **Twitter (X):** [@skrelectronics](https://twitter.com/skrelectronics)
- **Instagram:** [@skr_electronics_lab](https://instagram.com/skr_electronics_lab)
- **Contact:** `skrelectronicslab@gmail.com`

---

## License

This project is open-source under the [Apache License 2.0](LICENSE).
Copyright 2026 **SK Raihan (SKR Electronics Lab)**.
