import { compareToPersonalBaseline } from "@/lib/baseline/compare";
import { getDb } from "@/lib/db/client";
import { getCrewById, getMissionState } from "@/lib/db/queries";
import type { BaselineMetric } from "@/lib/db/types";
import {
  applyInvestigationAction,
  createInvestigationFromMonitoring,
  getActiveInvestigationForCrew,
} from "@/lib/investigation/service";
import type { InvestigationView } from "@/lib/investigation/types";
import type { VitalMetricKey } from "@/lib/station/view-model";

export type LiveVitals = Record<VitalMetricKey, number>;

type CrewLiveState = {
  tick: number;
  vitals: LiveVitals;
};

const globalLive = globalThis as typeof globalThis & {
  __med1LiveVitals?: Record<string, CrewLiveState>;
};

function demoUnit(crewId: string, tick: number, salt: number): number {
  const x =
    Math.sin(tick * 12.9898 + salt + crewId.charCodeAt(1) * 0.7) * 43758.5453;
  return x - Math.floor(x);
}

function baselineFor(
  baselines: BaselineMetric[],
  key: VitalMetricKey,
): BaselineMetric | undefined {
  return baselines.find((b) => b.metricKey === key);
}

function initVitals(crewId: string): LiveVitals {
  const crew = getCrewById(crewId);
  if (!crew) {
    return { heart_rate: 62, spo2: 98, temp_c: 36.5 };
  }

  const read = (key: VitalMetricKey, fallback: number) =>
    crew.recentMeasurements.find((m) => m.metricKey === key)?.value ?? fallback;

  return {
    heart_rate: read("heart_rate", 62),
    spo2: read("spo2", 98),
    temp_c: read("temp_c", 36.5),
  };
}

function getLiveState(crewId: string): CrewLiveState {
  const id = crewId.toUpperCase();
  if (!globalLive.__med1LiveVitals) {
    globalLive.__med1LiveVitals = {};
  }
  if (!globalLive.__med1LiveVitals[id]) {
    globalLive.__med1LiveVitals[id] = { tick: 0, vitals: initVitals(id) };
  }
  return globalLive.__med1LiveVitals[id];
}

function persistSample(crewId: string, vitals: LiveVitals, tick: number) {
  const mission = getMissionState();
  const day = mission.missionDay + tick * 0.001;
  const insert = getDb().prepare(
    `INSERT INTO measurements (
      crew_id, metric_key, value, recorded_at_mission_day, source
    ) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const [key, value] of Object.entries(vitals) as [VitalMetricKey, number][]) {
    insert.run(crewId, key, value, day, "biosensor_stream");
  }
}

function advanceVitals(crewId: string, state: CrewLiveState): LiveVitals {
  const id = crewId.toUpperCase();
  const nextTick = state.tick + 1;
  const n1 = demoUnit(id, nextTick, 2);
  const n2 = demoUnit(id, nextTick, 3);
  const n3 = demoUnit(id, nextTick, 4);

  let hr = state.vitals.heart_rate + (n1 - 0.42) * 2.2;
  if (id === "A02") {
    hr += 0.35 + n2 * 1.1;
  } else {
    hr += (n2 - 0.5) * 1.2;
  }

  const spo2 = state.vitals.spo2 + (n2 - 0.5) * 0.12;
  const temp = state.vitals.temp_c + (n3 - 0.5) * 0.04;

  return {
    heart_rate: Math.min(96, Math.max(52, Math.round(hr * 10) / 10)),
    spo2: Math.min(99.6, Math.max(96.2, Math.round(spo2 * 10) / 10)),
    temp_c: Math.min(37.4, Math.max(36.1, Math.round(temp * 100) / 100)),
  };
}

function syncActiveInvestigation(
  crewId: string,
  vitals: LiveVitals,
): InvestigationView | null {
  let investigation = getActiveInvestigationForCrew(crewId);
  if (!investigation?.recommendedNext) {
    return investigation;
  }

  const next = investigation.recommendedNext;
  if (next.action === "record_measurement" && next.metricKey) {
    investigation = applyInvestigationAction(investigation.id, {
      action: "record_measurement",
      metricKey: next.metricKey,
      value: vitals[next.metricKey],
    });
  } else if (next.action === "check_environment") {
    investigation = applyInvestigationAction(investigation.id, {
      action: "check_environment",
    });
  }

  return investigation;
}

export type MonitoringTickResult = {
  crewId: string;
  tick: number;
  vitals: LiveVitals;
  streamNote: string;
  heartRateDeviation: boolean;
  investigation: InvestigationView | null;
  investigationOpened: boolean;
};

export function runMonitoringTick(crewId: string): MonitoringTickResult {
  const id = crewId.toUpperCase();
  const crew = getCrewById(id);
  if (!crew) {
    throw new Error(`Crew member ${id} not found.`);
  }

  const state = getLiveState(id);
  const vitals = advanceVitals(id, state);
  state.tick += 1;
  state.vitals = vitals;

  persistSample(id, vitals, state.tick);

  const hrBaseline = baselineFor(crew.baselines, "heart_rate");
  const hrComparison = hrBaseline
    ? compareToPersonalBaseline(vitals.heart_rate, hrBaseline)
    : null;

  let investigation = getActiveInvestigationForCrew(id);
  let investigationOpened = false;

  if (!investigation && hrComparison?.isSignificant) {
    investigation = createInvestigationFromMonitoring(id, state.tick);
    investigationOpened = true;
  }

  investigation = syncActiveInvestigation(id, vitals);

  return {
    crewId: id,
    tick: state.tick,
    vitals,
    streamNote: `Biosensor packet #${state.tick} ingested from onboard stream.`,
    heartRateDeviation: hrComparison?.isSignificant ?? false,
    investigation,
    investigationOpened,
  };
}
