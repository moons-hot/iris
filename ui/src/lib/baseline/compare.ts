import type { BaselineMetric } from "@/lib/db/types";

export type PersonalBaselineStatus =
  | "within_personal_baseline"
  | "elevated_vs_personal_baseline"
  | "depressed_vs_personal_baseline";

export type BaselineComparison = {
  status: PersonalBaselineStatus;
  isSignificant: boolean;
  personalMean: number;
  unit: string;
};

function significantHigh(value: number, baseline: BaselineMetric): boolean {
  const spread =
    baseline.personalStd != null && baseline.personalStd > 0
      ? baseline.personalStd * 2
      : baseline.personalMax != null
        ? (baseline.personalMax - baseline.personalMean) * 0.75
        : 4;
  return value > baseline.personalMean + spread;
}

function significantLow(value: number, baseline: BaselineMetric): boolean {
  const spread =
    baseline.personalStd != null && baseline.personalStd > 0
      ? baseline.personalStd * 2
      : baseline.personalMin != null
        ? (baseline.personalMean - baseline.personalMin) * 0.75
        : 4;
  return value < baseline.personalMean - spread;
}

export function compareToPersonalBaseline(
  value: number,
  baseline: BaselineMetric,
): BaselineComparison {
  let status: PersonalBaselineStatus = "within_personal_baseline";

  if (
    baseline.personalMin != null &&
    baseline.personalMax != null &&
    value >= baseline.personalMin &&
    value <= baseline.personalMax
  ) {
    return {
      status: "within_personal_baseline",
      isSignificant: false,
      personalMean: baseline.personalMean,
      unit: baseline.unit,
    };
  }

  if (significantHigh(value, baseline)) {
    status = "elevated_vs_personal_baseline";
  } else if (significantLow(value, baseline)) {
    status = "depressed_vs_personal_baseline";
  } else if (
    baseline.personalMax != null &&
    value > baseline.personalMax
  ) {
    status = "elevated_vs_personal_baseline";
  } else if (
    baseline.personalMin != null &&
    value < baseline.personalMin
  ) {
    status = "depressed_vs_personal_baseline";
  }

  return {
    status,
    isSignificant: status !== "within_personal_baseline",
    personalMean: baseline.personalMean,
    unit: baseline.unit,
  };
}

export function deviationEvidenceBody(
  metricLabel: string,
  value: number,
  comparison: BaselineComparison,
  crewId: string,
): string {
  if (!comparison.isSignificant) {
    return `${metricLabel} (${value} ${comparison.unit}) is within the usual range for ${crewId} on this mission.`;
  }

  const direction =
    comparison.status === "elevated_vs_personal_baseline"
      ? "above"
      : "below";

  return `${metricLabel} (${value} ${comparison.unit}) is significantly ${direction} ${crewId}'s established baseline (~${comparison.personalMean} ${comparison.unit}). Personal deviation for investigation — not a diagnosis.`;
}
