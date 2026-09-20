import { describe, expect, it } from "vitest";

import {
  commsAiResponseSummary,
  investigationToSpeak,
  splitSpeakChunks,
} from "./speak-text";

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
    expect(speak).toBe("First sentence is fine. Second sentence is also fine.");
    expect(speak.endsWith(".")).toBe(true);
    expect(speak).not.toContain("Third");
  });

  it("never hard-cuts mid-sentence even when the first sentence is long", () => {
    const long =
      "This is one long complete sentence that clearly exceeds seventy characters all by itself.";
    const speak = investigationToSpeak(`${long} Second is dropped.`, 70, 5);
    expect(speak).toBe(long);
    expect(speak.endsWith(".")).toBe(true);
    expect(speak).not.toContain("Second");
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

  it("builds an informational Mission Control one-liner", () => {
    const summary = commsAiResponseSummary({
      speak:
        "I heard your headache and rising cabin CO2. Sit supported and recheck pulse in five minutes.",
      severity: "monitor",
      crewReport: "I have a headache",
    });
    expect(summary).toContain("Re: I have a headache.");
    expect(summary).toContain("Monitoring:");
    expect(summary).toContain("I heard your headache");
    expect(summary).not.toContain("[ALERT]");
    expect(summary).not.toContain("—");
  });

  it("flags high-priority Iris replies for Mission Control", () => {
    const summary = commsAiResponseSummary({
      speak: "Move to shielding now and notify the crew medical lead.",
      severity: "high",
      crewReport: "Seeing flashes and feeling nauseous",
    });
    expect(summary.startsWith("[ALERT]")).toBe(true);
    expect(summary).toContain("High priority:");
    expect(summary).toContain("Move to shielding");
    expect(summary).not.toContain("—");
  });
});
