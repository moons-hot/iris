# Iris Key firmware

Two ESP32-S3 boards run the same sketch with different identities:

| Device id          | Person       | Role                      |
| ------------------ | ------------ | ------------------------- |
| `IRIS-0042`        | Dr. Maya Chen | Physician, Cardiology     |
| `IRIS-ENGINEER-07` | Alex Kim     | Clinical Systems Engineer |

## What the board is for

Authentication, continued presence, and physical confirmation. Nothing else. Audio
is handled by the browser, which is both easier and more honest: the board would
add nothing to a microphone pipeline.

The board proves that a **registered credential** is present. It does not prove
which human is holding it.

## Wiring

| Function      | Pin     | Notes                                                    |
| ------------- | ------- | -------------------------------------------------------- |
| Confirm button| GPIO0   | The BOOT button already on the board. Pressed = LOW.      |
| WS2812 strip  | GPIO48  | 8-LED strip. Change `PIXEL_PIN` if your board differs.    |

If your board's onboard RGB is on a different pin, only `PIXEL_PIN` needs editing.
The strip is cosmetic: the protocol works without it.

## Build

1. Arduino IDE with the ESP32 board package (core 3.x).
2. Install the **Adafruit NeoPixel** library.
3. Board: *ESP32S3 Dev Module*. Set **USB CDC On Boot: Enabled** so the browser
   sees a serial port.
4. Flash both boards.

## Provisioning

Each device needs the same secret Iris holds for it. Print the demo secrets:

```bash
cd ui && pnpm device:secrets
```

Then either compile the values into `DEFAULT_DEVICE_ID` / `DEFAULT_SECRET_HEX`, or
send a provisioning line over the serial monitor at 115200:

```json
{"cmd":"PROVISION","deviceId":"IRIS-0042","secret":"<64 hex chars>"}
```

The values persist in NVS, so each board only needs this once.

For the hackathon the secret is ordinary NVS storage. A production build would put
it in the ESP32-S3 eFuse / HMAC peripheral so it cannot be read back out. We did
not burn eFuses here because it is irreversible and would risk the demo.

## Protocol

Newline-delimited JSON, 115200 baud. The host sends a command; the board replies
with one line. Nonces always come from the Iris server, never from the browser.

| Host                                               | Board                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `{"cmd":"HELLO"}`                                  | `{"type":"hello","deviceId":"IRIS-0042","fw":"1.0.0","provisioned":true}`     |
| `{"cmd":"CHALLENGE","nonce":"..."}`                | `{"type":"response","kind":"challenge","nonce":"...","hmac":"..."}`           |
| `{"cmd":"PRESENCE","nonce":"..."}`                 | `{"type":"response","kind":"presence","nonce":"...","hmac":"..."}`           |
| `{"cmd":"CONFIRM","nonce":"..."}`                  | `{"type":"confirm","pressed":true,"nonce":"...","hmac":"..."}` after a press  |
| `{"cmd":"STATE","state":"emergency"}`              | `{"type":"state","state":"emergency"}`                                       |

`hmac` is `HMAC-SHA256(device secret, nonce)` as lowercase hex.

`CONFIRM` blocks for up to 20 seconds waiting for the button. On timeout it
replies `{"type":"confirm","pressed":false,"error":"timeout"}`.

## LED states

| State           | Colour        | Meaning                              |
| --------------- | ------------- | ------------------------------------ |
| `idle`          | dim white     | No session                           |
| `authenticated` | green         | Session open, data authorized         |
| `limited`       | amber         | Purpose-limited or reduced view       |
| `denied`        | red           | Request restricted                    |
| `emergency`     | pulsing purple| Break-glass window active             |
| `confirm`       | pulsing blue  | Waiting for the physical button press |

These match the colours in the web UI, so the desk and the screen agree.
