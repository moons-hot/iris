import { describe, expect, it } from "vitest";

import {
  flattenProfilerItems,
  isEsp32Device,
  listSerialCandidates,
  looksLikeText,
  pcm16ToWav,
  pickAudioInput,
} from "./usb-voice";

describe("USB voice source", () => {
  it("recognizes an Espressif ESP32 from system_profiler JSON", () => {
    const devices = flattenProfilerItems({
      _name: "USB31Bus",
      items: [
        {
          _name: "USB JTAG/serial debug unit",
          vendor_id: "0x303a (Espressif Systems)",
          product_id: "0x1001",
          manufacturer: "Espressif",
        },
      ],
    });
    expect(devices).toHaveLength(1);
    expect(isEsp32Device(devices[0]!)).toBe(true);
  });

  it("treats ESP32 USB-serial paths as connected and ignores Bluetooth", () => {
    const ports = listSerialCandidates([
      "/dev/cu.usbmodem14101",
      "/dev/cu.Bluetooth-Incoming-Port",
      "/dev/cu.debug-console",
    ]);
    expect(ports).toEqual(["/dev/cu.usbmodem14101"]);
    expect(
      isEsp32Device({
        name: "/dev/cu.usbmodem14101",
        serialPath: "/dev/cu.usbmodem14101",
      }),
    ).toBe(true);
  });

  it("uses the ESP32 USB audio device when the board is plugged in", () => {
    const pick = pickAudioInput(
      [
        {
          deviceId: "built-in",
          kind: "audioinput",
          label: "MacBook Pro Microphone",
        },
        {
          deviceId: "esp",
          kind: "audioinput",
          label: "ESP32-S3 USB Audio",
        },
      ],
      true,
    );
    expect(pick).toMatchObject({
      deviceId: "esp",
      kind: "esp32",
      mode: "audio",
    });
  });

  it("falls back to the MacBook microphone when no ESP32 is present", () => {
    const pick = pickAudioInput(
      [
        {
          deviceId: "built-in",
          kind: "audioinput",
          label: "MacBook Pro Microphone",
        },
      ],
      false,
    );
    expect(pick).toMatchObject({
      deviceId: "built-in",
      kind: "macbook",
      mode: "builtin",
    });
  });

  it("asks for serial capture when ESP32 is on USB but not an audio class device", () => {
    const pick = pickAudioInput(
      [
        {
          deviceId: "built-in",
          kind: "audioinput",
          label: "MacBook Pro Microphone",
        },
      ],
      true,
    );
    expect(pick.mode).toBe("serial");
    expect(pick.kind).toBe("esp32");
  });

  it("wraps PCM as a WAV blob and detects serial text transcripts", () => {
    const wav = pcm16ToWav(new Uint8Array([1, 2, 3, 4]));
    expect(wav.type).toBe("audio/wav");
    expect(looksLikeText(new TextEncoder().encode("I feel short of breath\n"))).toBe(
      true,
    );
    expect(looksLikeText(new Uint8Array([0, 1, 2, 250, 251, 252]))).toBe(false);
  });
});
