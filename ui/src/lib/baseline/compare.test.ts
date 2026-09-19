import { describe, expect, it } from "vitest";

import { compareToPersonalBaseline } from "./compare";
import type { BaselineMetric } from "@/lib/db/types";

const a02HeartRate: BaselineMetric = {
  metricKey: "heart_rate",
  personalMean: 62,
  personalStd: 3,
  personalMin: 56,
  personalMax: 73,
  populationLow: 60,
  populationHigh: 100,
  unit: "bpm",
};

describe("compareToPersonalBaseline", () => {
  it("flags elevated heart rate for A02 demo value", () => {
    const result = compareToPersonalBaseline(84, a02HeartRate);
    expect(result.isSignificant).toBe(true);
    expect(result.status).toBe("elevated_vs_personal_baseline");
  });

  it("accepts near-baseline values", () => {
    const result = compareToPersonalBaseline(63, a02HeartRate);
    expect(result.isSignificant).toBe(false);
    expect(result.status).toBe("within_personal_baseline");
  });
});
