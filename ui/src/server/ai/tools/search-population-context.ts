import { tool } from "ai";
import { z } from "zod";

import { searchPopulationContext } from "@/server/iris/population-context";
import type { PopulationContextResult } from "@/server/iris/population-context";
import type { AgentStash } from "@/server/ai/stash";

export function searchPopulationContextTool(stash: AgentStash) {
  return tool({
    description: `Search a population-scale corpus of synthetic clinical contexts (Synthea FHIR).

Use this for relevance only: which observations, medications, procedures, and conditions commonly appear in similar situations.

This is NOT authorization, NOT clinical guidelines, NOT real physician behavior, and NOT this patient's record. Frequencies never grant or deny access to patient fields.`,
    inputSchema: z.object({
      clinicalSituation: z
        .string()
        .min(3)
        .describe(
          "Short clinical situation to retrieve similar synthetic contexts, e.g. persistent high blood pressure.",
        ),
    }),
    execute: async ({ clinicalSituation }) => {
      const result: PopulationContextResult =
        await searchPopulationContext(clinicalSituation);
      stash.population = result;
      stash.clinicalSituation = clinicalSituation;
      stash.lastTool = "searchPopulationContext";
      return result;
    },
  });
}
