import { describe, expect, it } from "vitest";

import { getCrewMeasurementHistory } from "@/lib/db/queries";

import { buildCrewTrendReport } from "./trends";

describe("buildCrewTrendReport", () => {
  it("suggests routine check for A02 heart-rate mission drift", () => {
    const history = getCrewMeasurementHistory("A02");
    const report = buildCrewTrendReport("A02", 180, history);
    const hr = report.trends.find((t) => t.metricKey === "heart_rate");
    expect(hr?.status).toBe("drifting_over_mission");
    expect(report.suggestRoutineCheck).toBe(true);
    expect(report.routineCheckReason).toMatch(/gradual/i);
  });
});
