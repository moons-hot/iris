/**
 * Iris ↔ ESP32 USB serial protocol (Web Serial).
 * @see firmware/iris_station/README.md
 */

/** Match firmware kBaud. 460800 is a safer CP210x rate than 921600. */
export const IRIS_SERIAL_BAUD = 460800;
export const IRIS_PCM_RATE = 16000;
/** Soften Grok TTS before the ESP amp (scratchy = often too hot). */
export const IRIS_PCM_GAIN = 0.35;

export type IrisSerialEvent =
  | { evt: "booting" }
  | { evt: "ready"; audio?: boolean }
  | { evt: "recording" }
  | {
      evt: "stopped";
      byteLength: number;
      rate: number;
      channels: number;
      bits: number;
      format: "wav";
    }
  | { evt: "play_rx"; got: number; need: number }
  | { evt: "playing" }
  | { evt: "done" }
  | { evt: "idle" }
  | { evt: "error"; msg: string };

export class IrisEspLink {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private lineBuffer = "";
  private audioReady = false;

  get connected() {
    return this.port !== null;
  }

  get hasAudio() {
    return this.audioReady;
  }

  async connect(): Promise<void> {
    if (!("serial" in navigator)) {
      throw new Error("Web Serial is not available in this browser.");
    }
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: IRIS_SERIAL_BAUD });

    // ESP32-S3 USB CDC often resets when the port opens ("Break received").
    // Wait, then re-bind streams and ping for status.
    await new Promise((r) => setTimeout(r, 1800));
    await this.bindStreams();

    try {
      await this.sendLine({ cmd: "ping" });
    } catch {
      // Port may still be settling after reset — retry once.
      await new Promise((r) => setTimeout(r, 1200));
      await this.bindStreams();
      await this.sendLine({ cmd: "ping" });
    }

    const ready = await this.waitForEvent("ready", 15_000);
    this.audioReady = ready.evt === "ready" ? ready.audio !== false : false;
    if (this.audioReady) {
      // idle may already have arrived with the announce burst
      try {
        await this.waitForEvent("idle", 3_000);
      } catch {
        // ready-only is enough to proceed
      }
    }
  }

  private async bindStreams(): Promise<void> {
    try {
      this.reader?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      this.writer?.releaseLock();
    } catch {
      /* ignore */
    }
    if (!this.port?.readable || !this.port.writable) {
      throw new Error("Serial port lost after ESP32 reset — press RESET and Connect again.");
    }
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.lineBuffer = "";
  }

  async disconnect(): Promise<void> {
    await this.reader?.cancel();
    await this.writer?.close();
    await this.port?.close();
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.lineBuffer = "";
  }

  async startRecording(): Promise<void> {
    await this.sendLine({ cmd: "start" });
    await this.waitForEvent("recording");
  }

  async stopRecording(): Promise<Blob> {
    await this.sendLine({ cmd: "stop" });
    const stopped = await this.waitForEvent("stopped");
    if (stopped.evt !== "stopped") {
      throw new Error("Expected stopped event");
    }
    const bytes = await this.readExact(stopped.byteLength);
    await this.waitForEvent("idle");
    return new Blob([bytes], { type: "audio/wav" });
  }

  async playPcm(pcm: ArrayBuffer, rate = IRIS_PCM_RATE): Promise<void> {
    const started = performance.now();
    const seconds = pcm.byteLength / 2 / rate;
    console.log(
      `[iris esp] play ${pcm.byteLength} bytes @ ${rate} Hz (~${seconds.toFixed(1)}s)`,
    );
    await this.sendLine({
      cmd: "play",
      rate,
      channels: 1,
      bits: 16,
      length: pcm.byteLength,
    });
    // Pace the write so ESP RX (even with a big buffer) does not drop bytes.
    await this.writeBytes(new Uint8Array(pcm), { pace: true });
    const transferMs = Math.max(60_000, Math.round(seconds * 3000) + 30_000);
    await this.waitForEvent("playing", transferMs);
    await this.waitForEvent("done", Math.round(seconds * 1000) + 15_000);
    await this.waitForEvent("idle", 10_000);
    console.log(
      `[iris esp] play finished in ${Math.round(performance.now() - started)} ms`,
    );
  }

  private async sendLine(payload: Record<string, unknown>): Promise<void> {
    if (!this.writer) throw new Error("Serial not connected");
    const line = `${JSON.stringify(payload)}\n`;
    await this.writer.write(new TextEncoder().encode(line));
  }

  private async writeBytes(
    data: Uint8Array,
    options?: { pace?: boolean },
  ): Promise<void> {
    if (!this.writer) throw new Error("Serial not connected");
    // Small paced chunks avoid overflowing the ESP CDC/UART RX buffer.
    const chunkSize = options?.pace ? 2048 : 8192;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      await this.writer.write(data.subarray(offset, offset + chunkSize));
      if (options?.pace) {
        await new Promise((r) => setTimeout(r, 4));
      }
    }
  }

  private async readExact(length: number): Promise<ArrayBuffer> {
    if (!this.reader) throw new Error("Serial not connected");
    const out = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const { value, done } = await this.reader.read();
      if (done || !value) {
        throw new Error("Serial stream ended before audio completed");
      }
      const take = Math.min(value.length, length - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
      if (take < value.length) {
        const rest = value.subarray(take);
        this.lineBuffer += new TextDecoder().decode(rest);
      }
    }
    return out.buffer;
  }

  private async waitForEvent(
    expected: IrisSerialEvent["evt"],
    timeoutMs = 30_000,
  ): Promise<IrisSerialEvent> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Timed out waiting for ESP32 "${expected}"`);
      }
      const event = await this.readEvent(remaining);
      if (!event) {
        throw new Error(`Timed out waiting for ESP32 "${expected}"`);
      }
      // Non-fatal during bring-up (e.g. audio init failed but serial is up).
      if (event.evt === "error") {
        if (expected === "ready") continue;
        throw new Error(event.msg);
      }
      if (event.evt === "booting") continue;
      if (event.evt === "play_rx") {
        console.log(
          `[iris esp] rx ${event.got}/${event.need} (${Math.round(
            (100 * event.got) / Math.max(1, event.need),
          )}%)`,
        );
        continue;
      }
      if (event.evt === expected) {
        return event;
      }
    }
  }

  private async readEvent(timeoutMs?: number): Promise<IrisSerialEvent | null> {
    const deadline =
      timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
    for (;;) {
      if (deadline !== undefined && Date.now() > deadline) return null;
      const line = await this.readLine(
        deadline === undefined ? undefined : Math.max(1, deadline - Date.now()),
      );
      if (line === null) return null;
      if (!line) continue;
      try {
        return JSON.parse(line) as IrisSerialEvent;
      } catch {
        continue;
      }
    }
  }

  private async readLine(timeoutMs?: number): Promise<string | null> {
    const deadline =
      timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
    for (;;) {
      const newline = this.lineBuffer.indexOf("\n");
      if (newline >= 0) {
        const line = this.lineBuffer.slice(0, newline).trim();
        this.lineBuffer = this.lineBuffer.slice(newline + 1);
        return line.length ? line : "";
      }
      if (!this.reader) throw new Error("Serial not connected");
      if (deadline !== undefined) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return null;
        const result = await Promise.race([
          this.reader.read(),
          new Promise<"timeout">((resolve) =>
            setTimeout(() => resolve("timeout"), remaining),
          ),
        ]);
        if (result === "timeout") return null;
        const { value, done } = result;
        if (done || !value) return null;
        this.lineBuffer += new TextDecoder().decode(value);
        continue;
      }
      const { value, done } = await this.reader.read();
      if (done || !value) return null;
      this.lineBuffer += new TextDecoder().decode(value);
    }
  }
}

/** Decode speak API MPEG audio to mono 16-bit PCM at targetRate for ESP playback. */
export async function mp3BlobToMonoPcm(
  blob: Blob,
  targetRate = IRIS_PCM_RATE,
  gain = IRIS_PCM_GAIN,
): Promise<ArrayBuffer> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = mixToMono(buffer);
    const resampled = resampleMono(mono, buffer.sampleRate, targetRate);
    return floatToInt16Pcm(resampled, gain);
  } finally {
    await ctx.close();
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const out = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      out[i] = (out[i] ?? 0) + (data[i] ?? 0) / channels;
    }
  }
  return out;
}

function resampleMono(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;
  const outLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = (i * fromRate) / toRate;
    const idx = Math.floor(src);
    const frac = src - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function floatToInt16Pcm(input: Float32Array, gain = 1): ArrayBuffer {
  const out = new ArrayBuffer(input.length * 2);
  const view = new DataView(out);
  for (let i = 0; i < input.length; i++) {
    // Soft-clip after gain so hot TTS peaks don't hash through the amp.
    let sample = (input[i] ?? 0) * gain;
    sample = Math.tanh(sample * 1.2) / Math.tanh(1.2);
    sample = Math.max(-1, Math.min(1, sample));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

declare global {
  interface Navigator {
    serial: Serial;
  }

  interface Serial {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
  }

  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialPort {
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
  }

  interface SerialOptions {
    baudRate: number;
    bufferSize?: number;
    dataBits?: number;
    flowControl?: "none" | "hardware";
    parity?: "none" | "even" | "odd";
    stopBits?: number;
  }
}

export {};
