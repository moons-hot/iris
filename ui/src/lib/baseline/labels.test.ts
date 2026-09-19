import { describe, expect, it } from "vitest";

import { compareToPersonalBaseline } from "./compare";
import { personalBaselineStatusLabel } from "./labels";
import type { BaselineMetric } from "@/lib/db/types";

const a02Hr: BaselineMetric = {
  metricKey: "heart_rate",
  personalMean: 62,
  personalStd: 3,
  personalMin: 56,
  personalMax: 68,
  populationLow: 60,
  populationHigh: 100,
  unit: "bpm",
};

describe("personalBaselineStatusLabel", () => {
  it("labels HR 72 as within usual range for A02", () => {
    const comparison = compareToPersonalBaseline(72, {
      ...a02Hr,
      personalMax: 73,
    });
    const label = personalBaselineStatusLabel("A02", comparison, "Heart rate");
    expect(label).toMatch(/within usual range/i);
    expect(label).not.toMatch(/diagnos/i);
  });

  it("labels HR 84 as significant vs baseline", () => {
    const comparison = compareToPersonalBaseline(84, a02Hr);
    expect(comparison.isSignificant).toBe(true);
    const label = personalBaselineStatusLabel("A02", comparison, "Heart rate");
    expect(label).toMatch(/significant vs A02 baseline/i);
    expect(label).toMatch(/~62/);
  });
});
