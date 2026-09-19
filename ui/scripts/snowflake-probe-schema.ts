import snowflake from "snowflake-sdk";
import type { Connection, SnowflakeError } from "snowflake-sdk";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function connect(): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection({
      account: env("SNOWFLAKE_ACCOUNT"),
      username: env("SNOWFLAKE_USERNAME"),
      authenticator: "PROGRAMMATIC_ACCESS_TOKEN",
      token: env("SNOWFLAKE_PAT"),
      role: env("SNOWFLAKE_ROLE") || undefined,
      warehouse: env("SNOWFLAKE_WAREHOUSE") || "IRIS_WH",
      database: env("SNOWFLAKE_DATABASE") || "IRIS",
      schema: env("SNOWFLAKE_SCHEMA") || "SYNTHEA",
      application: "IRIS_SCHEMA_PROBE",
    });
    conn.connect((error: SnowflakeError | undefined, connected) => {
      if (error) reject(error);
      else resolve(connected);
    });
  });
}

function execute(conn: Connection, sqlText: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      complete: (error, _statement, rows) => {
        if (error) reject(error);
        else resolve((rows ?? []) as unknown[]);
      },
    });
  });
}

async function main() {
  const conn = await connect();
  const tables = ["OBSERVATIONS", "MEDICATIONS", "PROCEDURES", "CONDITIONS", "CLINICAL_CONTEXTS"];
  for (const table of tables) {
    try {
      const cols = await execute(
        conn,
        `SHOW COLUMNS IN TABLE IRIS.SYNTHEA.${table}`,
      );
      const names = cols.map((row) => {
        const r = row as Record<string, unknown>;
        return String(r.column_name ?? r.COLUMN_NAME ?? r["column_name"] ?? JSON.stringify(r));
      });
      console.log(`\n=== ${table} ===`);
      console.log(names.join(", "));
      const sample = await execute(
        conn,
        `SELECT * FROM IRIS.SYNTHEA.${table} LIMIT 1`,
      );
      console.log("sample keys:", sample[0] ? Object.keys(sample[0] as object) : "(empty)");
    } catch (error) {
      console.log(`\n=== ${table} === FAIL`, error instanceof Error ? error.message : error);
    }
  }
  conn.destroy(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
