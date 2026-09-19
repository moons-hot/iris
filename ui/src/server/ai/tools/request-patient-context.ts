import { tool } from "ai";
import { z } from "zod";

import { policyFromLens } from "@/lib/pipeline";
import { buildLens, modelContext } from "@/server/iris/context";
import { FRAGMENT_TYPES, PURPOSES } from "@/server/iris/types";
import { getStore } from "@/server/store";
import type { AgentStash } from "@/server/ai/stash";

const purposeSchema = z.enum(PURPOSES);
const fragmentSchema = z.enum(FRAGMENT_TYPES);

export function requestPatientContextTool(
  stash: AgentStash,
  sessionId: string,
  patientId: string,
) {
  return tool({
    description: `Request this patient's record through Iris policy. This is the authorization boundary.

Pass the current purpose and the fragment types you actually need. Policy intersects those types with what the purpose allows. Denied fields are withheld as ciphertext and must not be invented.

Do not treat population frequencies as permissions.`,
    inputSchema: z.object({
      purpose: purposeSchema.describe("Clinician purpose for this request."),
      task: z
        .string()
        .nullish()
        .describe("Short snake_case task name, e.g. hypertension_evaluation."),
      requestedContext: z
        .array(fragmentSchema)
        .describe("Fragment types needed for this question."),
    }),
    execute: async ({ purpose, task, requestedContext }) => {
      const store = getStore();
      await store.updateSession(sessionId, {
        purpose,
        task: task ?? null,
      });

      const lens = await buildLens({
        sessionId,
        patientId,
        purpose,
        task: task ?? null,
        requestedTypes: requestedContext,
      });

      const policy = policyFromLens(requestedContext, lens.fragments);
      stash.lens = lens;
      stash.policy = policy;
      stash.requestedContext = requestedContext;
      stash.purpose = purpose;
      stash.task = task ?? null;
      stash.lastTool = "requestPatientContext";

      return {
        purpose,
        purposeLabel: lens.purposeLabel,
        task: task ?? null,
        summary: lens.summary,
        requestedContext,
        policy,
        authorizedContext: modelContext(lens),
        withheld: policy.filter((entry) => entry.decision === "deny"),
      };
    },
  });
}
