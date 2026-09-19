import type { HandoffResult } from "@/server/iris/actions";
import type { LensResult } from "@/server/iris/context";
import type { PopulationContextResult } from "@/server/iris/population-context";
import type { Delegation, FragmentType, Purpose } from "@/server/iris/types";
import type { PolicyCategoryView } from "@/lib/pipeline";

export interface AgentStash {
  utterance: string;
  clinicalSituation?: string;
  lastTool?: string;
  population?: PopulationContextResult;
  lens?: LensResult;
  policy?: PolicyCategoryView[];
  requestedContext?: FragmentType[];
  purpose?: Purpose;
  task?: string | null;
  answer?: string;
  answerSource?: string;
  breakGlass?: { requiresBreakGlass: true; message: string };
  handoff?: HandoffResult;
  delegation?: Delegation;
  timeline?: unknown;
}
