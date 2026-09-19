import { decryptFragment } from "@/server/iris/crypto";
import { PURPOSE_LABELS, evaluate } from "@/server/iris/engine";
import { TRANSFORM_LABELS, applyTransform } from "@/server/iris/transforms";
import type {
  AccessEventInput,
  Decision,
  Delegation,
  FragmentType,
  Purpose,
  Sensitivity,
  Session,
  Transform,
  User,
} from "@/server/iris/types";
import { getStore } from "@/server/store";

/** How long a session survives without a signed presence beat from the Iris Key. */
export const PRESENCE_TIMEOUT_MS = 8_000;

export class SessionInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionInvalidError";
  }
}

export interface LensFragment {
  id: string;
  label: string;
  fragmentType: FragmentType;
  sensitivity: Sensitivity;
  decision: Decision;
  transform: Transform;
  transformLabel: string | null;
  reason: string;
  value: string | null;
}

export interface LensResult {
  sessionId: string;
  actor: { id: string; name: string; role: string; department: string };
  patient: { id: string; displayName: string; pseudonym: string };
  purpose: Purpose;
  effectivePurpose: Purpose;
  purposeLabel: string;
  task: string | null;
  breakGlass: boolean;
  breakGlassExpiresAt: string | null;
  breakGlassReason: string | null;
  fragments: LensFragment[];
  allowedCount: number;
  restrictedCount: number;
  summary: string;
  ruleId: string | null;
  delegation: Delegation | null;
}

export function breakGlassActive(session: Session, now = new Date()): boolean {
  if (!session.breakGlassUntil) return false;
  return new Date(session.breakGlassUntil).getTime() > now.getTime();
}

/**
 * Which patient, if any, the current emergency window was opened on.
 *
 * The window lives on the session, but the patient it was granted for lives on
 * the grant event, so the off-list lookup reads it back from the audit trail
 * rather than keeping a second copy of the same fact.
 */
export async function activeBreakGlassPatientId(
  sessionId: string,
): Promise<string | null> {
  const store = getStore();
  const session = await store.getSession(sessionId);
  if (!session || !breakGlassActive(session)) return null;

  const events = await store.listEvents({
    actorId: session.actorId,
    limit: 100,
  });
  const grant = events.find(
    (event) =>
      event.sessionId === sessionId &&
      event.resourceType === "expanded_clinical_record" &&
      event.decision === "allow",
  );
  return grant?.patientId ?? null;
}

export async function requireActiveSession(sessionId: string): Promise<{
  session: Session;
  actor: User;
}> {
  const store = getStore();
  const session = await store.getSession(sessionId);
  if (!session) throw new SessionInvalidError("Session not found.");
  if (session.endedAt) {
    throw new SessionInvalidError(
      session.endReason ?? "Session has already ended.",
    );
  }

  const age = Date.now() - new Date(session.lastPresenceAt).getTime();
  if (age > PRESENCE_TIMEOUT_MS) {
    await store.updateSession(sessionId, {
      endedAt: new Date().toISOString(),
      endReason: "DEVICE_REMOVED",
    });
    await store.appendEvents([
      {
        actorId: session.actorId,
        actorRole: null,
        deviceId: session.deviceId,
        patientId: null,
        encounterId: null,
        sessionId,
        purpose: session.purpose,
        task: null,
        resourceType: "session",
        decision: "session_end",
        reason: "Hardware presence lost",
        breakGlass: false,
        latencyMs: null,
        metadata: { presenceAgeMs: age },
      },
    ]);
    throw new SessionInvalidError(
      "Hardware presence lost. Session terminated.",
    );
  }

  const actor = await store.getUser(session.actorId);
  if (!actor) throw new SessionInvalidError("Actor no longer exists.");
  return { session, actor };
}

export interface BuildLensOptions {
  sessionId: string;
  patientId: string;
  purpose: Purpose;
  task?: string | null;
  /** Set false for internal callers that log their own event (handoffs, etc). */
  logEvents?: boolean;
  /**
   * Optional intersection with policy. Empty/missing keeps the purpose-wide lens
   * used by the purpose toggle and `/api/context`.
   */
  requestedTypes?: FragmentType[];
}

/**
 * The read path. Order matters and is the whole privacy argument:
 * evaluate policy, fetch ciphertext for the allow set only, decrypt, transform.
 */
export async function buildLens(
  options: BuildLensOptions,
): Promise<LensResult> {
  const started = Date.now();
  const store = getStore();
  const { session, actor } = await requireActiveSession(options.sessionId);

  const patient = await store.getPatient(options.patientId);
  if (!patient) throw new SessionInvalidError("Unknown patient.");

  const [meta, rules, hasRelationship, displayName] = await Promise.all([
    store.listFragmentMeta(options.patientId),
    store.listPolicies(),
    store.hasRelationship(actor.id, options.patientId),
    store.getPatientDisplayName(options.patientId),
  ]);

  let delegation: Delegation | null = null;
  if (actor.role === "engineer") {
    const delegations = await store.listDelegationsForRole("engineer");
    delegation =
      delegations.find(
        (entry) =>
          entry.patientId === options.patientId &&
          !entry.revokedAt &&
          new Date(entry.expiresAt).getTime() > Date.now(),
      ) ?? null;
  }

  const isBreakGlass = breakGlassActive(session);
  const decision = evaluate({
    actor: { id: actor.id, role: actor.role },
    patientId: options.patientId,
    purpose: options.purpose,
    task: options.task ?? session.task,
    fragments: meta,
    rules,
    hasRelationship,
    breakGlassActive: isBreakGlass,
    delegation,
    requestedTypes: options.requestedTypes,
  });

  const authorizedIds = new Set(decision.allowedIds);
  const ciphers = await store.loadCiphertexts(decision.allowedIds);
  const plaintextById = new Map<string, string>();
  for (const cipher of ciphers) {
    plaintextById.set(cipher.id, decryptFragment(cipher, authorizedIds));
  }

  const fragments = decision.fragments.map<LensFragment>((entry) => {
    const raw = plaintextById.get(entry.fragment.id);
    const value =
      raw === undefined ? null : applyTransform(raw, entry.transform, patient);
    return {
      id: entry.fragment.id,
      label: entry.fragment.label,
      fragmentType: entry.fragment.fragmentType,
      sensitivity: entry.fragment.sensitivity,
      decision: entry.decision,
      transform: entry.transform,
      transformLabel:
        entry.transform === "none" ? null : TRANSFORM_LABELS[entry.transform],
      reason: entry.reason,
      value,
    };
  });

  const displayNameForLens =
    decision.fragments.find((entry) => entry.fragment.fragmentType === "name")
      ?.transform === "pseudonymize"
      ? patient.pseudonym
      : displayName;

  if (options.logEvents !== false) {
    const latency = Date.now() - started;
    const allowedTypes = decision.fragments
      .filter((entry) => entry.decision === "allow")
      .map((entry) => entry.fragment.fragmentType);
    // Tracked separately so the patient-facing view can say "in reduced form"
    // rather than implying the full value was read.
    const reducedTypes = decision.fragments
      .filter((entry) => entry.decision === "allow_transformed")
      .map((entry) => entry.fragment.fragmentType);
    const restrictedTypes = decision.fragments
      .filter((entry) => entry.decision === "deny")
      .map((entry) => entry.fragment.fragmentType);

    const events: AccessEventInput[] = [
      {
        actorId: actor.id,
        actorRole: actor.role,
        deviceId: session.deviceId,
        patientId: options.patientId,
        encounterId: null,
        sessionId: session.id,
        purpose: decision.effectivePurpose,
        task: decision.task,
        resourceType: "patient_context",
        decision: decision.allowedCount > 0 ? "allow" : "deny",
        reason: decision.summary,
        breakGlass: isBreakGlass,
        latencyMs: latency,
        metadata: {
          allowed: allowedTypes,
          reduced: reducedTypes,
          ruleId: decision.ruleId,
          requestedPurpose: decision.purpose,
          requestedTypes: options.requestedTypes ?? [],
          // Carried on every read in the window so the patient sees the same
          // stated reason on each one, not only on the confirmation event.
          ...(isBreakGlass && session.breakGlassReason
            ? { reason: session.breakGlassReason }
            : {}),
        },
      },
    ];

    if (restrictedTypes.length > 0) {
      events.push({
        actorId: actor.id,
        actorRole: actor.role,
        deviceId: session.deviceId,
        patientId: options.patientId,
        encounterId: null,
        sessionId: session.id,
        purpose: decision.effectivePurpose,
        task: decision.task,
        resourceType: "restricted_fields",
        decision: "restrict",
        reason: `${restrictedTypes.length} field(s) withheld for ${PURPOSE_LABELS[decision.effectivePurpose]}.`,
        breakGlass: isBreakGlass,
        latencyMs: latency,
        metadata: { restricted: restrictedTypes, ruleId: decision.ruleId },
      });
    }

    await store.appendEvents(events);
  }

  return {
    sessionId: session.id,
    actor: {
      id: actor.id,
      name: actor.fullName,
      role: actor.role,
      department: actor.department,
    },
    patient: {
      id: patient.id,
      displayName: displayNameForLens,
      pseudonym: patient.pseudonym,
    },
    purpose: decision.purpose,
    effectivePurpose: decision.effectivePurpose,
    purposeLabel: PURPOSE_LABELS[decision.effectivePurpose],
    task: decision.task,
    breakGlass: isBreakGlass,
    breakGlassExpiresAt: session.breakGlassUntil,
    breakGlassReason: session.breakGlassReason,
    fragments,
    allowedCount: decision.allowedCount,
    restrictedCount: decision.restrictedCount,
    summary: decision.summary,
    ruleId: decision.ruleId,
    delegation,
  };
}

/** Permitted context for the model: labels plus already-transformed values. */
export function modelContext(lens: LensResult): Array<{
  label: string;
  value: string;
  reduced: boolean;
}> {
  return lens.fragments
    .filter((fragment) => fragment.value !== null)
    .map((fragment) => ({
      label: fragment.label,
      value: fragment.value!,
      reduced: fragment.decision === "allow_transformed",
    }));
}
