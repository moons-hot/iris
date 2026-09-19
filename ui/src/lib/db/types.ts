export type LinkStatus = "connected" | "autonomous";

export type MissionState = {
  missionName: string;
  missionPhase: string;
  missionDay: number;
  commDelayMinutesOneWay: number;
  linkStatus: LinkStatus;
};

export type CrewMember = {
  id: string;
  displayName: string;
  role: string;
};

export type BaselineMetric = {
  metricKey: string;
  personalMean: number;
  personalStd: number | null;
  personalMin: number | null;
  personalMax: number | null;
  populationLow: number;
  populationHigh: number;
  unit: string;
};

export type Measurement = {
  metricKey: string;
  value: number;
  recordedAtMissionDay: number;
  source: string;
};

export type EnvironmentReading = {
  zone: string;
  metricKey: string;
  value: number;
  nominalLow: number;
  nominalHigh: number;
  unit: string;
  recordedAtMissionDay: number;
  status: "nominal" | "below_nominal" | "above_nominal";
};

export type HistoricalEvidence = {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  sourceCitation: string;
};
