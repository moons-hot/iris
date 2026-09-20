import { describe, expect, it } from "vitest";

import {
  idleVoiceLevels,
  levelsFromFrequencyData,
  mergeLiveTranscript,
  VOICE_WAVE_BARS,
} from "./voice-wave";

describe("voice waveform", () => {
  it("maps analyser frequencies into visible bar levels", () => {
    const data = Uint8Array.from({ length: 64 }, (_, index) =>
      index < 8 ? 220 : 20,
    );
    const levels = levelsFromFrequencyData(data, VOICE_WAVE_BARS);
    expect(levels).toHaveLength(VOICE_WAVE_BARS);
    expect(levels[0]).toBeGreaterThan(0.6);
    expect(levels.at(-1)).toBeLessThan(0.2);
    expect(levels.every((level) => level >= 0.08 && level <= 1)).toBe(true);
  });

  it("merges live Grok Voice chunks without repeating the same phrase", () => {
    expect(mergeLiveTranscript("", "I feel short of breath")).toBe(
      "I feel short of breath",
    );
    expect(
      mergeLiveTranscript("I feel short", "I feel short of breath"),
    ).toBe("I feel short of breath");
    expect(mergeLiveTranscript("headache", "and nausea")).toBe(
      "headache and nausea",
    );
  });

  it("keeps idle bars moving so the box still looks live without a stream", () => {
    const first = idleVoiceLevels(0);
    const later = idleVoiceLevels(12);
    expect(first).toHaveLength(VOICE_WAVE_BARS);
    expect(later).not.toEqual(first);
  });
});
