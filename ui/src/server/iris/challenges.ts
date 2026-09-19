import { randomBytes } from "node:crypto";

/**
 * Short-lived server-generated nonces. The browser is only a serial pipe: it
 * never invents a challenge and never holds a device secret.
 */

interface Challenge {
  id: string;
  deviceId: string;
  nonce: string;
  kind: "auth" | "presence" | "confirm";
  sessionId: string | null;
  createdAt: number;
  simulated: boolean;
  /** Set for break-glass confirmations awaiting a physical button press. */
  payload?: { patientId: string; reason: string | null };
}

const TTL_MS = 120_000;

const globalForChallenges = globalThis as unknown as {
  irisChallenges?: Map<string, Challenge>;
  irisPresence?: Map<string, Challenge>;
};

const challenges: Map<string, Challenge> = (globalForChallenges.irisChallenges ??=
  new Map<string, Challenge>());
const presenceBySession: Map<string, Challenge> =
  (globalForChallenges.irisPresence ??= new Map<string, Challenge>());

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, challenge] of challenges) {
    if (challenge.createdAt < cutoff) challenges.delete(id);
  }
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export function createChallenge(input: {
  deviceId: string;
  kind: Challenge["kind"];
  sessionId?: string | null;
  simulated?: boolean;
  payload?: Challenge["payload"];
}): Challenge {
  sweep();
  const challenge: Challenge = {
    id: `chl_${randomBytes(8).toString("hex")}`,
    deviceId: input.deviceId,
    nonce: newNonce(),
    kind: input.kind,
    sessionId: input.sessionId ?? null,
    createdAt: Date.now(),
    simulated: input.simulated ?? false,
    payload: input.payload,
  };
  challenges.set(challenge.id, challenge);
  return challenge;
}

export function takeChallenge(id: string): Challenge | null {
  const challenge = challenges.get(id);
  if (!challenge) return null;
  challenges.delete(id);
  if (Date.now() - challenge.createdAt > TTL_MS) return null;
  return challenge;
}

export function peekChallenge(id: string): Challenge | null {
  const challenge = challenges.get(id);
  if (!challenge) return null;
  if (Date.now() - challenge.createdAt > TTL_MS) {
    challenges.delete(id);
    return null;
  }
  return challenge;
}

export function setPresenceNonce(
  sessionId: string,
  deviceId: string,
  simulated: boolean,
): Challenge {
  const challenge: Challenge = {
    id: `prs_${randomBytes(6).toString("hex")}`,
    deviceId,
    nonce: newNonce(),
    kind: "presence",
    sessionId,
    createdAt: Date.now(),
    simulated,
  };
  presenceBySession.set(sessionId, challenge);
  return challenge;
}

export function getPresenceNonce(sessionId: string): Challenge | null {
  return presenceBySession.get(sessionId) ?? null;
}

export function clearPresence(sessionId: string): void {
  presenceBySession.delete(sessionId);
}
