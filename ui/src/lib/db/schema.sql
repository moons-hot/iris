PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mission_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mission_name TEXT NOT NULL,
  mission_phase TEXT NOT NULL,
  mission_day INTEGER NOT NULL,
  comm_delay_minutes_one_way INTEGER NOT NULL,
  link_status TEXT NOT NULL DEFAULT 'connected'
    CHECK (link_status IN ('connected', 'autonomous'))
);

CREATE TABLE IF NOT EXISTS crew (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS baseline_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id TEXT NOT NULL REFERENCES crew (id),
  metric_key TEXT NOT NULL,
  personal_mean REAL NOT NULL,
  personal_std REAL,
  personal_min REAL,
  personal_max REAL,
  population_low REAL NOT NULL,
  population_high REAL NOT NULL,
  unit TEXT NOT NULL,
  UNIQUE (crew_id, metric_key)
);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id TEXT NOT NULL REFERENCES crew (id),
  metric_key TEXT NOT NULL,
  value REAL NOT NULL,
  recorded_at_mission_day REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'medical_station'
);

CREATE TABLE IF NOT EXISTS environment_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT NOT NULL DEFAULT 'cabin',
  metric_key TEXT NOT NULL,
  value REAL NOT NULL,
  nominal_low REAL NOT NULL,
  nominal_high REAL NOT NULL,
  unit TEXT NOT NULL,
  recorded_at_mission_day REAL NOT NULL,
  UNIQUE (zone, metric_key)
);

CREATE TABLE IF NOT EXISTS historical_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT NOT NULL,
  source_citation TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_measurements_crew_metric
  ON measurements (crew_id, metric_key, recorded_at_mission_day DESC);
