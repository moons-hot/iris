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
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
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
  return new Blob([header, pcm], { type: "audio/wav" });
}
