/**
 * One-shot hackathon setup: attach a permissive network policy so PATs work.
 * Must authenticate with a password (PAT sessions cannot alter PATs / users).
 *
 * Usage:
 *   SNOWFLAKE_PASSWORD='...' pnpm exec tsx --env-file=.env scripts/snowflake-enable-pat.ts
 */
import snowflake from "snowflake-sdk";
import type { Connection, SnowflakeError } from "snowflake-sdk";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function connectWithPassword(): Promise<Connection> {
  const account = env("SNOWFLAKE_ACCOUNT");
  const username = env("SNOWFLAKE_USERNAME");
  const password = env("SNOWFLAKE_PASSWORD");
  if (!account || !username || !password) {
    throw new Error(
      "Need SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, and SNOWFLAKE_PASSWORD (password login only).",
    );
  }

  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection({
      account,
      username,
      password,
      role: env("SNOWFLAKE_ROLE") || "ACCOUNTADMIN",
      warehouse: env("SNOWFLAKE_WAREHOUSE") || "IRIS_WH",
      database: env("SNOWFLAKE_DATABASE") || "IRIS",
      schema: env("SNOWFLAKE_SCHEMA") || "SYNTHEA",
      application: "IRIS_PAT_SETUP",
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

async function main(): Promise<void> {
  const username = env("SNOWFLAKE_USERNAME");
  const conn = await connectWithPassword();
  console.log("Connected with password as", username);

  // Permissive policy for local/demo egress. Prefer tightening later.
  await execute(
    conn,
    `CREATE NETWORK RULE IF NOT EXISTS IRIS_DEV_ALLOW_ALL
      MODE = INGRESS
      TYPE = IPV4
      VALUE_LIST = ('0.0.0.0/0')`,
  );
  console.log("Network rule ready");

  await execute(
    conn,
    `CREATE NETWORK POLICY IF NOT EXISTS IRIS_DEV_POLICY
      ALLOWED_NETWORK_RULE_LIST = ('IRIS_DEV_ALLOW_ALL')`,
  );
  console.log("Network policy ready");

  await execute(
    conn,
    `ALTER USER ${username} SET NETWORK_POLICY = IRIS_DEV_POLICY`,
  );
  console.log(`Attached IRIS_DEV_POLICY to ${username}`);

  // Also set a 24h bypass on every active PAT (extra safety for person users).
  const tokens = (await execute(
    conn,
    `SHOW USER PROGRAMMATIC ACCESS TOKENS FOR USER ${username}`,
  )) as Array<Record<string, unknown>>;

  for (const row of tokens) {
    const name =
      (row.name as string | undefined) ??
      (row.NAME as string | undefined) ??
      (row["name"] as string | undefined);
    if (!name || typeof name !== "string") continue;
    try {
      await execute(
        conn,
        `ALTER USER ${username} MODIFY PROGRAMMATIC ACCESS TOKEN "${name.replaceAll('"', "")}"
           SET MINS_TO_BYPASS_NETWORK_POLICY_REQUIREMENT = 1440`,
      );
      console.log(`PAT bypass set for token: ${name}`);
    } catch (error) {
      console.warn(`Could not set bypass on ${name}:`, error);
    }
  }

  conn.destroy((error) => {
    if (error) console.warn("Disconnect warning", error);
  });
  console.log("Done. Retry Iris Ask with SNOWFLAKE_PAT.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
