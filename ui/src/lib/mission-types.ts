export type Scenario = "nominal" | "mild" | "dire";

export type Metric = {
  label: string;
  value: number;
  unit: string;
  baseline: number;
  direction: "stable" | "up" | "down";
  /** Recent live-feed samples, oldest first. About 15 points. */
  history: number[];
  /** Optional formatted feed (used for blood pressure pairs). */
  historyText?: string[];
};

export type Snapshot = {
  astronaut: { id: string; name: string; missionDay: number };
  scenario: Scenario;
  vitals: Metric[];
  cabin: Metric[];
  space: Metric[];
  peers: { id: string; name: string; status: string; heartRate: number }[];
};

export type VesselKind = "shuttle" | "rocket";
export type VesselStatus = "nominal" | "watch" | "alert";

export type MissionAlert = {
  id: string;
  severity: "critical" | "watch";
  title: string;
  detail: string;
};

export type VesselInfo = {
  id: string;
  name: string;
  kind: VesselKind;
  callsign: string;
  destination: string;
};

export type VesselCard = VesselInfo & {
  status: VesselStatus;
  missionDay: number;
  crewLead: { id: string; name: string };
  heartRate: number;
  radiation: number;
  flareActive: boolean;
  alertCount: number;
  scenario: Scenario;
};

export type VesselSnapshot = Snapshot & {
  vessel: VesselInfo;
  alerts: MissionAlert[];
};

export type FleetResponse = {
  vessels: VesselCard[];
  snapshots: Record<string, VesselSnapshot>;
  snapshot: VesselSnapshot;
};

export type CommsLog = {
  id: string;
  sentAt: string;
  receivedAt: string;
  actualReceivedAt: string;
  latencyMs: number;
  actualLatencyMs: number;
  propagationMs: number;
  channel: "typed" | "voice" | "speak";
  direction: "uplink" | "downlink";
  crewId: string;
  vesselId: string;
  summary: string;
};
