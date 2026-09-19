import type { FragmentView, Lens } from "@/lib/lens";

export const FRAGMENT_TYPE_LABELS: Record<string, string> = {
  name: "Name",
  date_of_birth: "Date of birth",
  phone: "Phone",
  address: "Address",
  insurance: "Insurance",
  appointment: "Appointment",
  visit_reason: "Visit reason",
  vitals: "Vitals",
  allergies: "Allergies",
  medications: "Medications",
  cardiac_history: "Cardiac history",
  diagnoses: "Diagnoses",
  labs: "Labs",
  procedures: "Procedures",
  clinical_note: "Visit note",
  psychiatric_note: "Behavioural health note",
  billing: "Billing",
  encounter_metadata: "Encounter metadata",
  technical_metadata: "Technical metadata",
  outcome: "Outcome",
};

export interface ConceptFrequencyView {
  concept: string;
  count: number;
  frequency: number;
}

export interface PopulationContextView {
  status: "ok" | "unavailable";
  reason?: string;
  query: string;
  corpus: string;
  corpusNote: string;
  matchedContexts: number;
  observations: ConceptFrequencyView[];
  medications: ConceptFrequencyView[];
  procedures: ConceptFrequencyView[];
  conditions: ConceptFrequencyView[];
  suggestedFragmentTypes: string[];
}

export interface PolicyCategoryView {
  fragmentType: string;
  label: string;
  decision: "allow" | "deny" | "not_present";
  reason: string;
}

export type PipelineStepId = "intent" | "population" | "policy" | "answer";
export type PipelineStepStatus = "pending" | "active" | "complete" | "skipped";

export interface PipelineStepView {
  id: PipelineStepId;
  label: string;
  status: PipelineStepStatus;
}

export interface IrisPipeline {
  clinicalSituation: string;
  purpose: string;
  task: string | null;
  steps: PipelineStepView[];
  population: PopulationContextView | null;
  policy: PolicyCategoryView[];
}

export interface InterpretResponse {
  intent?: {
    action: string;
    purpose: string;
    task: string | null;
    requestedContext: string[];
    source: "grok" | "keyword";
    utterance: string;
  };
  tool?: string;
  lens?: Lens;
  answer?: string;
  answerSource?: string;
  requiresBreakGlass?: boolean;
  message?: string;
  pipeline?: IrisPipeline;
  timeline?: unknown;
  action?: { id: string; title: string };
  included?: string[];
  excluded?: string[];
  delegation?: unknown;
  error?: string;
}

export function fragmentLabel(type: string): string {
  return FRAGMENT_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function policyFromLens(
  requested: string[],
  fragments: FragmentView[],
): PolicyCategoryView[] {
  const types = requested.length > 0 ? requested : [];
  return types.map((fragmentType) => {
    const matches = fragments.filter(
      (fragment) => fragment.fragmentType === fragmentType,
    );
    if (matches.length === 0) {
      return {
        fragmentType,
        label: fragmentLabel(fragmentType),
        decision: "not_present" as const,
        reason: "No field of this type is on the record.",
      };
    }
    const allowed = matches.filter((fragment) => fragment.decision !== "deny");
    if (allowed.length > 0) {
      return {
        fragmentType,
        label: fragmentLabel(fragmentType),
        decision: "allow" as const,
        reason: allowed[0]?.reason ?? "Authorized for this purpose.",
      };
    }
    return {
      fragmentType,
      label: fragmentLabel(fragmentType),
      decision: "deny" as const,
      reason: matches[0]?.reason ?? "Withheld by policy.",
    };
  });
}
