import type {
  BaselineMetric,
  CrewMember,
  EnvironmentReading,
  Measurement,
} from "@/lib/db/types";

export const DEFAULT_CREW_ID = "A02";

export const VITAL_METRIC_KEYS = ["heart_rate", "spo2", "temp_c"] as const;
export type VitalMetricKey = (typeof VITAL_METRIC_KEYS)[number];

export const INVESTIGATION_DISCLAIMER =
  "Investigation support — not a diagnosis.";

export const ENV_ANOMALY_DISCLAIMER =
  "A non-nominal cabin reading is a lead to investigate, not a cause.";

const METRIC_LABELS: Record<string, string> = {
  heart_rate: "Heart rate",
  spo2: "SpO₂",
  temp_c: "Temperature",
  co2_ppm: "CO₂",
  o2_fraction: "O₂ fraction",
  humidity_pct: "Humidity",
  cabin_temp_c: "Cabin temperature",
  radiation_msv_day: "Radiation",
};

export type VitalCardModel = {
  metricKey: VitalMetricKey;
  label: string;
  unit: string;
  latestValue: number | null;
  recordedAtMissionDay: number | null;
  personalMean: number;
  personalMin: number | null;
  personalMax: number | null;
  populationLow: number;
  populationHigh: number;
};

export type EnvStatusBadge = {
  label: "nominal" | "above nominal" | "below nominal";
  tone: "nominal" | "off_nominal";
};

export function resolveCrewId(
  requested: string | undefined,
  rosterIds: readonly string[],
): { crewId: string; unknownRequested: boolean } {
  const id = requested?.trim().toUpperCase();
  if (!id) {
    return { crewId: DEFAULT_CREW_ID, unknownRequested: false };
  }
  if (rosterIds.includes(id)) {
    return { crewId: id, unknownRequested: false };
  }
  return { crewId: DEFAULT_CREW_ID, unknownRequested: true };
}

export function metricLabel(metricKey: string): string {
  return METRIC_LABELS[metricKey] ?? metricKey.replaceAll("_", " ");
}

export function latestMeasurement(
  measurements: readonly Measurement[],
  metricKey: string,
): Measurement | undefined {
  return measurements.find((entry) => entry.metricKey === metricKey);
}

export function formatMetricValue(value: number, metricKey: string): string {
  if (metricKey === "heart_rate" || metricKey === "co2_ppm") {
    return Math.round(value).toString();
  }
  return value.toFixed(1);
}

export function buildVitalCards(
  baselines: readonly BaselineMetric[],
  measurements: readonly Measurement[],
): VitalCardModel[] {
  const cards: VitalCardModel[] = [];
  for (const metricKey of VITAL_METRIC_KEYS) {
    const baseline = baselines.find((entry) => entry.metricKey === metricKey);
    if (!baseline) continue;
    const latest = latestMeasurement(measurements, metricKey);
    cards.push({
      metricKey,
      label: metricLabel(metricKey),
      unit: baseline.unit,
      latestValue: latest?.value ?? null,
      recordedAtMissionDay: latest?.recordedAtMissionDay ?? null,
      personalMean: baseline.personalMean,
      personalMin: baseline.personalMin,
      personalMax: baseline.personalMax,
      populationLow: baseline.populationLow,
      populationHigh: baseline.populationHigh,
    });
  }
  return cards;
}

export function envStatusBadge(
  status: EnvironmentReading["status"],
): EnvStatusBadge {
  if (status === "above_nominal") {
    return { label: "above nominal", tone: "off_nominal" };
  }
  if (status === "below_nominal") {
    return { label: "below nominal", tone: "off_nominal" };
  }
  return { label: "nominal", tone: "nominal" };
}

export function isInvestigationSafeCopy(text: string): boolean {
  if (/\byou have\b|\bcaused\b/i.test(text)) return false;
  const withoutNegatedDiagnosis = text.replace(/\bnot a diagnosis\b/gi, "");
  return !/\bdiagnos(?:e|is|ed|ing)\b/i.test(withoutNegatedDiagnosis);
}

export type StationHeaderModel = {
  title: string;
  missionName: string;
  missionDay: number;
  commDelayMinutes: number;
  linkStatus: "connected" | "autonomous";
};

export function buildStationHeader(mission: {
  missionName: string;
  missionDay: number;
  commDelayMinutesOneWay: number;
  linkStatus: "connected" | "autonomous";
}): StationHeaderModel {
  return {
    title: "MED-1",
    missionName: mission.missionName,
    missionDay: mission.missionDay,
    commDelayMinutes: mission.commDelayMinutesOneWay,
    linkStatus: mission.linkStatus,
  };
}

export function selectedCrewSummary(
  crew: readonly CrewMember[],
  crewId: string,
): CrewMember | undefined {
  return crew.find((member) => member.id === crewId);
}
