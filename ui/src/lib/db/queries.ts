import type {
  BaselineMetric,
  CrewMember,
  EnvironmentReading,
  HistoricalEvidence,
  Measurement,
  MissionState,
} from "./types";
import { getDb } from "./client";

function envStatus(
  value: number,
  low: number,
  high: number,
): EnvironmentReading["status"] {
  if (value < low) return "below_nominal";
  if (value > high) return "above_nominal";
  return "nominal";
}

export function getMissionState(): MissionState & { crew: CrewMember[] } {
  const db = getDb();
  const mission = db
    .prepare(
      `SELECT mission_name, mission_phase, mission_day,
              comm_delay_minutes_one_way, link_status
       FROM mission_state WHERE id = 1`,
    )
    .get() as {
    mission_name: string;
    mission_phase: string;
    mission_day: number;
    comm_delay_minutes_one_way: number;
    link_status: "connected" | "autonomous";
  };

  const crew = db
    .prepare(`SELECT id, display_name, role FROM crew ORDER BY id`)
    .all() as Array<{ id: string; display_name: string; role: string }>;

  return {
    missionName: mission.mission_name,
    missionPhase: mission.mission_phase,
    missionDay: mission.mission_day,
    commDelayMinutesOneWay: mission.comm_delay_minutes_one_way,
    linkStatus: mission.link_status,
    crew: crew.map((c) => ({
      id: c.id,
      displayName: c.display_name,
      role: c.role,
    })),
  };
}

export function getCrewById(crewId: string): {
  crew: CrewMember;
  baselines: BaselineMetric[];
  recentMeasurements: Measurement[];
} | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, display_name, role FROM crew WHERE id = ?`)
    .get(crewId) as
    | { id: string; display_name: string; role: string }
    | undefined;

  if (!row) {
    return null;
  }

  const baselines = db
    .prepare(
      `SELECT metric_key, personal_mean, personal_std, personal_min, personal_max,
              population_low, population_high, unit
       FROM baseline_metrics WHERE crew_id = ? ORDER BY metric_key`,
    )
    .all(crewId) as Array<{
    metric_key: string;
    personal_mean: number;
    personal_std: number | null;
    personal_min: number | null;
    personal_max: number | null;
    population_low: number;
    population_high: number;
    unit: string;
  }>;

  const measurements = db
    .prepare(
      `SELECT metric_key, value, recorded_at_mission_day, source
       FROM measurements WHERE crew_id = ?
       ORDER BY recorded_at_mission_day DESC, id DESC
       LIMIT 24`,
    )
    .all(crewId) as Array<{
    metric_key: string;
    value: number;
    recorded_at_mission_day: number;
    source: string;
  }>;

  return {
    crew: {
      id: row.id,
      displayName: row.display_name,
      role: row.role,
    },
    baselines: baselines.map((b) => ({
      metricKey: b.metric_key,
      personalMean: b.personal_mean,
      personalStd: b.personal_std,
      personalMin: b.personal_min,
      personalMax: b.personal_max,
      populationLow: b.population_low,
      populationHigh: b.population_high,
      unit: b.unit,
    })),
    recentMeasurements: measurements.map((m) => ({
      metricKey: m.metric_key,
      value: m.value,
      recordedAtMissionDay: m.recorded_at_mission_day,
      source: m.source,
    })),
  };
}

export function getCrewMeasurementHistory(crewId: string): Measurement[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT metric_key, value, recorded_at_mission_day, source
       FROM measurements WHERE crew_id = ?
       ORDER BY recorded_at_mission_day ASC, id ASC`,
    )
    .all(crewId.toUpperCase()) as Array<{
    metric_key: string;
    value: number;
    recorded_at_mission_day: number;
    source: string;
  }>;

  return rows.map((m) => ({
    metricKey: m.metric_key,
    value: m.value,
    recordedAtMissionDay: m.recorded_at_mission_day,
    source: m.source,
  }));
}

export function getEnvironmentReadings(): EnvironmentReading[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT zone, metric_key, value, nominal_low, nominal_high, unit,
              recorded_at_mission_day
       FROM environment_readings ORDER BY zone, metric_key`,
    )
    .all() as Array<{
    zone: string;
    metric_key: string;
    value: number;
    nominal_low: number;
    nominal_high: number;
    unit: string;
    recorded_at_mission_day: number;
  }>;

  return rows.map((r) => ({
    zone: r.zone,
    metricKey: r.metric_key,
    value: r.value,
    nominalLow: r.nominal_low,
    nominalHigh: r.nominal_high,
    unit: r.unit,
    recordedAtMissionDay: r.recorded_at_mission_day,
    status: envStatus(r.value, r.nominal_low, r.nominal_high),
  }));
}

export function getHistoricalEvidence(): HistoricalEvidence[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, summary, tags, source_citation
       FROM historical_evidence ORDER BY id`,
    )
    .all() as Array<{
    id: number;
    title: string;
    summary: string;
    tags: string;
    source_citation: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    tags: JSON.parse(r.tags) as string[],
    sourceCitation: r.source_citation,
  }));
}
