/**
 * Iris ↔ ESP32 USB serial protocol (Web Serial).
 * @see firmware/iris_station/README.md
 */

export const IRIS_SERIAL_BAUD = 115200;

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

  async playPcm(pcm: ArrayBuffer, rate = 24000): Promise<void> {
    await this.sendLine({
      cmd: "play",
      rate,
      channels: 1,
      bits: 16,
      length: pcm.byteLength,
    });
    await this.writeBytes(new Uint8Array(pcm));
    await this.waitForEvent("playing");
    await this.waitForEvent("done");
    await this.waitForEvent("idle");
  }

  private async sendLine(payload: Record<string, unknown>): Promise<void> {
    if (!this.writer) throw new Error("Serial not connected");
    const line = `${JSON.stringify(payload)}\n`;
    await this.writer.write(new TextEncoder().encode(line));
  }

  private async writeBytes(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error("Serial not connected");
    const chunkSize = 4096;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      await this.writer.write(data.subarray(offset, offset + chunkSize));
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
  targetRate = 24000,
): Promise<ArrayBuffer> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = mixToMono(buffer);
    const resampled = resampleMono(mono, buffer.sampleRate, targetRate);
    return floatToInt16Pcm(resampled);
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

function floatToInt16Pcm(input: Float32Array): ArrayBuffer {
  const out = new ArrayBuffer(input.length * 2);
  const view = new DataView(out);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
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
