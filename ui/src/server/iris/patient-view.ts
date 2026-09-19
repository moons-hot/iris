import { templateSummary } from "@/server/grok/timeline";
import type { AccessEvent, FragmentType } from "@/server/iris/types";
import { getStore } from "@/server/store";

const PURPOSE_TEXT: Record<string, string> = {
  treatment: "Treating you during a visit",
  medication_prescription: "Checking safety before prescribing a medication",
  scheduling: "Managing your appointment and check-in",
  research: "Research on treatment outcomes, using de-identified data",
  engineering_debug: "Fixing a technical fault in the medical record system",
  emergency_treatment: "Emergency care",
};

const CATEGORY_TEXT: Partial<Record<FragmentType, string>> = {
  name: "your name",
  date_of_birth: "your date of birth",
  phone: "your phone number",
  address: "your address",
  insurance: "your insurance details",
  appointment: "your appointment",
  visit_reason: "your reason for visiting",
  vitals: "your vital signs",
  allergies: "your allergies",
  medications: "your medications",
  cardiac_history: "your heart history",
  diagnoses: "your diagnoses",
  labs: "your lab results",
  procedures: "your past procedures",
  clinical_note: "your visit notes",
  psychiatric_note: "your behavioural health note",
  billing: "your billing details",
  encounter_metadata: "visit record details",
  technical_metadata: "system diagnostic details",
  outcome: "your treatment outcome",
};

export interface TimelineEntry {
  id: string;
  time: string;
  actorName: string;
  actorRole: string;
  department: string;
  purposeText: string;
  viewed: string[];
  /** Seen only in a reduced form, such as an age range instead of a birth date. */
  reduced: string[];
  withheld: number;
  kind: "normal" | "emergency" | "system";
  emergencyReason: string | null;
  /** One plain sentence describing this access. Upgraded by Grok in the route. */
  summary: string;
}

function friendlyCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => CATEGORY_TEXT[item as FragmentType] ?? item.replace(/_/g, " "));
}

/**
 * The patient-facing view of the same audit stream the security team sees. Same
 * events, different language: no hashes, no field names, no role jargon.
 */
export async function buildPatientTimeline(
  patientId: string,
  limit = 40,
): Promise<TimelineEntry[]> {
  const store = getStore();
  const events = await store.listEvents({ patientId, limit: limit * 3 });

  const actorIds = [
    ...new Set(
      events
        .map((event) => event.actorId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const actors = await Promise.all(actorIds.map((id) => store.getUser(id)));
  const actorById = new Map(
    actors
      .filter((actor): actor is NonNullable<typeof actor> => actor !== null)
      .map((actor) => [actor.id, actor]),
  );

  // Reasons often arrive on a follow-up event after access is already open.
  const reasonBySession = new Map<string, string>();
  for (const event of events) {
    if (event.resourceType !== "break_glass_reason") continue;
    const text = event.metadata.reason;
    if (typeof text === "string" && text.length > 0 && event.sessionId) {
      reasonBySession.set(event.sessionId, text);
    }
  }

  // Restriction events are companions to a read; fold them into the read itself.
  const withheldBySession = new Map<string, number>();
  for (const event of events) {
    if (event.decision !== "restrict") continue;
    const key = `${event.sessionId ?? ""}:${event.time.slice(0, 19)}`;
    const restricted = event.metadata.restricted;
    withheldBySession.set(
      key,
      Array.isArray(restricted) ? restricted.length : 0,
    );
  }

  const entries: TimelineEntry[] = [];
  for (const event of events) {
    if (!isPatientVisible(event)) continue;
    const actor = event.actorId ? actorById.get(event.actorId) : undefined;
    const key = `${event.sessionId ?? ""}:${event.time.slice(0, 19)}`;

    const facts = {
      id: event.eventId,
      time: event.time,
      actorName: actor?.fullName ?? "A member of hospital staff",
      actorRole: actor?.role ?? event.actorRole ?? "staff",
      department: actor?.department ?? "",
      purposeText:
        PURPOSE_TEXT[event.purpose ?? ""] ?? "Access to your record",
      viewed: event.breakGlass
        ? ["your expanded clinical record"]
        : friendlyCategories(event.metadata.allowed),
      reduced: event.breakGlass ? [] : friendlyCategories(event.metadata.reduced),
      withheld: withheldBySession.get(key) ?? 0,
      kind: (event.breakGlass ? "emergency" : "normal") as TimelineEntry["kind"],
      // Only the stated reason, never the engine's own summary of the decision.
      // A patient reading "15 fields authorized, 5 restricted" learns nothing.
      emergencyReason: event.breakGlass
        ? ((event.metadata.reason as string | undefined) ??
          (event.sessionId
            ? (reasonBySession.get(event.sessionId) ?? null)
            : null))
        : null,
    };

    entries.push({ ...facts, summary: templateSummary(facts) });

    if (entries.length >= limit) break;
  }

  return entries;
}

function isPatientVisible(event: AccessEvent): boolean {
  if (event.decision === "restrict") return false;
  if (event.metadata.synthetic === true && !event.breakGlass) {
    // Backdated filler events still appear, but only the meaningful ones.
    return event.resourceType === "patient_context";
  }
  return (
    event.resourceType === "patient_context" ||
    event.resourceType === "expanded_clinical_record" ||
    event.resourceType === "clinical_handoff" ||
    event.resourceType === "delegation" ||
    event.resourceType === "medication_list" ||
    event.resourceType === "lab_results"
  );
}
