import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { promisify } from "node:util";

import {
  flattenProfilerItems,
  isEsp32Device,
  listSerialCandidates,
  type UsbVoiceDevice,
} from "./usb-voice";

const execFileAsync = promisify(execFile);

export async function scanUsbVoiceSource() {
  const devices: UsbVoiceDevice[] = [];

  try {
    const { stdout } = await execFileAsync(
      "system_profiler",
      ["SPUSBDataType", "-json"],
      { timeout: 8000 },
    );
    const parsed = JSON.parse(stdout) as { SPUSBDataType?: unknown[] };
    for (const bus of parsed.SPUSBDataType ?? []) {
      flattenProfilerItems(bus, devices);
    }
  } catch {
    // USB inventory is best-effort; serial ports still count.
  }

  let serialPorts: string[] = [];
  try {
    const names = await readdir("/dev");
    serialPorts = listSerialCandidates(names.map((name) => `/dev/${name}`));
    for (const serialPath of serialPorts) {
      devices.push({ name: serialPath, serialPath });
    }
  } catch {
    serialPorts = [];
  }

  const matches = devices.filter(isEsp32Device);
  return {
    connected: matches.length > 0,
    devices: matches,
    serialPorts,
  };
}
