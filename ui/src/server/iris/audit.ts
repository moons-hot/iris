import { hashChain, randomId } from "@/server/iris/crypto";
import type { AccessEvent, AccessEventInput } from "@/server/iris/types";

/**
 * Canonical form of an event for hashing. Field order is fixed so the same event
 * always produces the same hash regardless of how it was constructed.
 */
export function canonicalizeEvent(event: AccessEvent): string {
  return JSON.stringify([
    event.time,
    event.eventId,
    event.actorId,
    event.actorRole,
    event.deviceId,
    event.patientId,
    event.encounterId,
    event.sessionId,
    event.purpose,
    event.task,
    event.resourceType,
    event.decision,
    event.reason,
    event.breakGlass,
    event.metadata,
  ]);
}

/**
 * Links events into a hash chain. Re-writing history requires re-writing every
 * later hash, which is what makes the trail tamper-evident. It is not immutable:
 * an operator with write access could still rebuild the chain.
 */
export function chainEvents(
  previousHash: string | null,
  inputs: readonly AccessEventInput[],
): AccessEvent[] {
  let previous = previousHash;
  const chained: AccessEvent[] = [];

  for (const input of inputs) {
    const event: AccessEvent = {
      ...input,
      time: input.time ?? new Date().toISOString(),
      eventId: input.eventId ?? randomId("evt"),
      previousEventHash: previous,
      eventHash: "",
    };
    event.eventHash = hashChain(previous, canonicalizeEvent(event));
    previous = event.eventHash;
    chained.push(event);
  }

  return chained;
}

export function verifyChain(events: readonly AccessEvent[]): boolean {
  let previous: string | null = null;
  for (const event of events) {
    if (previous !== null && event.previousEventHash !== previous) return false;
    const expected = hashChain(event.previousEventHash, canonicalizeEvent(event));
    if (expected !== event.eventHash) return false;
    previous = event.eventHash;
  }
  return true;
}
