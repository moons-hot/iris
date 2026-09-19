import type { FragmentType } from "@/server/iris/types";
import {
  aggregatePopulationConcepts,
  searchCortexEncounters,
  snowflakeConfigured,
  type ConceptCountRow,
} from "@/server/snowflake/client";

export const SYNTHETIC_CORPUS = "synthetic clinical contexts" as const;

const TOP_N = 15;

export interface ConceptFrequency {
  concept: string;
  count: number;
  frequency: number;
}

export interface PopulationContextResult {
  status: "ok" | "unavailable";
  reason?: string;
  query: string;
  corpus: typeof SYNTHETIC_CORPUS;
  corpusNote: string;
  matchedContexts: number;
  observations: ConceptFrequency[];
  medications: ConceptFrequency[];
  procedures: ConceptFrequency[];
  conditions: ConceptFrequency[];
  suggestedFragmentTypes: FragmentType[];
  retrievalSource?: "rest" | "preview";
}

const CORPUS_NOTE =
  "Frequencies describe similar synthetic clinical contexts from a Synthea FHIR corpus. They are not guidelines, not authorization, and not real physician behavior.";

const HINTS: Array<{ pattern: RegExp; type: FragmentType }> = [
  {
    pattern:
      /blood pressure|heart rate|pulse|respiratory|bmi|vital|temperature|spo2|oxygen saturation|body weight|pain severity/i,
    type: "vitals",
  },
  {
    pattern:
      /cholesterol|a1c|hemoglobin|creatinine|glucose|ldl|hdl|triglyceride|sodium|potassium|lab|leukocyte|hematocrit/i,
    type: "labs",
  },
  {
    pattern:
      /lisinopril|metformin|warfarin|statin|atorvastatin|amlodipine|losartan|hydrochlorothiazide|medication|tablet|capsule|mg\b/i,
    type: "medications",
  },
  {
    pattern:
      /hypertension|diabetes|heart failure|atrial fibrillation|hyperlipidemia|obesity|condition|disorder|chronic kidney/i,
    type: "diagnoses",
  },
  {
    pattern:
      /electrocardiogram|echocardiogram|colonoscopy|procedure|imaging|mammography|spirometry|ultrasound/i,
    type: "procedures",
  },
  {
    pattern: /depression|anxiety|psychiatr|bipolar|schizophren|mental health/i,
    type: "psychiatric_note",
  },
];

export function aggregateConceptFrequencies(
  matchedContexts: number,
  rows: readonly ConceptCountRow[],
  limit = TOP_N,
): ConceptFrequency[] {
  const denominator = matchedContexts > 0 ? matchedContexts : 0;
  return rows
    .filter((row) => row.concept.trim().length > 0 && row.count > 0)
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((row) => ({
      concept: row.concept,
      count: row.count,
      frequency:
        denominator === 0 ? 0 : Number((row.count / denominator).toFixed(4)),
    }));
}

export function suggestFragmentTypes(result: {
  observations: readonly ConceptFrequency[];
  medications: readonly ConceptFrequency[];
  procedures: readonly ConceptFrequency[];
  conditions: readonly ConceptFrequency[];
}): FragmentType[] {
  const suggested = new Set<FragmentType>();
  if (result.observations.length > 0) suggested.add("vitals");
  if (result.medications.length > 0) suggested.add("medications");
  if (result.procedures.length > 0) suggested.add("procedures");
  if (result.conditions.length > 0) suggested.add("diagnoses");

  const concepts = [
    ...result.observations,
    ...result.medications,
    ...result.procedures,
    ...result.conditions,
  ].map((entry) => entry.concept);

  for (const concept of concepts) {
    for (const hint of HINTS) {
      if (hint.pattern.test(concept)) suggested.add(hint.type);
    }
  }

  return [...suggested];
}

function emptyResult(
  query: string,
  extras: Partial<PopulationContextResult> = {},
): PopulationContextResult {
  return {
    status: "unavailable",
    query,
    corpus: SYNTHETIC_CORPUS,
    corpusNote: CORPUS_NOTE,
    matchedContexts: 0,
    observations: [],
    medications: [],
    procedures: [],
    conditions: [],
    suggestedFragmentTypes: [],
    ...extras,
  };
}

/**
 * Population-scale retrieval only. Never decrypts patient ciphertext and never
 * authorizes a field. Suggested fragment types are hints for the model.
 */
export async function searchPopulationContext(
  clinicalSituation: string,
): Promise<PopulationContextResult> {
  const query = clinicalSituation.trim();
  if (!query) {
    return emptyResult(query, { reason: "A clinical situation is required." });
  }

  if (!snowflakeConfigured()) {
    return emptyResult(query, {
      reason: "Snowflake is not configured. Population retrieval was skipped.",
    });
  }

  try {
    const retrieved = await searchCortexEncounters(query);
    const matchedContexts = retrieved.encounterIds.length;
    const aggregates = await aggregatePopulationConcepts(
      retrieved.encounterIds,
    );
    const observations = aggregateConceptFrequencies(
      matchedContexts,
      aggregates.observations,
    );
    const medications = aggregateConceptFrequencies(
      matchedContexts,
      aggregates.medications,
    );
    const procedures = aggregateConceptFrequencies(
      matchedContexts,
      aggregates.procedures,
    );
    const conditions = aggregateConceptFrequencies(
      matchedContexts,
      aggregates.conditions,
    );

    return {
      status: "ok",
      query,
      corpus: SYNTHETIC_CORPUS,
      corpusNote: CORPUS_NOTE,
      matchedContexts,
      observations,
      medications,
      procedures,
      conditions,
      suggestedFragmentTypes: suggestFragmentTypes({
        observations,
        medications,
        procedures,
        conditions,
      }),
      retrievalSource: retrieved.source,
    };
  } catch (error) {
    console.warn("Population context search failed", error);
    return emptyResult(query, {
      reason:
        error instanceof Error
          ? error.message
          : "Snowflake population retrieval failed.",
    });
  }
}
