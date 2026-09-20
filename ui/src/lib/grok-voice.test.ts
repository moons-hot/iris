import { describe, expect, it } from "vitest";

import {
  GROK_VOICE_INSTRUCTIONS,
  grokVoiceInstructions,
  grokVoiceSession,
} from "./grok-voice";

describe("Grok Voice instructions", () => {
  it("uses the Iris purpose prompt as the speech-to-speech session instructions", () => {
    expect(GROK_VOICE_INSTRUCTIONS).toContain("## Role & Persona");
    expect(GROK_VOICE_INSTRUCTIONS).toContain("## Objective");
    expect(GROK_VOICE_INSTRUCTIONS).toContain("You are Iris");
    expect(GROK_VOICE_INSTRUCTIONS).toContain("You do not diagnose");

    const session = grokVoiceSession();
    expect(session.type).toBe("session.update");
    expect(session.session.instructions).toBe(GROK_VOICE_INSTRUCTIONS);
    expect(session.session.audio.input.transcription.keyterms).toContain(
      "radiation",
    );
  });

  it("lets a caller override the instructions field", () => {
    const override = "## Role & Persona\nYou are a shielding-protocol coach.";
    expect(grokVoiceInstructions(override)).toBe(override);
    expect(grokVoiceSession({ instructions: override }).session.instructions).toBe(
      override,
    );
  });
});
