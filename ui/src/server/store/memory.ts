import { chainEvents, verifyChain } from "@/server/iris/audit";
import { encryptFragmentValue, randomId } from "@/server/iris/crypto";
import { POLICY_RULES } from "@/server/iris/policy-rules";
import {
  PATIENT_DIRECTORY,
  SEED_DEVICES,
  SEED_ENCOUNTERS,
  SEED_FRAGMENTS,
  SEED_PATIENTS,
  SEED_RELATIONSHIPS,
  SEED_USERS,
} from "@/server/iris/seed-data";
import { buildBackdatedEvents } from "@/server/iris/seed-events";
import type {
  AccessEvent,
  Delegation,
  FragmentCipher,
  FragmentMeta,
  GeneratedAction,
  Session,
} from "@/server/iris/types";
import type { DashboardStats, IrisStore } from "@/server/store/types";

interface StoredFragment extends FragmentMeta {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

interface MemoryState {
  fragments: Map<string, StoredFragment>;
  sessions: Map<string, Session>;
  delegations: Delegation[];
  actions: GeneratedAction[];
  events: AccessEvent[];
}

function buildState(): MemoryState {
  const fragments = new Map<string, StoredFragment>();
  for (const seed of SEED_FRAGMENTS) {
    const encrypted = encryptFragmentValue(
      seed.patientId,
      seed.fragmentType,
      seed.value,
    );
    fragments.set(seed.id, {
      id: seed.id,
      patientId: seed.patientId,
      encounterId: seed.encounterId,
      fragmentType: seed.fragmentType,
      label: seed.label,
      sensitivity: seed.sensitivity,
      purposeClasses: seed.purposeClasses,
      updatedAt: new Date().toISOString(),
      ...encrypted,
    });
  }

  return {
    fragments,
    sessions: new Map(),
    delegations: [],
    actions: [],
    events: chainEvents(null, buildBackdatedEvents()),
  };
}

// Survives Next.js hot reloads so a demo session is not lost on every edit.
const globalForIris = globalThis as unknown as { irisMemory?: MemoryState };

/**
 * Built on first use rather than at import time: seeding encrypts every fragment,
 * and that should happen when a request needs it, not while Next collects routes.
 */
function getState(): MemoryState {
  return (globalForIris.irisMemory ??= buildState());
}

/** Strips ciphertext, so metadata can never be handed out with the payload attached. */
function toMeta(fragment: StoredFragment): FragmentMeta {
  return {
    id: fragment.id,
    patientId: fragment.patientId,
    encounterId: fragment.encounterId,
    fragmentType: fragment.fragmentType,
    label: fragment.label,
    sensitivity: fragment.sensitivity,
    purposeClasses: fragment.purposeClasses,
    updatedAt: fragment.updatedAt,
  };
}

function startOfToday(): number {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
}

export function createMemoryStore(): IrisStore {
  return {
    kind: "memory",

    listPolicies: async () => POLICY_RULES,

    getDeviceWithUser: async (deviceId) => {
      const device = SEED_DEVICES.find((entry) => entry.id === deviceId);
      if (!device) return null;
      const user = SEED_USERS.find((entry) => entry.id === device.userId);
      if (!user) return null;
      return { device, user };
    },

    getUser: async (userId) =>
      SEED_USERS.find((entry) => entry.id === userId) ?? null,

    listDevices: async () => SEED_DEVICES,

    listPatients: async () =>
      SEED_PATIENTS.map((patient) => ({
        id: patient.id,
        pseudonym: patient.pseudonym,
        displayName: PATIENT_DIRECTORY[patient.id] ?? patient.pseudonym,
      })),

    getPatient: async (patientId) =>
      SEED_PATIENTS.find((patient) => patient.id === patientId) ?? null,

    getPatientDisplayName: async (patientId) =>
      PATIENT_DIRECTORY[patientId] ?? patientId,

    listEncounters: async (patientId) =>
      SEED_ENCOUNTERS.filter((encounter) => encounter.patientId === patientId),

    hasRelationship: async (actorId, patientId) =>
      SEED_RELATIONSHIPS.some(
        (link) => link.actorId === actorId && link.patientId === patientId,
      ),

    listFragmentMeta: async (patientId) =>
      [...getState().fragments.values()]
        .filter((fragment) => fragment.patientId === patientId)
        .map(toMeta),

    loadCiphertexts: async (fragmentIds) => {
      const wanted = new Set(fragmentIds);
      const result: FragmentCipher[] = [];
      for (const fragment of getState().fragments.values()) {
        if (!wanted.has(fragment.id)) continue;
        result.push({
          id: fragment.id,
          patientId: fragment.patientId,
          fragmentType: fragment.fragmentType,
          ciphertext: fragment.ciphertext,
          iv: fragment.iv,
          authTag: fragment.authTag,
        });
      }
      return result;
    },

    upsertFragment: async (input) => {
      const encrypted = encryptFragmentValue(
        input.patientId,
        input.fragmentType,
        input.value,
      );
      const existing = [...getState().fragments.values()].find(
        (fragment) =>
          fragment.patientId === input.patientId &&
          fragment.fragmentType === input.fragmentType &&
          fragment.encounterId === input.encounterId,
      );
      const id = existing?.id ?? randomId("frg");
      const stored: StoredFragment = {
        id,
        patientId: input.patientId,
        encounterId: input.encounterId,
        fragmentType: input.fragmentType,
        label: input.label,
        sensitivity: input.sensitivity,
        purposeClasses: input.purposeClasses,
        updatedAt: new Date().toISOString(),
        ...encrypted,
      };
      getState().fragments.set(id, stored);
      return toMeta(stored);
    },

    createSession: async ({ actorId, deviceId, purpose }) => {
      const session: Session = {
        id: randomId("ses"),
        actorId,
        deviceId,
        purpose,
        task: null,
        breakGlassUntil: null,
        breakGlassReason: null,
        createdAt: new Date().toISOString(),
        lastPresenceAt: new Date().toISOString(),
        endedAt: null,
        endReason: null,
      };
      getState().sessions.set(session.id, session);
      return session;
    },

    getSession: async (sessionId) => getState().sessions.get(sessionId) ?? null,

    updateSession: async (sessionId, patch) => {
      const existing = getState().sessions.get(sessionId);
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      getState().sessions.set(sessionId, updated);
      return updated;
    },

    createDelegation: async (input) => {
      const delegation: Delegation = {
        id: randomId("dlg"),
        createdAt: new Date().toISOString(),
        revokedAt: null,
        ...input,
      };
      getState().delegations.push(delegation);
      return delegation;
    },

    listDelegationsForRole: async (recipientRole) =>
      getState().delegations
        .filter((delegation) => delegation.recipientRole === recipientRole)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    createGeneratedAction: async (input) => {
      const action: GeneratedAction = {
        id: randomId("act"),
        createdAt: new Date().toISOString(),
        ...input,
      };
      getState().actions.unshift(action);
      return action;
    },

    listGeneratedActions: async (limit = 20) => getState().actions.slice(0, limit),

    appendEvents: async (inputs) => {
      const last = getState().events.at(-1)?.eventHash ?? null;
      const chained = chainEvents(last, inputs);
      getState().events.push(...chained);
      return chained;
    },

    listEvents: async (filter) => {
      const limit = filter?.limit ?? 50;
      const filtered = getState().events.filter((event) => {
        if (filter?.patientId && event.patientId !== filter.patientId) {
          return false;
        }
        if (filter?.actorId && event.actorId !== filter.actorId) return false;
        return true;
      });
      return filtered.slice(-limit).reverse();
    },

    dashboard: async () => computeDashboard(),
  };
}

function computeDashboard(): DashboardStats {
  const events = getState().events;
  const dayStart = startOfToday();
  const today = events.filter(
    (event) => new Date(event.time).getTime() >= dayStart,
  );

  const purposeCounts = new Map<string, number>();
  for (const event of today) {
    const key = event.purpose ?? "other";
    purposeCounts.set(key, (purposeCounts.get(key) ?? 0) + 1);
  }

  const byPurpose = [...purposeCounts.entries()]
    .map(([purpose, count]) => ({
      purpose,
      count,
      share: today.length === 0 ? 0 : count / today.length,
    }))
    .sort((a, b) => b.count - a.count);

  // Only the grants themselves, not the restriction events that accompany them.
  const breakGlass = today
    .filter((event) => event.breakGlass && event.decision === "allow")
    .slice(-12)
    .reverse();

  const overrides = new Map<string, { count: number; departments: Set<string> }>();
  for (const event of breakGlass) {
    if (!event.actorId) continue;
    const entry = overrides.get(event.actorId) ?? {
      count: 0,
      departments: new Set<string>(),
    };
    entry.count += 1;
    const department = event.metadata.department;
    if (typeof department === "string") entry.departments.add(department);
    overrides.set(event.actorId, entry);
  }

  const anomalies = [...overrides.entries()]
    .filter(([, entry]) => entry.count >= 3)
    .map(([actorId, entry]) => ({
      actorId,
      actorName:
        SEED_USERS.find((user) => user.id === actorId)?.fullName ?? actorId,
      overrides: entry.count,
      departments: [...entry.departments],
    }));

  // Verifying the whole chain on every request would not scale; the tail is
  // enough to demonstrate the property live.
  const tail = events.slice(-200);

  return {
    source: "memory",
    totalEvents: events.length,
    today: {
      total: today.length,
      allowed: today.filter((event) => event.decision === "allow").length,
      restricted: today.filter((event) => event.decision === "restrict").length,
      denied: today.filter((event) => event.decision === "deny").length,
      breakGlass: today.filter((event) => event.breakGlass).length,
    },
    byPurpose,
    breakGlass,
    recent: events.slice(-25).reverse(),
    anomalies,
    chainVerified: verifyChain(tail),
  };
}
