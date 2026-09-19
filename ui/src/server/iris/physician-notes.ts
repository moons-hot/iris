import { draftNoteFromTranscript } from "@/server/grok/clinical-note";
import { redactClinicalText } from "@/server/grok/redact";
import { decryptFragment } from "@/server/iris/crypto";
import { requireActiveSession } from "@/server/iris/context";
import { getStore } from "@/server/store";

async function latestEncounterId(patientId: string): Promise<string | null> {
  const store = getStore();
  const encounters = await store.listEncounters(patientId);
  const sorted = [...encounters].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  return sorted[0]?.id ?? null;
}

async function readExistingNote(
  patientId: string,
  encounterId: string | null,
): Promise<string | null> {
  const store = getStore();
  const meta = await store.listFragmentMeta(patientId);
  const noteMeta = meta.find(
    (fragment) =>
      fragment.fragmentType === "clinical_note" &&
      fragment.encounterId === encounterId,
  );
  if (!noteMeta) return null;

  const ciphers = await store.loadCiphertexts([noteMeta.id]);
  const cipher = ciphers[0];
  if (!cipher) return null;

  return decryptFragment(cipher, new Set([noteMeta.id]));
}

export interface PrepareNoteResult {
  draft: string;
  draftSource: "grok" | "template";
  transcriptRetained: false;
}

/** Draft from dictation only. Redaction runs on save. */
export async function preparePhysicianNote(input: {
  sessionId: string;
  patientId: string;
  transcript?: string;
  text?: string;
}): Promise<PrepareNoteResult> {
  const { actor } = await requireActiveSession(input.sessionId);
  if (actor.role !== "physician") {
    throw new Error("Only treating clinicians can document visits.");
  }

  let draft = input.text?.trim() ?? "";
  let draftSource: "grok" | "template" = "template";

  if (input.transcript?.trim()) {
    const drafted = await draftNoteFromTranscript(input.transcript.trim());
    draft = drafted.note;
    draftSource = drafted.source;
  }

  if (draft.length < 4) {
    throw new Error("Add a note or dictate a longer conversation.");
  }

  return {
    draft,
    draftSource,
    transcriptRetained: false,
  };
}

export async function savePhysicianNote(input: {
  sessionId: string;
  patientId: string;
  text: string;
}): Promise<{
  redacted: string;
  removed: string[];
  redactionSource: "grok" | "template";
  encounterId: string | null;
}> {
  const store = getStore();
  const { session, actor } = await requireActiveSession(input.sessionId);
  if (actor.role !== "physician") {
    throw new Error("Only treating clinicians can document visits.");
  }

  const redaction = await redactClinicalText(input.text);
  const encounterId = await latestEncounterId(input.patientId);
  const prior = await readExistingNote(input.patientId, encounterId);
  const stamp = new Date().toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const block = `— ${stamp}, ${actor.fullName}\n${redaction.redacted}`;
  const value = prior ? `${prior}\n\n${block}` : block;

  await store.upsertFragment({
    patientId: input.patientId,
    encounterId,
    fragmentType: "clinical_note",
    label: "Cardiology note",
    sensitivity: "clinical",
    purposeClasses: ["treatment", "emergency_treatment"],
    value,
  });

  await store.appendEvents([
    {
      actorId: actor.id,
      actorRole: actor.role,
      deviceId: session.deviceId,
      patientId: input.patientId,
      encounterId,
      sessionId: session.id,
      purpose: "treatment",
      task: "visit_documentation",
      resourceType: "clinical_note",
      decision: "update",
      reason: "Visit note saved after identifier redaction",
      breakGlass: false,
      latencyMs: null,
      metadata: {
        redactionSource: redaction.source,
        removedCategories: redaction.removed,
        transcriptRetained: false,
      },
    },
  ]);

  return {
    redacted: redaction.redacted,
    removed: redaction.removed,
    redactionSource: redaction.source,
    encounterId,
  };
}
