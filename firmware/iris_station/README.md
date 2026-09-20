# Iris ESP32 station

| Tools | Value |
|--------|--------|
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | Enabled |
| Flash Mode | **DIO 80MHz** |
| Flash Size | 16MB |
| PSRAM | OPI PSRAM (or Disabled if DIO board has no OPI) |
| Baud | 115200 |

Libs: [arduino-audio-driver](https://github.com/pschatzmann/arduino-audio-driver), [arduino-audio-tools](https://github.com/pschatzmann/arduino-audio-tools)

Cmds: `ping` `tone` `start` `stop` `play` — see Serial Monitor for `ready` / `audio_ok`.
