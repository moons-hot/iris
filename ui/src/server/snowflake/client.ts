import snowflake from "snowflake-sdk";
import type { Connection, SnowflakeError } from "snowflake-sdk";

const DEFAULT_WAREHOUSE = "IRIS_WH";
const DEFAULT_DATABASE = "IRIS";
const DEFAULT_SCHEMA = "SYNTHEA";
const DEFAULT_SEARCH_SERVICE = "IRIS_CONTEXT_SEARCH";
const SEARCH_LIMIT = 100;

export interface CortexSearchHit {
  encounterId: string;
  raw: Record<string, unknown>;
}

export interface ConceptCountRow {
  concept: string;
  count: number;
}

export interface PopulationAggregates {
  observations: ConceptCountRow[];
  medications: ConceptCountRow[];
  procedures: ConceptCountRow[];
  conditions: ConceptCountRow[];
}

interface RestAuth {
  authorization: string;
  tokenType: string | null;
  expiresAt: number;
}

let connection: Connection | null = null;
let connecting: Promise<Connection> | null = null;
let restAuth: RestAuth | null = null;
let encounterColumn: "ENCOUNTER" | "ENCOUNTER_ID" | null = null;

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function sqlIdent(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid Snowflake ${label}.`);
  }
  return value.toUpperCase();
}

export function snowflakeConfigured(): boolean {
  const account = env("SNOWFLAKE_ACCOUNT");
  const username = env("SNOWFLAKE_USERNAME");
  const secret = env("SNOWFLAKE_PASSWORD") || env("SNOWFLAKE_PAT");
  return Boolean(account && username && secret);
}

function warehouse(): string {
  return sqlIdent(env("SNOWFLAKE_WAREHOUSE", DEFAULT_WAREHOUSE), "warehouse");
}

function database(): string {
  return sqlIdent(env("SNOWFLAKE_DATABASE", DEFAULT_DATABASE), "database");
}

function schemaName(): string {
  return sqlIdent(env("SNOWFLAKE_SCHEMA", DEFAULT_SCHEMA), "schema");
}

function searchService(): string {
  return sqlIdent(
    env("SNOWFLAKE_CORTEX_SEARCH_SERVICE", DEFAULT_SEARCH_SERVICE),
    "search service",
  );
}

function accountUrl(): string {
  const explicit = env("SNOWFLAKE_ACCOUNT_URL").replace(/\/$/, "");
  if (explicit) return explicit;
  const account = env("SNOWFLAKE_ACCOUNT");
  return `https://${account}.snowflakecomputing.com`;
}

function qualified(table: string): string {
  return `${database()}.${schemaName()}.${sqlIdent(table, "table")}`;
}

function qualifiedSearchService(): string {
  return `${database()}.${schemaName()}.${searchService()}`;
}

async function getConnection(): Promise<Connection> {
  if (connection?.isUp()) return connection;
  if (connecting) return connecting;

  connecting = new Promise<Connection>((resolve, reject) => {
    const next = snowflake.createConnection({
      account: env("SNOWFLAKE_ACCOUNT"),
      username: env("SNOWFLAKE_USERNAME"),
      password: env("SNOWFLAKE_PASSWORD") || undefined,
      authenticator: env("SNOWFLAKE_PAT")
        ? "PROGRAMMATIC_ACCESS_TOKEN"
        : undefined,
      token: env("SNOWFLAKE_PAT") || undefined,
      warehouse: warehouse(),
      database: database(),
      schema: schemaName(),
      role: env("SNOWFLAKE_ROLE") || undefined,
      clientSessionKeepAlive: true,
      application: "IRIS",
    });

    next.connect((error: SnowflakeError | undefined, conn: Connection) => {
      connecting = null;
      if (error) {
        connection = null;
        reject(error);
        return;
      }
      connection = conn;
      resolve(conn);
    });
  });

  return connecting;
}

export async function executeSnowflakeQuery<T extends Record<string, unknown>>(
  sqlText: string,
  binds: Array<string | number> = [],
): Promise<T[]> {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (error, _statement, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve((rows ?? []) as T[]);
      },
    });
  });
}

function rowString(row: Record<string, unknown>, key: string): string | null {
  const match = Object.keys(row).find(
    (entry) => entry.toLowerCase() === key.toLowerCase(),
  );
  if (!match) return null;
  const value = row[match];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function rowNumber(row: Record<string, unknown>, key: string): number {
  const match = Object.keys(row).find(
    (entry) => entry.toLowerCase() === key.toLowerCase(),
  );
  const value = match ? row[match] : undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function encounterIdFromHit(row: Record<string, unknown>): string | null {
  return rowString(row, "encounter_id") ?? rowString(row, "encounter");
}

async function restAuthHeaders(): Promise<Record<string, string>> {
  const pat = env("SNOWFLAKE_PAT");
  if (pat) {
    return {
      authorization: `Bearer ${pat}`,
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
      "content-type": "application/json",
      accept: "application/json",
    };
  }

  if (restAuth && restAuth.expiresAt > Date.now() + 60_000) {
    return {
      authorization: restAuth.authorization,
      ...(restAuth.tokenType
        ? { "X-Snowflake-Authorization-Token-Type": restAuth.tokenType }
        : {}),
      "content-type": "application/json",
      accept: "application/json",
    };
  }

  const url = new URL(`${accountUrl()}/session/v1/login-request`);
  url.searchParams.set("warehouse", warehouse());
  url.searchParams.set("databaseName", database());
  url.searchParams.set("schemaName", schemaName());
  const role = env("SNOWFLAKE_ROLE");
  if (role) url.searchParams.set("roleName", role);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      data: {
        CLIENT_APP_ID: "IRIS",
        CLIENT_APP_VERSION: "0.1.0",
        ACCOUNT_NAME: env("SNOWFLAKE_ACCOUNT"),
        LOGIN_NAME: env("SNOWFLAKE_USERNAME"),
        PASSWORD: env("SNOWFLAKE_PASSWORD"),
      },
    }),
  });

  const payload = (await response.json()) as {
    success?: boolean;
    message?: string;
    data?: { token?: string; validityInSeconds?: number };
  };

  if (!response.ok || !payload.success || !payload.data?.token) {
    throw new Error(
      payload.message ?? `Snowflake login failed (${response.status}).`,
    );
  }

  const ttlMs = (payload.data.validityInSeconds ?? 3600) * 1000;
  restAuth = {
    authorization: `Snowflake Token="${payload.data.token}"`,
    tokenType: null,
    expiresAt: Date.now() + ttlMs,
  };

  return {
    authorization: restAuth.authorization,
    "content-type": "application/json",
    accept: "application/json",
  };
}

async function queryCortexSearchRest(
  query: string,
): Promise<CortexSearchHit[]> {
  const encodedDb = encodeURIComponent(database());
  const encodedSchema = encodeURIComponent(schemaName());
  const encodedService = encodeURIComponent(searchService());
  const url = `${accountUrl()}/api/v2/databases/${encodedDb}/schemas/${encodedSchema}/cortex-search-services/${encodedService}:query`;

  const response = await fetch(url, {
    method: "POST",
    headers: await restAuthHeaders(),
    body: JSON.stringify({
      query,
      columns: ["encounter_id", "ENCOUNTER_ID", "encounter"],
      limit: SEARCH_LIMIT,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Cortex Search REST failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    results?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
  };
  const rows = payload.results ?? payload.data ?? [];
  const hits: CortexSearchHit[] = [];
  for (const row of rows) {
    const encounterId = encounterIdFromHit(row);
    if (encounterId) hits.push({ encounterId, raw: row });
  }
  return hits;
}

async function queryCortexSearchPreview(
  query: string,
): Promise<CortexSearchHit[]> {
  const request = JSON.stringify({
    query,
    columns: ["encounter_id"],
    limit: SEARCH_LIMIT,
  });
  const rows = await executeSnowflakeQuery<{ RESULT?: unknown }>(
    `SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(?, PARSE_JSON(?)) AS RESULT`,
    [qualifiedSearchService(), request],
  );
  const hits: CortexSearchHit[] = [];
  for (const row of rows) {
    const result = row.RESULT;
    const parsed =
      typeof result === "string"
        ? (JSON.parse(result) as { results?: Array<Record<string, unknown>> })
        : (result as { results?: Array<Record<string, unknown>> } | null);
    for (const entry of parsed?.results ?? []) {
      const encounterId = encounterIdFromHit(entry);
      if (encounterId) hits.push({ encounterId, raw: entry });
    }
  }
  return hits;
}

export async function searchCortexEncounters(
  clinicalSituation: string,
): Promise<{ encounterIds: string[]; source: "rest" | "preview" }> {
  try {
    const hits = await queryCortexSearchRest(clinicalSituation);
    return {
      encounterIds: uniqueIds(hits.map((hit) => hit.encounterId)).slice(
        0,
        SEARCH_LIMIT,
      ),
      source: "rest",
    };
  } catch (error) {
    console.warn("Cortex Search REST failed, trying SEARCH_PREVIEW", error);
    const hits = await queryCortexSearchPreview(clinicalSituation);
    return {
      encounterIds: uniqueIds(hits.map((hit) => hit.encounterId)).slice(
        0,
        SEARCH_LIMIT,
      ),
      source: "preview",
    };
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function asConceptRows(
  rows: Array<Record<string, unknown>>,
): ConceptCountRow[] {
  return rows
    .map((row) => ({
      concept: rowString(row, "concept") ?? "",
      count: rowNumber(row, "cnt"),
    }))
    .filter((row) => row.concept.length > 0 && row.count > 0);
}

async function aggregateTable(
  table: string,
  encounterIds: string[],
  column: "ENCOUNTER" | "ENCOUNTER_ID",
): Promise<ConceptCountRow[]> {
  if (encounterIds.length === 0) return [];
  const placeholders = encounterIds.map(() => "?").join(", ");
  const rows = await executeSnowflakeQuery(
    `SELECT DESCRIPTION AS CONCEPT, COUNT(DISTINCT ${column}) AS CNT
     FROM ${qualified(table)}
     WHERE ${column} IN (${placeholders})
     GROUP BY DESCRIPTION
     ORDER BY CNT DESC
     LIMIT 20`,
    encounterIds,
  );
  return asConceptRows(rows);
}

async function resolveEncounterColumn(
  sampleId: string,
): Promise<"ENCOUNTER" | "ENCOUNTER_ID"> {
  if (encounterColumn) return encounterColumn;
  try {
    await executeSnowflakeQuery(
      `SELECT 1 AS OK FROM ${qualified("OBSERVATIONS")} WHERE ENCOUNTER = ? LIMIT 1`,
      [sampleId],
    );
    encounterColumn = "ENCOUNTER";
  } catch {
    encounterColumn = "ENCOUNTER_ID";
  }
  return encounterColumn;
}

export async function aggregatePopulationConcepts(
  encounterIds: string[],
): Promise<PopulationAggregates> {
  if (encounterIds.length === 0) {
    return {
      observations: [],
      medications: [],
      procedures: [],
      conditions: [],
    };
  }

  const column = await resolveEncounterColumn(encounterIds[0]!);
  const [observations, medications, procedures, conditions] = await Promise.all(
    [
      aggregateTable("OBSERVATIONS", encounterIds, column),
      aggregateTable("MEDICATIONS", encounterIds, column),
      aggregateTable("PROCEDURES", encounterIds, column),
      aggregateTable("CONDITIONS", encounterIds, column),
    ],
  );

  return { observations, medications, procedures, conditions };
}
