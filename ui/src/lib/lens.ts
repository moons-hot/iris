import type { FragmentView } from "@/components/iris/fragment-card";

export type { FragmentView };

/** The server's answer to one (patient, purpose) policy evaluation. */
export interface Lens {
  sessionId: string;
  actor: { id: string; name: string; role: string; department: string };
  patient: { id: string; displayName: string; pseudonym: string };
  purpose: string;
  effectivePurpose: string;
  purposeLabel: string;
  task: string | null;
  breakGlass: boolean;
  breakGlassExpiresAt: string | null;
  breakGlassReason: string | null;
  fragments: FragmentView[];
  allowedCount: number;
  restrictedCount: number;
  summary: string;
  ruleId: string | null;
}
