/**
 * Applies the Iris schema to Tiger Data and loads synthetic demo data.
 *
 * Usage: DATABASE_URL=... pnpm db:seed
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { chainEvents } from "@/server/iris/audit";
import { encryptFragmentValue } from "@/server/iris/crypto";
import { POLICY_RULES } from "@/server/iris/policy-rules";
import {
  SEED_DEVICES,
  SEED_ENCOUNTERS,
  SEED_FRAGMENTS,
  SEED_PATIENTS,
  SEED_RELATIONSHIPS,
  SEED_USERS,
} from "@/server/iris/seed-data";
import { buildBackdatedEvents } from "@/server/iris/seed-events";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. Point it at your Tiger service.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, prepare: false });

type JsonParam = Parameters<typeof sql.json>[0];
const asJson = (value: unknown): JsonParam => value as JsonParam;

const migrationPath = fileURLToPath(
  new URL("../src/server/db/migrations/001_schema.sql", import.meta.url),
);

async function main(): Promise<void> {
  console.log("Applying schema...");
  const schema = await readFile(migrationPath, "utf8");
  await sql.unsafe(schema);

  console.log("Clearing previous demo data...");
  await sql`truncate access_events`;
  await sql`
    truncate generated_actions, delegations, sessions, record_fragments,
             patient_relationships, encounters, patients, devices, users, policies
    cascade
  `;

  console.log("Loading users, devices and patients...");
  for (const user of SEED_USERS) {
    await sql`
      insert into users (id, full_name, role, department)
      values (${user.id}, ${user.fullName}, ${user.role}, ${user.department})
    `;
  }
  for (const device of SEED_DEVICES) {
    await sql`
      insert into devices (id, user_id, label, secret_hex)
      values (${device.id}, ${device.userId}, ${device.label}, ${device.secretHex})
    `;
  }
  for (const patient of SEED_PATIENTS) {
    await sql`
      insert into patients (id, pseudonym, date_of_birth)
      values (${patient.id}, ${patient.pseudonym}, ${patient.dateOfBirth})
    `;
  }
  for (const encounter of SEED_ENCOUNTERS) {
    await sql`
      insert into encounters (id, patient_id, department, reason, started_at)
      values (${encounter.id}, ${encounter.patientId}, ${encounter.department},
              ${encounter.reason}, ${encounter.startedAt})
    `;
  }
  for (const link of SEED_RELATIONSHIPS) {
    await sql`
      insert into patient_relationships (actor_id, patient_id, relationship)
      values (${link.actorId}, ${link.patientId}, ${link.relationship})
    `;
  }

  console.log("Loading policy rules...");
  for (const rule of POLICY_RULES) {
    await sql`
      insert into policies (
        id, actor_role, purpose, allowed_types, transformed_types, deny_reason,
        requires_relationship
      ) values (
        ${rule.id}, ${rule.actorRole}, ${rule.purpose}, ${rule.allowedTypes},
        ${sql.json(asJson(rule.transformedTypes))}, ${rule.denyReason},
        ${rule.requiresRelationship}
      )
    `;
  }

  console.log(`Encrypting and loading ${SEED_FRAGMENTS.length} fragments...`);
  for (const fragment of SEED_FRAGMENTS) {
    const encrypted = encryptFragmentValue(
      fragment.patientId,
      fragment.fragmentType,
      fragment.value,
    );
    await sql`
      insert into record_fragments (
        id, patient_id, encounter_id, fragment_type, label, sensitivity,
        purpose_classes, ciphertext, iv, auth_tag
      ) values (
        ${fragment.id}, ${fragment.patientId}, ${fragment.encounterId},
        ${fragment.fragmentType}, ${fragment.label}, ${fragment.sensitivity},
        ${fragment.purposeClasses}, ${encrypted.ciphertext}, ${encrypted.iv},
        ${encrypted.authTag}
      )
    `;
  }

  const events = chainEvents(null, buildBackdatedEvents());
  console.log(`Loading ${events.length} backdated access events...`);
  const batchSize = 500;
  for (let index = 0; index < events.length; index += batchSize) {
    const batch = events.slice(index, index + batchSize);
    await sql`
      insert into access_events ${sql(
        batch.map((event) => ({
          time: event.time,
          event_id: event.eventId,
          actor_id: event.actorId,
          actor_role: event.actorRole,
          device_id: event.deviceId,
          patient_id: event.patientId,
          encounter_id: event.encounterId,
          session_id: event.sessionId,
          purpose: event.purpose,
          task: event.task,
          resource_type: event.resourceType,
          decision: event.decision,
          reason: event.reason,
          break_glass: event.breakGlass,
          latency_ms: event.latencyMs,
          metadata: sql.json(asJson(event.metadata)),
          previous_event_hash: event.previousEventHash,
          event_hash: event.eventHash,
        })),
      )}
    `;
  }

  console.log("Refreshing continuous aggregate...");
  await sql`call refresh_continuous_aggregate('access_events_5min', null, null)`;

  console.log("Done. Iris is seeded.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void sql.end();
  });
