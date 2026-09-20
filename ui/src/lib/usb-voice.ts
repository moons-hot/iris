export type UsbVoiceDevice = {
  name: string;
  vendorId?: number;
  productId?: number;
  manufacturer?: string;
  serialPath?: string;
};

export type VoiceInputKind = "esp32" | "macbook";

export type VoiceInputPick = {
  deviceId?: string;
  kind: VoiceInputKind;
  label: string;
  mode: "audio" | "serial" | "builtin";
};

export const ESP32_VENDOR_IDS = new Set([
  0x303a, // Espressif native USB
  0x10c4, // Silicon Labs CP210x
  0x1a86, // WCH CH340 / CH9102
]);

export const ESP32_SERIAL_FILTERS = [
  { usbVendorId: 0x303a },
  { usbVendorId: 0x10c4 },
  { usbVendorId: 0x1a86 },
];

export function parseVendorId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const hex = value.match(/0x([0-9a-f]+)/i);
  if (hex?.[1]) return Number.parseInt(hex[1], 16);
  const dec = Number.parseInt(value, 10);
  return Number.isNaN(dec) ? undefined : dec;
}

export function isEsp32Device(device: UsbVoiceDevice): boolean {
  if (device.vendorId === 0x303a) return true;
  const hay =
    `${device.name} ${device.manufacturer ?? ""} ${device.serialPath ?? ""}`.toLowerCase();
  if (/esp32|espressif/.test(hay)) return true;
  if (device.vendorId && ESP32_VENDOR_IDS.has(device.vendorId)) return true;
  return Boolean(
    device.serialPath &&
      /cu\.(usbmodem|usbserial|wchusb|slab_usb)/i.test(device.serialPath),
  );
}

export function flattenProfilerItems(
  node: unknown,
  out: UsbVoiceDevice[] = [],
): UsbVoiceDevice[] {
  if (!node || typeof node !== "object") return out;
  const item = node as Record<string, unknown>;
  const name = typeof item._name === "string" ? item._name : "";
  const vendorId = parseVendorId(item.vendor_id);
  const manufacturer =
    typeof item.manufacturer === "string" ? item.manufacturer : undefined;
  if (name && (vendorId || manufacturer || item.product_id)) {
    out.push({
      name,
      vendorId,
      productId: parseVendorId(item.product_id),
      manufacturer,
    });
  }
  if (Array.isArray(item.items)) {
    for (const child of item.items) flattenProfilerItems(child, out);
  }
  return out;
}

export function listSerialCandidates(paths: string[]): string[] {
  return paths.filter((path) =>
    /cu\.(usbmodem|usbserial|wchusb|slab_usb)/i.test(path),
  );
}

export function pickAudioInput(
  devices: { deviceId: string; kind: string; label: string }[],
  esp32Connected: boolean,
): VoiceInputPick {
  const inputs = devices.filter((device) => device.kind === "audioinput");
  if (esp32Connected) {
    const named = inputs.find((device) =>
      /esp32|espressif/i.test(device.label),
    );
    if (named) {
      return {
        deviceId: named.deviceId,
        kind: "esp32",
        label: named.label,
        mode: "audio",
      };
    }
    const usb = inputs.find(
      (device) =>
        /usb/i.test(device.label) &&
        !/macbook|built-in|internal/i.test(device.label),
    );
    if (usb) {
      return {
        deviceId: usb.deviceId,
        kind: "esp32",
        label: usb.label,
        mode: "audio",
      };
    }
    const external = inputs.find(
      (device) =>
        device.label &&
        !/macbook|built-in|internal|default/i.test(device.label),
    );
    if (external) {
      return {
        deviceId: external.deviceId,
        kind: "esp32",
        label: external.label,
        mode: "audio",
      };
    }
    return { kind: "esp32", label: "ESP32 USB", mode: "serial" };
  }

  const builtIn = inputs.find((device) =>
    /macbook|built-in|internal/i.test(device.label),
  );
  return {
    deviceId: builtIn?.deviceId,
    kind: "macbook",
    label: builtIn?.label || "MacBook microphone",
    mode: "builtin",
  };
}

export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return false;
  let printable = 0;
  for (const byte of bytes) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) {
      printable += 1;
    }
  }
  return printable / bytes.byteLength > 0.85;
}

export function pcm16ToWav(pcm: Uint8Array, sampleRate = 16000): Blob {
  const bytes = pcm16ToWavBytes(pcm, sampleRate);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: "audio/wav" });
}

/** Canonical 44-byte PCM WAV — use this before xAI STT (ESP headers can sniff-fail). */
export function pcm16ToWavBytes(pcm: Uint8Array, sampleRate = 16000): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(out.buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

/** Pull PCM + rate from a WAV (or treat whole buffer as PCM). */
export function extractPcm16(
  bytes: Uint8Array,
  fallbackRate = 24000,
): { pcm: Uint8Array; sampleRate: number } {
  if (
    bytes.byteLength >= 44 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let sampleRate = fallbackRate;
    let pcm: Uint8Array | null = null;
    let offset = 12; // after "WAVE"
    while (offset + 8 <= bytes.byteLength) {
      const id = String.fromCharCode(
        bytes[offset] ?? 0,
        bytes[offset + 1] ?? 0,
        bytes[offset + 2] ?? 0,
        bytes[offset + 3] ?? 0,
      );
      const size = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + size, bytes.byteLength);
      if (id === "fmt " && size >= 16) {
        sampleRate = view.getUint32(dataStart + 4, true) || fallbackRate;
      } else if (id === "data") {
        pcm = bytes.subarray(dataStart, dataEnd);
        break;
      }
      offset = dataStart + size + (size & 1);
    }
    if (!pcm) pcm = bytes.subarray(44);
    const even = pcm.byteLength & 1 ? pcm.subarray(0, pcm.byteLength - 1) : pcm;
    return { pcm: even, sampleRate };
  }
  const even =
    bytes.byteLength & 1 ? bytes.subarray(0, bytes.byteLength - 1) : bytes;
  return { pcm: even, sampleRate: fallbackRate };
}

/** Linear resample mono PCM16. */
export function resamplePcm16(
  pcm: Uint8Array,
  fromRate: number,
  toRate: number,
): Uint8Array {
  if (fromRate === toRate || pcm.byteLength < 4) return pcm;
  const inSamples = Math.floor(pcm.byteLength / 2);
  const outSamples = Math.max(1, Math.round((inSamples * toRate) / fromRate));
  const out = new Uint8Array(outSamples * 2);
  const src = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const dst = new DataView(out.buffer);
  for (let i = 0; i < outSamples; i += 1) {
    const srcPos = (i * fromRate) / toRate;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const a = src.getInt16(Math.min(idx, inSamples - 1) * 2, true);
    const b = src.getInt16(Math.min(idx + 1, inSamples - 1) * 2, true);
    dst.setInt16(i * 2, Math.round(a + (b - a) * frac), true);
  }
  return out;
}

/**
 * Prepare ESP/browser PCM for Grok STT: remove DC, normalize, resample to 16 kHz.
 * Empty STT with loud peak often means garbled/noisy 24 kHz captures.
 */
export function preparePcmForStt(
  pcm: Uint8Array,
  sampleRate: number,
  targetRate = 16000,
): { pcm: Uint8Array; sampleRate: number } {
  const samples = Math.floor(pcm.byteLength / 2);
  if (samples < 8) return { pcm, sampleRate };

  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let sum = 0;
  let peak = 1;
  for (let i = 0; i < samples; i += 1) {
    const s = view.getInt16(i * 2, true);
    sum += s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  const mean = sum / samples;
  // Quiet → boost. Hard-clipped ESP captures (peak at ceiling) → soften so STT
  // sees speech instead of a flat rail; leave normal speech alone.
  const gain =
    peak < 8000
      ? Math.min(4, (0.55 * 32767) / peak)
      : peak >= 30000
        ? 0.42
        : 1;

  const cleaned = new Uint8Array(samples * 2);
  const out = new DataView(cleaned.buffer);
  for (let i = 0; i < samples; i += 1) {
    let s = (view.getInt16(i * 2, true) - mean) * gain;
    if (s > 32767) s = 32767;
    if (s < -32768) s = -32768;
    out.setInt16(i * 2, Math.round(s), true);
  }

  const resampled = resamplePcm16(cleaned, sampleRate, targetRate);
  return { pcm: resampled, sampleRate: targetRate };
}
