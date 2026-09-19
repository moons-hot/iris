import { createMemoryStore } from "@/server/store/memory";
import { createPostgresStore, getSql } from "@/server/store/postgres";
import type { IrisStore } from "@/server/store/types";

const globalForStore = globalThis as unknown as { irisStore?: IrisStore };

/**
 * Tiger Data is the intended store. When `DATABASE_URL` is absent the identical
 * interface is served from memory so the demo still runs end to end - useful on
 * a conference network, and it keeps the policy and audit logic in one place.
 */
export function getStore(): IrisStore {
  if (globalForStore.irisStore) return globalForStore.irisStore;

  const connectionString = process.env.DATABASE_URL;
  const store = connectionString
    ? createPostgresStore(getSql(connectionString))
    : createMemoryStore();

  globalForStore.irisStore = store;
  return store;
}
