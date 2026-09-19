import type { PolicyRule } from "@/server/iris/types";

/**
 * The full authorization surface of the demo, as data.
 *
 * Nothing in this file is generated or influenced by a model. Grok can propose a
 * purpose; only these rules decide what that purpose is allowed to open.
 */
export const POLICY_RULES: PolicyRule[] = [
  {
    id: "physician_treatment",
    actorRole: "physician",
    purpose: "treatment",
    allowedTypes: [
      "name",
      "date_of_birth",
      "visit_reason",
      "vitals",
      "allergies",
      "medications",
      "cardiac_history",
      "diagnoses",
      "labs",
      "procedures",
      "clinical_note",
      "encounter_metadata",
    ],
    transformedTypes: {},
    denyReason: "Outside the current treatment context for this encounter.",
    requiresRelationship: true,
  },
  {
    id: "physician_medication_prescription",
    actorRole: "physician",
    purpose: "medication_prescription",
    allowedTypes: [
      "name",
      "allergies",
      "medications",
      "diagnoses",
      "labs",
      "cardiac_history",
    ],
    transformedTypes: {},
    denyReason:
      "Not required to check contraindications for a new prescription.",
    requiresRelationship: true,
  },
  {
    id: "physician_research",
    actorRole: "physician",
    purpose: "research",
    allowedTypes: [
      "name",
      "date_of_birth",
      "diagnoses",
      "medications",
      "procedures",
      "labs",
      "outcome",
    ],
    transformedTypes: {
      name: "pseudonymize",
      date_of_birth: "age_band",
      diagnoses: "category_only",
    },
    denyReason: "Not released for secondary research use.",
    requiresRelationship: false,
  },
  {
    id: "physician_emergency",
    actorRole: "physician",
    purpose: "emergency_treatment",
    allowedTypes: [
      "name",
      "date_of_birth",
      "phone",
      "visit_reason",
      "vitals",
      "allergies",
      "medications",
      "cardiac_history",
      "diagnoses",
      "labs",
      "procedures",
      "clinical_note",
      "psychiatric_note",
      "encounter_metadata",
      "outcome",
    ],
    transformedTypes: {},
    denyReason: "Not clinical context, so not opened even under break-glass.",
    requiresRelationship: false,
  },
  {
    id: "nurse_treatment",
    actorRole: "nurse",
    purpose: "treatment",
    allowedTypes: [
      "name",
      "date_of_birth",
      "visit_reason",
      "vitals",
      "allergies",
      "medications",
      "encounter_metadata",
    ],
    transformedTypes: {},
    denyReason: "Outside visit preparation for the current encounter.",
    requiresRelationship: true,
  },
  {
    id: "reception_scheduling",
    actorRole: "reception",
    purpose: "scheduling",
    allowedTypes: [
      "name",
      "date_of_birth",
      "phone",
      "address",
      "insurance",
      "appointment",
    ],
    transformedTypes: {},
    denyReason: "Clinical detail is not needed to check a patient in.",
    requiresRelationship: false,
  },
  {
    id: "engineer_debug",
    actorRole: "engineer",
    purpose: "engineering_debug",
    allowedTypes: ["technical_metadata", "encounter_metadata", "medications"],
    transformedTypes: {
      medications: "technical_shape",
    },
    denyReason: "Not required to debug the reported system fault.",
    requiresRelationship: false,
  },
];

export function findPolicyRule(
  rules: readonly PolicyRule[],
  actorRole: string,
  purpose: string,
): PolicyRule | null {
  return (
    rules.find(
      (rule) => rule.actorRole === actorRole && rule.purpose === purpose,
    ) ?? null
  );
}
