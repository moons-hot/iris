import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { seedDatabase } from "./seed";

const globalForDb = globalThis as typeof globalThis & {
  __med1Db?: Database.Database;
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
  if (!globalForDb.__med1Db) {
    globalForDb.__med1Db = createDatabase();
  }
  return globalForDb.__med1Db;
}
