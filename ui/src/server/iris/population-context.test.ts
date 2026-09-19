import { describe, expect, it } from "vitest";

import {
  aggregateConceptFrequencies,
  searchPopulationContext,
  suggestFragmentTypes,
} from "@/server/iris/population-context";

describe("population concept aggregation", () => {
  it("computes frequency as distinct-encounter count over matched contexts", () => {
    const frequencies = aggregateConceptFrequencies(100, [
      { concept: "Systolic blood pressure", count: 92 },
      { concept: "Body weight", count: 40 },
      { concept: "Unused", count: 0 },
    ]);

    expect(frequencies).toEqual([
      { concept: "Systolic blood pressure", count: 92, frequency: 0.92 },
      { concept: "Body weight", count: 40, frequency: 0.4 },
    ]);
  });

  it("returns empty frequencies when no contexts matched", () => {
    expect(
      aggregateConceptFrequencies(0, [{ concept: "Hypertension", count: 12 }]),
    ).toEqual([{ concept: "Hypertension", count: 12, frequency: 0 }]);
  });

  it("caps the list and keeps the highest counts", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      concept: `Concept ${index}`,
      count: index + 1,
    }));
    const frequencies = aggregateConceptFrequencies(30, rows, 10);
    expect(frequencies).toHaveLength(10);
    expect(frequencies[0]).toMatchObject({ concept: "Concept 29", count: 30 });
    expect(frequencies.at(-1)).toMatchObject({
      concept: "Concept 20",
      count: 21,
    });
  });
});

describe("fragment type hints", () => {
  it("maps population concepts to Iris types without treating them as allow scores", () => {
    const suggested = suggestFragmentTypes({
      observations: [
        { concept: "Systolic blood pressure", count: 80, frequency: 0.8 },
        { concept: "Hemoglobin A1c", count: 20, frequency: 0.2 },
      ],
      medications: [
        { concept: "Lisinopril 10 MG", count: 55, frequency: 0.55 },
      ],
      procedures: [
        { concept: "Electrocardiogram", count: 12, frequency: 0.12 },
      ],
      conditions: [
        { concept: "Hypertension", count: 70, frequency: 0.7 },
        { concept: "Major depression disorder", count: 4, frequency: 0.04 },
      ],
    });

    expect(suggested).toEqual(
      expect.arrayContaining([
        "vitals",
        "labs",
        "medications",
        "procedures",
        "diagnoses",
        "psychiatric_note",
      ]),
    );
  });
});

describe("offline population tool", () => {
  it("returns unavailable instead of crashing when Snowflake is not configured", async () => {
    const result = await searchPopulationContext(
      "persistent high blood pressure",
    );
    expect(result.status).toBe("unavailable");
    expect(result.corpus).toBe("synthetic clinical contexts");
    expect(result.matchedContexts).toBe(0);
    expect(result.reason).toMatch(/not configured/i);
  });
});
