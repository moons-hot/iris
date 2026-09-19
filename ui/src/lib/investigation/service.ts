import {
  inferSymptomTags,
  retrieveMultiSourceEvidence,
} from "@/lib/evidence/retrieve";
import { getDb } from "@/lib/db/client";
import { getCrewById, getEnvironmentReadings, getMissionState } from "@/lib/db/queries";
import type { BaselineMetric } from "@/lib/db/types";

import {
  ENV_REVIEW,
  METRIC_LABELS,
  RECOMMENDED_COPY,
  VITAL_COLLECTION_ORDER,
} from "./constants";
import type {
  InvestigationAction,
  InvestigationView,
  RecommendedStep,
  VitalMetricKey,
  VitalsCollected,
} from "./types";
import { pickMonitoringSignals } from "@/lib/telemetry/signals";
import {
  compareToPersonalBaseline,
  deviationEvidenceBody,
} from "@/lib/baseline/compare";

type InvestigationRow = {
  id: string;
  subject_crew_id: string;
  scope: "individual" | "crew";
  status: "active" | "closed";
  vitals_collected: string;
  open_questions: string;
  completed_actions: string;
  recommended_action: string | null;
  recommended_metric_key: string | null;
  environment_reviewed: number;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function metricLabel(key: VitalMetricKey): string {
  return METRIC_LABELS[key];
}

function rowToView(
  row: InvestigationRow,
  evidence: InvestigationView["evidence"],
  transcript: InvestigationView["transcript"],
): InvestigationView {
  const vitals = parseJson<VitalsCollected>(row.vitals_collected, {});
  const openQuestions = parseJson<string[]>(row.open_questions, []);
  const completedActions = parseJson<string[]>(row.completed_actions, []);

  let recommendedNext: RecommendedStep = null;
  if (row.recommended_action === "record_measurement" && row.recommended_metric_key) {
    const key = row.recommended_metric_key as VitalMetricKey;
    const copy = RECOMMENDED_COPY[key];
    recommendedNext = {
      action: "record_measurement",
      metricKey: key,
      label: copy.label,
      detail: copy.detail,
    };
  } else if (row.recommended_action === "check_environment") {
    recommendedNext = {
      action: "check_environment",
      label: ENV_REVIEW.label,
      detail: ENV_REVIEW.detail,
    };
  }

  return {
    id: row.id,
    subjectCrewId: row.subject_crew_id,
    scope: row.scope,
    status: row.status,
    vitalsCollected: vitals,
    openQuestions,
    completedActions,
    recommendedNext,
    evidence,
    transcript,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadEvidence(investigationId: string): InvestigationView["evidence"] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, kind, title, body, metadata, created_at
       FROM investigation_evidence
       WHERE investigation_id = ?
       ORDER BY id ASC`,
    )
    .all(investigationId) as Array<{
    id: number;
    kind: InvestigationView["evidence"][number]["kind"];
    title: string;
    body: string;
    metadata: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
    createdAt: r.created_at,
  }));
}

function loadTranscript(investigationId: string): InvestigationView["transcript"] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, role, content, created_at
       FROM investigation_events
       WHERE investigation_id = ?
       ORDER BY id ASC`,
    )
    .all(investigationId) as Array<{
    id: number;
    role: InvestigationView["transcript"][number]["role"];
    content: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}

function getRow(id: string): InvestigationRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM investigations WHERE id = ?`)
    .get(id) as InvestigationRow | undefined;
}

function addEvent(investigationId: string, role: InvestigationView["transcript"][number]["role"], content: string) {
  getDb()
    .prepare(
      `INSERT INTO investigation_events (investigation_id, role, content, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(investigationId, role, content, nowIso());
}

function addEvidence(
  investigationId: string,
  kind: InvestigationView["evidence"][number]["kind"],
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
) {
  getDb()
    .prepare(
      `INSERT INTO investigation_evidence (
        investigation_id, kind, title, body, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      investigationId,
      kind,
      title,
      body,
      metadata ? JSON.stringify(metadata) : null,
      nowIso(),
    );
}

function updateInvestigationRow(
  id: string,
  patch: {
    vitals?: VitalsCollected;
    openQuestions?: string[];
    completedActions?: string[];
    recommendedAction?: string | null;
    recommendedMetricKey?: string | null;
    environmentReviewed?: boolean;
  },
) {
  const row = getRow(id);
  if (!row) return;

  const vitals = patch.vitals ?? parseJson<VitalsCollected>(row.vitals_collected, {});
  const openQuestions =
    patch.openQuestions ?? parseJson<string[]>(row.open_questions, []);
  const completedActions =
    patch.completedActions ?? parseJson<string[]>(row.completed_actions, []);

  getDb()
    .prepare(
      `UPDATE investigations SET
        vitals_collected = ?,
        open_questions = ?,
        completed_actions = ?,
        recommended_action = ?,
        recommended_metric_key = ?,
        environment_reviewed = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .run(
      JSON.stringify(vitals),
      JSON.stringify(openQuestions),
      JSON.stringify(completedActions),
      patch.recommendedAction !== undefined
        ? patch.recommendedAction
        : row.recommended_action,
      patch.recommendedMetricKey !== undefined
        ? patch.recommendedMetricKey
        : row.recommended_metric_key,
      patch.environmentReviewed !== undefined
        ? patch.environmentReviewed
          ? 1
          : 0
        : row.environment_reviewed,
      nowIso(),
      id,
    );
}

function baselineFor(
  baselines: BaselineMetric[],
  metricKey: VitalMetricKey,
): BaselineMetric | undefined {
  return baselines.find((b) => b.metricKey === metricKey);
}

function attachEnvironmentEvidence(investigationId: string, crewId: string) {
  const readings = getEnvironmentReadings();
  const row = getRow(investigationId);
  if (!row) return;

  const vitals = parseJson<VitalsCollected>(row.vitals_collected, {});
  const existingEvidence = loadEvidence(investigationId);
  const symptomTags = inferSymptomTags([
    ...existingEvidence.map((e) => `${e.title} ${e.body}`),
    ...loadTranscript(investigationId).map((e) => e.content),
  ]);

  const vitalDeviations: VitalMetricKey[] = [];
  for (const key of VITAL_COLLECTION_ORDER) {
    const value = vitals[key];
    if (value === undefined) continue;
    const crew = getCrewById(crewId);
    const baseline = crew
      ? baselineFor(crew.baselines, key)
      : undefined;
    if (baseline && compareToPersonalBaseline(value, baseline).isSignificant) {
      vitalDeviations.push(key);
    }
  }

  const cards = retrieveMultiSourceEvidence({
    crewId,
    symptomTags,
    vitals,
    vitalDeviations,
    cabinReadings: readings,
  });

  for (const card of cards) {
    addEvidence(investigationId, card.kind, card.title, card.body, {
      ...card.metadata,
      layer: card.layer,
      sourceLabel: card.sourceLabel,
      citation_url: card.citationUrl,
      tags: card.tags,
    });
  }

  const hasSpacecraft = cards.some((c) => c.layer === "spacecraft");
  const hasSpace = cards.some((c) => c.layer === "space");
  const hasHistorical = cards.some((c) => c.layer === "historical");

  addEvent(
    investigationId,
    "med1",
    [
      hasSpacecraft
        ? "Spacecraft (live + EDA cache) evidence attached."
        : null,
      hasSpace ? "Space-environment (RadLab cache) evidence attached." : null,
      hasHistorical
        ? "Historical OSDR context attached — contextual only, not causation."
        : null,
      "Multi-source board updated for ground medical packaging.",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function reevaluate(investigationId: string) {
  const row = getRow(investigationId);
  if (!row || row.status !== "active") return;

  const vitals = parseJson<VitalsCollected>(row.vitals_collected, {});
  const openQuestions: string[] = [];
  const completedActions = parseJson<string[]>(row.completed_actions, []);

  let recommendedAction: string | null = null;
  let recommendedMetricKey: string | null = null;

  for (const key of VITAL_COLLECTION_ORDER) {
    if (vitals[key] === undefined) {
      openQuestions.push(`Need current ${metricLabel(key).toLowerCase()}.`);
      recommendedAction = "record_measurement";
      recommendedMetricKey = key;
      updateInvestigationRow(investigationId, {
        openQuestions,
        recommendedAction,
        recommendedMetricKey,
      });
      return;
    }
  }

  if (!row.environment_reviewed) {
    attachEnvironmentEvidence(investigationId, row.subject_crew_id);
    const nextCompleted = [...completedActions, "environment_reviewed"];
    updateInvestigationRow(investigationId, {
      openQuestions: [],
      completedActions: nextCompleted,
      recommendedAction: null,
      recommendedMetricKey: null,
      environmentReviewed: true,
    });
    addEvent(
      investigationId,
      "med1",
      "Vitals for this check are recorded. Evidence collected so far can be packaged for ground medical review when communications allow.",
    );
    return;
  }

  updateInvestigationRow(investigationId, {
    openQuestions: [],
    recommendedAction: null,
    recommendedMetricKey: null,
  });
}

export function getInvestigation(id: string): InvestigationView | null {
  const row = getRow(id);
  if (!row) return null;
  return rowToView(row, loadEvidence(id), loadTranscript(id));
}

export function getActiveInvestigationForCrew(crewId: string): InvestigationView | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM investigations
       WHERE subject_crew_id = ? AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(crewId.toUpperCase()) as InvestigationRow | undefined;

  if (!row) return null;
  return rowToView(row, loadEvidence(row.id), loadTranscript(row.id));
}

export function createInvestigation(
  crewId: string,
  reportedSymptoms: string[],
): InvestigationView {
  const normalizedId = crewId.toUpperCase();
  const crew = getCrewById(normalizedId);
  if (!crew) {
    throw new Error(`Crew member ${normalizedId} not found.`);
  }

  const symptoms = reportedSymptoms
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (symptoms.length === 0) {
    throw new Error("At least one reported symptom is required.");
  }

  const id = crypto.randomUUID();
  const created = nowIso();

  getDb()
    .prepare(
      `UPDATE investigations SET status = 'closed', updated_at = ?
       WHERE subject_crew_id = ? AND status = 'active'`,
    )
    .run(created, normalizedId);

  getDb()
    .prepare(
      `INSERT INTO investigations (
        id, subject_crew_id, scope, status, vitals_collected,
        open_questions, completed_actions, recommended_action,
        recommended_metric_key, environment_reviewed, created_at, updated_at
      ) VALUES (?, ?, 'individual', 'active', '{}', '[]', '[]', ?, ?, 0, ?, ?)`,
    )
    .run(
      id,
      normalizedId,
      "record_measurement",
      "heart_rate",
      created,
      created,
    );

  addEvent(
    id,
    "system",
    `Onboard status feed: ${symptoms.join("; ")}.`,
  );

  for (const symptom of symptoms) {
    addEvidence(id, "observation", "Aggregated status signal", symptom, {
      crewId: normalizedId,
      source: "onboard_feed",
      layer: "astronaut",
    });
  }

  addEvent(
    id,
    "med1",
    `Investigation opened for ${crew.crew.displayName}. I'll compare any new measurements to personal baseline — not population averages alone.`,
  );

  updateInvestigationRow(id, {
    completedActions: ["symptoms_recorded"],
    openQuestions: ["Need current heart rate."],
    recommendedAction: "record_measurement",
    recommendedMetricKey: "heart_rate",
  });

  reevaluate(id);
  const view = getInvestigation(id);
  if (!view) throw new Error("Failed to create investigation.");
  return view;
}

export function createInvestigationFromMonitoring(
  crewId: string,
  tick: number,
): InvestigationView {
  const normalizedId = crewId.toUpperCase();
  const crew = getCrewById(normalizedId);
  if (!crew) {
    throw new Error(`Crew member ${normalizedId} not found.`);
  }

  const signals = pickMonitoringSignals(normalizedId, tick);
  const id = crypto.randomUUID();
  const created = nowIso();

  getDb()
    .prepare(
      `UPDATE investigations SET status = 'closed', updated_at = ?
       WHERE subject_crew_id = ? AND status = 'active'`,
    )
    .run(created, normalizedId);

  getDb()
    .prepare(
      `INSERT INTO investigations (
        id, subject_crew_id, scope, status, vitals_collected,
        open_questions, completed_actions, recommended_action,
        recommended_metric_key, environment_reviewed, created_at, updated_at
      ) VALUES (?, ?, 'individual', 'active', '{}', '[]', '[]', ?, ?, 0, ?, ?)`,
    )
    .run(
      id,
      normalizedId,
      "record_measurement",
      "heart_rate",
      created,
      created,
    );

  addEvent(
    id,
    "system",
    "Onboard biosensors flagged a personal baseline deviation on heart rate.",
  );

  for (const signal of signals) {
    addEvidence(id, "observation", "Aggregated crew-status signal", signal, {
      crewId: normalizedId,
      source: "biosensor_stream",
      layer: "astronaut",
    });
    addEvent(id, "system", `Status telemetry: ${signal}`);
  }

  addEvent(
    id,
    "med1",
    `Investigation opened from existing monitoring for ${crew.crew.displayName}. Pulling biosensor stream and cabin telemetry — no new hardware required.`,
  );

  updateInvestigationRow(id, {
    completedActions: ["monitoring_alert_received"],
    openQuestions: ["Need current heart rate from biosensor stream."],
    recommendedAction: "record_measurement",
    recommendedMetricKey: "heart_rate",
  });

  reevaluate(id);
  const view = getInvestigation(id);
  if (!view) throw new Error("Failed to create investigation.");
  return view;
}

function recordMeasurement(
  investigationId: string,
  metricKey: VitalMetricKey,
  value: number,
): InvestigationView {
  const row = getRow(investigationId);
  if (!row) throw new Error("Investigation not found.");
  if (row.status !== "active") throw new Error("Investigation is not active.");

  const crew = getCrewById(row.subject_crew_id);
  if (!crew) throw new Error("Crew record missing.");

  const vitals = parseJson<VitalsCollected>(row.vitals_collected, {});
  vitals[metricKey] = value;

  const mission = getMissionState();
  getDb()
    .prepare(
      `INSERT INTO measurements (
        crew_id, metric_key, value, recorded_at_mission_day, source
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      row.subject_crew_id,
      metricKey,
      value,
      mission.missionDay,
      `investigation:${investigationId}`,
    );

  const label = metricLabel(metricKey);
  addEvent(
    investigationId,
    "system",
    `Biosensor ingest — ${label}: ${value}${metricKey === "heart_rate" ? " bpm" : metricKey === "spo2" ? "%" : " °C"}.`,
  );

  const baseline = baselineFor(crew.baselines, metricKey);
  if (baseline) {
    const comparison = compareToPersonalBaseline(value, baseline);
    addEvidence(
      investigationId,
      comparison.isSignificant ? "personal_deviation" : "observation",
      comparison.isSignificant
        ? `Personal deviation: ${label}`
        : `${label} measurement`,
      deviationEvidenceBody(label, value, comparison, row.subject_crew_id),
      {
        metricKey,
        value,
        status: comparison.status,
        layer: "astronaut",
      },
    );

    if (comparison.isSignificant) {
      addEvent(
        investigationId,
        "med1",
        `${label} differs from ${row.subject_crew_id}'s established baseline. This is a deviation to investigate, not a diagnosis.`,
      );
    }
  }

  const completed = parseJson<string[]>(row.completed_actions, []);
  const actionKey = `${metricKey}_recorded`;
  if (!completed.includes(actionKey)) {
    completed.push(actionKey);
  }

  updateInvestigationRow(investigationId, {
    vitals: vitals,
    completedActions: completed,
  });

  reevaluate(investigationId);

  const view = getInvestigation(investigationId);
  if (!view) throw new Error("Investigation missing after measurement.");
  return view;
}

function checkEnvironment(investigationId: string): InvestigationView {
  const row = getRow(investigationId);
  if (!row) throw new Error("Investigation not found.");

  if (row.environment_reviewed) {
    const view = getInvestigation(investigationId);
    if (!view) throw new Error("Investigation not found.");
    return view;
  }

  attachEnvironmentEvidence(investigationId, row.subject_crew_id);
  const completed = parseJson<string[]>(row.completed_actions, []);
  if (!completed.includes("environment_reviewed")) {
    completed.push("environment_reviewed");
  }

  updateInvestigationRow(investigationId, {
    completedActions: completed,
    environmentReviewed: true,
    recommendedAction: null,
    recommendedMetricKey: null,
    openQuestions: [],
  });

  addEvent(investigationId, "system", "Cabin environment review completed.");

  const view = getInvestigation(investigationId);
  if (!view) throw new Error("Investigation missing after environment review.");
  return view;
}

export function applyInvestigationAction(
  investigationId: string,
  action: InvestigationAction,
): InvestigationView {
  if (action.action === "record_measurement") {
    return recordMeasurement(investigationId, action.metricKey, action.value);
  }
  return checkEnvironment(investigationId);
}
