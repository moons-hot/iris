import { describe, expect, it } from "vitest";

import { getEnvironmentReadings } from "@/lib/db/queries";
import { isInvestigationSafeCopy } from "@/lib/station/view-model";

import {
  groupEvidenceByLayer,
  retrieveMultiSourceEvidence,
} from "./retrieve";

describe("retrieveMultiSourceEvidence", () => {
  it("returns spacecraft, space, and historical layers for A02 headache + HR context", () => {
    const cabin = getEnvironmentReadings();
    const cards = retrieveMultiSourceEvidence({
      crewId: "A02",
      symptomTags: ["headache", "dizziness"],
      vitals: { heart_rate: 84, spo2: 98, temp_c: 36.5 },
      vitalDeviations: ["heart_rate"],
      cabinReadings: cabin,
    });

    expect(cards.some((c) => c.layer === "spacecraft")).toBe(true);
    expect(cards.some((c) => c.layer === "space")).toBe(true);
    expect(cards.some((c) => c.layer === "historical")).toBe(true);
    expect(
      cards.some(
        (c) =>
          c.layer === "historical" &&
          (c.title.includes("OSD-575") || c.title.includes("OSD-656")),
      ),
    ).toBe(true);
    expect(
      cards.some((c) => c.layer === "space" && /radlab/i.test(c.sourceLabel)),
    ).toBe(true);

    for (const card of cards) {
      expect(isInvestigationSafeCopy(card.body)).toBe(true);
      expect(card.body.toLowerCase()).not.toMatch(/caused by/);
    }
  });

  it("groups evidence by metadata layer", () => {
    const groups = groupEvidenceByLayer([
      {
        id: 1,
        kind: "personal_deviation",
        title: "HR",
        body: "dev",
        metadata: { layer: "astronaut" },
      },
      {
        id: 2,
        kind: "correlation",
        title: "CO2",
        body: "corr",
        metadata: { layer: "spacecraft" },
      },
      {
        id: 3,
        kind: "correlation",
        title: "Rad",
        body: "space",
        metadata: { layer: "space" },
      },
      {
        id: 4,
        kind: "historical_context",
        title: "OSD",
        body: "hist",
        metadata: { layer: "historical" },
      },
    ]);

    expect(groups.astronaut).toHaveLength(1);
    expect(groups.spacecraft).toHaveLength(1);
    expect(groups.space).toHaveLength(1);
    expect(groups.historical).toHaveLength(1);
  });
});
