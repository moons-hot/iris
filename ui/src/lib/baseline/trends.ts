import type { Measurement } from "@/lib/db/types";

import type { VitalMetricKey } from "@/lib/station/view-model";
import { VITAL_METRIC_KEYS, metricLabel } from "@/lib/station/view-model";

import type { MissionDriftStatus } from "./labels";

const WINDOW = 4;

const DRIFT_THRESHOLDS: Record<VitalMetricKey, number> = {
  heart_rate: 2.5,
  spo2: 0.4,
  temp_c: 0.15,
};

export type MetricMissionTrend = {
  metricKey: VitalMetricKey;
  label: string;
  status: MissionDriftStatus;
  earlyMean: number;
  recentMean: number;
  sampleCount: number;
  summary: string;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function seriesForMetric(
  measurements: readonly Measurement[],
  metricKey: VitalMetricKey,
): Measurement[] {
  return measurements
    .filter((m) => m.metricKey === metricKey)
    .filter((m) => m.source === "routine_monitor")
    .sort((a, b) => a.recordedAtMissionDay - b.recordedAtMissionDay);
}

export function analyzeMetricMissionTrend(
  measurements: readonly Measurement[],
  metricKey: VitalMetricKey,
  crewId: string,
): MetricMissionTrend | null {
  const series = seriesForMetric(measurements, metricKey);
  if (series.length < WINDOW * 2) {
    return null;
  }

  const early = series.slice(0, WINDOW).map((m) => m.value);
  const recent = series.slice(-WINDOW).map((m) => m.value);
  const earlyMean = mean(early);
  const recentMean = mean(recent);
  const delta = recentMean - earlyMean;
  const threshold = DRIFT_THRESHOLDS[metricKey];
  const label = metricLabel(metricKey);

  const drifting =
    Math.abs(delta) >= threshold &&
    (metricKey !== "spo2" || delta < 0) &&
    (metricKey !== "temp_c" || Math.abs(delta) >= threshold);

  const status: MissionDriftStatus = drifting
    ? "drifting_over_mission"
    : "stable";

  const direction =
    delta > 0 ? "upward" : delta < 0 ? "downward" : "flat";

  const summary =
    status === "drifting_over_mission"
      ? `${label} has a gradual ${direction} shift compared with early mission data for ${crewId}.`
      : `${label} is consistent with ${crewId}'s early-mission pattern.`;

  return {
    metricKey,
    label,
    status,
    earlyMean,
    recentMean,
    sampleCount: series.length,
    summary,
  };
}

export type CrewTrendReport = {
  crewId: string;
  missionDay: number;
  trends: MetricMissionTrend[];
  suggestRoutineCheck: boolean;
  routineCheckReason: string | null;
};

export function buildCrewTrendReport(
  crewId: string,
  missionDay: number,
  measurements: readonly Measurement[],
): CrewTrendReport {
  const trends: MetricMissionTrend[] = [];
  for (const metricKey of VITAL_METRIC_KEYS) {
    const trend = analyzeMetricMissionTrend(measurements, metricKey, crewId);
    if (trend) trends.push(trend);
  }

  const drifting = trends.filter((t) => t.status === "drifting_over_mission");
  const suggestRoutineCheck = drifting.length >= 1;
  const routineCheckReason = suggestRoutineCheck
    ? drifting.map((t) => t.summary).join(" ")
    : null;

  return {
    crewId,
    missionDay,
    trends,
    suggestRoutineCheck,
    routineCheckReason,
  };
}
