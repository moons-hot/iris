import type Database from "better-sqlite3";

const MISSION_DAY = 180;

export function seedDatabase(db: Database.Database): void {
  const existing = db
    .prepare("SELECT mission_day FROM mission_state WHERE id = 1")
    .get() as { mission_day: number } | undefined;

  if (existing) {
    return;
  }

  db.prepare(
    `INSERT INTO mission_state (
      id, mission_name, mission_phase, mission_day,
      comm_delay_minutes_one_way, link_status
    ) VALUES (1, ?, ?, ?, ?, ?)`,
  ).run("Mars Transit — MED-1 Demo", "cruise", MISSION_DAY, 18, "connected");

  const insertCrew = db.prepare(
    `INSERT INTO crew (id, display_name, role) VALUES (?, ?, ?)`,
  );
  const crew = [
    ["A01", "Dr. Elena Vasquez", "Commander / Flight Surgeon"],
    ["A02", "Marcus Chen", "Mission Specialist"],
    ["A03", "Priya Okonkwo", "Systems Engineer"],
    ["A04", "James Okafor", "Payload Specialist"],
  ] as const;
  for (const row of crew) {
    insertCrew.run(row[0], row[1], row[2]);
  }

  const insertBaseline = db.prepare(
    `INSERT INTO baseline_metrics (
      crew_id, metric_key, personal_mean, personal_std,
      personal_min, personal_max, population_low, population_high, unit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const baselines: Array<
    [
      string,
      string,
      number,
      number | null,
      number | null,
      number | null,
      number,
      number,
      string,
    ]
  > = [
    ["A01", "heart_rate", 58, 4, 52, 66, 60, 100, "bpm"],
    ["A01", "spo2", 97.5, 0.4, 96.5, 99, 95, 100, "%"],
    ["A01", "temp_c", 36.6, 0.15, 36.3, 36.9, 36.1, 37.2, "°C"],
    ["A02", "heart_rate", 62, 3, 56, 68, 60, 100, "bpm"],
    ["A02", "spo2", 98, 0.3, 97, 99.2, 95, 100, "%"],
    ["A02", "temp_c", 36.5, 0.12, 36.2, 36.8, 36.1, 37.2, "°C"],
    ["A03", "heart_rate", 64, 3.5, 58, 70, 60, 100, "bpm"],
    ["A03", "spo2", 97.8, 0.35, 96.8, 98.8, 95, 100, "%"],
    ["A03", "temp_c", 36.55, 0.14, 36.25, 36.85, 36.1, 37.2, "°C"],
    ["A04", "heart_rate", 60, 3, 54, 66, 60, 100, "bpm"],
    ["A04", "spo2", 98.2, 0.25, 97.5, 99, 95, 100, "%"],
    ["A04", "temp_c", 36.58, 0.1, 36.35, 36.8, 36.1, 37.2, "°C"],
  ];
  for (const row of baselines) {
    insertBaseline.run(...row);
  }

  const insertMeasurement = db.prepare(
    `INSERT INTO measurements (
      crew_id, metric_key, value, recorded_at_mission_day, source
    ) VALUES (?, ?, ?, ?, ?)`,
  );

  for (const crewId of ["A01", "A02", "A03", "A04"]) {
    const hrMean =
      crewId === "A02"
        ? 62
        : crewId === "A01"
          ? 58
          : crewId === "A03"
            ? 64
            : 60;
    for (let i = 0; i < 8; i++) {
      const day = MISSION_DAY - 14 + i * 2;
      insertMeasurement.run(
        crewId,
        "heart_rate",
        hrMean + (i % 3) - 1,
        day,
        "routine_monitor",
      );
    }
    insertMeasurement.run(
      crewId,
      "heart_rate",
      crewId === "A02" ? 63 : hrMean,
      MISSION_DAY - 0.5,
      "routine_monitor",
    );
    insertMeasurement.run(
      crewId,
      "spo2",
      crewId === "A02" ? 98.1 : 97.9,
      MISSION_DAY - 0.5,
      "routine_monitor",
    );
    insertMeasurement.run(
      crewId,
      "temp_c",
      crewId === "A02" ? 36.5 : 36.55,
      MISSION_DAY - 0.5,
      "routine_monitor",
    );
  }

  const insertEnv = db.prepare(
    `INSERT INTO environment_readings (
      zone, metric_key, value, nominal_low, nominal_high, unit, recorded_at_mission_day
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  insertEnv.run("cabin", "co2_ppm", 3200, 400, 3000, "ppm", MISSION_DAY);
  insertEnv.run("cabin", "o2_fraction", 21.0, 19.5, 23.5, "%", MISSION_DAY);
  insertEnv.run("cabin", "humidity_pct", 42, 30, 60, "%", MISSION_DAY);
  insertEnv.run("cabin", "cabin_temp_c", 22.1, 18, 26, "°C", MISSION_DAY);
  insertEnv.run(
    "hull",
    "radiation_msv_day",
    0.62,
    0,
    1.2,
    "mSv/day",
    MISSION_DAY,
  );

  const insertHistorical = db.prepare(
    `INSERT INTO historical_evidence (title, summary, tags, source_citation)
     VALUES (?, ?, ?, ?)`,
  );

  insertHistorical.run(
    "Headache reports during long-duration flight",
    "Previous spaceflight research has documented increased headache reports during extended missions, often investigated alongside hydration, sleep, and cabin environmental factors.",
    JSON.stringify(["headache", "neuro", "spaceflight"]),
    "NASA OSDR — aggregated biomedical literature (demo cache)",
  );
  insertHistorical.run(
    "Cardiovascular adaptation in microgravity",
    "Crew cardiovascular profiles often shift during transit; personal baselines are more informative than single population thresholds for trend detection.",
    JSON.stringify(["heart_rate", "cardiovascular", "baseline"]),
    "NASA Human Research Program summaries (demo cache)",
  );
  insertHistorical.run(
    "Elevated cabin CO2 and crew symptoms",
    "Prior missions have investigated relationships between elevated partial pressure of CO2 and nonspecific symptoms such as headache and fatigue; such data inform investigation, not individual diagnosis.",
    JSON.stringify(["co2", "headache", "environment", "correlation"]),
    "NASA OSDR — environmental health studies (demo cache)",
  );
}
