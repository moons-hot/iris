import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { seedDatabase } from "./seed";

/** Bump when schema.sql changes so dev HMR picks up new tables. */
const SCHEMA_VERSION = 4;

const globalForDb = globalThis as typeof globalThis & {
  __med1Db?: Database.Database;
  __med1SchemaVersion?: number;
};

function loadSchema(): string {
  const schemaPath = join(process.cwd(), "src/lib/db/schema.sql");
  return readFileSync(schemaPath, "utf8");
}

function createDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(loadSchema());
  seedDatabase(db);
  return db;
}

/** Onboard in-memory store; singleton survives Next.js dev HMR. */
export function getDb(): Database.Database {
  if (
    globalForDb.__med1Db &&
    globalForDb.__med1SchemaVersion !== SCHEMA_VERSION
  ) {
    globalForDb.__med1Db.close();
    globalForDb.__med1Db = undefined;
  }

  if (!globalForDb.__med1Db) {
    globalForDb.__med1Db = createDatabase();
    globalForDb.__med1SchemaVersion = SCHEMA_VERSION;
  }
  return globalForDb.__med1Db;
}
