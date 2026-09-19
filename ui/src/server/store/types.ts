import type {
  AccessEvent,
  AccessEventInput,
  Delegation,
  Device,
  Encounter,
  FragmentCipher,
  FragmentMeta,
  FragmentType,
  GeneratedAction,
  Patient,
  PolicyRule,
  Purpose,
  Role,
  Session,
  User,
} from "@/server/iris/types";

export interface PatientSummary {
  id: string;
  displayName: string;
  pseudonym: string;
}

export interface PurposeShare {
  purpose: string;
  count: number;
  share: number;
}

export interface Anomaly {
  actorId: string;
  actorName: string;
  overrides: number;
  departments: string[];
}

export interface DashboardStats {
  source: "tiger" | "memory";
  totalEvents: number;
  today: {
    total: number;
    allowed: number;
    restricted: number;
    denied: number;
    breakGlass: number;
  };
  byPurpose: PurposeShare[];
  breakGlass: AccessEvent[];
  recent: AccessEvent[];
  anomalies: Anomaly[];
  chainVerified: boolean;
}

export interface NewFragment {
  patientId: string;
  encounterId: string | null;
  fragmentType: FragmentType;
  label: string;
  sensitivity: FragmentMeta["sensitivity"];
  purposeClasses: Purpose[];
  value: string;
}

export interface IrisStore {
  readonly kind: "tiger" | "memory";

  listPolicies(): Promise<PolicyRule[]>;

  getDeviceWithUser(
    deviceId: string,
  ): Promise<{ device: Device; user: User } | null>;
  getUser(userId: string): Promise<User | null>;
  listDevices(): Promise<Device[]>;

  listPatients(): Promise<PatientSummary[]>;
  getPatient(patientId: string): Promise<Patient | null>;
  getPatientDisplayName(patientId: string): Promise<string>;
  listEncounters(patientId: string): Promise<Encounter[]>;
  hasRelationship(actorId: string, patientId: string): Promise<boolean>;

  listFragmentMeta(patientId: string): Promise<FragmentMeta[]>;
  /** Loads ciphertext for the given ids only. Denied fragments are never fetched. */
  loadCiphertexts(fragmentIds: readonly string[]): Promise<FragmentCipher[]>;
  upsertFragment(fragment: NewFragment): Promise<FragmentMeta>;

  createSession(input: {
    actorId: string;
    deviceId: string;
    purpose: Purpose | null;
  }): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  updateSession(
    sessionId: string,
    patch: Partial<
      Pick<
        Session,
        | "purpose"
        | "task"
        | "breakGlassUntil"
        | "breakGlassReason"
        | "lastPresenceAt"
        | "endedAt"
        | "endReason"
      >
    >,
  ): Promise<Session | null>;

  createDelegation(input: {
    createdBy: string;
    recipientRole: Role;
    patientId: string;
    encounterId: string | null;
    purpose: Purpose;
    scope: FragmentType[];
    reason: string;
    expiresAt: string;
  }): Promise<Delegation>;
  listDelegationsForRole(recipientRole: Role): Promise<Delegation[]>;

  createGeneratedAction(input: Omit<GeneratedAction, "id" | "createdAt">): Promise<GeneratedAction>;
  listGeneratedActions(limit?: number): Promise<GeneratedAction[]>;

  appendEvents(inputs: readonly AccessEventInput[]): Promise<AccessEvent[]>;
  listEvents(filter?: {
    patientId?: string;
    actorId?: string;
    limit?: number;
  }): Promise<AccessEvent[]>;
  dashboard(): Promise<DashboardStats>;
}
