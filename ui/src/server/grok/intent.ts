import { grokChat, grokConfigured } from "@/server/grok/client";
import { FRAGMENT_TYPES, PURPOSES } from "@/server/iris/types";
import type { FragmentType, Purpose } from "@/server/iris/types";

export type IrisAction =
  | "request_context"
  | "create_handoff"
  | "create_engineering_delegation"
  | "request_break_glass"
  | "show_access_history";

export interface Intent {
  action: IrisAction;
  purpose: Purpose;
  task: string | null;
  requestedContext: FragmentType[];
  source: "grok" | "keyword";
  utterance: string;
}

const SYSTEM_PROMPT = `You classify a clinician's spoken request for Iris, a purpose-bound patient-context system.

You do NOT decide what data the clinician may see. A deterministic policy engine does that. Your only job is to describe what they are trying to do.

Reply with JSON only:
{
  "action": "request_context" | "create_handoff" | "create_engineering_delegation" | "request_break_glass" | "show_access_history",
  "purpose": ${PURPOSES.map((p) => `"${p}"`).join(" | ")},
  "task": short lowercase snake_case task name,
  "requested_context": array of field names from this list: ${FRAGMENT_TYPES.join(", ")}
}

Rules:
- "break glass", "emergency", "unconscious", "override" => action request_break_glass, purpose emergency_treatment.
- research, dataset, study, outcome analysis => purpose research.
- prescribing, medication order, NSAID, contraindication => purpose medication_prescription.
- handoff, refer, transfer to a specialty => action create_handoff, purpose treatment.
- give engineering/debug access, failed import, duplicate rows => action create_engineering_delegation, purpose engineering_debug.
- booking, check in, appointment, insurance => purpose scheduling.
- otherwise => action request_context, purpose treatment.`;

interface GrokIntentPayload {
  action?: string;
  purpose?: string;
  task?: string;
  requested_context?: string[];
}

function isPurpose(value: string): value is Purpose {
  return (PURPOSES as readonly string[]).includes(value);
}

function isFragmentType(value: string): value is FragmentType {
  return (FRAGMENT_TYPES as readonly string[]).includes(value);
}

const ACTIONS: IrisAction[] = [
  "request_context",
  "create_handoff",
  "create_engineering_delegation",
  "request_break_glass",
  "show_access_history",
];

function isAction(value: string): value is IrisAction {
  return (ACTIONS as string[]).includes(value);
}

/**
 * Deterministic classifier. Also the offline fallback, so the demo never depends
 * on network conditions at a hackathon venue.
 */
export function keywordIntent(utterance: string): Intent {
  const text = utterance.toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => text.includes(term));

  if (
    has(
      "break glass",
      "breakglass",
      "emergency access",
      "unconscious",
      "overdose",
      "override",
    )
  ) {
    return {
      action: "request_break_glass",
      purpose: "emergency_treatment",
      task: "emergency_context",
      requestedContext: [
        "medications",
        "allergies",
        "diagnoses",
        "psychiatric_note",
      ],
      source: "keyword",
      utterance,
    };
  }

  if (has("handoff", "hand off", "handover", "refer", "transfer to")) {
    return {
      action: "create_handoff",
      purpose: "treatment",
      task: "specialist_handoff",
      requestedContext: [
        "visit_reason",
        "cardiac_history",
        "medications",
        "allergies",
        "labs",
      ],
      source: "keyword",
      utterance,
    };
  }

  if (
    has(
      "engineering",
      "engineer",
      "debug",
      "duplicate",
      "failed import",
      "reconciliation",
    )
  ) {
    return {
      action: "create_engineering_delegation",
      purpose: "engineering_debug",
      task: "medication_reconciliation_debug",
      requestedContext: [
        "technical_metadata",
        "encounter_metadata",
        "medications",
      ],
      source: "keyword",
      utterance,
    };
  }

  if (has("who accessed", "access history", "who looked", "who viewed")) {
    return {
      action: "show_access_history",
      purpose: "treatment",
      task: "access_review",
      requestedContext: [],
      source: "keyword",
      utterance,
    };
  }

  if (has("research", "dataset", "study", "outcome analysis", "cohort")) {
    return {
      action: "request_context",
      purpose: "research",
      task: "outcome_analysis",
      requestedContext: ["diagnoses", "procedures", "labs", "outcome"],
      source: "keyword",
      utterance,
    };
  }

  if (
    has("prescrib", "nsaid", "contraindication", "medication order", "dose")
  ) {
    return {
      action: "request_context",
      purpose: "medication_prescription",
      task: "medication_prescription",
      requestedContext: ["allergies", "medications", "diagnoses", "labs"],
      source: "keyword",
      utterance,
    };
  }

  if (has("appointment", "check in", "checking in", "insurance", "reschedul")) {
    return {
      action: "request_context",
      purpose: "scheduling",
      task: "patient_check_in",
      requestedContext: ["name", "date_of_birth", "appointment", "insurance"],
      source: "keyword",
      utterance,
    };
  }

  return {
    action: "request_context",
    purpose: "treatment",
    task: has("chest pain") ? "chest_pain_evaluation" : "clinical_review",
    requestedContext: [
      "visit_reason",
      "vitals",
      "allergies",
      "medications",
      "cardiac_history",
      "labs",
      ...(has("psychiatr", "behavioral health", "behavioural health")
        ? (["psychiatric_note"] as const)
        : []),
    ],
    source: "keyword",
    utterance,
  };
}

/**
 * Grok interprets the request; the policy engine still decides everything that
 * matters. Only the utterance is sent, never patient data.
 */
export async function extractIntent(utterance: string): Promise<Intent> {
  const fallback = keywordIntent(utterance);
  if (!grokConfigured()) return fallback;

  const raw = await grokChat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: utterance },
    ],
    { json: true, temperature: 0 },
  );
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as GrokIntentPayload;
    const action =
      parsed.action && isAction(parsed.action)
        ? parsed.action
        : fallback.action;
    const purpose =
      parsed.purpose && isPurpose(parsed.purpose)
        ? parsed.purpose
        : fallback.purpose;
    const requestedContext = (parsed.requested_context ?? []).filter(
      isFragmentType,
    );

    return {
      action,
      purpose,
      task: parsed.task ?? fallback.task,
      requestedContext:
        requestedContext.length > 0
          ? requestedContext
          : fallback.requestedContext,
      source: "grok",
      utterance,
    };
  } catch {
    return fallback;
  }
}
