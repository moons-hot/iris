/*
 * Iris Key - hardware-backed authenticator for the Iris patient-context system.
 *
 * Board:   ESP32-S3 (USB CDC on boot enabled)
 * Speaks:  newline-delimited JSON over USB serial at 115200
 * Library: Adafruit NeoPixel (for the WS2812 status strip)
 *
 * What this device does:
 *   - proves possession of a provisioned per-device secret via HMAC-SHA256
 *   - answers a presence beat so the server can tell the key is still plugged in
 *   - requires a physical button press to confirm emergency (break-glass) access
 *   - mirrors the session state on the LED strip
 *
 * What it does not do: it does not prove which human is holding it. It proves a
 * registered credential is present. Audio never touches this device.
 */

#include <Adafruit_NeoPixel.h>
#include <Preferences.h>
#include <mbedtls/md.h>

// ---------------------------------------------------------------- configuration

// Flash one board with each identity. Values can also be set at runtime with the
// PROVISION command, which stores them in NVS.
#define DEFAULT_DEVICE_ID "IRIS-0042"
// Must match the secret Iris holds for this device id.
#define DEFAULT_SECRET_HEX "0000000000000000000000000000000000000000000000000000000000000000"

#define FIRMWARE_VERSION "1.0.0"

static const uint8_t BUTTON_PIN = 0;   // BOOT button on most ESP32-S3 boards
static const uint8_t PIXEL_PIN = 48;   // WS2812 data pin
static const uint8_t PIXEL_COUNT = 8;
static const uint32_t CONFIRM_TIMEOUT_MS = 20000;

// ------------------------------------------------------------------------ state

Adafruit_NeoPixel strip(PIXEL_COUNT, PIXEL_PIN, NEO_GRB + NEO_KHZ800);
Preferences prefs;

String deviceId = DEFAULT_DEVICE_ID;
uint8_t secret[32];
size_t secretLength = 0;

enum LedState {
  STATE_IDLE,
  STATE_AUTHENTICATED,
  STATE_LIMITED,
  STATE_DENIED,
  STATE_EMERGENCY,
  STATE_AWAITING_CONFIRM
};

LedState ledState = STATE_IDLE;
uint32_t lastPresenceMs = 0;

// ------------------------------------------------------------------- utilities

static int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static size_t hexDecode(const String &hex, uint8_t *out, size_t maxOut) {
  size_t length = hex.length() / 2;
  if (length > maxOut) length = maxOut;
  for (size_t i = 0; i < length; i++) {
    int high = hexValue(hex[i * 2]);
    int low = hexValue(hex[i * 2 + 1]);
    if (high < 0 || low < 0) return 0;
    out[i] = (uint8_t)((high << 4) | low);
  }
  return length;
}

static String hexEncode(const uint8_t *data, size_t length) {
  static const char digits[] = "0123456789abcdef";
  String out;
  out.reserve(length * 2);
  for (size_t i = 0; i < length; i++) {
    out += digits[data[i] >> 4];
    out += digits[data[i] & 0x0F];
  }
  return out;
}

/* Minimal string extraction, so the sketch needs no JSON library. */
static String jsonField(const String &line, const char *key) {
  String needle = String("\"") + key + "\"";
  int keyAt = line.indexOf(needle);
  if (keyAt < 0) return "";
  int colon = line.indexOf(':', keyAt + needle.length());
  if (colon < 0) return "";
  int firstQuote = line.indexOf('"', colon);
  if (firstQuote < 0) return "";
  int secondQuote = line.indexOf('"', firstQuote + 1);
  if (secondQuote < 0) return "";
  return line.substring(firstQuote + 1, secondQuote);
}

static String hmacSha256Hex(const String &message) {
  uint8_t digest[32];
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, secret, secretLength);
  mbedtls_md_hmac_update(&ctx, (const unsigned char *)message.c_str(), message.length());
  mbedtls_md_hmac_finish(&ctx, digest);
  mbedtls_md_free(&ctx);
  return hexEncode(digest, sizeof(digest));
}

// ------------------------------------------------------------------------- LEDs

static void paint(uint8_t r, uint8_t g, uint8_t b, uint8_t brightness) {
  strip.setBrightness(brightness);
  for (uint8_t i = 0; i < PIXEL_COUNT; i++) {
    strip.setPixelColor(i, strip.Color(r, g, b));
  }
  strip.show();
}

static void renderLeds() {
  // A slow triangle wave drives the pulsing states.
  uint32_t phase = millis() % 2000;
  uint8_t pulse = phase < 1000 ? (uint8_t)(phase / 6) : (uint8_t)((2000 - phase) / 6);

  switch (ledState) {
    case STATE_IDLE:
      paint(40, 40, 45, 30);
      break;
    case STATE_AUTHENTICATED:
      paint(0, 200, 90, 60);
      break;
    case STATE_LIMITED:
      paint(230, 160, 0, 70);
      break;
    case STATE_DENIED:
      paint(220, 30, 30, 80);
      break;
    case STATE_EMERGENCY:
      paint(150, 40, 220, 40 + pulse);
      break;
    case STATE_AWAITING_CONFIRM:
      paint(40, 120, 240, 40 + pulse);
      break;
  }
}

static LedState parseState(const String &value) {
  if (value == "authenticated") return STATE_AUTHENTICATED;
  if (value == "limited") return STATE_LIMITED;
  if (value == "denied") return STATE_DENIED;
  if (value == "emergency") return STATE_EMERGENCY;
  if (value == "confirm") return STATE_AWAITING_CONFIRM;
  return STATE_IDLE;
}

// -------------------------------------------------------------------- responses

static void emit(const String &json) {
  Serial.println(json);
}

static void emitError(const char *code, const char *message) {
  emit(String("{\"type\":\"error\",\"code\":\"") + code +
       "\",\"message\":\"" + message + "\"}");
}

static bool buttonPressed() {
  return digitalRead(BUTTON_PIN) == LOW;
}

/* Blocks until the clinician presses the button, or the window closes. */
static bool waitForPress(uint32_t timeoutMs) {
  LedState previous = ledState;
  ledState = STATE_AWAITING_CONFIRM;

  // Ignore a button that is already held down when the request arrives.
  uint32_t start = millis();
  while (buttonPressed() && millis() - start < 500) {
    renderLeds();
    delay(10);
  }

  start = millis();
  while (millis() - start < timeoutMs) {
    renderLeds();
    if (buttonPressed()) {
      delay(30);  // debounce
      if (buttonPressed()) {
        while (buttonPressed()) delay(10);
        ledState = previous;
        return true;
      }
    }
    delay(10);
  }

  ledState = previous;
  return false;
}

// -------------------------------------------------------------------- provision

static void loadIdentity() {
  prefs.begin("iris", false);
  deviceId = prefs.getString("deviceId", DEFAULT_DEVICE_ID);
  String secretHex = prefs.getString("secret", DEFAULT_SECRET_HEX);
  secretLength = hexDecode(secretHex, secret, sizeof(secret));
  prefs.end();
}

static void provision(const String &line) {
  String newId = jsonField(line, "deviceId");
  String newSecret = jsonField(line, "secret");
  if (newId.length() == 0 || newSecret.length() != 64) {
    emitError("bad_provision", "deviceId and 64-char hex secret required");
    return;
  }

  prefs.begin("iris", false);
  prefs.putString("deviceId", newId);
  prefs.putString("secret", newSecret);
  prefs.end();
  loadIdentity();

  emit(String("{\"type\":\"provisioned\",\"deviceId\":\"") + deviceId + "\"}");
}

// ------------------------------------------------------------------ command loop

static void handleLine(const String &line) {
  String cmd = jsonField(line, "cmd");

  if (cmd == "HELLO") {
    emit(String("{\"type\":\"hello\",\"deviceId\":\"") + deviceId +
         "\",\"fw\":\"" FIRMWARE_VERSION "\",\"provisioned\":" +
         (secretLength == 32 ? "true" : "false") + "}");
    return;
  }

  if (cmd == "PROVISION") {
    provision(line);
    return;
  }

  if (cmd == "STATE") {
    ledState = parseState(jsonField(line, "state"));
    emit(String("{\"type\":\"state\",\"state\":\"") + jsonField(line, "state") + "\"}");
    return;
  }

  if (cmd == "CHALLENGE" || cmd == "PRESENCE" || cmd == "CONFIRM") {
    String nonce = jsonField(line, "nonce");
    if (nonce.length() == 0) {
      emitError("missing_nonce", "nonce required");
      return;
    }
    if (secretLength != 32) {
      emitError("unprovisioned", "device has no secret");
      return;
    }

    if (cmd == "CONFIRM") {
      // Emergency access needs a human to physically press the button.
      if (!waitForPress(CONFIRM_TIMEOUT_MS)) {
        emit("{\"type\":\"confirm\",\"pressed\":false,\"error\":\"timeout\"}");
        return;
      }
      emit(String("{\"type\":\"confirm\",\"pressed\":true,\"deviceId\":\"") +
           deviceId + "\",\"nonce\":\"" + nonce + "\",\"hmac\":\"" +
           hmacSha256Hex(nonce) + "\"}");
      return;
    }

    if (cmd == "PRESENCE") lastPresenceMs = millis();

    emit(String("{\"type\":\"response\",\"kind\":\"") +
         (cmd == "CHALLENGE" ? "challenge" : "presence") +
         "\",\"deviceId\":\"" + deviceId + "\",\"nonce\":\"" + nonce +
         "\",\"hmac\":\"" + hmacSha256Hex(nonce) + "\"}");
    return;
  }

  emitError("unknown_command", "unrecognised cmd");
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  strip.begin();
  strip.show();
  loadIdentity();
  ledState = STATE_IDLE;
}

void loop() {
  static String buffer;

  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      buffer.trim();
      if (buffer.length() > 0) handleLine(buffer);
      buffer = "";
    } else if (buffer.length() < 512) {
      buffer += c;
    }
  }

  // No presence request for a while means the host is gone; fall back to idle.
  if (ledState != STATE_IDLE && lastPresenceMs > 0 &&
      millis() - lastPresenceMs > 10000) {
    ledState = STATE_IDLE;
  }

  renderLeds();
  delay(5);
}
