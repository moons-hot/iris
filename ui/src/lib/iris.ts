import Database from "better-sqlite3";

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
    strength: number;
    nutrition: number;
    co2: number;
    radiation: number;
    oxygen: number;
    water: number;
    flare: number;
  }
> = {
  nominal: {
    hr: 62,
    sys: 112,
    dia: 72,
    temp: 36.7,
    strength: 96,
    nutrition: 91,
    co2: 0.62,
    radiation: 0.18,
    oxygen: 20.9,
    water: 99.8,
    flare: 0,
  },
  mild: {
    hr: 84,
    sys: 134,
    dia: 86,
    temp: 37.6,
    strength: 79,
    nutrition: 68,
    co2: 0.78,
    radiation: 0.2,
    oxygen: 20.8,
    water: 99.8,
    flare: 0,
  },
  dire: {
    hr: 118,
    sys: 84,
    dia: 51,
    temp: 38.9,
    strength: 41,
    nutrition: 27,
    co2: 0.84,
    radiation: 2.6,
    oxygen: 20.3,
    water: 99.6,
    flare: 4,
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
  options: { drift?: number; count?: number; phase?: number } = {},
): number[] {
  const count = options.count ?? 15;
  const drift = options.drift ?? 0;
  const phaseOffset = options.phase ?? 0;
  return Array.from({ length: count }, (_, i) => {
    const t = tick + i + phaseOffset;
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

export function getSnapshot(): Snapshot {
  tick += 2;
  const s = specs[scenario];
  const jitter = scenario === "nominal" ? 1 : 0.55;
  const hrHistory = sampleSeries(s.hr, 3.8 * jitter, 0);
  const sysHistory = sampleSeries(s.sys, 4.2 * jitter, 0);
  const diaHistory = sampleSeries(s.dia, 2.4 * jitter, 0, { phase: 3 });
  const tempHistory = sampleSeries(s.temp, 0.14 * jitter, 1);
  const strengthHistory = sampleSeries(s.strength, 2.2 * jitter, 0);
  const nutritionHistory = sampleSeries(s.nutrition, 2.6 * jitter, 0);
  const oxygenHistory = sampleSeries(s.oxygen, 0.12, 1, {
    drift: scenario === "dire" ? -0.12 : 0,
  });
  const co2History = sampleSeries(s.co2, 0.05, 2, {
    drift: scenario === "nominal" ? 0.03 : 0.1,
  });
  const waterHistory = sampleSeries(s.water, 0.1, 1);
  const radiationHistory = sampleSeries(s.radiation, scenario === "dire" ? 0.16 : 0.07, 2, {
    drift: scenario === "dire" ? 0.22 : 0.03,
  });
  const flareHistory =
    s.flare === 0
      ? Array.from({ length: 15 }, () => 0)
      : sampleSeries(s.flare, 0.45, 0, { drift: 1.2 });

  const latestSys = sysHistory.at(-1) ?? s.sys;
  const latestDia = diaHistory.at(-1) ?? s.dia;

  return {
    astronaut: { id: "A01", name: "Mara Voss", missionDay: 184 },
    scenario,
    vitals: [
      metric("Heart rate", hrHistory, "bpm", 62, 1.2, {
        direction: scenario === "nominal" ? directionFrom(hrHistory, 1.2) : "up",
      }),
      metric("Blood pressure", sysHistory, `/${latestDia} mmHg`, 112, 1.5, {
        direction:
          scenario === "mild"
            ? "up"
            : scenario === "dire"
              ? "down"
              : directionFrom(sysHistory, 1.5),
        historyText: sysHistory.map(
          (sys, index) => `${sys}/${diaHistory[index] ?? latestDia}`,
        ),
      }),
      metric("Temperature", tempHistory, "°C", 36.7, 0.08, {
        direction: scenario === "nominal" ? directionFrom(tempHistory, 0.08) : "up",
      }),
      metric("Strength", strengthHistory, "% baseline", 96, 1, {
        direction: scenario === "nominal" ? directionFrom(strengthHistory, 1) : "down",
      }),
      metric("Nutrition", nutritionHistory, "% target", 90, 1, {
        direction: scenario === "nominal" ? directionFrom(nutritionHistory, 1) : "down",
      }),
    ],
    cabin: [
      metric("Oxygen", oxygenHistory, "%", 20.9, 0.05, {
        direction: scenario === "dire" ? "down" : directionFrom(oxygenHistory, 0.05),
      }),
      metric("CO₂", co2History, "%", 0.61, 0.03, {
        direction: scenario === "nominal" ? directionFrom(co2History, 0.03) : "up",
      }),
      metric("Water purity", waterHistory, "%", 99.8, 0.08),
    ],
    space: [
      metric("Radiation", radiationHistory, "mSv/h", 0.18, 0.04, {
        direction: scenario === "dire" ? "up" : directionFrom(radiationHistory, 0.04),
      }),
      metric(
        "Solar flare",
        flareHistory,
        scenario === "dire" ? " active" : " clear",
        0,
        0.5,
        {
          direction: scenario === "dire" ? "up" : "stable",
        },
      ),
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
  const radiation = snapshot?.space.find((metric) => metric.label === "Radiation");
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
  const oxygen = snapshot.cabin.find((metric) => metric.label === "Oxygen");
  const co2 = snapshot.cabin.find((metric) => metric.label === "CO₂");
  const radiation = snapshot.space.find((metric) => metric.label === "Radiation");
  const flare = snapshot.space.find((metric) => metric.label === "Solar flare");
  if (!heartRate || !bloodPressure || !radiation) {
    throw new Error("Incomplete onboard telemetry snapshot");
  }
  const voice = voiceAssessment?.trim()
    ? voiceAssessment
    : "no additional voice cues";
  const observations = dire
    ? `Voice report: "${input}". Voice signal: ${voice}. Astronaut: heart rate ${heartRate.value} bpm vs personal baseline 62, blood pressure ${bloodPressure.value}${bloodPressure.unit}, temperature ${temperature?.value ?? "elevated"} °C. Spacecraft: oxygen ${oxygen?.value ?? "n/a"}%, CO₂ ${co2?.value ?? "n/a"}%. Space environment: radiation ${radiation.value} mSv/h, solar flare ${flare?.value ?? 0}${flare?.unit ?? ""}.`
    : mild
      ? `Voice report: "${input}". Voice signal: ${voice}. Astronaut: heart rate ${heartRate.value} bpm vs personal baseline 62, blood pressure ${bloodPressure.value}${bloodPressure.unit}, temperature ${temperature?.value ?? "elevated"} °C. Strength and nutrition are below station targets. Spacecraft CO₂ is ${co2?.value ?? "elevated"}% versus 0.61%.`
      : `Voice report: "${input}". Voice signal: ${voice}. Astronaut heart rate is ${heartRate.value} bpm against a personal resting baseline of 62 bpm. Cabin and space readings remain near the current mission baseline.`;
  const possibleConcerns = dire
    ? [
        "Acute radiation-related illness to investigate given rising dose rate, an active solar event, and reported visual or GI symptoms.",
        "Circulatory stress: tachycardia with falling blood pressure is a dangerous combination and needs immediate recheck.",
        "Fever plus weakness and poor intake — infection, dehydration, and other explanations still remain open.",
      ]
    : mild
      ? [
          "Cabin-linked headache or breathlessness to investigate while CO₂ is above the mission baseline.",
          "Physiological strain: pulse, blood pressure, and temperature are all up versus personal baseline.",
          "Reduced strength and nutrition that may be worsening symptom tolerance.",
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
          "Repeat pulse, blood pressure, and temperature after five quiet minutes.",
          "Review cabin CO₂ scrubber status and report whether symptoms change with position.",
        ]
      : [
          "Sit supported and repeat pulse and blood pressure after five quiet minutes.",
          "Confirm hydration and last meal, then re-report if symptoms change.",
        ];
  const hypothesis = dire
    ? "The voice report, astronaut telemetry, spacecraft cabin readings, and space-environment spike line up in time. That is a high-priority safety concern, not proof that radiation caused the symptoms."
    : mild
      ? "Voice symptoms plus off-baseline vitals and elevated cabin CO₂ form a working investigation, not a diagnosis. Hydration, exertion, and cabin air are the first things to test."
      : "Telemetry does not yet show a material departure from personal baseline. Keep investigating the reported symptoms rather than dismissing them.";

  return {
    id: crypto.randomUUID(),
    severity: dire ? "high" : "monitor",
    possibleConcerns,
    recommendedActions,
    telemetry: packet,
    text: `## Iris investigation update\n\n**Observed** — ${observations}\n\n**Possible concerns to investigate** — ${possibleConcerns.join(" ")}\n\n**Immediate actions** — ${recommendedActions.join(" ")}\n\n**Working interpretation** — ${hypothesis}\n\n**Historical context** — ${evidence.map((item) => `[${item.id}] ${item.snippet}`).join(" ")}`,
    speak: dire
      ? "I am flagging a high-priority concern. Move to shielding now, then we will repeat your blood pressure."
      : mild
        ? "Your pulse, blood pressure, and temperature are above your personal baseline, and cabin CO2 is up. Sit, hydrate, and we will recheck."
        : "Your current measurements are close to your personal baseline. Let us repeat them after a short supported rest.",
    citations: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
    })),
  };
}
