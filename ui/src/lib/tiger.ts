import pg from "pg";
import type { PoolConfig } from "pg";

import {
  SPACE_DOWNLINK_MS,
  applySpaceDownlinkDelay,
  fromLoggedReceived,
} from "./format";

export { SPACE_DOWNLINK_MS, applySpaceDownlinkDelay, fromLoggedReceived };

export type CommsChannel = "typed" | "voice" | "speak";
export type CommsDirection = "uplink" | "downlink";

export type CommsLogInput = {
  sentAt: Date;
  receivedAt?: Date;
  channel: CommsChannel;
  direction?: CommsDirection;
  crewId?: string;
  vesselId?: string;
  summary: string;
};

export type CommsLogMeta = {
  sentAt: string;
  receivedAt: string;
  latencyMs: number;
  stored: boolean;
};

export type CommsLogRow = CommsLogMeta & {
  id: string;
  actualReceivedAt: string;
  actualLatencyMs: number;
  propagationMs: number;
  channel: CommsChannel;
  direction: CommsDirection;
  crewId: string;
  vesselId: string;
  summary: string;
};

type GlobalPg = typeof globalThis & { irisTigerPool?: pg.Pool };

const globalPg = globalThis as GlobalPg;
let schemaReady = false;

export function parseSentAt(value: unknown, fallback = new Date()): Date {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export function latencyMs(sentAt: Date, receivedAt: Date): number {
  return Math.max(0, receivedAt.getTime() - sentAt.getTime());
}

export function isTigerConfigured(): boolean {
  return Boolean(process.env.TIGER_DATABASE_URL);
}

function connectionConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return {
    connectionString: url.toString(),
    max: 5,
    ssl: { rejectUnauthorized: false },
  };
}

function getPool(): pg.Pool | null {
  const connectionString = process.env.TIGER_DATABASE_URL;
  if (!connectionString) return null;
  if (!globalPg.irisTigerPool) {
    globalPg.irisTigerPool = new pg.Pool(connectionConfig(connectionString));
  }
  return globalPg.irisTigerPool;
}

async function ensureSchema(pool: pg.Pool) {
  if (schemaReady) return;
  await pool.query(
    `ALTER TABLE comms_logs ADD COLUMN IF NOT EXISTS vessel_id TEXT`,
  );
  schemaReady = true;
}

export async function recordCommsLog(
  input: CommsLogInput,
): Promise<CommsLogMeta> {
  const actualReceivedAt = input.receivedAt ?? new Date();
  const loggedReceivedAt = applySpaceDownlinkDelay(actualReceivedAt);
  const meta: CommsLogMeta = {
    sentAt: input.sentAt.toISOString(),
    receivedAt: actualReceivedAt.toISOString(),
    latencyMs: latencyMs(input.sentAt, actualReceivedAt),
    stored: false,
  };

  const pool = getPool();
  if (!pool) return meta;

  const vesselId = input.vesselId ?? "asteria";
  const direction = input.direction ?? "uplink";
  const crewId = input.crewId ?? "A01";
  const summary = input.summary.slice(0, 500);

  try {
    await ensureSchema(pool);
    await pool.query(
      `INSERT INTO comms_logs
        (sent_at, received_at, channel, direction, crew_id, summary, vessel_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        meta.sentAt,
        loggedReceivedAt.toISOString(),
        input.channel,
        direction,
        crewId,
        summary,
        vesselId,
      ],
    );
    return { ...meta, stored: true };
  } catch (error) {
    console.error("Tiger Data log insert failed", error);
    try {
      await pool.query(
        `INSERT INTO comms_logs
          (sent_at, received_at, channel, direction, crew_id, summary)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          meta.sentAt,
          loggedReceivedAt.toISOString(),
          input.channel,
          direction,
          crewId,
          summary,
        ],
      );
      return { ...meta, stored: true };
    } catch (fallbackError) {
      console.error("Tiger Data log insert fallback failed", fallbackError);
      return meta;
    }
  }
}

export async function listCommsLogs(
  options: { limit?: number; vesselId?: string } = {},
): Promise<CommsLogRow[]> {
  const pool = getPool();
  if (!pool) return [];

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const vesselId = options.vesselId?.trim();

  try {
    await ensureSchema(pool);
  } catch (error) {
    console.error("Tiger Data schema ensure failed", error);
  }

  try {
    const result = await pool.query<{
      id: string;
      sent_at: Date;
      received_at: Date;
      channel: CommsChannel;
      direction: CommsDirection;
      crew_id: string;
      vessel_id: string | null;
      summary: string;
      latency_ms: number;
    }>(
      `SELECT
         id::text,
         sent_at,
         received_at,
         channel,
         direction,
         crew_id,
         COALESCE(vessel_id, 'asteria') AS vessel_id,
         summary,
         (EXTRACT(EPOCH FROM (received_at - sent_at)) * 1000)::INTEGER AS latency_ms
       FROM comms_logs
       WHERE ($2::text IS NULL OR COALESCE(vessel_id, 'asteria') = $2)
       ORDER BY received_at DESC
       LIMIT $1`,
      [limit, vesselId ?? null],
    );
    return result.rows.map(mapCommsRow);
  } catch (error) {
    console.error("Tiger Data log read with vessel_id failed", error);
    const result = await pool.query<{
      id: string;
      sent_at: Date;
      received_at: Date;
      channel: CommsChannel;
      direction: CommsDirection;
      crew_id: string;
      summary: string;
      latency_ms: number;
    }>(
      `SELECT
         id::text,
         sent_at,
         received_at,
         channel,
         direction,
         crew_id,
         summary,
         (EXTRACT(EPOCH FROM (received_at - sent_at)) * 1000)::INTEGER AS latency_ms
       FROM comms_logs
       ORDER BY received_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) =>
      mapCommsRow({ ...row, vessel_id: "asteria" }),
    );
  }
}

function mapCommsRow(row: {
  id: string;
  sent_at: Date;
  received_at: Date;
  channel: CommsChannel;
  direction: CommsDirection;
  crew_id: string;
  vessel_id: string | null;
  summary: string;
  latency_ms: number;
}): CommsLogRow {
  const sentAt = new Date(row.sent_at);
  const receivedAt = new Date(row.received_at);
  const split = fromLoggedReceived(receivedAt, sentAt);
  return {
    id: row.id,
    sentAt: sentAt.toISOString(),
    receivedAt: receivedAt.toISOString(),
    actualReceivedAt: split.actualReceivedAt.toISOString(),
    latencyMs: split.loggedLatencyMs,
    actualLatencyMs: split.actualLatencyMs,
    propagationMs: SPACE_DOWNLINK_MS,
    stored: true,
    channel: row.channel,
    direction: row.direction,
    crewId: row.crew_id,
    vesselId: row.vessel_id ?? "asteria",
    summary: row.summary,
  };
}
