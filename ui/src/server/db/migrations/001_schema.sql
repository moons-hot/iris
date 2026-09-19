-- Iris schema for Tiger Data (PostgreSQL + TimescaleDB).
-- Synthetic demo data only. See README for production caveats.

create extension if not exists pgcrypto;
create extension if not exists timescaledb;

create table if not exists users (
  id            text primary key,
  full_name     text not null,
  role          text not null,
  department    text not null,
  created_at    timestamptz not null default now()
);

create table if not exists devices (
  id            text primary key,
  user_id       text not null references users (id) on delete cascade,
  label         text not null,
  -- Provisioned shared secret for the hackathon build. Production would keep
  -- this in ESP32-S3 eFuse / HMAC peripheral and never in application storage.
  secret_hex    text not null,
  created_at    timestamptz not null default now()
);

create table if not exists patients (
  id            text primary key,
  pseudonym     text not null unique,
  date_of_birth date not null,
  created_at    timestamptz not null default now()
);

create table if not exists encounters (
  id            text primary key,
  patient_id    text not null references patients (id) on delete cascade,
  department    text not null,
  reason        text not null,
  started_at    timestamptz not null default now()
);

create table if not exists patient_relationships (
  actor_id      text not null references users (id) on delete cascade,
  patient_id    text not null references patients (id) on delete cascade,
  relationship  text not null,
  primary key (actor_id, patient_id)
);

-- Deterministic authorization rules. The policy engine reads these; no model
-- output is ever consulted to widen an allow list.
create table if not exists policies (
  id                 text primary key,
  actor_role         text not null,
  purpose            text not null,
  allowed_types      text[] not null default '{}',
  transformed_types  jsonb not null default '{}'::jsonb,
  deny_reason        text not null,
  requires_relationship boolean not null default true
);

-- One row per clinical fact. Encrypting per fragment is what makes
-- purpose-bound decryption possible: we never have to open the whole chart.
create table if not exists record_fragments (
  id              text primary key,
  patient_id      text not null references patients (id) on delete cascade,
  encounter_id    text references encounters (id) on delete set null,
  fragment_type   text not null,
  label           text not null,
  sensitivity     text not null,
  purpose_classes text[] not null default '{}',
  ciphertext      bytea not null,
  iv              bytea not null,
  auth_tag        bytea not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists record_fragments_patient_idx
  on record_fragments (patient_id, fragment_type);

create table if not exists delegations (
  id            text primary key,
  created_by    text not null references users (id) on delete cascade,
  recipient_role text not null,
  patient_id    text not null references patients (id) on delete cascade,
  encounter_id  text references encounters (id) on delete set null,
  purpose       text not null,
  scope         text[] not null default '{}',
  reason        text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);

create table if not exists sessions (
  id                text primary key,
  actor_id          text not null references users (id) on delete cascade,
  device_id         text not null references devices (id) on delete cascade,
  purpose           text,
  task              text,
  break_glass_until timestamptz,
  break_glass_reason text,
  created_at        timestamptz not null default now(),
  last_presence_at  timestamptz not null default now(),
  ended_at          timestamptz,
  end_reason        text
);

create table if not exists generated_actions (
  id           text primary key,
  action_type  text not null,
  actor_id     text not null references users (id) on delete cascade,
  patient_id   text references patients (id) on delete set null,
  encounter_id text references encounters (id) on delete set null,
  title        text not null,
  body         jsonb not null,
  included     text[] not null default '{}',
  excluded     text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- The audit stream. This is the Tiger hypertable everything else feeds.
create table if not exists access_events (
  time                timestamptz not null default now(),
  event_id            text not null,
  actor_id            text,
  actor_role          text,
  device_id           text,
  patient_id          text,
  encounter_id        text,
  session_id          text,
  purpose             text,
  task                text,
  resource_type       text,
  decision            text not null,
  reason              text,
  break_glass         boolean not null default false,
  latency_ms          integer,
  metadata            jsonb not null default '{}'::jsonb,
  previous_event_hash text,
  event_hash          text not null,
  primary key (time, event_id)
);

select create_hypertable(
  'access_events',
  by_range('time', interval '1 hour'),
  if_not_exists => true
);

create index if not exists access_events_patient_time_idx
  on access_events (patient_id, time desc);

create index if not exists access_events_actor_time_idx
  on access_events (actor_id, time desc);

create index if not exists access_events_break_glass_idx
  on access_events (break_glass, time desc)
  where break_glass;

-- Continuous aggregate powering the live security dashboard. Buckets are small
-- so the demo sees its own actions land within seconds.
create materialized view if not exists access_events_5min
  with (timescaledb.continuous) as
select
  time_bucket('5 minutes', time) as bucket,
  purpose,
  decision,
  break_glass,
  count(*)                       as event_count
from access_events
group by bucket, purpose, decision, break_glass
with no data;

select add_continuous_aggregate_policy(
  'access_events_5min',
  start_offset => interval '3 days',
  end_offset   => interval '1 minute',
  schedule_interval => interval '1 minute',
  if_not_exists => true
);
