import postgres from "postgres";

import { chainEvents, verifyChain } from "@/server/iris/audit";
import { encryptFragmentValue, randomId } from "@/server/iris/crypto";
import type {
  AccessEvent,
  Delegation,
  Device,
  Encounter,
  FragmentCipher,
  FragmentMeta,
  GeneratedAction,
  Patient,
  PolicyRule,
  Purpose,
  Role,
  Session,
  User,
} from "@/server/iris/types";
import type { DashboardStats, IrisStore } from "@/server/store/types";

export type Sql = postgres.Sql<Record<string, never>>;

type JsonParam = Parameters<Sql["json"]>[0];

/** `metadata` and action bodies are open-ended objects; postgres.js wants its own JSON type. */
function asJson(value: unknown): JsonParam {
  return value as JsonParam;
}

const globalForSql = globalThis as unknown as { irisSql?: Sql };

export function getSql(connectionString: string): Sql {
  globalForSql.irisSql ??= postgres(connectionString, {
    max: 5,
    // Tiger Cloud requires TLS; `prepare: false` keeps pooled connections happy.
    prepare: false,
    onnotice: () => undefined,
  });
  return globalForSql.irisSql;
}

function isoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isoString(value);
}

/*
 * postgres.js returns untyped rows, so the mapping functions below are the one
 * place where we assert shape. Everything above this line stays fully typed.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

export function createPostgresStore(sql: Sql): IrisStore {
  return {
    kind: "tiger",

    listPolicies: async () => {
      const rows = await sql`
        select id, actor_role, purpose, allowed_types, transformed_types,
               deny_reason, requires_relationship
        from policies
      `;
      return rows.map((row): PolicyRule => ({
        id: row.id,
        actorRole: row.actor_role,
        purpose: row.purpose,
        allowedTypes: row.allowed_types,
        transformedTypes: row.transformed_types,
        denyReason: row.deny_reason,
        requiresRelationship: row.requires_relationship,
      }));
    },

    getDeviceWithUser: async (deviceId) => {
      const rows = await sql`
        select d.id, d.user_id, d.label, d.secret_hex,
               u.full_name, u.role, u.department
        from devices d
        join users u on u.id = d.user_id
        where d.id = ${deviceId}
      `;
      const row = rows[0];
      if (!row) return null;
      const device: Device = {
        id: row.id,
        userId: row.user_id,
        label: row.label,
        secretHex: row.secret_hex,
      };
      const user: User = {
        id: row.user_id,
        fullName: row.full_name,
        role: row.role,
        department: row.department,
      };
      return { device, user };
    },

    getUser: async (userId) => {
      const rows = await sql`
        select id, full_name, role, department from users where id = ${userId}
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        fullName: row.full_name,
        role: row.role,
        department: row.department,
      };
    },

    listDevices: async () => {
      const rows = await sql`
        select id, user_id, label, secret_hex from devices order by id
      `;
      return rows.map((row): Device => ({
        id: row.id,
        userId: row.user_id,
        label: row.label,
        secretHex: row.secret_hex,
      }));
    },

    listPatients: async () => {
      const rows = await sql`
        select p.id, p.pseudonym, f.ciphertext, f.iv, f.auth_tag
        from patients p
        left join record_fragments f
          on f.patient_id = p.id and f.fragment_type = 'name'
        order by p.id
      `;
      // The display name is itself an encrypted fragment, so patient lookup
      // decrypts exactly one field and logs nothing clinical.
      const { decryptFragment } = await import("@/server/iris/crypto");
      return rows.map((row) => {
        let displayName = row.pseudonym as string;
        if (row.ciphertext) {
          const cipher: FragmentCipher = {
            id: `lookup-${row.id}`,
            patientId: row.id,
            fragmentType: "name",
            ciphertext: Buffer.from(row.ciphertext),
            iv: Buffer.from(row.iv),
            authTag: Buffer.from(row.auth_tag),
          };
          displayName = decryptFragment(cipher, new Set([cipher.id]));
        }
        return { id: row.id, pseudonym: row.pseudonym, displayName };
      });
    },

    getPatient: async (patientId) => {
      const rows = await sql`
        select id, pseudonym, date_of_birth from patients where id = ${patientId}
      `;
      const row = rows[0];
      if (!row) return null;
      const patient: Patient = {
        id: row.id,
        pseudonym: row.pseudonym,
        dateOfBirth: isoString(row.date_of_birth).slice(0, 10),
      };
      return patient;
    },

    getPatientDisplayName: async (patientId) => {
      const rows = await sql`
        select pseudonym from patients where id = ${patientId}
      `;
      return (rows[0]?.pseudonym as string | undefined) ?? patientId;
    },

    listEncounters: async (patientId) => {
      const rows = await sql`
        select id, patient_id, department, reason, started_at
        from encounters
        where patient_id = ${patientId}
        order by started_at desc
      `;
      return rows.map((row): Encounter => ({
        id: row.id,
        patientId: row.patient_id,
        department: row.department,
        reason: row.reason,
        startedAt: isoString(row.started_at),
      }));
    },

    hasRelationship: async (actorId, patientId) => {
      const rows = await sql`
        select 1 from patient_relationships
        where actor_id = ${actorId} and patient_id = ${patientId}
      `;
      return rows.length > 0;
    },

    listFragmentMeta: async (patientId) => {
      // Ciphertext is deliberately excluded from this query.
      const rows = await sql`
        select id, patient_id, encounter_id, fragment_type, label,
               sensitivity, purpose_classes, updated_at
        from record_fragments
        where patient_id = ${patientId}
        order by created_at
      `;
      return rows.map((row): FragmentMeta => ({
        id: row.id,
        patientId: row.patient_id,
        encounterId: row.encounter_id,
        fragmentType: row.fragment_type,
        label: row.label,
        sensitivity: row.sensitivity,
        purposeClasses: row.purpose_classes,
        updatedAt: isoString(row.updated_at),
      }));
    },

    loadCiphertexts: async (fragmentIds) => {
      if (fragmentIds.length === 0) return [];
      const rows = await sql`
        select id, patient_id, fragment_type, ciphertext, iv, auth_tag
        from record_fragments
        where id in ${sql(fragmentIds as string[])}
      `;
      return rows.map((row): FragmentCipher => ({
        id: row.id,
        patientId: row.patient_id,
        fragmentType: row.fragment_type,
        ciphertext: Buffer.from(row.ciphertext),
        iv: Buffer.from(row.iv),
        authTag: Buffer.from(row.auth_tag),
      }));
    },

    upsertFragment: async (input) => {
      const encrypted = encryptFragmentValue(
        input.patientId,
        input.fragmentType,
        input.value,
      );
      const existing = await sql`
        select id from record_fragments
        where patient_id = ${input.patientId}
          and fragment_type = ${input.fragmentType}
          and encounter_id is not distinct from ${input.encounterId}
      `;
      const id = (existing[0]?.id as string | undefined) ?? randomId("frg");
      const rows = await sql`
        insert into record_fragments (
          id, patient_id, encounter_id, fragment_type, label, sensitivity,
          purpose_classes, ciphertext, iv, auth_tag, updated_at
        ) values (
          ${id}, ${input.patientId}, ${input.encounterId}, ${input.fragmentType},
          ${input.label}, ${input.sensitivity}, ${input.purposeClasses},
          ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.authTag}, now()
        )
        on conflict (id) do update set
          label = excluded.label,
          sensitivity = excluded.sensitivity,
          purpose_classes = excluded.purpose_classes,
          ciphertext = excluded.ciphertext,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          updated_at = now()
        returning id, patient_id, encounter_id, fragment_type, label,
                  sensitivity, purpose_classes, updated_at
      `;
      const row = rows[0]!;
      return {
        id: row.id,
        patientId: row.patient_id,
        encounterId: row.encounter_id,
        fragmentType: row.fragment_type,
        label: row.label,
        sensitivity: row.sensitivity,
        purposeClasses: row.purpose_classes,
        updatedAt: isoString(row.updated_at),
      };
    },

    createSession: async ({ actorId, deviceId, purpose }) => {
      const id = randomId("ses");
      const rows = await sql`
        insert into sessions (id, actor_id, device_id, purpose)
        values (${id}, ${actorId}, ${deviceId}, ${purpose})
        returning *
      `;
      return mapSession(rows[0]!);
    },

    getSession: async (sessionId) => {
      const rows = await sql`select * from sessions where id = ${sessionId}`;
      const row = rows[0];
      return row ? mapSession(row) : null;
    },

    updateSession: async (sessionId, patch) => {
      const rows = await sql`
        update sessions set
          purpose = ${patch.purpose ?? sql`purpose`},
          task = ${patch.task ?? sql`task`},
          break_glass_until = ${
            patch.breakGlassUntil === undefined
              ? sql`break_glass_until`
              : patch.breakGlassUntil
          },
          break_glass_reason = ${
            patch.breakGlassReason === undefined
              ? sql`break_glass_reason`
              : patch.breakGlassReason
          },
          last_presence_at = ${patch.lastPresenceAt ?? sql`last_presence_at`},
          ended_at = ${patch.endedAt === undefined ? sql`ended_at` : patch.endedAt},
          end_reason = ${patch.endReason === undefined ? sql`end_reason` : patch.endReason}
        where id = ${sessionId}
        returning *
      `;
      const row = rows[0];
      return row ? mapSession(row) : null;
    },

    createDelegation: async (input) => {
      const id = randomId("dlg");
      const rows = await sql`
        insert into delegations (
          id, created_by, recipient_role, patient_id, encounter_id, purpose,
          scope, reason, expires_at
        ) values (
          ${id}, ${input.createdBy}, ${input.recipientRole}, ${input.patientId},
          ${input.encounterId}, ${input.purpose}, ${input.scope}, ${input.reason},
          ${input.expiresAt}
        )
        returning *
      `;
      return mapDelegation(rows[0]!);
    },

    listDelegationsForRole: async (recipientRole: Role) => {
      const rows = await sql`
        select * from delegations
        where recipient_role = ${recipientRole}
        order by created_at desc
      `;
      return rows.map(mapDelegation);
    },

    createGeneratedAction: async (input) => {
      const id = randomId("act");
      const rows = await sql`
        insert into generated_actions (
          id, action_type, actor_id, patient_id, encounter_id, title, body,
          included, excluded
        ) values (
          ${id}, ${input.actionType}, ${input.actorId}, ${input.patientId},
          ${input.encounterId}, ${input.title}, ${sql.json(asJson(input.body))},
          ${input.included}, ${input.excluded}
        )
        returning *
      `;
      return mapAction(rows[0]!);
    },

    listGeneratedActions: async (limit = 20) => {
      const rows = await sql`
        select * from generated_actions order by created_at desc limit ${limit}
      `;
      return rows.map(mapAction);
    },

    appendEvents: async (inputs) => {
      if (inputs.length === 0) return [];
      const lastRows = await sql`
        select event_hash from access_events order by time desc limit 1
      `;
      const chained = chainEvents(
        (lastRows[0]?.event_hash as string | undefined) ?? null,
        inputs,
      );
      await sql`
        insert into access_events ${sql(
          chained.map((event) => ({
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
      return chained;
    },

    listEvents: async (filter) => {
      const limit = filter?.limit ?? 50;
      const rows = await sql`
        select * from access_events
        where (${filter?.patientId ?? null}::text is null or patient_id = ${filter?.patientId ?? null})
          and (${filter?.actorId ?? null}::text is null or actor_id = ${filter?.actorId ?? null})
        order by time desc
        limit ${limit}
      `;
      return rows.map(mapEvent);
    },

    dashboard: async () => dashboardFromSql(sql),
  };
}

async function dashboardFromSql(sql: Sql): Promise<DashboardStats> {
  const [totals, purposes, breakGlassRows, recentRows, anomalyRows, totalRows] =
    await Promise.all([
      sql`
        select
          count(*)::int as total,
          count(*) filter (where decision = 'allow')::int as allowed,
          count(*) filter (where decision = 'restrict')::int as restricted,
          count(*) filter (where decision = 'deny')::int as denied,
          count(*) filter (where break_glass)::int as break_glass
        from access_events
        where time >= date_trunc('day', now())
      `,
      // Reads the continuous aggregate rather than the raw hypertable.
      sql`
        select purpose, sum(event_count)::int as count
        from access_events_5min
        where bucket >= date_trunc('day', now())
        group by purpose
        order by count desc
      `,
      // Only the grants themselves, not the restriction events beside them.
      sql`
        select * from access_events
        where break_glass and decision = 'allow'
          and time >= date_trunc('day', now())
        order by time desc
        limit 12
      `,
      sql`select * from access_events order by time desc limit 25`,
      sql`
        select actor_id,
               count(*)::int as overrides,
               array_remove(array_agg(distinct metadata->>'department'), null) as departments
        from access_events
        where break_glass and time >= date_trunc('day', now())
        group by actor_id
        having count(*) >= 3
      `,
      sql`select count(*)::int as total from access_events`,
    ]);

  const todayTotal = (totals[0]?.total as number | undefined) ?? 0;
  const purposeRows = purposes as unknown as Array<{
    purpose: string | null;
    count: number;
  }>;

  const users = await sql`select id, full_name from users`;
  const nameById = new Map(
    users.map((row) => [row.id as string, row.full_name as string]),
  );

  const recent = recentRows.map(mapEvent);

  return {
    source: "tiger",
    totalEvents: (totalRows[0]?.total as number | undefined) ?? 0,
    today: {
      total: todayTotal,
      allowed: (totals[0]?.allowed as number | undefined) ?? 0,
      restricted: (totals[0]?.restricted as number | undefined) ?? 0,
      denied: (totals[0]?.denied as number | undefined) ?? 0,
      breakGlass: (totals[0]?.break_glass as number | undefined) ?? 0,
    },
    byPurpose: purposeRows.map((row) => ({
      purpose: row.purpose ?? "other",
      count: row.count,
      share: todayTotal === 0 ? 0 : row.count / todayTotal,
    })),
    breakGlass: breakGlassRows.map(mapEvent),
    recent,
    anomalies: anomalyRows.map((row) => ({
      actorId: row.actor_id,
      actorName: nameById.get(row.actor_id) ?? row.actor_id,
      overrides: row.overrides,
      departments: row.departments ?? [],
    })),
    // The most recent events are returned newest-first; verify in write order.
    chainVerified: verifyChain([...recent].reverse()),
  };
}

function mapSession(row: postgres.Row): Session {
  return {
    id: row.id,
    actorId: row.actor_id,
    deviceId: row.device_id,
    purpose: row.purpose,
    task: row.task,
    breakGlassUntil: isoOrNull(row.break_glass_until),
    breakGlassReason: row.break_glass_reason,
    createdAt: isoString(row.created_at),
    lastPresenceAt: isoString(row.last_presence_at),
    endedAt: isoOrNull(row.ended_at),
    endReason: row.end_reason,
  };
}

function mapDelegation(row: postgres.Row): Delegation {
  return {
    id: row.id,
    createdBy: row.created_by,
    recipientRole: row.recipient_role,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    purpose: row.purpose as Purpose,
    scope: row.scope,
    reason: row.reason,
    createdAt: isoString(row.created_at),
    expiresAt: isoString(row.expires_at),
    revokedAt: isoOrNull(row.revoked_at),
  };
}

function mapAction(row: postgres.Row): GeneratedAction {
  return {
    id: row.id,
    actionType: row.action_type,
    actorId: row.actor_id,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    title: row.title,
    body: row.body,
    included: row.included,
    excluded: row.excluded,
    createdAt: isoString(row.created_at),
  };
}

function mapEvent(row: postgres.Row): AccessEvent {
  return {
    time: isoString(row.time),
    eventId: row.event_id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    deviceId: row.device_id,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    sessionId: row.session_id,
    purpose: row.purpose,
    task: row.task,
    resourceType: row.resource_type,
    decision: row.decision,
    reason: row.reason,
    breakGlass: row.break_glass,
    latencyMs: row.latency_ms,
    metadata: row.metadata ?? {},
    previousEventHash: row.previous_event_hash,
    eventHash: row.event_hash,
  };
}
