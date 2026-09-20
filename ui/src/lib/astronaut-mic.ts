import {
  ESP32_SERIAL_FILTERS,
  looksLikeText,
  pcm16ToWav,
} from "./usb-voice";

export type BrowserSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
};

type SerialNavigator = Navigator & {
  serial?: {
    getPorts: () => Promise<BrowserSerialPort[]>;
    requestPort: (options?: {
      filters: { usbVendorId: number }[];
    }) => Promise<BrowserSerialPort>;
  };
};

export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function floatToPcm16(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

export function createPcmTap(
  stream: MediaStream,
  onChunk: (file: File) => void,
  intervalMs = 1600,
) {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const pending: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    pending.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  const timer = window.setInterval(() => {
    if (!pending.length) return;
    const merged = concatFloat32(pending.splice(0, pending.length));
    if (merged.length < context.sampleRate * 0.35) return;
    const wav = pcm16ToWav(floatToPcm16(merged), context.sampleRate);
    onChunk(new File([wav], "grok-live.wav", { type: "audio/wav" }));
  }, intervalMs);

  return () => {
    window.clearInterval(timer);
    processor.disconnect();
    source.disconnect();
    mute.disconnect();
    void context.close();
  };
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function openEsp32Serial(): Promise<BrowserSerialPort> {
  const serial = (navigator as SerialNavigator).serial;
  if (!serial) {
    throw new Error("Web Serial is not available in this browser");
  }
  const existing = await serial.getPorts();
  const preferred =
    existing.find((port) => {
      const vendor = port.getInfo().usbVendorId;
      return vendor === 0x303a || vendor === 0x10c4 || vendor === 0x1a86;
    }) ?? existing[0];
  const port = preferred ?? (await serial.requestPort({ filters: ESP32_SERIAL_FILTERS }));
  await port.open({ baudRate: 115200 });
  return port;
}

export async function captureSerialAudio(
  port: BrowserSerialPort,
  signal: AbortSignal,
): Promise<{ file?: File; transcript?: string }> {
  const reader = port.readable?.getReader();
  if (!reader) throw new Error("ESP32 serial port is not readable");
  const chunks: Uint8Array[] = [];
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort);
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } catch {
    // Cancelled reads reject; treat that as a normal stop.
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
    await port.close().catch(() => undefined);
  }

  const bytes = concatBytes(chunks);
  if (looksLikeText(bytes)) {
    return { transcript: new TextDecoder().decode(bytes).trim() };
  }
  const wav = pcm16ToWav(bytes);
  return {
    file: new File([wav], "astronaut-report.wav", { type: "audio/wav" }),
  };
}
