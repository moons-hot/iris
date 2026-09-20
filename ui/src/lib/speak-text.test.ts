import { describe, expect, it } from "vitest";

import { investigationToSpeak, splitSpeakChunks } from "./speak-text";

describe("speak-text", () => {
  it("strips markdown into spoken prose", () => {
    const speak = investigationToSpeak(
      "## Observed\n\n**Heart rate** is up.\n\n- Sit down\n\nSee [EVID](https://example.com).",
    );
    expect(speak).toContain("Heart rate is up");
    expect(speak).toContain("Sit down");
    expect(speak).toContain("EVID");
    expect(speak).not.toContain("**");
    expect(speak).not.toContain("##");
  });

  it("prefers a short Speak aloud section", () => {
    const speak = investigationToSpeak(
      "## Observed\n\nLong vitals dump that should not be read aloud.\n\n## Speak aloud\n\nI heard your headache. Sit supported and we will recheck pulse in five minutes.",
    );
    expect(speak).toBe(
      "I heard your headache. Sit supported and we will recheck pulse in five minutes.",
    );
    expect(speak).not.toContain("vitals dump");
  });

  it("caps spoken length at sentence boundaries", () => {
    const speak = investigationToSpeak(
      "First sentence is fine. Second sentence is also fine. Third sentence should often be cut when the budget is tight.",
      70,
    );
    expect(speak.length).toBeLessThanOrEqual(70);
    expect(speak).toContain("First sentence");
  });

  it("chunks long speech on sentence boundaries", () => {
    const text =
      "First sentence is here. Second sentence follows next. Third one wraps it up for the crew briefing today.";
    const chunks = splitSpeakChunks(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("First sentence");
    expect(chunks.every((c) => c.length <= 60)).toBe(true);
  });
});
