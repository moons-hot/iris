# Iris ESP32 station

| Tools | Value |
|--------|--------|
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | Enabled |
| Flash Mode | **DIO 80MHz** |
| Flash Size | 16MB |
| PSRAM | OPI PSRAM (or Disabled if DIO board has no OPI) |
| Baud | **460800** (Monitor + Web Serial) |

Libs: [arduino-audio-driver](https://github.com/pschatzmann/arduino-audio-driver), [arduino-audio-tools](https://github.com/pschatzmann/arduino-audio-tools)

Audio: mono PCM **16 kHz** / 16-bit (ES7210 needs 16k MCLK coeffs), codec volume **10**, play gain **38%**, mic input volume **85**. Boot runs an I2C scan and tries ES7210 at 0x40–0x43 before ES8311-only.

Cmds: `ping` `tone` `start` `stop` `play` — see Serial Monitor for `ready` / `audio_ok`.
