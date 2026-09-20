# Iris ESP32 station firmware

USB-only bridge for the [LAFVIN AIoT Starter Kit](https://lafvin-aiot-starter-kit.readthedocs.io/en/latest/components_list.html) (ESP32-S3 + AI Chatbot IoT shield + Lafvin audio codec + speaker). The Iris web UI owns the full cycle: **start/stop recording**, Grok Voice + investigation on the laptop, then **play TTS** on the board speaker.

## Arduino IDE setup

1. Board package: **esp32** by Espressif → board **ESP32S3 Dev Module** (enable **USB CDC On Boot** if available).
2. Install these two libraries from **GitHub** (they are often missing from Library Manager search):

| Library | Repo | Arduino folder name after install |
|---------|------|-----------------------------------|
| **audio-driver** (required) | https://github.com/pschatzmann/arduino-audio-driver | `arduino-audio-driver` |
| **audio-tools** (required) | https://github.com/pschatzmann/arduino-audio-tools | `arduino-audio-tools` |

**Do not use** the old [arduino-audiokit](https://github.com/pschatzmann/arduino-audiokit) library — it is obsolete and replaced by `arduino-audio-driver`.

### Install option A — ZIP (easiest)

1. Open each repo → green **Code** → **Download ZIP**.
2. Arduino IDE → **Sketch → Include Library → Add .ZIP Library…** → pick each ZIP.
3. Restart the IDE if includes still fail.

### Install option B — git (easier to update)

```bash
cd ~/Documents/Arduino/libraries   # Windows: Documents\Arduino\libraries
git clone https://github.com/pschatzmann/arduino-audio-driver.git
git clone https://github.com/pschatzmann/arduino-audio-tools.git
```

3. Open `iris_station.ino` and flash over USB Type-C.

### If Library Manager search fails

Search for **`audio-tools`** or **`audio-driver`** (hyphenated names), not “AudioKit”. If nothing shows up, use ZIP/git above — that is the supported path.

## Serial protocol

- **921600 baud**, newline-delimited JSON for control.
- Recording: **24 kHz**, **16-bit**, **mono PCM** wrapped in a **WAV** for upload to `/api/voice`.

| Host → ESP | Meaning |
|------------|---------|
| `{"cmd":"start"}` | Start microphone capture |
| `{"cmd":"stop"}` | Stop capture; ESP sends WAV bytes |
| `{"cmd":"play","rate":24000,"channels":1,"bits":16,"length":N}` | Host sends **N** bytes of raw PCM immediately after the line |

| ESP → host | Meaning |
|------------|---------|
| `{"evt":"ready"}` | Boot complete |
| `{"evt":"recording"}` | Capturing |
| `{"evt":"stopped","byteLength":…,"rate":24000,"channels":1,"bits":16}` | Next on wire: `byteLength` bytes (WAV file) |
| `{"evt":"playing"}` / `{"evt":"done"}` | Playback lifecycle |
| `{"evt":"idle"}` | Ready for next `start` |
| `{"evt":"error","msg":"…"}` | Failure |

## Hardware notes

- Codec wiring matches Lafvin AI Chatbot docs (MCLK 38, BCLK 14, WS 13, DOUT 45, DIN 12, I2C SDA 1 / SCL 2, PA enable 48).
- Sketch uses `AudioDriverES8311_ES7210` (speaker DAC + mic ADC). If init fails, open an issue and we can fall back to `AudioDriverES8311` only.
- If the mic is silent, confirm the audio module is seated on the IoT shield and try the kit external power adapter after the first USB flash.
