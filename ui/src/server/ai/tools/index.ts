import {
  createClinicalHandoffTool,
  createEngineeringDelegationTool,
  requestBreakGlassTool,
  showAccessHistoryTool,
} from "@/server/ai/tools/clinical-actions";
import { requestPatientContextTool } from "@/server/ai/tools/request-patient-context";
import { searchPopulationContextTool } from "@/server/ai/tools/search-population-context";
import type { AgentStash } from "@/server/ai/stash";

export function bindIrisTools(
  stash: AgentStash,
  sessionId: string,
  patientId: string,
) {
  return {
    searchPopulationContext: searchPopulationContextTool(stash),
    requestPatientContext: requestPatientContextTool(
      stash,
      sessionId,
      patientId,
    ),
    requestBreakGlass: requestBreakGlassTool(stash),
    createClinicalHandoff: createClinicalHandoffTool(
      stash,
      sessionId,
      patientId,
    ),
    createEngineeringDelegation: createEngineeringDelegationTool(
      stash,
      sessionId,
      patientId,
    ),
    showAccessHistory: showAccessHistoryTool(stash, patientId),
  };
}
