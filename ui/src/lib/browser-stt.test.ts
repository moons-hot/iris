import { describe, expect, it } from "vitest";

import { stitchSpeechResults } from "./browser-stt";

describe("browser STT", () => {
  it("joins final phrases with the latest interim text", () => {
    expect(stitchSpeechResults(["I feel dizzy"], "and nauseous")).toBe(
      "I feel dizzy and nauseous",
    );
    expect(stitchSpeechResults(["  headache  ", ""], " ")).toBe("headache");
    expect(stitchSpeechResults([])).toBe("");
  });
});
