import { describe, expect, it } from "vitest";

import {
  applyInvestigationAction,
  createInvestigation,
  getInvestigation,
} from "./service";

describe("investigation service", () => {
  it("runs A02 demo flow with environment correlation", () => {
    const inv = createInvestigation("A02", ["dizzy", "headache"]);
    expect(inv.openQuestions.some((q) => /heart rate/i.test(q))).toBe(true);

    let current = applyInvestigationAction(inv.id, {
      action: "record_measurement",
      metricKey: "heart_rate",
      value: 84,
    });
    expect(
      current.evidence.some((e) => e.kind === "personal_deviation"),
    ).toBe(true);

    current = applyInvestigationAction(current.id, {
      action: "record_measurement",
      metricKey: "spo2",
      value: 98,
    });
    current = applyInvestigationAction(current.id, {
      action: "record_measurement",
      metricKey: "temp_c",
      value: 36.5,
    });

    const final = getInvestigation(current.id);
    expect(final).not.toBeNull();
    expect(
      final!.evidence.some(
        (e) => e.kind === "correlation" && e.body.includes("not evidence of causation"),
      ),
    ).toBe(true);
    expect(
      final!.evidence.some((e) => e.metadata?.layer === "space"),
    ).toBe(true);
    expect(
      final!.evidence.some((e) => e.metadata?.layer === "historical"),
    ).toBe(true);
    expect(
      final!.evidence.some(
        (e) =>
          e.kind === "historical_context" &&
          typeof e.metadata?.study_id === "string",
      ),
    ).toBe(true);
    expect(final!.recommendedNext).toBeNull();
  });
});
