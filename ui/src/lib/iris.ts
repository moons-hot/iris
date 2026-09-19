import Database from "better-sqlite3";

export type Scenario = "nominal" | "mild" | "dire";

export type Metric = {
  label: string;
  value: number;
  unit: string;
  baseline: number;
  direction: "stable" | "up" | "down";
};

export type Snapshot = {
  astronaut: { id: string; name: string; missionDay: number };
  scenario: Scenario;
  vitals: Metric[];
  cabin: Metric[];
  space: Metric[];
  peers: { id: string; name: string; status: string; heartRate: number }[];
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

const specs: Record<
  Scenario,
  {
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
  }
> = {
  nominal: {
    hr: 62,
    sys: 112,
    dia: 72,
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
  mild: {
    hr: 65,
    sys: 111,
    dia: 71,
    temp: 36.8,
    spo2: 97,
    rr: 16,
    co2: 0.68,
    radiation: 0.2,
    oxygen: 20.9,
    suit: 29.5,
    pressure: 101.2,
    spe: 0.5,
  },
  dire: {
    hr: 86,
    sys: 92,
    dia: 59,
    temp: 37.3,
    spo2: 91,
    rr: 24,
    co2: 0.7,
    radiation: 1.46,
    oxygen: 20.7,
    suit: 24.1,
    pressure: 100.8,
    spe: 18.2,
  },
};

function jitter(value: number, magnitude: number) {
  return Math.round((value + Math.sin(tick / 2) * magnitude) * 10) / 10;
}

export function getSnapshot(): Snapshot {
  tick += 1;
  const s = specs[scenario];
  return {
    astronaut: { id: "A01", name: "Mara Voss", missionDay: 184 },
    scenario,
    vitals: [
      {
        label: "Heart rate",
        value: Math.round(jitter(s.hr, 2)),
        unit: "bpm",
        baseline: 62,
        direction: scenario === "dire" ? "up" : "stable",
      },
      {
        label: "Blood pressure",
        value: Math.round(s.sys),
        unit: `/${Math.round(s.dia)} mmHg`,
        baseline: 112,
        direction: scenario === "dire" ? "down" : "stable",
      },
      {
        label: "Temperature",
        value: jitter(s.temp, 0.1),
        unit: "°C",
        baseline: 36.7,
        direction: scenario === "dire" ? "up" : "stable",
      },
      {
        label: "SpO₂",
        value: Math.round(jitter(s.spo2, 0.4)),
        unit: "%",
        baseline: 98,
        direction: scenario === "dire" ? "down" : "stable",
      },
      {
        label: "Resp. rate",
        value: Math.round(jitter(s.rr, 0.6)),
        unit: "/min",
        baseline: 14,
        direction: scenario === "dire" ? "up" : "stable",
      },
    ],
    cabin: [
      {
        label: "Cabin O₂",
        value: jitter(s.oxygen, 0.05),
        unit: "%",
        baseline: 20.9,
        direction: scenario === "dire" ? "down" : "stable",
      },
      {
        label: "Cabin CO₂",
        value: jitter(s.co2, 0.02),
        unit: "%",
        baseline: 0.61,
        direction: scenario === "mild" ? "up" : "stable",
      },
      {
        label: "Cabin pressure",
        value: jitter(s.pressure, 0.05),
        unit: "kPa",
        baseline: 101.3,
        direction: scenario === "dire" ? "down" : "stable",
      },
      {
        label: "Suit pressure",
        value: jitter(s.suit, 0.04),
        unit: "kPa",
        baseline: 29.6,
        direction: scenario === "dire" ? "down" : "stable",
      },
    ],
    space: [
      {
        label: "Hull radiation",
        value: jitter(s.radiation, 0.04),
        unit: "mSv/h",
        baseline: 0.18,
        direction: scenario === "dire" ? "up" : "stable",
      },
      {
        label: "Solar flare",
        value: scenario === "dire" ? 1 : 0,
        unit: scenario === "dire" ? "active" : "quiet",
        baseline: 0,
        direction: scenario === "dire" ? "up" : "stable",
      },
      {
        label: "SPE flux",
        value: jitter(s.spe, scenario === "dire" ? 0.8 : 0.05),
        unit: "pfu",
        baseline: 0.4,
        direction: scenario === "dire" ? "up" : "stable",
      },
    ],
    peers: [
      {
        id: "A02",
        name: "Jonah Reyes",
        status: scenario === "dire" ? "observing" : "nominal",
        heartRate: 65,
      },
      {
        id: "A03",
        name: "Elena Park",
        status: scenario === "dire" ? "report logged" : "nominal",
        heartRate: 59,
      },
    ],
  };
}

export function setScenario(next: Scenario) {
  scenario = next;
  tick = 0;
  return getSnapshot();
}

export function findEvidence(query: string) {
  const normalized = query.toLowerCase();
  const categories = new Set<string>(["co2"]);
  if (
    /(radiation|flash|nausea|vomit|vision|light)/.test(normalized) ||
    scenario === "dire"
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

export function investigationReply(input: string, voiceAssessment?: string) {
  const snapshot = getSnapshot();
  const evidence = findEvidence(input);
  const dire = snapshot.scenario === "dire";
  const [heartRate, bloodPressure] = snapshot.vitals;
  const [radiation] = snapshot.space;
  if (!heartRate || !bloodPressure || !radiation) {
    throw new Error("Incomplete onboard telemetry snapshot");
  }
  const observations = dire
    ? `Your heart rate is ${heartRate.value} bpm against a personal resting baseline of 62 bpm, while blood pressure is ${bloodPressure.value}${bloodPressure.unit}. Hull radiation is ${radiation.value} mSv/h and a solar flare is active — treat this as a shielding window, not a diagnosis.`
    : `Your heart rate is ${heartRate.value} bpm against a personal resting baseline of 62 bpm. Blood pressure, temperature, oxygen, and radiation remain near your current mission baseline.`;
  const hypothesis = dire
    ? "The timing of symptoms, rising radiation, and the two related peer logs create a time-linked safety concern. This is not enough to establish that radiation caused the symptoms; dehydration, orthostatic effects, medication, infection, and other explanations still require checking."
    : "The present measurements do not show a material departure from your personal baseline. Your reported breathing discomfort and headache still matter; they should be followed with a focused recheck rather than dismissed as normal.";
  const nextStep = dire
    ? "Immediate next evidence: move to the designated shielding protocol, repeat blood pressure and symptom check in 10 minutes, document fluid intake and emesis, and notify the crew medical lead."
    : "Next evidence: sit supported, repeat pulse and blood pressure after five quiet minutes, confirm hydration and meal intake, and tell me whether symptoms change with position or activity.";
  const voice = voiceAssessment ? ` Voice signal: ${voiceAssessment}.` : "";

  return {
    id: crypto.randomUUID(),
    severity: dire ? "high" : "monitor",
    text: `## Iris investigation update\n\n**Observed** — ${observations}${voice}\n\n**Working interpretation** — ${hypothesis}\n\n**What would reduce uncertainty next** — ${nextStep}\n\n**Historical context** — ${evidence.map((item) => `[${item.id}] ${item.snippet}`).join(" ")}`,
    speak: dire
      ? "I am flagging a high-priority monitoring concern. Please move to shielding and repeat your blood pressure now."
      : "Your current measurements are close to your personal baseline. Let us repeat them after a short supported rest.",
    citations: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
    })),
  };
}
