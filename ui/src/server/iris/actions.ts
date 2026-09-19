import { generateHandoff } from "@/server/grok/generate";
import { buildLens } from "@/server/iris/context";
import type { LensResult } from "@/server/iris/context";
import type { FragmentType, GeneratedAction, Purpose } from "@/server/iris/types";
import { getStore } from "@/server/store";

/**
 * Conversation to action: each of these does real work - writes a row, creates a
 * scoped grant - and emits its own audit event. None of them widen access.
 */

export interface HandoffResult {
  action: GeneratedAction;
  included: string[];
  excluded: string[];
  lens: LensResult;
}

export async function createClinicalHandoff(input: {
  sessionId: string;
  patientId: string;
  specialty: string;
  clinicianContext?: string;
}): Promise<HandoffResult> {
  const store = getStore();

  // The handoff is built from a treatment-purpose lens, so it can only ever
  // contain fields that purpose already authorized.
  const lens = await buildLens({
    sessionId: input.sessionId,
    patientId: input.patientId,
    purpose: "treatment",
    task: "specialist_handoff",
    logEvents: false,
  });

  const draft = await generateHandoff(
    lens,
    input.specialty,
    input.clinicianContext,
  );
  const clinicianContext = input.clinicianContext?.trim();
  const included = lens.fragments
    .filter((fragment) => fragment.value !== null)
    .map((fragment) => fragment.label);
  const excluded = lens.fragments
    .filter((fragment) => fragment.value === null)
    .map((fragment) => fragment.label);

  const action = await store.createGeneratedAction({
    actionType: "clinical_handoff",
    actorId: lens.actor.id,
    patientId: input.patientId,
    encounterId: null,
    title: `${input.specialty} handoff - ${lens.patient.displayName}`,
    body: {
      specialty: draft.specialty,
      sections: draft.sections,
      generatedBy: draft.source,
      ...(clinicianContext ? { clinicianContext } : {}),
    },
    included,
    excluded,
  });

  await store.appendEvents([
    {
      actorId: lens.actor.id,
      actorRole: lens.actor.role,
      deviceId: null,
      patientId: input.patientId,
      encounterId: null,
      sessionId: input.sessionId,
      purpose: "treatment",
      task: "specialist_handoff",
      resourceType: "clinical_handoff",
      decision: "allow",
      reason: `${input.specialty} handoff generated from ${included.length} authorized field(s)`,
      breakGlass: lens.breakGlass,
      latencyMs: null,
      metadata: {
        actionId: action.id,
        allowed: lens.fragments
          .filter((fragment) => fragment.value !== null)
          .map((fragment) => fragment.fragmentType),
        excludedCount: excluded.length,
        generatedBy: draft.source,
      },
    },
  ]);

  return { action, included, excluded, lens };
}

export const ENGINEERING_SCOPE: FragmentType[] = [
  "technical_metadata",
  "encounter_metadata",
  "medications",
];

export async function createEngineeringDelegation(input: {
  sessionId: string;
  patientId: string;
  encounterId: string | null;
  minutes: number;
  reason: string;
}) {
  const store = getStore();
  const { requireActiveSession } = await import("@/server/iris/context");
  const { actor } = await requireActiveSession(input.sessionId);

  const expiresAt = new Date(Date.now() + input.minutes * 60_000).toISOString();
  const delegation = await store.createDelegation({
    createdBy: actor.id,
    recipientRole: "engineer",
    patientId: input.patientId,
    encounterId: input.encounterId,
    purpose: "engineering_debug" satisfies Purpose,
    scope: ENGINEERING_SCOPE,
    reason: input.reason,
    expiresAt,
  });

  await store.appendEvents([
    {
      actorId: actor.id,
      actorRole: actor.role,
      deviceId: null,
      patientId: input.patientId,
      encounterId: input.encounterId,
      sessionId: input.sessionId,
      purpose: "engineering_debug",
      task: "scoped_delegation",
      resourceType: "delegation",
      decision: "allow",
      reason: `Scoped debug view granted for ${input.minutes} minutes`,
      breakGlass: false,
      latencyMs: null,
      metadata: {
        delegationId: delegation.id,
        scope: delegation.scope,
        expiresAt,
        recipientRole: "engineer",
      },
    },
  ]);

  return delegation;
}

export async function recordEncounterNote(input: {
  sessionId: string;
  patientId: string;
  encounterId: string | null;
  transcript: string;
}) {
  const store = getStore();
  const { requireActiveSession } = await import("@/server/iris/context");
  const { actor } = await requireActiveSession(input.sessionId);
  const { extractEncounterFragments } = await import("@/server/grok/generate");

  const extracted = await extractEncounterFragments(input.transcript);
  const SENSITIVITY: Record<string, "clinical" | "highly_sensitive"> = {
    psychiatric_note: "highly_sensitive",
  };

  const written = [];
  for (const fragment of extracted.fragments) {
    const fragmentType = fragment.fragmentType as FragmentType;
    written.push(
      await store.upsertFragment({
        patientId: input.patientId,
        encounterId: input.encounterId,
        fragmentType,
        label: fragment.label,
        sensitivity: SENSITIVITY[fragmentType] ?? "clinical",
        purposeClasses: ["treatment", "emergency_treatment"],
        value: fragment.value,
      }),
    );
  }

  await store.appendEvents([
    {
      actorId: actor.id,
      actorRole: actor.role,
      deviceId: null,
      patientId: input.patientId,
      encounterId: input.encounterId,
      sessionId: input.sessionId,
      purpose: "treatment",
      task: "encounter_documentation",
      resourceType: "record_update",
      decision: "update",
      reason: `${written.length} field(s) extracted and encrypted`,
      breakGlass: false,
      latencyMs: null,
      metadata: {
        fields: written.map((fragment) => fragment.fragmentType),
        extractedBy: extracted.source,
        // The raw transcript is intentionally not stored.
        transcriptRetained: false,
      },
    },
  ]);

  return { written, source: extracted.source };
}
