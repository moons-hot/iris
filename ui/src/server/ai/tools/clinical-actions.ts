import { tool } from "ai";
import { z } from "zod";

import {
  createClinicalHandoff,
  createEngineeringDelegation,
} from "@/server/iris/actions";
import { buildPatientTimeline } from "@/server/iris/patient-view";
import { getStore } from "@/server/store";
import type { AgentStash } from "@/server/ai/stash";

export function requestBreakGlassTool(stash: AgentStash) {
  return tool({
    description: `Start emergency break-glass. Do not request patient context in the same turn. Access is granted only after a hardware confirmation and a recorded reason on the client — this tool does not decrypt anything.`,
    inputSchema: z.object({
      reasonHint: z
        .string()
        .optional()
        .describe("Optional short description of the emergency."),
    }),
    execute: async () => {
      stash.lastTool = "requestBreakGlass";
      stash.breakGlass = {
        requiresBreakGlass: true,
        message:
          "Confirm emergency access on your CareKey, then record the reason.",
      };
      return stash.breakGlass;
    },
  });
}

export function createClinicalHandoffTool(
  stash: AgentStash,
  sessionId: string,
  patientId: string,
) {
  return tool({
    description: `Create a specialist clinical handoff from the current treatment lens. Only authorized fields can be included.`,
    inputSchema: z.object({
      specialty: z
        .string()
        .min(3)
        .describe("Receiving specialty, e.g. Cardiology."),
    }),
    execute: async ({ specialty }) => {
      const result = await createClinicalHandoff({
        sessionId,
        patientId,
        specialty,
      });
      stash.lastTool = "createClinicalHandoff";
      stash.handoff = result;
      return {
        title: result.action.title,
        included: result.included,
        excluded: result.excluded,
        summary: result.lens.summary,
      };
    },
  });
}

export function createEngineeringDelegationTool(
  stash: AgentStash,
  sessionId: string,
  patientId: string,
) {
  return tool({
    description: `Grant a time-limited engineering debug view. Does not widen clinical access.`,
    inputSchema: z.object({
      minutes: z.number().int().min(5).max(120).default(30),
      reason: z.string().min(5),
    }),
    execute: async ({ minutes, reason }) => {
      const store = getStore();
      const encounters = await store.listEncounters(patientId);
      const delegation = await createEngineeringDelegation({
        sessionId,
        patientId,
        encounterId: encounters[0]?.id ?? null,
        minutes,
        reason,
      });
      stash.lastTool = "createEngineeringDelegation";
      stash.delegation = delegation;
      return {
        id: delegation.id,
        expiresAt: delegation.expiresAt,
        scope: delegation.scope,
      };
    },
  });
}

export function showAccessHistoryTool(stash: AgentStash, patientId: string) {
  return tool({
    description: `Show recent access history for this patient.`,
    inputSchema: z.object({}),
    execute: async () => {
      const timeline = await buildPatientTimeline(patientId, 10);
      stash.lastTool = "showAccessHistory";
      stash.timeline = timeline;
      return { entries: timeline.length };
    },
  });
}
