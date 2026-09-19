export const ROLES = [
  "physician",
  "nurse",
  "reception",
  "engineer",
  "compliance",
  /** The person the record is about. Never granted a policy rule. */
  "patient",
] as const;

export type Role = (typeof ROLES)[number];

export const PURPOSES = [
  "treatment",
  "medication_prescription",
  "scheduling",
  "research",
  "engineering_debug",
  "emergency_treatment",
] as const;

export type Purpose = (typeof PURPOSES)[number];

export const FRAGMENT_TYPES = [
  "name",
  "date_of_birth",
  "phone",
  "address",
  "insurance",
  "appointment",
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
  "billing",
  "encounter_metadata",
  "technical_metadata",
  "outcome",
] as const;

export type FragmentType = (typeof FRAGMENT_TYPES)[number];

export type Sensitivity =
  | "identifier"
  | "administrative"
  | "clinical"
  | "highly_sensitive"
  | "financial"
  | "technical";

/**
 * Transforms run after decryption, on the server, and only for fragments the
 * policy engine already allowed. They are how one encrypted record can present
 * as different lenses without a second copy of the data.
 */
export type Transform =
  | "none"
  | "pseudonymize"
  | "age_band"
  | "category_only"
  | "coarse_date"
  | "technical_shape";

export type Decision = "allow" | "allow_transformed" | "deny";

export interface User {
  id: string;
  fullName: string;
  role: Role;
  department: string;
}

export interface Device {
  id: string;
  userId: string;
  label: string;
  secretHex: string;
}

export interface Patient {
  id: string;
  pseudonym: string;
  dateOfBirth: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  department: string;
  reason: string;
  startedAt: string;
}

/** Metadata only. Deliberately carries no ciphertext so callers cannot decrypt by accident. */
export interface FragmentMeta {
  id: string;
  patientId: string;
  encounterId: string | null;
  fragmentType: FragmentType;
  label: string;
  sensitivity: Sensitivity;
  purposeClasses: Purpose[];
  updatedAt: string;
}

export interface FragmentCipher {
  id: string;
  patientId: string;
  fragmentType: FragmentType;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export interface Delegation {
  id: string;
  createdBy: string;
  recipientRole: Role;
  patientId: string;
  encounterId: string | null;
  purpose: Purpose;
  scope: FragmentType[];
  reason: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface Session {
  id: string;
  actorId: string;
  deviceId: string;
  purpose: Purpose | null;
  task: string | null;
  breakGlassUntil: string | null;
  breakGlassReason: string | null;
  createdAt: string;
  lastPresenceAt: string;
  endedAt: string | null;
  endReason: string | null;
}

export interface GeneratedAction {
  id: string;
  actionType: string;
  actorId: string;
  patientId: string | null;
  encounterId: string | null;
  title: string;
  body: Record<string, unknown>;
  included: string[];
  excluded: string[];
  createdAt: string;
}

export interface AccessEvent {
  time: string;
  eventId: string;
  actorId: string | null;
  actorRole: string | null;
  deviceId: string | null;
  patientId: string | null;
  encounterId: string | null;
  sessionId: string | null;
  purpose: string | null;
  task: string | null;
  resourceType: string | null;
  decision: string;
  reason: string | null;
  breakGlass: boolean;
  latencyMs: number | null;
  metadata: Record<string, unknown>;
  previousEventHash: string | null;
  eventHash: string;
}

export type AccessEventInput = Omit<
  AccessEvent,
  "eventId" | "eventHash" | "previousEventHash" | "time"
> & {
  time?: string;
  eventId?: string;
};

export interface PolicyRule {
  id: string;
  actorRole: Role;
  purpose: Purpose;
  allowedTypes: FragmentType[];
  transformedTypes: Partial<Record<FragmentType, Transform>>;
  denyReason: string;
  requiresRelationship: boolean;
}
