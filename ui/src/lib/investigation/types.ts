export type InvestigationScope = "individual" | "crew";
export type InvestigationStatus = "active" | "closed";
export type EvidenceKind =
  | "observation"
  | "personal_deviation"
  | "correlation"
  | "historical_context";

export type EventRole = "astronaut" | "med1" | "system";

export type VitalMetricKey = "heart_rate" | "spo2" | "temp_c";

export type VitalsCollected = Partial<Record<VitalMetricKey, number>>;

export type InvestigationEvidence = {
  id: number;
  kind: EvidenceKind;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type InvestigationEvent = {
  id: number;
  role: EventRole;
  content: string;
  createdAt: string;
};

export type RecommendedStep = {
  action: "record_measurement" | "check_environment";
  metricKey?: VitalMetricKey;
  label: string;
  detail: string;
} | null;

export type InvestigationView = {
  id: string;
  subjectCrewId: string;
  scope: InvestigationScope;
  status: InvestigationStatus;
  vitalsCollected: VitalsCollected;
  openQuestions: string[];
  completedActions: string[];
  recommendedNext: RecommendedStep;
  evidence: InvestigationEvidence[];
  transcript: InvestigationEvent[];
  createdAt: string;
  updatedAt: string;
};

export type RecordMeasurementAction = {
  action: "record_measurement";
  metricKey: VitalMetricKey;
  value: number;
};

export type CheckEnvironmentAction = {
  action: "check_environment";
};

export type InvestigationAction =
  | RecordMeasurementAction
  | CheckEnvironmentAction;
