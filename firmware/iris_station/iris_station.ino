#include "AudioTools.h"
#include "AudioTools/AudioLibs/I2SCodecStream.h"
#include <esp_heap_caps.h>
#include <math.h>
#include <stdarg.h>
#include <stdio.h>

using namespace audio_tools;
using namespace audio_driver;

static constexpr int kPinMclk = 38;
static constexpr int kPinBclk = 14;
static constexpr int kPinWs = 13;
static constexpr int kPinDout = 45;
static constexpr int kPinDin = 12;
static constexpr int kPinSda = 1;
static constexpr int kPinScl = 2;
static constexpr int kPinPa = 48;
static constexpr int kI2cHz = 100000;

static constexpr uint32_t kBaud = 115200;
static constexpr int kRate = 24000;
static constexpr int kChannels = 2;
static constexpr int kBits = 16;
static constexpr uint32_t kMaxSec = 12;
static constexpr size_t kMaxPcm = (size_t)kRate * (kBits / 8) * 1 * kMaxSec;
static constexpr size_t kChunk = 1024;
static constexpr int kVolume = 15;

enum class State { Idle, Recording, ReceivingPlay };

DriverDeviceInfo *pins = nullptr;
AudioBoard *board = nullptr;
I2SCodecStream *codec = nullptr;
AudioInfo info(kRate, kChannels, kBits);

State state = State::Idle;
bool audioOk = false;
String lineBuf;
uint8_t *pcmBuf = nullptr;
size_t pcmFilled = 0;
uint8_t *playBuf = nullptr;
size_t playNeed = 0;
size_t playGot = 0;
uint32_t lastHbMs = 0;

static void logLine(const char *s) {
  Serial.println(s);
  Serial.flush();
  Serial0.println(s);
  Serial0.flush();
}

static void logf(const char *fmt, ...) {
  char buf[192];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  logLine(buf);
}

static void emit(const char *json) { logLine(json); }

static void emitError(const char *msg) {
  logf("{\"evt\":\"error\",\"msg\":\"%s\"}", msg);
}

static void announce() {
  if (audioOk) {
    emit("{\"evt\":\"ready\",\"audio\":true,\"rate\":24000,\"channels\":1,\"bits\":16}");
    emit("{\"evt\":\"idle\"}");
  } else {
    emit("{\"evt\":\"ready\",\"audio\":false,\"rate\":24000,\"channels\":1,\"bits\":16}");
  }
}

static void serialBegin() {
  Serial.begin(kBaud);
  Serial0.begin(kBaud);
  delay(800);
  while (Serial.available()) Serial.read();
  while (Serial0.available()) Serial0.read();
  logLine("iris_station");
}

static bool openCodec(RxTxMode mode) {
  auto cfg = codec->defaultConfig(mode);
  cfg.copyFrom(info);
  cfg.sd_active = false;
  cfg.input_device = ADC_INPUT_LINE1;
  cfg.output_device = DAC_OUTPUT_ALL;
  return codec->begin(cfg);
}

static void teardownAudio() {
  if (codec) {
    codec->end();
    delete codec;
    codec = nullptr;
  }
  if (board) {
    delete board;
    board = nullptr;
  }
  if (pins) {
    delete pins;
    pins = nullptr;
  }
}

static bool tryDriver(AudioDriver &driver, const char *name) {
  logf("{\"evt\":\"audio_try\",\"driver\":\"%s\"}", name);
  teardownAudio();

  pins = new DriverDeviceInfo();
  pins->addI2C(PinFunction::CODEC, kPinScl, kPinSda, -1, kI2cHz);
  pins->addI2S(PinFunction::CODEC, kPinMclk, kPinBclk, kPinWs, kPinDout, kPinDin);
  pins->addPin(PinFunction::PA, kPinPa, PinLogic::Output);
  if (!pins->begin()) {
    emitError("pins_begin");
    return false;
  }

  board = new AudioBoard(driver, *pins);
  CodecConfig cfg;
  cfg.input_device = ADC_INPUT_LINE1;
  cfg.output_device = DAC_OUTPUT_ALL;
  cfg.i2s.bits = BIT_LENGTH_16BITS;
  cfg.i2s.rate = RATE_24K;
  if (!board->begin(cfg)) {
    emitError("board_begin");
    return false;
  }
  board->setVolume(kVolume);
  board->setPAPower(false);

  codec = new I2SCodecStream(*board);
  if (!openCodec(RXTX_MODE)) {
    emitError("codec_begin");
    return false;
  }

  logf("{\"evt\":\"audio_ok\",\"driver\":\"%s\"}", name);
  return true;
}

static bool initAudio() {
  if (tryDriver(AudioDriverES8311, "ES8311")) return true;
  if (tryDriver(AudioDriverES8311_ES7210, "ES8311_ES7210")) return true;
  return false;
}

static void playTone() {
  if (!audioOk || !codec || !board) {
    emitError("audio_not_ready");
    return;
  }
  emit("{\"evt\":\"tone\"}");
  board->setPAPower(true);

  const float freq = 440.0f;
  const size_t samples = (size_t)(kRate * 0.25f);
  uint8_t frame[4];
  for (size_t i = 0; i < samples; i++) {
    const float t = (float)i / (float)kRate;
    const int16_t s = (int16_t)(sinf(2.0f * 3.14159265f * freq * t) * 2000.0f);
    frame[0] = (uint8_t)(s & 0xff);
    frame[1] = (uint8_t)((s >> 8) & 0xff);
    frame[2] = frame[0];
    frame[3] = frame[1];
    codec->write(frame, 4);
  }

  board->setPAPower(false);
  emit("{\"evt\":\"done\"}");
  emit("{\"evt\":\"idle\"}");
}

static void writeWavHeader(uint8_t *dst, uint32_t pcmBytes) {
  const uint16_t ch = 1;
  const uint32_t byteRate = kRate * ch * (kBits / 8);
  const uint16_t align = ch * (kBits / 8);
  const uint32_t riff = 36 + pcmBytes;
  memcpy(dst + 0, "RIFF", 4);
  memcpy(dst + 4, &riff, 4);
  memcpy(dst + 8, "WAVE", 4);
  memcpy(dst + 12, "fmt ", 4);
  const uint32_t fmtSize = 16;
  memcpy(dst + 16, &fmtSize, 4);
  const uint16_t fmt = 1;
  memcpy(dst + 20, &fmt, 2);
  memcpy(dst + 22, &ch, 2);
  memcpy(dst + 24, &kRate, 4);
  memcpy(dst + 28, &byteRate, 4);
  memcpy(dst + 32, &align, 2);
  memcpy(dst + 34, &kBits, 2);
  memcpy(dst + 36, "data", 4);
  memcpy(dst + 40, &pcmBytes, 4);
}

static void startRec() {
  if (!audioOk || state != State::Idle) {
    emitError("not_idle");
    return;
  }
  pcmFilled = 0;
  board->setPAPower(false);
  state = State::Recording;
  emit("{\"evt\":\"recording\"}");
}

static void stopRec() {
  if (state != State::Recording) {
    emitError("not_recording");
    return;
  }
  const uint32_t pcmBytes = (uint32_t)pcmFilled;
  const uint32_t wavBytes = 44 + pcmBytes;
  logf("{\"evt\":\"stopped\",\"byteLength\":%lu,\"rate\":%d,\"channels\":1,\"bits\":16,\"format\":\"wav\"}",
       (unsigned long)wavBytes, kRate);

  uint8_t hdr[44];
  writeWavHeader(hdr, pcmBytes);
  Serial.write(hdr, 44);
  Serial0.write(hdr, 44);
  if (pcmBytes && pcmBuf) {
    Serial.write(pcmBuf, pcmBytes);
    Serial0.write(pcmBuf, pcmBytes);
  }
  Serial.flush();
  Serial0.flush();

  pcmFilled = 0;
  state = State::Idle;
  emit("{\"evt\":\"idle\"}");
}

static void beginPlay(size_t length) {
  if (!audioOk || state != State::Idle) {
    emitError("not_idle");
    return;
  }
  if (playBuf) {
    heap_caps_free(playBuf);
    playBuf = nullptr;
  }
  playBuf = (uint8_t *)heap_caps_malloc(length, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!playBuf) playBuf = (uint8_t *)malloc(length);
  if (!playBuf) {
    emitError("play_alloc");
    return;
  }
  playNeed = length;
  playGot = 0;
  state = State::ReceivingPlay;
}

static void pumpRec() {
  if (state != State::Recording || !codec || !pcmBuf) return;
  uint8_t chunk[kChunk];
  size_t n = codec->readBytes(chunk, sizeof(chunk));
  if (n < 4) return;
  const int16_t *frames = (const int16_t *)chunk;
  const size_t count = n / 4;
  for (size_t i = 0; i < count; i++) {
    if (pcmFilled + 2 > kMaxPcm) break;
    const int16_t m = frames[i * 2];
    pcmBuf[pcmFilled++] = (uint8_t)(m & 0xff);
    pcmBuf[pcmFilled++] = (uint8_t)((m >> 8) & 0xff);
  }
}

static int hostAvailable() { return Serial.available() + Serial0.available(); }

static int hostRead() {
  if (Serial.available()) return Serial.read();
  if (Serial0.available()) return Serial0.read();
  return -1;
}

static void pumpPlay() {
  if (state != State::ReceivingPlay || !playBuf) return;
  while (hostAvailable() > 0 && playGot < playNeed) {
    playBuf[playGot++] = (uint8_t)hostRead();
  }
  if (playGot < playNeed) return;

  emit("{\"evt\":\"playing\"}");
  board->setPAPower(true);
  const size_t samples = playNeed / 2;
  uint8_t frame[4];
  for (size_t i = 0; i < samples; i++) {
    frame[0] = playBuf[i * 2];
    frame[1] = playBuf[i * 2 + 1];
    frame[2] = frame[0];
    frame[3] = frame[1];
    codec->write(frame, 4);
  }
  board->setPAPower(false);
  heap_caps_free(playBuf);
  playBuf = nullptr;
  playNeed = playGot = 0;
  state = State::Idle;
  emit("{\"evt\":\"done\"}");
  emit("{\"evt\":\"idle\"}");
}

static void handleLine(const String &line) {
  if (line.indexOf("\"cmd\":\"ping\"") >= 0 || line.indexOf("\"cmd\":\"hello\"") >= 0) {
    announce();
    return;
  }
  if (line.indexOf("\"cmd\":\"tone\"") >= 0) {
    playTone();
    return;
  }
  if (line.indexOf("\"cmd\":\"start\"") >= 0) {
    startRec();
    return;
  }
  if (line.indexOf("\"cmd\":\"stop\"") >= 0) {
    stopRec();
    return;
  }
  if (line.indexOf("\"cmd\":\"play\"") >= 0) {
    const int idx = line.indexOf("\"length\":");
    if (idx < 0) {
      emitError("play_missing_length");
      return;
    }
    const size_t length = (size_t)line.substring(idx + 9).toInt();
    if (length == 0 || length > kMaxPcm) {
      emitError("play_bad_length");
      return;
    }
    beginPlay(length);
  }
}

static void pumpLines() {
  while (hostAvailable() > 0) {
    const int c = hostRead();
    if (c < 0) break;
    if (c == '\n') {
      if (lineBuf.length() > 0) handleLine(lineBuf);
      lineBuf = "";
      return;
    }
    if (c != '\r') lineBuf += (char)c;
  }
}

void setup() {
  serialBegin();
  emit("{\"evt\":\"booting\"}");

  AudioLogger::instance().begin(Serial0, AudioLogger::Error);
  AudioDriverLogger.begin(Serial0, AudioDriverLogLevel::Error);

  pcmBuf = (uint8_t *)heap_caps_malloc(kMaxPcm, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!pcmBuf) pcmBuf = (uint8_t *)malloc(kMaxPcm);
  if (!pcmBuf) {
    emitError("pcm_alloc");
  } else {
    emit("{\"evt\":\"audio_init\"}");
    audioOk = initAudio();
    if (!audioOk) emitError("audio_init_failed");
  }

  announce();
  lastHbMs = millis();
}

void loop() {
  if (state == State::Idle && millis() - lastHbMs >= 3000) {
    lastHbMs = millis();
    announce();
  }
  if (state == State::ReceivingPlay) {
    pumpPlay();
    return;
  }
  pumpLines();
  if (state == State::Recording) pumpRec();
}
