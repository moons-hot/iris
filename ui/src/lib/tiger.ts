import { createRequire } from "node:module";

export type CommsChannel = "typed" | "voice" | "speak";
export type CommsDirection = "uplink" | "downlink";

export type CommsLogInput = {
  sentAt: Date;
  receivedAt?: Date;
  channel: CommsChannel;
  direction?: CommsDirection;
  crewId?: string;
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
  channel: CommsChannel;
  direction: CommsDirection;
  crewId: string;
  summary: string;
};

type PoolQueryResult<T> = { rows: T[] };
type PoolLike = {
  query: <T>(sql: string, params?: unknown[]) => Promise<PoolQueryResult<T>>;
};
type PgModule = {
  Pool: new (config: {
    connectionString: string;
    max?: number;
    ssl?: { rejectUnauthorized: boolean };
  }) => PoolLike;
  default?: PgModule;
};

type GlobalPg = typeof globalThis & { irisTigerPool?: PoolLike };

const globalPg = globalThis as GlobalPg;

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

function loadPg(): PgModule | null {
  try {
    const require = createRequire(import.meta.url);
    const loaded = require("pg") as PgModule;
    return loaded.Pool ? loaded : (loaded.default ?? null);
  } catch {
    return null;
  }
}

function connectionConfig(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return {
    connectionString: url.toString(),
    max: 5,
    ssl: { rejectUnauthorized: false },
  };
}

function getPool(): PoolLike | null {
  const connectionString = process.env.TIGER_DATABASE_URL;
  if (!connectionString) return null;
  if (!globalPg.irisTigerPool) {
    const pg = loadPg();
    if (!pg?.Pool) {
      console.error("Tiger Data is configured, but the pg package is not installed");
      return null;
    }
    globalPg.irisTigerPool = new pg.Pool(connectionConfig(connectionString));
  }
  return globalPg.irisTigerPool;
}

export async function recordCommsLog(
  input: CommsLogInput,
): Promise<CommsLogMeta> {
  const receivedAt = input.receivedAt ?? new Date();
  const meta: CommsLogMeta = {
    sentAt: input.sentAt.toISOString(),
    receivedAt: receivedAt.toISOString(),
    latencyMs: latencyMs(input.sentAt, receivedAt),
    stored: false,
  };

  const pool = getPool();
  if (!pool) return meta;

  try {
    await pool.query(
      `INSERT INTO comms_logs
        (sent_at, received_at, channel, direction, crew_id, summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        meta.sentAt,
        meta.receivedAt,
        input.channel,
        input.direction ?? "uplink",
        input.crewId ?? "A01",
        input.summary.slice(0, 500),
      ],
    );
    return { ...meta, stored: true };
  } catch (error) {
    console.error("Tiger Data log insert failed", error);
    return meta;
  }
}

export async function listCommsLogs(limit = 25): Promise<CommsLogRow[]> {
  const pool = getPool();
  if (!pool) return [];

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

  return result.rows.map((row) => ({
    id: row.id,
    sentAt: new Date(row.sent_at).toISOString(),
    receivedAt: new Date(row.received_at).toISOString(),
    latencyMs: Math.max(0, row.latency_ms),
    stored: true,
    channel: row.channel,
    direction: row.direction,
    crewId: row.crew_id,
    summary: row.summary,
  }));
}
