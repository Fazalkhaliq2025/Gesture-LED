/**
 * ============================================================================
 * Project: GestureLED
 * Description: Direct USB Serial Hand-Gesture Controlled 5-LED System for ESP32.
 * Author: SKR Electronics Lab (SK Raihan)
 * Framework: Arduino Core 3.x (PlatformIO)
 * Hardware: ESP32 WROOM-32 DevKit + 5 LEDs (GPIO 13, 14, 27, 26, 25)
 * ============================================================================
 */

#include <Arduino.h>

// ============================================================================
// HARDWARE PIN DEFINITIONS & PWM CONFIGURATION
// ============================================================================
// 5 LEDs connected through 220-330 ohm current-limiting resistors.
// Strapping pins (0, 2, 4, 5, 12, 15) are strictly avoided.
const uint8_t LED_PINS[] = {13, 14, 27, 26, 25};
const size_t NUM_LEDS = sizeof(LED_PINS) / sizeof(LED_PINS[0]);

// PWM Configuration for ESP32 Arduino Core 3.x ledcAttach API
const uint32_t PWM_FREQUENCY = 5000; // 5 kHz flicker-free PWM frequency
const uint8_t  PWM_RESOLUTION = 8;    // 8-bit duty resolution (0-255)

// ============================================================================
// STATE ENUMS & TRACKING
// ============================================================================
enum ModePrefix {
    MODE_NONE = 0,
    MODE_1,
    MODE_2,
    MODE_3
};

ModePrefix activeMode = MODE_NONE;

// ============================================================================
// LED CONTROL FUNCTIONS (ESP32 Arduino Core 3.x ledc API)
// ============================================================================

/**
 * @brief Turn off all 5 LEDs immediately.
 */
void turnOffAllLEDs() {
    for (size_t i = 0; i < NUM_LEDS; i++) {
        ledcWrite(LED_PINS[i], 0);
    }
}

/**
 * @brief Initialize all 5 LED pins using Arduino Core 3.x ledcAttach.
 */
void initLEDs() {
    for (size_t i = 0; i < NUM_LEDS; i++) {
        // Core 3.x syntax: ledcAttach(pin, frequency, resolution)
        ledcAttach(LED_PINS[i], PWM_FREQUENCY, PWM_RESOLUTION);
        ledcWrite(LED_PINS[i], 0);
    }
    Serial.println("[Hardware] 5 LEDs initialized on GPIO 13, 14, 27, 26, 25 (LEDC Core 3.x)");
}

/**
 * @brief Set brightness for all 5 LEDs together (PWM 0-255).
 * @param duty Brightness duty cycle (0 = off, 255 = full on).
 */
void setAllLEDsBrightness(uint8_t duty) {
    for (size_t i = 0; i < NUM_LEDS; i++) {
        ledcWrite(LED_PINS[i], duty);
    }
}

/**
 * @brief Light up a specific count of LEDs in array order, turning the rest off.
 * @param count Number of LEDs to turn on (0 to 5).
 */
void setLEDCount(uint8_t count) {
    if (count > NUM_LEDS) {
        count = NUM_LEDS;
    }
    for (size_t i = 0; i < NUM_LEDS; i++) {
        if (i < count) {
            ledcWrite(LED_PINS[i], 255); // Full ON
        } else {
            ledcWrite(LED_PINS[i], 0);   // OFF
        }
    }
}

// ============================================================================
// COMMAND PARSER & DISPATCHER
// ============================================================================

/**
 * @brief Defensively parse and execute incoming plain-text serial commands.
 * Protocol:
 *   MODE1:ON      -> All 5 LEDs full on
 *   MODE1:OFF     -> All 5 LEDs off
 *   MODE2:<0-255> -> All 5 LEDs set to PWM brightness
 *   MODE3:<0-5>   -> Light up N LEDs in array order, rest off
 * 
 * Rules:
 *   - On switching to a different MODE prefix, reset all LEDs off first, then apply state.
 *   - Defensively reject malformed messages without crashing; log rejected messages to Serial.
 */
void processCommand(const char* rawPayload, size_t length) {
    if (length == 0 || length > 64) {
        Serial.printf("[Command] Rejected message: invalid length (%u bytes)\n", (unsigned int)length);
        return;
    }

    // Copy to null-terminated buffer for safe string parsing
    char buffer[65];
    memcpy(buffer, rawPayload, length);
    buffer[length] = '\0';

    // Locate delimiter ':'
    char* colonPos = strchr(buffer, ':');
    if (!colonPos) {
        Serial.printf("[Command] Rejected malformed message (missing ':'): %s\n", buffer);
        return;
    }

    *colonPos = '\0';
    const char* prefix = buffer;
    const char* payload = colonPos + 1;

    // Identify mode prefix
    ModePrefix incomingMode = MODE_NONE;
    if (strcmp(prefix, "MODE1") == 0) {
        incomingMode = MODE_1;
    } else if (strcmp(prefix, "MODE2") == 0) {
        incomingMode = MODE_2;
    } else if (strcmp(prefix, "MODE3") == 0) {
        incomingMode = MODE_3;
    } else {
        Serial.printf("[Command] Rejected message with unknown prefix: %s:%s\n", prefix, payload);
        return;
    }

    // If switching mode from previous message, reset all LEDs off first
    if (incomingMode != activeMode) {
        turnOffAllLEDs();
        activeMode = incomingMode;
        Serial.printf("[Mode] Switched active mode to %s (all LEDs reset to OFF)\n", prefix);
    }

    // Execute mode-specific command
    switch (incomingMode) {
        case MODE_1: {
            if (strcmp(payload, "ON") == 0) {
                setAllLEDsBrightness(255);
                Serial.println("[Mode 1] Palm OPEN -> All LEDs ON");
            } else if (strcmp(payload, "OFF") == 0) {
                turnOffAllLEDs();
                Serial.println("[Mode 1] Palm CLOSED -> All LEDs OFF");
            } else {
                Serial.printf("[Command] Rejected MODE1 invalid payload: %s\n", payload);
            }
            break;
        }

        case MODE_2: {
            // Validate integer in range 0-255
            char* endPtr = nullptr;
            long brightnessVal = strtol(payload, &endPtr, 10);
            if (endPtr == payload || *endPtr != '\0' || brightnessVal < 0 || brightnessVal > 255) {
                Serial.printf("[Command] Rejected MODE2 invalid brightness: %s\n", payload);
                return;
            }
            setAllLEDsBrightness(static_cast<uint8_t>(brightnessVal));
            break;
        }

        case MODE_3: {
            // Validate integer in range 0-5
            char* endPtr = nullptr;
            long countVal = strtol(payload, &endPtr, 10);
            if (endPtr == payload || *endPtr != '\0' || countVal < 0 || countVal > 5) {
                Serial.printf("[Command] Rejected MODE3 invalid count: %s\n", payload);
                return;
            }
            setLEDCount(static_cast<uint8_t>(countVal));
            Serial.printf("[Mode 3] Finger count %ld -> Lighting %ld LEDs\n", countVal, countVal);
            break;
        }

        default:
            break;
    }
}

// ============================================================================
// ARDUINO SETUP
// ============================================================================
void setup() {
    // 1. Initialize Hardware UART at 115200 baud
    Serial.begin(115200);

    // 2. Initialize 5 LED Pins (Core 3.x ledcAttach)
    initLEDs();

    Serial.println("==================================================");
    Serial.println(" GestureLED Controller Ready (Direct USB Serial)");
    Serial.println(" Author: SKR Electronics Lab");
    Serial.println(" Baud: 115200");
    Serial.println(" Protocol: MODE1:ON/OFF | MODE2:0-255 | MODE3:0-5");
    Serial.println("==================================================");
}

// ============================================================================
// ARDUINO LOOP (NON-BLOCKING SERIAL PARSER)
// ============================================================================
void loop() {
    // Read direct USB Serial commands without blocking
    static String serialCmdBuffer = "";
    while (Serial.available() > 0) {
        char c = (char)Serial.read();
        if (c == '\n' || c == '\r') {
            serialCmdBuffer.trim();
            if (serialCmdBuffer.length() > 0) {
                processCommand(serialCmdBuffer.c_str(), serialCmdBuffer.length());
                serialCmdBuffer = "";
            }
        } else {
            if (serialCmdBuffer.length() < 64) {
                serialCmdBuffer += c;
            } else {
                // Buffer overflow protection
                serialCmdBuffer = "";
            }
        }
    }
}
