import { describe, expect, it } from "vitest";

import {
  commsAiResponseSummary,
  investigationToSpeak,
} from "./speak-text";

describe("speak-text", () => {
  it("returns empty when there is no Speak aloud section", () => {
    const speak = investigationToSpeak(
      "## Predictions\n\n**Heart rate** is up.\n\n- Sit down\n\nSee [EVID](https://example.com).",
    );
    expect(speak).toBe("");
  });

  it("speaks ONLY the Speak aloud section, never Predictions", () => {
    const speak = investigationToSpeak(
      "## Predictions\n\nLong vitals dump that should not be read aloud.\n\n## Speak aloud\n\nI heard your headache. Sit supported and we will recheck pulse in five minutes.",
    );
    expect(speak).toBe(
      "I heard your headache. Sit supported and we will recheck pulse in five minutes.",
    );
    expect(speak).not.toContain("vitals dump");
    expect(speak).not.toContain("Predictions");
  });

  it("does not hard-cap Speak aloud sentences", () => {
    const speak = investigationToSpeak(
      "## Speak aloud\n\nOne. Two. Three. Four. Five. Six is still spoken.",
    );
    expect(speak).toBe("One. Two. Three. Four. Five. Six is still spoken.");
  });

  it("never stops mid-sentence in Speak aloud", () => {
    const long =
      "This is one long complete sentence that clearly exceeds seventy characters all by itself.";
    const speak = investigationToSpeak(
      `## Speak aloud\n\n${long} Second sentence stays too.`,
    );
    expect(speak).toBe(`${long} Second sentence stays too.`);
    expect(speak.endsWith(".")).toBe(true);
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
