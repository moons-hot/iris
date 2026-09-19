import type { AccessEventInput, Purpose } from "@/server/iris/types";

import { SEED_USERS } from "@/server/iris/seed-data";

/**
 * Backdated synthetic audit volume. The dashboard needs a believable baseline so
 * that actions performed live during the demo visibly move the counters.
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PURPOSE_WEIGHTS: Array<[Purpose, number]> = [
  ["treatment", 0.62],
  ["scheduling", 0.14],
  ["medication_prescription", 0.09],
  ["engineering_debug", 0.05],
  ["research", 0.04],
  ["emergency_treatment", 0.06],
];

const RESOURCE_TYPES = [
  "patient_context",
  "medication_list",
  "lab_results",
  "appointment",
  "clinical_note",
];

const PATIENTS = ["P1048", "P2210", "P3187"];

function pickPurpose(random: () => number): Purpose {
  const roll = random();
  let cumulative = 0;
  for (const [purpose, weight] of PURPOSE_WEIGHTS) {
    cumulative += weight;
    if (roll <= cumulative) return purpose;
  }
  return "treatment";
}

function actorForPurpose(
  purpose: Purpose,
  random: () => number,
): { id: string; role: string } {
  const candidates = SEED_USERS.filter((user) => {
    if (purpose === "scheduling") return user.role === "reception";
    if (purpose === "engineering_debug") return user.role === "engineer";
    if (purpose === "treatment") return user.role === "physician" || user.role === "nurse";
    return user.role === "physician";
  });
  const pool = candidates.length > 0 ? candidates : SEED_USERS;
  const picked = pool[Math.floor(random() * pool.length)] ?? pool[0]!;
  return { id: picked.id, role: picked.role };
}

export function buildBackdatedEvents(count = 4800): AccessEventInput[] {
  const random = mulberry32(20260919);
  const now = Date.now();
  const windowMs = 72 * 3_600_000;
  const events: AccessEventInput[] = [];

  for (let index = 0; index < count; index += 1) {
    // Bias toward the recent past so "today" looks like a busy hospital day.
    const skew = random() ** 1.7;
    const time = new Date(now - skew * windowMs);
    const purpose = pickPurpose(random);
    const actor = actorForPurpose(purpose, random);
    const roll = random();
    const decision =
      roll > 0.9 ? (roll > 0.985 ? "deny" : "restrict") : "allow";
    const breakGlass = purpose === "emergency_treatment";

    events.push({
      time: time.toISOString(),
      actorId: actor.id,
      actorRole: actor.role,
      deviceId: null,
      patientId: PATIENTS[Math.floor(random() * PATIENTS.length)] ?? "P1048",
      encounterId: null,
      sessionId: null,
      purpose,
      task: null,
      resourceType:
        RESOURCE_TYPES[Math.floor(random() * RESOURCE_TYPES.length)] ?? null,
      decision,
      reason: decision === "allow" ? null : "Outside the stated purpose.",
      breakGlass,
      latencyMs: Math.round(8 + random() * 60),
      metadata: { synthetic: true },
    });
  }

  events.push(...chenAnomalyEvents());
  events.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return events;
}

/**
 * A deliberate anomaly: one clinician with repeated emergency overrides across
 * several departments. Iris flags this for review; it never blocks the override.
 */
function chenAnomalyEvents(): AccessEventInput[] {
  const departments = [
    "Emergency",
    "Intensive Care",
    "Cardiology",
    "Emergency",
    "Intensive Care",
  ];
  return departments.map((department, index) => ({
    time: new Date(Date.now() - (index + 1) * 55 * 60_000).toISOString(),
    actorId: "DOC-001",
    actorRole: "physician",
    deviceId: "IRIS-0042",
    patientId: PATIENTS[index % PATIENTS.length] ?? "P1048",
    encounterId: null,
    sessionId: null,
    purpose: "emergency_treatment",
    task: "emergency_context",
    resourceType: "expanded_clinical_record",
    decision: "allow",
    reason: "Break-glass emergency access",
    breakGlass: true,
    latencyMs: 24,
    metadata: { synthetic: true, department },
  }));
}
