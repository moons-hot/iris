import Database from "better-sqlite3";

import type {
  FleetResponse,
  Metric,
  MissionAlert,
  Scenario,
  Snapshot,
  VesselCard,
  VesselInfo,
  VesselSnapshot,
  VesselStatus,
} from "./mission-types";

export type {
  FleetResponse,
  Metric,
  MissionAlert,
  Scenario,
  Snapshot,
  VesselCard,
  VesselInfo,
  VesselSnapshot,
};

type Evidence = {
  id: string;
  category: string;
  title: string;
  snippet: string;
  source: string;
};

const dbPath = process.env.DATABASE_PATH ?? ".iris-onboard.db";
const globalDb = globalThis as unknown as { irisDb?: Database.Database };
const db = globalDb.irisDb ?? new Database(dbPath);
globalDb.irisDb = db;

db.exec(`
  CREATE TABLE IF NOT EXISTS crew (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, baseline_hr INTEGER NOT NULL,
    baseline_sys INTEGER NOT NULL, baseline_dia INTEGER NOT NULL, baseline_temp REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, snippet TEXT NOT NULL, source TEXT NOT NULL
  );
`);

const seeded = db.prepare("SELECT COUNT(*) as count FROM crew").get() as {
  count: number;
};
if (seeded.count === 0) {
  db.prepare(
    "INSERT INTO crew VALUES (@id, @name, @hr, @sys, @dia, @temp)",
  ).run({
    id: "A01",
    name: "Mara Voss",
    hr: 62,
    sys: 112,
    dia: 72,
    temp: 36.7,
  });
  db.prepare(
    "INSERT INTO crew VALUES (@id, @name, @hr, @sys, @dia, @temp)",
  ).run({
    id: "A02",
    name: "Jonah Reyes",
    hr: 65,
    sys: 118,
    dia: 75,
    temp: 36.6,
  });
  db.prepare(
    "INSERT INTO crew VALUES (@id, @name, @hr, @sys, @dia, @temp)",
  ).run({
    id: "A03",
    name: "Elena Park",
    hr: 59,
    sys: 108,
    dia: 69,
    temp: 36.8,
  });
  const insertEvidence = db.prepare(
    "INSERT INTO evidence VALUES (?, ?, ?, ?, ?)",
  );
  [
    [
      "EVID-OSDR-014",
      "radiation",
      "OSDR radiation response cohort",
      "Reports that acute exposure context and visual phenomena warrant repeated assessment; individual symptoms alone do not establish mechanism.",
      "NASA Open Science Data Repository, onboard extract",
    ],
    [
      "EVID-HRR-095",
      "radiation",
      "NASA Human Research Roadmap Risk 95",
      "Describes uncertainty and monitoring needs around spaceflight-associated neuro-ocular and radiation-related risks.",
      "https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=95",
    ],
    [
      "EVID-CABIN-009",
      "co2",
      "Closed-cabin CO₂ trend review",
      "Headache and perceived breathlessness are nonspecific; compare symptoms with cabin trend and repeat measurements before attribution.",
      "Onboard environmental literature cache",
    ],
    [
      "EVID-PEER-022",
      "peer",
      "Peer-flight symptom log",
      "Two prior crew logs recorded nausea and transient visual disturbances during elevated-radiation operational windows; documentation is associative, not causal.",
      "Iris encrypted crew-history cache",
    ],
  ].forEach((row) => insertEvidence.run(...row));
}

let scenario: Scenario = "nominal";
let tick = 0;
const vesselTicks: Record<string, number> = {};

export const DEFAULT_VESSEL_ID = "asteria";

type Spec = {
  hr: number;
  sys: number;
  dia: number;
  temp: number;
  spo2: number;
  rr: number;
  co2: number;
  radiation: number;
  oxygen: number;
  suit: number;
  pressure: number;
  spe: number;
};

type PeerRoster = { id: string; name: string; heartRate: number }[];

type VesselDef = VesselInfo & {
  astronaut: Snapshot["astronaut"];
  peers: PeerRoster;
  liveScenario?: boolean;
  scenario: Scenario;
  spec?: Partial<Spec>;
};

const specs: Record<Scenario, Spec> = {
  // State 1 — default resting band (~70s bpm)
  nominal: {
    hr: 72,
    sys: 118,
    dia: 74,
    temp: 36.7,
    spo2: 98,
    rr: 14,
    co2: 0.62,
    radiation: 0.18,
    oxygen: 20.9,
    suit: 29.6,
    pressure: 101.3,
    spe: 0.4,
  },
  // State 2 — slight vitals drift (still cabin / exertion range)
  mild: {
    hr: 82,
    sys: 126,
    dia: 80,
    temp: 37.2,
    spo2: 96,
    rr: 18,
    co2: 0.72,
    radiation: 0.2,
    oxygen: 20.8,
    suit: 29.4,
    pressure: 101.1,
    spe: 0.5,
  },
  // State 3 — major flare / radiation window
  dire: {
    hr: 118,
    sys: 84,
    dia: 51,
    temp: 38.9,
    spo2: 88,
    rr: 28,
    co2: 0.84,
    radiation: 2.6,
    oxygen: 20.3,
    suit: 24.1,
    pressure: 100.8,
    spe: 18.2,
  },
};

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Sliding window of live telemetry. Each tick advances the window so the
 * last sample is "now" and earlier points look like a noisy real-time feed.
 */
export function sampleSeries(
  center: number,
  magnitude: number,
  decimals: number,
  options: { drift?: number; count?: number; phase?: number; tick?: number } = {},
): number[] {
  const count = options.count ?? 15;
  const drift = options.drift ?? 0;
  const phaseOffset = options.phase ?? 0;
  const t0 = options.tick ?? tick;
  return Array.from({ length: count }, (_, i) => {
    const t = t0 + i + phaseOffset;
    const wander =
      Math.sin(t * 1.55) * magnitude +
      Math.sin(t * 0.82 + 1.4) * magnitude * 0.55 +
      Math.cos(t * 2.4 + 0.6) * magnitude * 0.35;
    const stepDrift = drift * ((i - (count - 1)) / Math.max(count - 1, 1));
    return roundTo(center + wander + stepDrift, decimals);
  });
}

function directionFrom(
  history: number[],
  threshold: number,
): Metric["direction"] {
  if (history.length < 6) return "stable";
  const early =
    history.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
  const late =
    history.slice(-4).reduce((sum, value) => sum + value, 0) / 4;
  const delta = late - early;
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "stable";
}

function metric(
  label: string,
  history: number[],
  unit: string,
  baseline: number,
  threshold: number,
  extras: Partial<Metric> = {},
): Metric {
  const value = history.at(-1);
  if (value === undefined) {
    throw new Error(`Empty telemetry history for ${label}`);
  }
  return {
    label,
    value,
    unit,
    baseline,
    direction: extras.direction ?? directionFrom(history, threshold),
    history,
    ...extras,
  };
}

function peerHeartRate(
  baseline: number,
  activeScenario: Scenario,
  t: number,
  phase: number,
): number {
  const center =
    activeScenario === "dire"
      ? baseline + 38
      : activeScenario === "mild"
        ? baseline + 8
        : baseline;
  const magnitude =
    activeScenario === "dire" ? 7 : activeScenario === "mild" ? 3 : 2.2;
  return (
    sampleSeries(center, magnitude, 0, { tick: t, phase }).at(-1) ?? center
  );
}

function peerStatus(
  activeScenario: Scenario,
  index: number,
): Snapshot["peers"][number]["status"] {
  if (activeScenario === "dire") {
    return index === 0 ? "observing" : "report logged";
  }
  if (activeScenario === "mild") return "observing";
  return "nominal";
}

/** Live peer vitals — elevated and noisier during mild / solar-flare (dire). */
export function livePeers(
  roster: { id: string; name: string; heartRate: number }[],
  activeScenario: Scenario,
  t: number,
): Snapshot["peers"] {
  return roster.map((peer, index) => ({
    id: peer.id,
    name: peer.name,
    status: peerStatus(activeScenario, index),
    heartRate: peerHeartRate(peer.heartRate, activeScenario, t, index * 5),
  }));
}

function snapshotFrom(
  activeScenario: Scenario,
  t: number,
  astronaut: Snapshot["astronaut"],
  peers: Snapshot["peers"],
  spec: Spec = specs[activeScenario],
): Snapshot {
  // High-risk windows wander harder so the console looks alive.
  const jitter =
    activeScenario === "dire" ? 1.45 : activeScenario === "mild" ? 1.15 : 1;
  const hrHistory = sampleSeries(spec.hr, 4.6 * jitter, 0, { tick: t });
  const sysHistory = sampleSeries(spec.sys, 5.2 * jitter, 0, { tick: t });
  const diaHistory = sampleSeries(spec.dia, 3.1 * jitter, 0, {
    phase: 3,
    tick: t,
  });
  const tempHistory = sampleSeries(spec.temp, 0.18 * jitter, 1, { tick: t });
  const spo2History = sampleSeries(spec.spo2, 0.85 * jitter, 0, {
    drift:
      activeScenario === "dire" ? -1.4 : activeScenario === "mild" ? -0.6 : 0,
    tick: t,
  });
  const rrHistory = sampleSeries(spec.rr, 1.5 * jitter, 0, {
    drift: activeScenario === "nominal" ? 0 : 1.4,
    tick: t,
  });
  const oxygenHistory = sampleSeries(spec.oxygen, 0.16 * jitter, 1, {
    drift: activeScenario === "dire" ? -0.12 : 0,
    tick: t,
  });
  const co2History = sampleSeries(spec.co2, 0.06 * jitter, 2, {
    drift: activeScenario === "nominal" ? 0.03 : 0.1,
    tick: t,
  });
  const pressureHistory = sampleSeries(spec.pressure, 0.12 * jitter, 1, {
    drift: activeScenario === "dire" ? -0.18 : 0,
    tick: t,
  });
  const suitHistory = sampleSeries(spec.suit, 0.12 * jitter, 1, {
    drift: activeScenario === "dire" ? -0.7 : 0,
    tick: t,
  });
  const radiationHistory = sampleSeries(
    spec.radiation,
    activeScenario === "dire" ? 0.28 : 0.09,
    2,
    {
      drift: activeScenario === "dire" ? 0.22 : 0.03,
      tick: t,
    },
  );
  const flareHistory = Array.from({ length: 15 }, () =>
    activeScenario === "dire" ? 1 : 0,
  );
  const speHistory = sampleSeries(
    spec.spe,
    activeScenario === "dire" ? 1.2 : 0.08,
    1,
    {
      drift: activeScenario === "dire" ? 1.4 : 0,
      tick: t,
    },
  );

  const latestSys = sysHistory.at(-1) ?? spec.sys;
  const latestDia = diaHistory.at(-1) ?? spec.dia;

  return {
    astronaut,
    scenario: activeScenario,
    vitals: [
      metric("Heart rate", hrHistory, "bpm", 72, 1.2, {
        direction:
          activeScenario === "nominal" ? directionFrom(hrHistory, 1.2) : "up",
      }),
      metric("Blood pressure", sysHistory, `/${latestDia} mmHg`, 118, 1.5, {
        direction:
          activeScenario === "mild"
            ? "up"
            : activeScenario === "dire"
              ? "down"
              : directionFrom(sysHistory, 1.5),
        historyText: sysHistory.map(
          (sys, index) => `${sys}/${diaHistory[index] ?? latestDia}`,
        ),
      }),
      metric("Temperature", tempHistory, "°C", 36.7, 0.08, {
        direction:
          activeScenario === "nominal"
            ? directionFrom(tempHistory, 0.08)
            : "up",
      }),
      metric("SpO₂", spo2History, "%", 98, 0.6, {
        direction:
          activeScenario === "nominal"
            ? directionFrom(spo2History, 0.6)
            : "down",
      }),
      metric("Resp. rate", rrHistory, "/min", 14, 0.8, {
        direction:
          activeScenario === "nominal" ? directionFrom(rrHistory, 0.8) : "up",
      }),
    ],
    cabin: [
      metric("Cabin O₂", oxygenHistory, "%", 20.9, 0.05, {
        direction:
          activeScenario === "dire"
            ? "down"
            : directionFrom(oxygenHistory, 0.05),
      }),
      metric("Cabin CO₂", co2History, "%", 0.61, 0.03, {
        direction:
          activeScenario === "nominal" ? directionFrom(co2History, 0.03) : "up",
      }),
      metric("Cabin pressure", pressureHistory, "kPa", 101.3, 0.05, {
        direction:
          activeScenario === "dire"
            ? "down"
            : directionFrom(pressureHistory, 0.05),
      }),
      metric("Suit pressure", suitHistory, "kPa", 29.6, 0.08, {
        direction:
          activeScenario === "dire" ? "down" : directionFrom(suitHistory, 0.08),
      }),
    ],
    space: [
      metric("Hull radiation", radiationHistory, "mSv/h", 0.18, 0.04, {
        direction:
          activeScenario === "dire"
            ? "up"
            : directionFrom(radiationHistory, 0.04),
      }),
      metric(
        "Solar flare",
        flareHistory,
        activeScenario === "dire" ? "active" : "quiet",
        0,
        0.5,
        {
          direction: activeScenario === "dire" ? "up" : "stable",
        },
      ),
      metric("SPE flux", speHistory, "pfu", 0.4, 0.08, {
        direction:
          activeScenario === "dire" ? "up" : directionFrom(speHistory, 0.08),
      }),
    ],
    peers,
  };
}

const ASTERIA_PEER_ROSTER = [
  { id: "A02", name: "Jonah Reyes", heartRate: 70 },
  { id: "A03", name: "Elena Park", heartRate: 68 },
] as const;

const VESSELS: VesselDef[] = [
  {
    id: DEFAULT_VESSEL_ID,
    name: "Asteria",
    kind: "shuttle",
    callsign: "AST-1",
    destination: "Deep-space cruise",
    astronaut: { id: "A01", name: "Mara Voss", missionDay: 184 },
    peers: [...ASTERIA_PEER_ROSTER],
    liveScenario: true,
    scenario: "nominal",
  },
  {
    id: "helios",
    name: "Helios",
    kind: "shuttle",
    callsign: "SHU-4",
    destination: "Rendezvous with Asteria",
    astronaut: { id: "A04", name: "Nia Okonkwo", missionDay: 12 },
    peers: [
      { id: "A05", name: "Chris Vale", heartRate: 68 },
      { id: "A06", name: "Priya Shah", heartRate: 71 },
    ],
    scenario: "mild",
  },
  {
    id: "kepler",
    name: "Kepler",
    kind: "rocket",
    callsign: "RKT-7",
    destination: "Outbound injection",
    astronaut: { id: "A07", name: "Ravi Mehta", missionDay: 3 },
    peers: [{ id: "A08", name: "Owen Blake", heartRate: 72 }],
    scenario: "dire",
  },
  {
    id: "selene",
    name: "Selene",
    kind: "shuttle",
    callsign: "SHU-9",
    destination: "Lunar swing-by",
    astronaut: { id: "A09", name: "Sofia Alvarez", missionDay: 41 },
    peers: [{ id: "A10", name: "Kenji Mori", heartRate: 61 }],
    scenario: "nominal",
    spec: { suit: 26.2, co2: 0.66 },
  },
];

function metricByLabel(metrics: Metric[], label: string) {
  return metrics.find((item) => item.label === label);
}

export function alertsFor(
  snapshot: Snapshot,
  vesselName: string,
): MissionAlert[] {
  const alerts: MissionAlert[] = [];
  const flare = metricByLabel(snapshot.space, "Solar flare");
  const radiation = metricByLabel(snapshot.space, "Hull radiation");
  const spe = metricByLabel(snapshot.space, "SPE flux");
  const hr = metricByLabel(snapshot.vitals, "Heart rate");
  const spo2 = metricByLabel(snapshot.vitals, "SpO₂");
  const temp = metricByLabel(snapshot.vitals, "Temperature");
  const suit = metricByLabel(snapshot.cabin, "Suit pressure");
  const co2 = metricByLabel(snapshot.cabin, "Cabin CO₂");

  if ((flare?.value ?? 0) >= 1) {
    alerts.push({
      id: "flare",
      severity: "critical",
      title: "Solar flare",
      detail: `${vesselName} is in an SPE window. Hull exposure is not nominal — crew should be in shielding.`,
    });
  }
  if (radiation && radiation.value >= 1) {
    alerts.push({
      id: "radiation",
      severity: "critical",
      title: "Hull radiation",
      detail: `${radiation.value} mSv/h against a ${radiation.baseline} mSv/h baseline.`,
    });
  }
  if (spo2 && spo2.value <= 92) {
    alerts.push({
      id: "spo2",
      severity: "critical",
      title: "SpO₂ off baseline",
      detail: `${spo2.value}% versus ${spo2.baseline}% station target.`,
    });
  }
  if (hr && Math.abs(hr.value - hr.baseline) >= 25) {
    alerts.push({
      id: "hr",
      severity: hr.value >= 110 ? "critical" : "watch",
      title: "Heart rate",
      detail: `${hr.value} bpm versus resting baseline ${hr.baseline} bpm.`,
    });
  }
  if (temp && temp.value >= 38) {
    alerts.push({
      id: "temp",
      severity: "watch",
      title: "Temperature",
      detail: `${temp.value} °C versus ${temp.baseline} °C baseline.`,
    });
  }
  if (suit && suit.value <= suit.baseline - 3) {
    alerts.push({
      id: "suit",
      severity: "critical",
      title: "Suit pressure",
      detail: `${suit.value} kPa versus ${suit.baseline} kPa target.`,
    });
  }
  if (co2 && co2.value >= 0.75) {
    alerts.push({
      id: "co2",
      severity: "watch",
      title: "Cabin CO₂",
      detail: `${co2.value}% versus ${co2.baseline}% typical cabin target.`,
    });
  }
  if (spe && spe.value >= 8) {
    alerts.push({
      id: "spe",
      severity: "critical",
      title: "SPE flux",
      detail: `${spe.value} pfu during this radiation window.`,
    });
  }
  if (snapshot.scenario === "mild" && !alerts.some((alert) => alert.id === "hr")) {
    alerts.push({
      id: "mild",
      severity: "watch",
      title: "Crew watch",
      detail: `${vesselName} vitals have moved off personal baseline. Keep the investigation loop open.`,
    });
  }
  return alerts;
}

function statusFrom(alerts: MissionAlert[]): VesselStatus {
  if (alerts.some((alert) => alert.severity === "critical")) return "alert";
  if (alerts.length > 0) return "watch";
  return "nominal";
}

function vesselInfo(def: VesselDef): VesselInfo {
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    callsign: def.callsign,
    destination: def.destination,
  };
}

function advanceVesselTick(id: string) {
  if (id === DEFAULT_VESSEL_ID) {
    tick += 2;
    return tick;
  }
  vesselTicks[id] = (vesselTicks[id] ?? 0) + 2;
  return vesselTicks[id];
}

function snapshotForVessel(id: string, advance = true): VesselSnapshot {
  const def =
    VESSELS.find((vessel) => vessel.id === id) ??
    VESSELS[0] ??
    (() => {
      throw new Error("No vessels configured");
    })();
  const activeScenario = def.liveScenario ? scenario : def.scenario;
  const t = advance ? advanceVesselTick(def.id) : def.liveScenario ? tick : (vesselTicks[def.id] ?? 0);
  const spec = { ...specs[activeScenario], ...def.spec };
  const peers = livePeers(def.peers, activeScenario, t);
  const snapshot = snapshotFrom(
    activeScenario,
    t,
    def.astronaut,
    peers,
    spec,
  );
  return {
    ...snapshot,
    vessel: vesselInfo(def),
    alerts: alertsFor(snapshot, def.name),
  };
}

function toCard(snapshot: VesselSnapshot): VesselCard {
  const heart = metricByLabel(snapshot.vitals, "Heart rate");
  const radiation = metricByLabel(snapshot.space, "Hull radiation");
  const flare = metricByLabel(snapshot.space, "Solar flare");
  return {
    ...snapshot.vessel,
    status: statusFrom(snapshot.alerts),
    missionDay: snapshot.astronaut.missionDay,
    crewLead: {
      id: snapshot.astronaut.id,
      name: snapshot.astronaut.name,
    },
    heartRate: heart?.value ?? 0,
    radiation: radiation?.value ?? 0,
    flareActive: (flare?.value ?? 0) >= 1,
    alertCount: snapshot.alerts.length,
    scenario: snapshot.scenario,
  };
}

export function getSnapshot(): Snapshot {
  return snapshotForVessel(DEFAULT_VESSEL_ID, true);
}

export function getFleet(selectedId = DEFAULT_VESSEL_ID): FleetResponse {
  const list = VESSELS.map((def) => snapshotForVessel(def.id, true));
  const snapshots = Object.fromEntries(
    list.map((item) => [item.vessel.id, item]),
  ) as Record<string, VesselSnapshot>;
  const selected =
    snapshots[selectedId] != null ? selectedId : DEFAULT_VESSEL_ID;
  const snapshot = snapshots[selected];
  if (!snapshot) {
    throw new Error("No vessels configured");
  }
  return {
    vessels: list.map(toCard),
    snapshots,
    snapshot,
  };
}

export function vesselIds() {
  return VESSELS.map((vessel) => vessel.id);
}

export function setScenario(next: Scenario) {
  scenario = next;
  tick = 0;
  return getSnapshot();
}

function withUnit(value: number | string, unit: string) {
  if (unit.startsWith(" ") || unit.startsWith("/")) return `${value}${unit}`;
  return `${value} ${unit}`;
}

export function formatMetricLine(metric: Metric): string {
  return `${metric.label}: ${withUnit(metric.value, metric.unit)} (baseline ${withUnit(metric.baseline, metric.unit)}, ${metric.direction})`;
}

export function buildTelemetryPacket(snapshot: Snapshot) {
  return {
    astronaut: snapshot.vitals.map(formatMetricLine),
    spacecraft: snapshot.cabin.map(formatMetricLine),
    environment: snapshot.space.map(formatMetricLine),
    peers: snapshot.peers.map(
      (peer) =>
        `${peer.id} ${peer.name}: ${peer.status}, heart rate ${peer.heartRate} bpm`,
    ),
  };
}

export function findEvidence(query: string, snapshot?: Snapshot) {
  const normalized = query.toLowerCase();
  const categories = new Set<string>(["co2"]);
  const radiation = snapshot?.space.find(
    (metric) =>
      metric.label === "Hull radiation" || metric.label === "Radiation",
  );
  const flare = snapshot?.space.find((metric) => metric.label === "Solar flare");
  if (
    /(radiation|flash|nausea|vomit|vision|light)/.test(normalized) ||
    snapshot?.scenario === "dire" ||
    (radiation?.value ?? 0) > 1 ||
    (flare?.value ?? 0) > 0
  ) {
    categories.add("radiation");
    categories.add("peer");
  }
  return [...categories].flatMap(
    (category) =>
      db
        .prepare("SELECT * FROM evidence WHERE category = ?")
        .all(category) as Evidence[],
  );
}

export function investigationReply(
  input: string,
  voiceAssessment?: string,
  telemetry?: Snapshot,
) {
  const snapshot = telemetry ?? getSnapshot();
  const packet = buildTelemetryPacket(snapshot);
  const evidence = findEvidence(input, snapshot);
  const dire = snapshot.scenario === "dire";
  const mild = snapshot.scenario === "mild";
  const heartRate = snapshot.vitals.find((metric) => metric.label === "Heart rate");
  const bloodPressure = snapshot.vitals.find(
    (metric) => metric.label === "Blood pressure",
  );
  const temperature = snapshot.vitals.find(
    (metric) => metric.label === "Temperature",
  );
  const oxygen = snapshot.cabin.find((metric) => metric.label === "Cabin O₂");
  const co2 = snapshot.cabin.find((metric) => metric.label === "Cabin CO₂");
  const spo2 = snapshot.vitals.find((metric) => metric.label === "SpO₂");
  const rr = snapshot.vitals.find((metric) => metric.label === "Resp. rate");
  const radiation = snapshot.space.find(
    (metric) =>
      metric.label === "Hull radiation" || metric.label === "Radiation",
  );
  const flare = snapshot.space.find((metric) => metric.label === "Solar flare");
  if (!heartRate || !bloodPressure || !radiation) {
    throw new Error("Incomplete onboard telemetry snapshot");
  }
  const voice = voiceAssessment?.trim()
    ? voiceAssessment
    : "no additional voice cues";
  const observations = dire
      ? `Voice report: "${input}". Voice signal: ${voice}. Astronaut: heart rate ${heartRate.value} bpm vs personal baseline 72, blood pressure ${bloodPressure.value}${bloodPressure.unit}, temperature ${temperature?.value ?? "elevated"} °C, SpO₂ ${spo2?.value ?? "n/a"}%. Habitat: cabin O₂ ${oxygen?.value ?? "n/a"}%, cabin CO₂ ${co2?.value ?? "n/a"}%. Space weather: hull radiation ${radiation.value} mSv/h, solar flare ${flare?.unit ?? "active"}.`
    : mild
      ? `Voice report: "${input}". Voice signal: ${voice}. Astronaut: heart rate ${heartRate.value} bpm vs personal baseline 72, blood pressure ${bloodPressure.value}${bloodPressure.unit}, temperature ${temperature?.value ?? "elevated"} °C, SpO₂ ${spo2?.value ?? "n/a"}%, respiratory rate ${rr?.value ?? "elevated"} /min. Cabin CO₂ is ${co2?.value ?? "elevated"}% versus 0.61%.`
      : `Voice report: "${input}". Voice signal: ${voice}. Astronaut heart rate is ${heartRate.value} bpm against a personal resting baseline of 72 bpm. Cabin air and space weather remain near the current mission baseline.`;
  const possibleConcerns = dire
    ? [
        "Acute radiation-related illness to investigate given rising hull dose rate, an active solar event, and reported visual or GI symptoms.",
        "Circulatory stress: tachycardia with falling blood pressure is a dangerous combination and needs immediate recheck.",
        "Fever plus falling SpO₂ — infection, dehydration, and other explanations still remain open.",
      ]
    : mild
      ? [
          "Cabin-linked headache or breathlessness to investigate while cabin CO₂ is above the mission baseline.",
          "Physiological strain: pulse, blood pressure, and temperature are up, while SpO₂ is down and breathing is faster.",
          "Reduced oxygen-carrying comfort that may be worsening symptom tolerance.",
        ]
      : [
          "Symptom-only concern: the voice report matters even though current telemetry is close to personal baseline.",
        ];
  const recommendedActions = dire
    ? [
        "Move immediately to the designated shielding protocol.",
        "Repeat blood pressure and symptom check in 10 minutes; document fluid intake and any emesis.",
        "Notify the crew medical lead and keep the Earth handoff packet ready.",
      ]
    : mild
      ? [
          "Sit supported, hydrate, and stop nonessential exertion.",
          "Repeat pulse, blood pressure, temperature, and SpO₂ after five quiet minutes.",
          "Review cabin CO₂ scrubber status and report whether symptoms change with position.",
        ]
      : [
          "Sit supported and repeat pulse and blood pressure after five quiet minutes.",
          "Confirm hydration and last meal, then re-report if symptoms change.",
        ];
  const hypothesis = dire
    ? "The voice report, astronaut telemetry, habitat readings, and space-weather spike line up in time. That is a high-priority safety concern, not proof that radiation caused the symptoms."
    : mild
      ? "Voice symptoms plus off-baseline vitals and elevated cabin CO₂ form a working investigation, not a diagnosis. Hydration, exertion, and cabin air are the first things to test."
      : "Telemetry does not yet show a material departure from personal baseline. Keep investigating the reported symptoms rather than dismissing them.";

  return {
    id: crypto.randomUUID(),
    severity: dire ? "high" : "monitor",
    possibleConcerns,
    recommendedActions,
    telemetry: packet,
    text: `## Predictions
${
  dire
    ? "If symptoms stay co-timed with the radiation and flare window, treat this as a high-priority safety investigation and prepare shielding plus medical-lead handoff. Without a shielded blood-pressure recheck, uncertainty about radiation-associated risk stays high."
    : mild
      ? "If vitals stay off baseline with the reported symptoms, expect a monitor-level pattern that needs a quiet recheck in five minutes. A second set of pulse, blood pressure, and symptom notes will tighten the next prediction."
      : "If symptoms continue while telemetry stays near baseline, expect an incomplete picture that still warrants follow-up rather than dismissal. Another quiet measurement pass will clarify whether this stays monitor-level."
}

## What could be causing these symptoms
${possibleConcerns.join(" ")} ${hypothesis}

## Historical analysis
Using onboard OSDR/HRR extracts (${evidence.map((item) => item.id).join(", ")}): ${evidence.map((item) => item.snippet).join(" ")} For this ${dire ? "dire" : mild ? "mild" : "nominal"} event window${dire ? " with active solar-weather pressure" : ""}, that history ${dire ? "aligns with prior co-timed radiation and neuro-ocular style reports, so we treat the match as a safety investigation rather than proof of mechanism" : mild ? "partially matches nonspecific cabin-air and exertion patterns more than a clear radiation signature" : "does not yet match a strong historical hazard pattern because live readings are still near personal baseline"}.

## Speak aloud
${
  dire
    ? "Your nausea and light flashes line up with the radiation and solar-flare rise, so those could be connected rather than random. That pattern predicts a high-priority risk window if exposure continues. I checked NASA OSDR historical cases, and prior crews logged similar co-timed GI and visual reports during SPE windows. Move to shielding now, notify the medical lead, and recheck blood pressure once you are shielded."
    : mild
      ? "Your headache and breathlessness can fit with cabin air pressure and your pulse running above your personal baseline. That pattern predicts a monitor-level watch, not an emergency, if we recheck after a quiet pause. I checked NASA OSDR and cabin history, and it only partly matches past nonspecific cabin-air cases. Sit supported, hydrate, and we will repeat the key vitals in five minutes."
      : "I hear what you described, but ship and space readings are still near your personal baseline, so environment alone does not explain it yet. That predicts a symptom-first watch until something moves. I checked NASA OSDR history and nothing strongly matches this window. Sit supported, recheck pulse after five quiet minutes, and tell me if anything changes."
}`,
    speak: dire
      ? "Your nausea and light flashes line up with the radiation and solar-flare rise, so those could be connected rather than random. That pattern predicts a high-priority risk window if exposure continues. I checked NASA OSDR historical cases, and prior crews logged similar co-timed GI and visual reports during SPE windows. Move to shielding now, notify the medical lead, and recheck blood pressure once you are shielded."
      : mild
        ? "Your headache and breathlessness can fit with cabin air pressure and your pulse running above your personal baseline. That pattern predicts a monitor-level watch, not an emergency, if we recheck after a quiet pause. I checked NASA OSDR and cabin history, and it only partly matches past nonspecific cabin-air cases. Sit supported, hydrate, and we will repeat the key vitals in five minutes."
        : "I hear what you described, but ship and space readings are still near your personal baseline, so environment alone does not explain it yet. That predicts a symptom-first watch until something moves. I checked NASA OSDR history and nothing strongly matches this window. Sit supported, recheck pulse after five quiet minutes, and tell me if anything changes.",
    citations: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
    })),
  };
}
