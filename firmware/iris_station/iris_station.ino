/**
 * Iris station firmware — USB control + Lafvin ES8311(+ES7210) audio path.
 * Libraries (GitHub ZIP — not always in Library Manager):
 *   https://github.com/pschatzmann/arduino-audio-driver
 *   https://github.com/pschatzmann/arduino-audio-tools
 * Host: Iris /station via Web Serial (no Wi-Fi).
 */

#include "AudioTools.h"
#include "AudioTools/AudioLibs/I2SCodecStream.h"

#include <esp_heap_caps.h>

using namespace audio_tools;
using namespace audio_driver;

// Lafvin AI Chatbot / AIoT shield codec wiring
static constexpr int kPinMclk = 38;
static constexpr int kPinBclk = 14;
static constexpr int kPinWs = 13;
static constexpr int kPinDout = 45;  // ESP → codec
static constexpr int kPinDin = 12;   // codec → ESP
static constexpr int kPinSda = 1;
static constexpr int kPinScl = 2;
static constexpr int kPinPa = 48;
static constexpr int kI2cHz = 100000;

static constexpr uint32_t kSerialBaud = 921600;
static constexpr int kSampleRate = 24000;
static constexpr int kChannels = 2;  // I2S frame; we store mono L channel
static constexpr int kBits = 16;
static constexpr uint32_t kMaxSeconds = 20;
static constexpr size_t kReadChunk = 1024;
static constexpr size_t kMaxPcmBytes =
    (size_t)kSampleRate * (kBits / 8) * 1 * kMaxSeconds;

enum class State { Idle, Recording, Sending, ReceivingPlay, Playing };

DriverDeviceInfo pins;
AudioBoard board(AudioDriverES8311_ES7210, pins);
I2SCodecStream codec(board);
AudioInfo audioInfo(kSampleRate, kChannels, kBits);

State state = State::Idle;
uint8_t *pcmBuffer = nullptr;
size_t pcmFilled = 0;
size_t playRemaining = 0;
size_t playOffset = 0;
uint8_t *playBuffer = nullptr;
String lineBuffer;

static void emitJson(const char *json) { Serial.println(json); }

static void emitError(const char *msg) {
  String out = "{\"evt\":\"error\",\"msg\":\"";
  out += msg;
  out += "\"}";
  emitJson(out.c_str());
}

static void writeWavHeader(uint8_t *dst, uint32_t pcmBytes) {
  const uint16_t wavChannels = 1;
  const uint32_t byteRate = kSampleRate * wavChannels * (kBits / 8);
  const uint16_t blockAlign = wavChannels * (kBits / 8);
  const uint32_t riffSize = 36 + pcmBytes;

  memcpy(dst + 0, "RIFF", 4);
  memcpy(dst + 4, &riffSize, 4);
  memcpy(dst + 8, "WAVE", 4);
  memcpy(dst + 12, "fmt ", 4);
  const uint32_t fmtSize = 16;
  memcpy(dst + 16, &fmtSize, 4);
  const uint16_t audioFormat = 1;
  memcpy(dst + 20, &audioFormat, 2);
  memcpy(dst + 22, &wavChannels, 2);
  memcpy(dst + 24, &kSampleRate, 4);
  memcpy(dst + 28, &byteRate, 4);
  memcpy(dst + 32, &blockAlign, 2);
  memcpy(dst + 34, &kBits, 2);
  memcpy(dst + 36, "data", 4);
  memcpy(dst + 40, &pcmBytes, 4);
}

static bool openCodec(RxTxMode mode) {
  auto cfg = codec.defaultConfig(mode);
  cfg.copyFrom(audioInfo);
  cfg.sd_active = false;
  cfg.input_device = ADC_INPUT_LINE1;
  cfg.output_device = DAC_OUTPUT_ALL;
  return codec.begin(cfg);
}

static bool initAudio() {
  pins.addI2C(PinFunction::CODEC, kPinScl, kPinSda, -1, kI2cHz);
  // mclk, bck, ws, data_out, data_in
  pins.addI2S(PinFunction::CODEC, kPinMclk, kPinBclk, kPinWs, kPinDout,
              kPinDin);
  pins.addPin(PinFunction::PA, kPinPa, PinLogic::Output);
  if (!pins.begin()) {
    return false;
  }

  CodecConfig cfg;
  cfg.input_device = ADC_INPUT_LINE1;
  cfg.output_device = DAC_OUTPUT_ALL;
  cfg.i2s.bits = BIT_LENGTH_16BITS;
  cfg.i2s.rate = RATE_24K;
  if (!board.begin(cfg)) {
    return false;
  }
  board.setVolume(70);
  board.setPAPower(false);

  // Start duplex so we can switch record/play without re-init thrash.
  return openCodec(RXTX_MODE);
}

static void freePlayBuffer() {
  if (playBuffer) {
    heap_caps_free(playBuffer);
    playBuffer = nullptr;
  }
  playRemaining = 0;
  playOffset = 0;
}

static void startRecording() {
  if (state != State::Idle) {
    emitError("not idle");
    return;
  }
  pcmFilled = 0;
  board.setPAPower(false);
  state = State::Recording;
  emitJson("{\"evt\":\"recording\"}");
}

static void stopRecordingAndSend() {
  if (state != State::Recording) {
    emitError("not recording");
    return;
  }
  state = State::Sending;

  const uint32_t pcmBytes = (uint32_t)pcmFilled;
  const uint32_t wavBytes = 44 + pcmBytes;
  String meta = "{\"evt\":\"stopped\",\"byteLength\":";
  meta += wavBytes;
  meta += ",\"rate\":";
  meta += kSampleRate;
  meta += ",\"channels\":1,\"bits\":";
  meta += kBits;
  meta += ",\"format\":\"wav\"}";
  emitJson(meta.c_str());

  uint8_t header[44];
  writeWavHeader(header, pcmBytes);
  Serial.write(header, sizeof(header));
  if (pcmBytes > 0) {
    Serial.write(pcmBuffer, pcmBytes);
  }
  Serial.flush();

  pcmFilled = 0;
  state = State::Idle;
  emitJson("{\"evt\":\"idle\"}");
}

static void beginPlay(size_t length) {
  if (state != State::Idle) {
    emitError("not idle");
    return;
  }
  freePlayBuffer();
  playBuffer =
      (uint8_t *)heap_caps_malloc(length, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!playBuffer) {
    playBuffer = (uint8_t *)malloc(length);
  }
  if (!playBuffer) {
    emitError("play alloc failed");
    return;
  }
  playRemaining = length;
  playOffset = 0;
  state = State::ReceivingPlay;
}

static void pumpRecording() {
  if (state != State::Recording || !pcmBuffer) {
    return;
  }
  uint8_t chunk[kReadChunk];
  size_t len = codec.readBytes(chunk, sizeof(chunk));
  if (len < 4) {
    return;
  }

  // Stereo I2S → keep left channel as mono PCM for Grok upload.
  const int16_t *frames = (const int16_t *)chunk;
  const size_t frameCount = len / 4;
  for (size_t i = 0; i < frameCount; i++) {
    if (pcmFilled + 2 > kMaxPcmBytes) {
      break;
    }
    const int16_t mono = frames[i * 2];
    pcmBuffer[pcmFilled++] = (uint8_t)(mono & 0xff);
    pcmBuffer[pcmFilled++] = (uint8_t)((mono >> 8) & 0xff);
  }
}

static void ingestPlayBytes() {
  if (state != State::ReceivingPlay || !playBuffer) {
    return;
  }
  while (Serial.available() > 0 && playOffset < playRemaining) {
    playBuffer[playOffset++] = (uint8_t)Serial.read();
  }
  if (playOffset < playRemaining) {
    return;
  }

  state = State::Playing;
  emitJson("{\"evt\":\"playing\"}");
  board.setPAPower(true);

  // Expand mono PCM to stereo frames for I2S.
  const size_t samples = playRemaining / 2;
  const size_t frameBytes = 4;
  uint8_t frame[4];
  for (size_t i = 0; i < samples; i++) {
    const uint8_t lo = playBuffer[i * 2];
    const uint8_t hi = playBuffer[i * 2 + 1];
    frame[0] = lo;
    frame[1] = hi;
    frame[2] = lo;
    frame[3] = hi;
    codec.write(frame, frameBytes);
  }

  board.setPAPower(false);
  freePlayBuffer();
  state = State::Idle;
  emitJson("{\"evt\":\"done\"}");
  emitJson("{\"evt\":\"idle\"}");
}

static void handleCommandLine(const String &line) {
  if (line.indexOf("\"cmd\":\"start\"") >= 0) {
    startRecording();
    return;
  }
  if (line.indexOf("\"cmd\":\"stop\"") >= 0) {
    stopRecordingAndSend();
    return;
  }
  if (line.indexOf("\"cmd\":\"play\"") >= 0) {
    int lengthIdx = line.indexOf("\"length\":");
    if (lengthIdx < 0) {
      emitError("play missing length");
      return;
    }
    size_t length = (size_t)line.substring(lengthIdx + 9).toInt();
    if (length == 0 || length > kMaxPcmBytes) {
      emitError("invalid play length");
      return;
    }
    beginPlay(length);
  }
}

static void pumpLineInput() {
  while (Serial.available() > 0) {
    const char c = (char)Serial.read();
    if (c == '\n') {
      const String trimmed = lineBuffer;
      lineBuffer = "";
      if (trimmed.length() > 0) {
        handleCommandLine(trimmed);
      }
      return;
    }
    if (c != '\r') {
      lineBuffer += c;
    }
  }
}

void setup() {
  Serial.begin(kSerialBaud);
  delay(400);
  AudioLogger::instance().begin(Serial, AudioLogger::Warning);
  AudioDriverLogger.begin(Serial, AudioDriverLogLevel::Warning);

  pcmBuffer =
      (uint8_t *)heap_caps_malloc(kMaxPcmBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!pcmBuffer) {
    pcmBuffer = (uint8_t *)malloc(kMaxPcmBytes);
  }
  if (!pcmBuffer) {
    emitError("pcm alloc failed");
    return;
  }

  if (!initAudio()) {
    emitError("audio init failed");
    return;
  }

  emitJson("{\"evt\":\"ready\",\"rate\":24000,\"channels\":1,\"bits\":16}");
  emitJson("{\"evt\":\"idle\"}");
}

void loop() {
  if (state == State::ReceivingPlay) {
    ingestPlayBytes();
    return;
  }
  if (state == State::Recording) {
    pumpRecording();
  }
  if (state == State::Idle || state == State::Recording) {
    pumpLineInput();
  }
}
