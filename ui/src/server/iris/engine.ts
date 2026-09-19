import { findPolicyRule } from "@/server/iris/policy-rules";
import type {
  Decision,
  Delegation,
  FragmentMeta,
  FragmentType,
  PolicyRule,
  Purpose,
  Role,
  Transform,
} from "@/server/iris/types";

export const PURPOSE_LABELS: Record<Purpose, string> = {
  treatment: "active treatment",
  medication_prescription: "medication prescribing",
  scheduling: "scheduling and check-in",
  research: "secondary research use",
  engineering_debug: "technical debugging",
  emergency_treatment: "emergency treatment",
};

export interface EvaluateInput {
  actor: { id: string; role: Role };
  patientId: string;
  purpose: Purpose;
  task?: string | null;
  fragments: readonly FragmentMeta[];
  rules: readonly PolicyRule[];
  hasRelationship: boolean;
  breakGlassActive?: boolean;
  delegation?: Delegation | null;
  now?: Date;
}

export interface FragmentDecision {
  fragment: FragmentMeta;
  decision: Decision;
  transform: Transform;
  reason: string;
}

export interface PolicyDecision {
  purpose: Purpose;
  effectivePurpose: Purpose;
  task: string | null;
  breakGlass: boolean;
  ruleId: string | null;
  fragments: FragmentDecision[];
  /** The only fragment ids the crypto layer will decrypt for this request. */
  allowedIds: string[];
  allowedCount: number;
  restrictedCount: number;
  summary: string;
}

function denyAll(
  fragments: readonly FragmentMeta[],
  reason: string,
): FragmentDecision[] {
  return fragments.map((fragment) => ({
    fragment,
    decision: "deny" as const,
    transform: "none" as const,
    reason,
  }));
}

function denialReason(
  fragment: FragmentMeta,
  purpose: Purpose,
  fallback: string,
): string {
  const label = PURPOSE_LABELS[purpose];
  switch (fragment.sensitivity) {
    case "financial":
      return `Billing information is not part of ${label}.`;
    case "highly_sensitive":
      return `Highly sensitive note, outside the current ${label} context.`;
    case "identifier":
      return `Direct identifiers are not released for ${label}.`;
    case "technical":
      return `System diagnostics are not part of ${label}.`;
    default:
      return fallback;
  }
}

function delegationActive(delegation: Delegation, now: Date): boolean {
  if (delegation.revokedAt) return false;
  return new Date(delegation.expiresAt).getTime() > now.getTime();
}

/**
 * The single authorization decision point.
 *
 * Pure function: same inputs always produce the same allow/deny set, which is
 * what lets us log a decision and defend it afterwards.
 */
export function evaluate(input: EvaluateInput): PolicyDecision {
  const now = input.now ?? new Date();
  const breakGlass = input.breakGlassActive === true;
  const effectivePurpose: Purpose = breakGlass
    ? "emergency_treatment"
    : input.purpose;
  const task = input.task ?? null;

  const base = {
    purpose: input.purpose,
    effectivePurpose,
    task,
    breakGlass,
  };

  const rule = findPolicyRule(input.rules, input.actor.role, effectivePurpose);
  if (!rule) {
    const reason = `No policy grants ${input.actor.role} access for ${PURPOSE_LABELS[effectivePurpose]}.`;
    return finalize({ ...base, ruleId: null }, denyAll(input.fragments, reason));
  }

  // Break-glass deliberately bypasses the relationship gate. An authenticated
  // clinician in an emergency is never blocked; the event is flagged instead.
  if (rule.requiresRelationship && !input.hasRelationship && !breakGlass) {
    const reason =
      "No care relationship with this patient is on record for the current context.";
    return finalize(
      { ...base, ruleId: rule.id },
      denyAll(input.fragments, reason),
    );
  }

  // Engineers only ever see data through a scoped, time-limited delegation
  // created by a clinician. Role alone grants nothing.
  let scopeLimit: FragmentType[] | null = null;
  if (input.actor.role === "engineer") {
    const delegation = input.delegation ?? null;
    const usable =
      delegation !== null &&
      delegation.patientId === input.patientId &&
      delegation.recipientRole === "engineer" &&
      delegationActive(delegation, now);
    if (!usable) {
      const reason =
        "No active delegation covers this patient. Ask a clinician to grant a scoped debug view.";
      return finalize(
        { ...base, ruleId: rule.id },
        denyAll(input.fragments, reason),
      );
    }
    scopeLimit = delegation.scope;
  }

  const decisions = input.fragments.map<FragmentDecision>((fragment) => {
    const inRule = rule.allowedTypes.includes(fragment.fragmentType);
    const inScope =
      scopeLimit === null || scopeLimit.includes(fragment.fragmentType);

    if (!inRule || !inScope) {
      const reason = !inScope
        ? "Outside the scope of the delegation that granted this view."
        : denialReason(fragment, effectivePurpose, rule.denyReason);
      return { fragment, decision: "deny", transform: "none", reason };
    }

    // Defence in depth: the rule must allow the field *and* the field must be
    // classified for this purpose. Policy and data classification have to agree.
    if (
      fragment.purposeClasses.length > 0 &&
      !fragment.purposeClasses.includes(effectivePurpose)
    ) {
      return {
        fragment,
        decision: "deny",
        transform: "none",
        reason: `This field is not classified for ${PURPOSE_LABELS[effectivePurpose]}.`,
      };
    }

    const transform = rule.transformedTypes[fragment.fragmentType] ?? "none";
    return {
      fragment,
      decision: transform === "none" ? "allow" : "allow_transformed",
      transform,
      reason:
        transform === "none"
          ? `Required for ${PURPOSE_LABELS[effectivePurpose]}.`
          : `Released for ${PURPOSE_LABELS[effectivePurpose]} in reduced form.`,
    };
  });

  return finalize({ ...base, ruleId: rule.id }, decisions);
}

function finalize(
  base: {
    purpose: Purpose;
    effectivePurpose: Purpose;
    task: string | null;
    breakGlass: boolean;
    ruleId: string | null;
  },
  fragments: FragmentDecision[],
): PolicyDecision {
  const allowed = fragments.filter((entry) => entry.decision !== "deny");
  const restricted = fragments.length - allowed.length;
  return {
    ...base,
    fragments,
    allowedIds: allowed.map((entry) => entry.fragment.id),
    allowedCount: allowed.length,
    restrictedCount: restricted,
    summary: `${allowed.length} field${allowed.length === 1 ? "" : "s"} authorized for ${PURPOSE_LABELS[base.effectivePurpose]}, ${restricted} restricted.`,
  };
}
