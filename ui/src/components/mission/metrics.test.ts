import { describe, expect, it } from "vitest";

import { metricAlert } from "@/components/mission/metrics";
import type { Metric } from "@/lib/mission-types";

function metric(
  label: string,
  value: number,
  baseline: number,
  direction: Metric["direction"] = "stable",
): Metric {
  return {
    label,
    value,
    unit: "u",
    baseline,
    direction,
    history: [value],
  };
}

describe("metricAlert", () => {
  it("stays quiet in the default state", () => {
    expect(metricAlert(metric("Heart rate", 118, 72, "up"), "nominal")).toBe(0);
  });

  it("uses soft red during vitals drift", () => {
    const level = metricAlert(metric("Heart rate", 82, 72, "up"), "mild");
    expect(level).toBeGreaterThanOrEqual(1);
    expect(level).toBeLessThanOrEqual(2);
  });

  it("scores high heart rate and radiation in the major flare state", () => {
    expect(metricAlert(metric("Heart rate", 118, 72, "up"), "dire")).toBe(3);
    expect(metricAlert(metric("Hull radiation", 2.6, 0.18, "up"), "dire")).toBe(
      3,
    );
  });

  it("scores low SpO2 and blood pressure in the major flare state", () => {
    expect(metricAlert(metric("SpO₂", 88, 98, "down"), "dire")).toBe(3);
    expect(metricAlert(metric("Blood pressure", 84, 118, "down"), "dire")).toBe(
      3,
    );
  });

  it("ignores a rise in SpO2 during a flare", () => {
    expect(metricAlert(metric("SpO₂", 99, 98, "up"), "dire")).toBe(0);
  });
});
