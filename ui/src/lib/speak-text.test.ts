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
      5,
    );
    expect(speak.length).toBeLessThanOrEqual(70);
    expect(speak).toContain("First sentence");
  });

  it("keeps cabin briefings to at most five sentences", () => {
    const speak = investigationToSpeak(
      "## Speak aloud\n\nOne. Two. Three. Four. Five. Six should be dropped.",
    );
    expect(speak).toBe("One. Two. Three. Four. Five.");
    expect(speak).not.toContain("Six");
  });

  it("parses prediction, historical, and cause sections", async () => {
    const { investigationSections } = await import("./speak-text");
    const sections = investigationSections(`## Predictions
Next recheck may show a rising cabin-air effect if symptoms continue.

## What could be causing these symptoms
Cabin CO2 and the reported headache can line up in time without proving cause.

## Historical analysis
[EVID-OSDR-014] Prior radiation cohorts warrant repeated assessment. This mild window only partly matches those cases.

## Speak aloud
I heard your report.`);
    expect(sections.predictions[0]).toContain("cabin-air");
    expect(sections.historicalAnalysis[0]).toContain("EVID-OSDR-014");
    expect(sections.possibleCauses[0]).toContain("Cabin CO2");
  });
});
