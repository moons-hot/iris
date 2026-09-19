import { createHash } from "node:crypto";

import type {
  Device,
  Encounter,
  FragmentType,
  Patient,
  Purpose,
  Sensitivity,
  User,
} from "@/server/iris/types";

/**
 * Every value in this file is synthetic. No real patient information is used
 * anywhere in Iris.
 */

export function demoDeviceSecret(deviceId: string): string {
  return createHash("sha256")
    .update(`iris-demo-secret:${deviceId}`)
    .digest("hex");
}

export const SEED_USERS: User[] = [
  {
    id: "DOC-001",
    fullName: "Dr. Maya Chen",
    role: "physician",
    department: "Cardiology",
  },
  {
    id: "DOC-002",
    fullName: "Dr. Priya Thomas",
    role: "physician",
    department: "Intensive Care",
  },
  {
    id: "DOC-003",
    fullName: "Dr. Luis Rivera",
    role: "physician",
    department: "Emergency",
  },
  {
    id: "NUR-014",
    fullName: "Jordan Lee",
    role: "nurse",
    department: "Cardiology",
  },
  {
    id: "REC-021",
    fullName: "Sarah Kim",
    role: "reception",
    department: "Scheduling",
  },
  {
    id: "ENG-007",
    fullName: "Alex Kim",
    role: "engineer",
    department: "Clinical Systems",
  },
  {
    id: "PAT-1048",
    fullName: "Maya Patel",
    role: "patient",
    department: "Patient portal",
  },
  {
    id: "PAT-2210",
    fullName: "Daniel Osei",
    role: "patient",
    department: "Patient portal",
  },
];

/**
 * Which record a patient account is the subject of.
 *
 * Patients authenticate as themselves and can only ever reach their own
 * timeline, so this is the one place that link is made. It is static demo data
 * rather than a schema column, so both stores read it the same way.
 */
export const PATIENT_ACCOUNTS: Record<string, string> = {
  "PAT-1048": "P1048",
  "PAT-2210": "P2210",
};

export function patientIdForActor(actorId: string): string | null {
  return PATIENT_ACCOUNTS[actorId] ?? null;
}

export const SEED_DEVICES: Device[] = [
  {
    id: "IRIS-0042",
    userId: "DOC-001",
    label: "Iris Key - Dr. Maya Chen",
    secretHex: demoDeviceSecret("IRIS-0042"),
  },
  {
    id: "IRIS-ENGINEER-07",
    userId: "ENG-007",
    label: "Iris Key - Alex Kim",
    secretHex: demoDeviceSecret("IRIS-ENGINEER-07"),
  },
  {
    id: "IRIS-0117",
    userId: "NUR-014",
    label: "Iris Key - Jordan Lee",
    secretHex: demoDeviceSecret("IRIS-0117"),
  },
  {
    id: "IRIS-0203",
    userId: "REC-021",
    label: "Iris Key - Sarah Kim",
    secretHex: demoDeviceSecret("IRIS-0203"),
  },
  // Same challenge-response path as a clinician's key, different subject.
  {
    id: "IRIS-PATIENT-1048",
    userId: "PAT-1048",
    label: "Patient card - Maya Patel",
    secretHex: demoDeviceSecret("IRIS-PATIENT-1048"),
  },
  {
    id: "IRIS-PATIENT-2210",
    userId: "PAT-2210",
    label: "Patient card - Daniel Osei",
    secretHex: demoDeviceSecret("IRIS-PATIENT-2210"),
  },
];

export const SEED_PATIENTS: Patient[] = [
  { id: "P1048", pseudonym: "Patient P1048", dateOfBirth: "1979-04-18" },
  { id: "P2210", pseudonym: "Patient P2210", dateOfBirth: "1992-11-02" },
  { id: "P3187", pseudonym: "Patient P3187", dateOfBirth: "1965-01-27" },
  { id: "P4402", pseudonym: "Patient P4402", dateOfBirth: "1988-03-14" },
  { id: "P5178", pseudonym: "Patient P5178", dateOfBirth: "1954-07-09" },
  { id: "P6023", pseudonym: "Patient P6023", dateOfBirth: "1971-12-30" },
  { id: "P6519", pseudonym: "Patient P6519", dateOfBirth: "2001-05-22" },
  { id: "P7744", pseudonym: "Patient P7744", dateOfBirth: "1946-09-03" },
  { id: "P8130", pseudonym: "Patient P8130", dateOfBirth: "1983-02-17" },
  { id: "P8291", pseudonym: "Patient P8291", dateOfBirth: "1995-10-11" },
  { id: "P9006", pseudonym: "Patient P9006", dateOfBirth: "1967-06-25" },
  { id: "P9412", pseudonym: "Patient P9412", dateOfBirth: "1979-11-08" },
];

export interface DirectoryEntry {
  firstName: string;
  lastName: string;
}

/**
 * Display names live outside the encrypted store only for patient lookup.
 *
 * Renata and Marcus Silva share a surname on purpose: a search for "silva"
 * has to be able to return more than one row.
 */
export const PATIENT_NAMES: Record<string, DirectoryEntry> = {
  P1048: { firstName: "Maya", lastName: "Patel" },
  P2210: { firstName: "Daniel", lastName: "Osei" },
  P3187: { firstName: "Renata", lastName: "Silva" },
  P4402: { firstName: "Marcus", lastName: "Silva" },
  P5178: { firstName: "Aisha", lastName: "Rahman" },
  P6023: { firstName: "Tomas", lastName: "Novak" },
  P6519: { firstName: "Grace", lastName: "Lin" },
  P7744: { firstName: "Ethan", lastName: "Brooks" },
  P8130: { firstName: "Priya", lastName: "Anand" },
  P8291: { firstName: "Nadia", lastName: "Okafor" },
  P9006: { firstName: "Lena", lastName: "Fischer" },
  P9412: { firstName: "Omar", lastName: "Haddad" },
};

export const PATIENT_DIRECTORY: Record<string, string> = Object.fromEntries(
  Object.entries(PATIENT_NAMES).map(([id, name]) => [
    id,
    `${name.firstName} ${name.lastName}`,
  ]),
);

/**
 * The Postgres path stores the name as a single encrypted fragment, so the
 * doctor APIs split it back apart rather than carry a second schema column.
 */
export function splitName(full: string): DirectoryEntry {
  const trimmed = full.trim();
  const cut = trimmed.lastIndexOf(" ");
  if (cut === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, cut),
    lastName: trimmed.slice(cut + 1),
  };
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export const SEED_ENCOUNTERS: Encounter[] = [
  {
    id: "E3391",
    patientId: "P1048",
    department: "Cardiology",
    reason: "Chest pain evaluation",
    startedAt: hoursAgo(3),
  },
  {
    id: "E2870",
    patientId: "P1048",
    department: "Cardiology",
    reason: "Post-procedure follow-up",
    startedAt: hoursAgo(26 * 24),
  },
  {
    id: "E5512",
    patientId: "P2210",
    department: "Primary Care",
    reason: "Annual physical",
    startedAt: hoursAgo(50),
  },
  {
    id: "E6104",
    patientId: "P3187",
    department: "Cardiology",
    reason: "Blood pressure review",
    startedAt: hoursAgo(8),
  },
  {
    id: "E6212",
    patientId: "P4402",
    department: "Cardiology",
    reason: "Hypertension follow-up",
    startedAt: hoursAgo(5),
  },
  {
    id: "E6330",
    patientId: "P5178",
    department: "Cardiology",
    reason: "Post-op wound check",
    startedAt: hoursAgo(11),
  },
  {
    id: "E6448",
    patientId: "P6023",
    department: "Cardiology",
    reason: "New-onset palpitations",
    startedAt: hoursAgo(2),
  },
  {
    id: "E6577",
    patientId: "P6519",
    department: "Cardiology",
    reason: "Exercise tolerance review",
    startedAt: hoursAgo(19),
  },
  {
    id: "E6690",
    patientId: "P7744",
    department: "Cardiology",
    reason: "Anticoagulation review",
    startedAt: hoursAgo(7),
  },
  {
    id: "E6805",
    patientId: "P8130",
    department: "Cardiology",
    reason: "Palpitations, thyroid workup",
    startedAt: hoursAgo(30),
  },
];

/**
 * DOC-001 is attending for eight patients. P2210, P8291, P9006 and P9412 have
 * no row here on purpose: they are the off-team patients the lookup surface and
 * break-glass flow are built around.
 */
export const SEED_RELATIONSHIPS: Array<{
  actorId: string;
  patientId: string;
  relationship: string;
}> = [
  { actorId: "DOC-001", patientId: "P1048", relationship: "attending" },
  { actorId: "DOC-001", patientId: "P3187", relationship: "attending" },
  { actorId: "DOC-001", patientId: "P4402", relationship: "attending" },
  { actorId: "DOC-001", patientId: "P5178", relationship: "attending" },
  { actorId: "DOC-001", patientId: "P6023", relationship: "attending" },
  { actorId: "DOC-001", patientId: "P6519", relationship: "attending" },
  { actorId: "DOC-001", patientId: "P7744", relationship: "attending" },
  { actorId: "DOC-001", patientId: "P8130", relationship: "attending" },
  { actorId: "NUR-014", patientId: "P1048", relationship: "assigned_nurse" },
];

export interface SeedFragment {
  id: string;
  patientId: string;
  encounterId: string | null;
  fragmentType: FragmentType;
  label: string;
  sensitivity: Sensitivity;
  purposeClasses: Purpose[];
  value: string;
}

const CHART_FRAGMENTS: SeedFragment[] = [
  {
    id: "F-P1048-name",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "name",
    label: "Patient name",
    sensitivity: "identifier",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "scheduling",
      "research",
      "emergency_treatment",
    ],
    value: "Maya Patel",
  },
  {
    id: "F-P1048-dob",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "date_of_birth",
    label: "Date of birth",
    sensitivity: "identifier",
    purposeClasses: [
      "treatment",
      "scheduling",
      "research",
      "emergency_treatment",
    ],
    value: "1979-04-18",
  },
  {
    id: "F-P1048-phone",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "phone",
    label: "Phone number",
    sensitivity: "identifier",
    purposeClasses: ["scheduling", "emergency_treatment"],
    value: "+1 (410) 555-0164",
  },
  {
    id: "F-P1048-address",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "address",
    label: "Home address",
    sensitivity: "identifier",
    purposeClasses: ["scheduling"],
    value: "1408 Parkview Terrace, Baltimore, MD 21218",
  },
  {
    id: "F-P1048-insurance",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "insurance",
    label: "Insurance",
    sensitivity: "administrative",
    purposeClasses: ["scheduling"],
    value: "Meridian Health PPO, member 44820193, group 5521",
  },
  {
    id: "F-P1048-appointment",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "appointment",
    label: "Upcoming appointment",
    sensitivity: "administrative",
    purposeClasses: ["scheduling"],
    value: "2026-09-24 09:20 - Cardiology follow-up, Clinic 3B",
  },
  {
    id: "F-P1048-visit-reason",
    patientId: "P1048",
    encounterId: "E3391",
    fragmentType: "visit_reason",
    label: "Reason for visit",
    sensitivity: "clinical",
    purposeClasses: ["treatment", "emergency_treatment"],
    value: "Central chest pain, 2 hours, radiating to left arm",
  },
  {
    id: "F-P1048-vitals",
    patientId: "P1048",
    encounterId: "E3391",
    fragmentType: "vitals",
    label: "Vitals",
    sensitivity: "clinical",
    purposeClasses: ["treatment", "emergency_treatment"],
    value: "BP 148/92, HR 104, RR 20, SpO2 96% on room air, temp 37.1C",
  },
  {
    id: "F-P1048-allergies",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "allergies",
    label: "Allergies",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "emergency_treatment",
    ],
    value: "NSAIDs - GI bleed 2021. Penicillin - rash.",
  },
  {
    id: "F-P1048-medications",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "medications",
    label: "Active medications",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "research",
      "engineering_debug",
      "emergency_treatment",
    ],
    value:
      "Warfarin 5mg daily\nMetoprolol 25mg twice daily\nAtorvastatin 40mg nightly",
  },
  {
    id: "F-P1048-cardiac-history",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "cardiac_history",
    label: "Cardiac history",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "emergency_treatment",
    ],
    value:
      "NSTEMI 2023, drug-eluting stent to LAD. Paroxysmal atrial fibrillation on anticoagulation.",
  },
  {
    id: "F-P1048-diagnoses",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "diagnoses",
    label: "Diagnoses",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "research",
      "emergency_treatment",
    ],
    value: "Stable angina pectoris (I20.9); Atrial fibrillation (I48.0)",
  },
  {
    id: "F-P1048-labs",
    patientId: "P1048",
    encounterId: "E3391",
    fragmentType: "labs",
    label: "Relevant labs",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "research",
      "emergency_treatment",
    ],
    value:
      "Troponin T 0.04 ng/mL (borderline), INR 2.8, Hgb 11.9 g/dL, eGFR 74",
  },
  {
    id: "F-P1048-procedures",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "procedures",
    label: "Prior procedures",
    sensitivity: "clinical",
    purposeClasses: ["treatment", "research", "emergency_treatment"],
    value: "PCI with DES to LAD (2023-06-11); TTE (2025-02-03), EF 52%",
  },
  {
    id: "F-P1048-clinical-note",
    patientId: "P1048",
    encounterId: "E3391",
    fragmentType: "clinical_note",
    label: "Cardiology note",
    sensitivity: "clinical",
    purposeClasses: ["treatment", "emergency_treatment"],
    value:
      "Pain reproducible on exertion, relieved by rest. ECG without acute ST elevation. Plan: serial troponins, continue anticoagulation, stress testing if second troponin negative.",
  },
  {
    id: "F-P1048-psych-note",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "psychiatric_note",
    label: "Behavioural health note",
    sensitivity: "highly_sensitive",
    purposeClasses: ["emergency_treatment"],
    value:
      "Treated for generalised anxiety disorder. Sertraline 50mg daily. Counselling every two weeks.",
  },
  {
    id: "F-P1048-billing",
    patientId: "P1048",
    encounterId: "E3391",
    fragmentType: "billing",
    label: "Billing detail",
    sensitivity: "financial",
    purposeClasses: [],
    value: "Claim 88120-A, $2,480 outstanding, card ending 4417",
  },
  {
    id: "F-P1048-encounter-meta",
    patientId: "P1048",
    encounterId: "E3391",
    fragmentType: "encounter_metadata",
    label: "Encounter metadata",
    sensitivity: "administrative",
    purposeClasses: ["treatment", "engineering_debug", "emergency_treatment"],
    value:
      "Encounter E3391, Cardiology, opened 2026-09-19, source: ED triage transfer",
  },
  {
    id: "F-P1048-technical",
    patientId: "P1048",
    encounterId: "E3391",
    fragmentType: "technical_metadata",
    label: "System diagnostics",
    sensitivity: "technical",
    purposeClasses: ["engineering_debug"],
    value:
      "med_reconciliation job 5512 returned 2 duplicate rows for encounter E3391; source feed HL7v2 RXA segment replayed at 04:11Z; constraint med_unique_encounter_drug absent",
  },
  {
    id: "F-P1048-outcome",
    patientId: "P1048",
    encounterId: null,
    fragmentType: "outcome",
    label: "Outcome",
    sensitivity: "clinical",
    purposeClasses: ["research", "emergency_treatment"],
    value:
      "No MACE at 12 months post-PCI. Two ED visits for chest pain, both non-ischaemic.",
  },

  {
    id: "F-P2210-name",
    patientId: "P2210",
    encounterId: null,
    fragmentType: "name",
    label: "Patient name",
    sensitivity: "identifier",
    purposeClasses: [
      "treatment",
      "scheduling",
      "research",
      "emergency_treatment",
    ],
    value: "Daniel Osei",
  },
  {
    id: "F-P2210-dob",
    patientId: "P2210",
    encounterId: null,
    fragmentType: "date_of_birth",
    label: "Date of birth",
    sensitivity: "identifier",
    purposeClasses: [
      "treatment",
      "scheduling",
      "research",
      "emergency_treatment",
    ],
    value: "1992-11-02",
  },
  {
    id: "F-P2210-allergies",
    patientId: "P2210",
    encounterId: null,
    fragmentType: "allergies",
    label: "Allergies",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "emergency_treatment",
    ],
    value: "No known drug allergies",
  },
  {
    id: "F-P2210-medications",
    patientId: "P2210",
    encounterId: null,
    fragmentType: "medications",
    label: "Active medications",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "research",
      "emergency_treatment",
    ],
    value: "Lisinopril 10mg daily",
  },
  {
    id: "F-P2210-billing",
    patientId: "P2210",
    encounterId: null,
    fragmentType: "billing",
    label: "Billing detail",
    sensitivity: "financial",
    purposeClasses: [],
    value: "Claim 77410-C, $180 outstanding",
  },

  {
    id: "F-P3187-name",
    patientId: "P3187",
    encounterId: null,
    fragmentType: "name",
    label: "Patient name",
    sensitivity: "identifier",
    purposeClasses: [
      "treatment",
      "scheduling",
      "research",
      "emergency_treatment",
    ],
    value: "Renata Silva",
  },
  {
    id: "F-P3187-dob",
    patientId: "P3187",
    encounterId: null,
    fragmentType: "date_of_birth",
    label: "Date of birth",
    sensitivity: "identifier",
    purposeClasses: [
      "treatment",
      "scheduling",
      "research",
      "emergency_treatment",
    ],
    value: "1965-01-27",
  },
  {
    id: "F-P3187-medications",
    patientId: "P3187",
    encounterId: null,
    fragmentType: "medications",
    label: "Active medications",
    sensitivity: "clinical",
    purposeClasses: [
      "treatment",
      "medication_prescription",
      "research",
      "emergency_treatment",
    ],
    value: "Metformin 500mg twice daily\nAmlodipine 5mg daily",
  },
  {
    id: "F-P3187-visit-reason",
    patientId: "P3187",
    encounterId: "E6104",
    fragmentType: "visit_reason",
    label: "Reason for visit",
    sensitivity: "clinical",
    purposeClasses: ["treatment", "emergency_treatment"],
    value: "Blood pressure above target on current dose",
  },
  {
    id: "F-P3187-psych-note",
    patientId: "P3187",
    encounterId: null,
    fragmentType: "psychiatric_note",
    label: "Behavioural health note",
    sensitivity: "highly_sensitive",
    purposeClasses: ["emergency_treatment"],
    value: "History of depressive episode 2019, no current treatment.",
  },
];

const IDENTIFIER_PURPOSES: Purpose[] = [
  "treatment",
  "scheduling",
  "research",
  "emergency_treatment",
];

/**
 * The other patients exist so the care-team list and the off-list lookup are
 * real rather than a single row. Only P1048 carries a full chart; everyone else
 * gets the three fields a list row and a chart header actually need.
 */
const MINIMAL_PATIENTS: Array<{
  patientId: string;
  encounterId: string | null;
  visitReason: string;
}> = [
  {
    patientId: "P4402",
    encounterId: "E6212",
    visitReason: "Home readings 150/95 despite amlodipine",
  },
  {
    patientId: "P5178",
    encounterId: "E6330",
    visitReason: "Sternotomy wound review, day 12",
  },
  {
    patientId: "P6023",
    encounterId: "E6448",
    visitReason: "Intermittent palpitations for two weeks",
  },
  {
    patientId: "P6519",
    encounterId: "E6577",
    visitReason: "Breathless on stairs since a chest infection",
  },
  {
    patientId: "P7744",
    encounterId: "E6690",
    visitReason: "Warfarin dosing review, INR unstable",
  },
  {
    patientId: "P8130",
    encounterId: "E6805",
    visitReason: "Palpitations with weight loss, thyroid workup",
  },
  {
    patientId: "P8291",
    encounterId: null,
    visitReason: "Ankle swelling, cause unclear",
  },
  {
    patientId: "P9006",
    encounterId: null,
    visitReason: "Chest tightness on exertion",
  },
  {
    patientId: "P9412",
    encounterId: null,
    visitReason: "Syncope while driving",
  },
];

function minimalFragments(entry: (typeof MINIMAL_PATIENTS)[number]): SeedFragment[] {
  const { patientId, encounterId, visitReason } = entry;
  const patient = SEED_PATIENTS.find((candidate) => candidate.id === patientId)!;
  const name = PATIENT_NAMES[patientId]!;

  return [
    {
      id: `F-${patientId}-name`,
      patientId,
      encounterId: null,
      fragmentType: "name",
      label: "Patient name",
      sensitivity: "identifier",
      purposeClasses: IDENTIFIER_PURPOSES,
      value: `${name.firstName} ${name.lastName}`,
    },
    {
      id: `F-${patientId}-dob`,
      patientId,
      encounterId: null,
      fragmentType: "date_of_birth",
      label: "Date of birth",
      sensitivity: "identifier",
      purposeClasses: IDENTIFIER_PURPOSES,
      value: patient.dateOfBirth,
    },
    {
      id: `F-${patientId}-visit-reason`,
      patientId,
      encounterId,
      fragmentType: "visit_reason",
      label: "Reason for visit",
      sensitivity: "clinical",
      purposeClasses: ["treatment", "emergency_treatment"],
      value: visitReason,
    },
  ];
}

export const SEED_FRAGMENTS: SeedFragment[] = [
  ...CHART_FRAGMENTS,
  ...MINIMAL_PATIENTS.flatMap(minimalFragments),
];
