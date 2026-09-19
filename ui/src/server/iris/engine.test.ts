import { describe, expect, it } from "vitest";

import { chainEvents, verifyChain } from "@/server/iris/audit";
import {
  decryptFragment,
  encryptFragmentValue,
  verifyDeviceResponse,
  deviceResponse,
} from "@/server/iris/crypto";
import { evaluate } from "@/server/iris/engine";
import { POLICY_RULES } from "@/server/iris/policy-rules";
import { SEED_FRAGMENTS } from "@/server/iris/seed-data";
import { applyTransform } from "@/server/iris/transforms";
import type {
  Delegation,
  FragmentMeta,
  Patient,
  Purpose,
} from "@/server/iris/types";

const PATIENT: Patient = {
  id: "P1048",
  pseudonym: "Patient P1048",
  dateOfBirth: "1979-04-18",
};

const FRAGMENTS: FragmentMeta[] = SEED_FRAGMENTS.filter(
  (fragment) => fragment.patientId === "P1048",
).map((fragment) => ({
  id: fragment.id,
  patientId: fragment.patientId,
  encounterId: fragment.encounterId,
  fragmentType: fragment.fragmentType,
  label: fragment.label,
  sensitivity: fragment.sensitivity,
  purposeClasses: fragment.purposeClasses,
  updatedAt: "2026-09-19T00:00:00.000Z",
}));

function decide(
  purpose: Purpose,
  overrides: Partial<Parameters<typeof evaluate>[0]> = {},
) {
  return evaluate({
    actor: { id: "DOC-001", role: "physician" },
    patientId: "P1048",
    purpose,
    fragments: FRAGMENTS,
    rules: POLICY_RULES,
    hasRelationship: true,
    ...overrides,
  });
}

function allowedTypes(decision: ReturnType<typeof evaluate>): string[] {
  return decision.fragments
    .filter((entry) => entry.decision !== "deny")
    .map((entry) => entry.fragment.fragmentType)
    .sort();
}

describe("purpose-bound authorization", () => {
  it("gives a treating physician the cardiac picture but not unrelated records", () => {
    const decision = decide("treatment");
    const allowed = allowedTypes(decision);

    expect(allowed).toContain("medications");
    expect(allowed).toContain("allergies");
    expect(allowed).toContain("cardiac_history");
    expect(allowed).toContain("labs");
    expect(allowed).not.toContain("psychiatric_note");
    expect(allowed).not.toContain("billing");
    expect(allowed).not.toContain("address");
  });

  it("changes the view when only the purpose changes", () => {
    const treatment = decide("treatment");
    const research = decide("research");

    // Same actor, same role, same patient. Only the purpose differs.
    expect(allowedTypes(treatment)).not.toEqual(allowedTypes(research));

    const researchName = research.fragments.find(
      (entry) => entry.fragment.fragmentType === "name",
    );
    const researchDob = research.fragments.find(
      (entry) => entry.fragment.fragmentType === "date_of_birth",
    );
    expect(researchName?.transform).toBe("pseudonymize");
    expect(researchDob?.transform).toBe("age_band");

    const researchAllowed = allowedTypes(research);
    expect(researchAllowed).not.toContain("phone");
    expect(researchAllowed).not.toContain("address");
    expect(researchAllowed).not.toContain("clinical_note");
    expect(researchAllowed).toContain("outcome");
  });

  it("reduces identifiers instead of dropping them for research", () => {
    const research = decide("research");
    const name = research.fragments.find(
      (entry) => entry.fragment.fragmentType === "name",
    )!;
    expect(applyTransform("Maya Patel", name.transform, PATIENT)).toBe(
      "Patient P1048",
    );
    const dob = research.fragments.find(
      (entry) => entry.fragment.fragmentType === "date_of_birth",
    )!;
    expect(
      applyTransform("1979-04-18", dob.transform, PATIENT, new Date("2026-09-19")),
    ).toBe("Age 45-50");
  });

  it("limits a prescribing check to contraindication data", () => {
    const allowed = allowedTypes(decide("medication_prescription"));
    expect(allowed).toContain("allergies");
    expect(allowed).toContain("medications");
    expect(allowed).not.toContain("vitals");
    expect(allowed).not.toContain("clinical_note");
  });

  it("keeps clinical detail away from a scheduling purpose", () => {
    const decision = evaluate({
      actor: { id: "REC-021", role: "reception" },
      patientId: "P1048",
      purpose: "scheduling",
      fragments: FRAGMENTS,
      rules: POLICY_RULES,
      hasRelationship: false,
    });
    const allowed = allowedTypes(decision);
    expect(allowed).toEqual([
      "address",
      "appointment",
      "date_of_birth",
      "insurance",
      "name",
      "phone",
    ]);
    expect(allowed).not.toContain("diagnoses");
  });

  it("explains every restriction in words a human can read", () => {
    const decision = decide("treatment");
    for (const entry of decision.fragments) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
    const psych = decision.fragments.find(
      (entry) => entry.fragment.fragmentType === "psychiatric_note",
    )!;
    expect(psych.reason).toMatch(/outside the current active treatment context/i);
  });
});

describe("break-glass", () => {
  it("opens expanded clinical context and is never refused", () => {
    const emergency = decide("treatment", { breakGlassActive: true });
    const allowed = allowedTypes(emergency);
    expect(emergency.breakGlass).toBe(true);
    expect(emergency.effectivePurpose).toBe("emergency_treatment");
    expect(allowed).toContain("psychiatric_note");
    expect(allowed).toContain("medications");
  });

  it("works even with no care relationship on record", () => {
    const blocked = decide("treatment", { hasRelationship: false });
    expect(blocked.allowedCount).toBe(0);

    const emergency = decide("treatment", {
      hasRelationship: false,
      breakGlassActive: true,
    });
    expect(emergency.allowedCount).toBeGreaterThan(0);
  });

  it("still withholds billing, because an emergency is clinical", () => {
    const emergency = decide("treatment", { breakGlassActive: true });
    expect(allowedTypes(emergency)).not.toContain("billing");
  });
});

describe("engineer delegation", () => {
  const delegation: Delegation = {
    id: "dlg_1",
    createdBy: "DOC-001",
    recipientRole: "engineer",
    patientId: "P1048",
    encounterId: "E3391",
    purpose: "engineering_debug",
    scope: ["technical_metadata", "encounter_metadata", "medications"],
    reason: "Duplicate medication rows",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
    revokedAt: null,
  };

  function engineerDecision(withDelegation: Delegation | null) {
    return evaluate({
      actor: { id: "ENG-007", role: "engineer" },
      patientId: "P1048",
      purpose: "engineering_debug",
      fragments: FRAGMENTS,
      rules: POLICY_RULES,
      hasRelationship: false,
      delegation: withDelegation,
    });
  }

  it("grants nothing on role alone", () => {
    const decision = engineerDecision(null);
    expect(decision.allowedCount).toBe(0);
    expect(decision.fragments[0]?.reason).toMatch(/no active delegation/i);
  });

  it("grants only the delegated scope, with medications reduced to shape", () => {
    const decision = engineerDecision(delegation);
    const allowed = allowedTypes(decision);
    expect(allowed).toEqual([
      "encounter_metadata",
      "medications",
      "technical_metadata",
    ]);
    const meds = decision.fragments.find(
      (entry) => entry.fragment.fragmentType === "medications",
    )!;
    expect(meds.transform).toBe("technical_shape");
    expect(
      applyTransform("Warfarin 5mg daily", meds.transform, PATIENT),
    ).not.toContain("Warfarin");
  });

  it("expires with the delegation", () => {
    const decision = engineerDecision({
      ...delegation,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(decision.allowedCount).toBe(0);
  });
});

describe("encryption boundary", () => {
  it("refuses to decrypt a fragment outside the current decision", () => {
    const encrypted = encryptFragmentValue("P1048", "allergies", "NSAIDs");
    const cipher = {
      id: "F-P1048-allergies",
      patientId: "P1048",
      fragmentType: "allergies" as const,
      ...encrypted,
    };

    expect(decryptFragment(cipher, new Set([cipher.id]))).toBe("NSAIDs");
    expect(() => decryptFragment(cipher, new Set<string>())).toThrow(
      /not in the current policy decision/i,
    );
  });

  it("detects a fragment moved to another patient", () => {
    const encrypted = encryptFragmentValue("P1048", "allergies", "NSAIDs");
    const moved = {
      id: "f1",
      patientId: "P2210",
      fragmentType: "allergies" as const,
      ...encrypted,
    };
    expect(() => decryptFragment(moved, new Set(["f1"]))).toThrow();
  });
});

describe("audit trail", () => {
  it("chains events and detects tampering", () => {
    const events = chainEvents(null, [
      {
        actorId: "DOC-001",
        actorRole: "physician",
        deviceId: "IRIS-0042",
        patientId: "P1048",
        encounterId: null,
        sessionId: "ses_1",
        purpose: "treatment",
        task: null,
        resourceType: "patient_context",
        decision: "allow",
        reason: null,
        breakGlass: false,
        latencyMs: 12,
        metadata: {},
      },
      {
        actorId: "DOC-001",
        actorRole: "physician",
        deviceId: "IRIS-0042",
        patientId: "P1048",
        encounterId: null,
        sessionId: "ses_1",
        purpose: "emergency_treatment",
        task: null,
        resourceType: "expanded_clinical_record",
        decision: "allow",
        reason: "Break glass",
        breakGlass: true,
        latencyMs: 9,
        metadata: {},
      },
    ]);

    expect(verifyChain(events)).toBe(true);

    const tampered = structuredClone(events);
    tampered[0]!.purpose = "research";
    expect(verifyChain(tampered)).toBe(false);
  });
});

describe("device challenge-response", () => {
  it("accepts the right response and rejects a wrong one", () => {
    const secret = "a".repeat(64);
    const nonce = "nonce-123";
    expect(
      verifyDeviceResponse(secret, nonce, deviceResponse(secret, nonce)),
    ).toBe(true);
    expect(verifyDeviceResponse(secret, nonce, "00".repeat(32))).toBe(false);
    expect(verifyDeviceResponse(secret, nonce, "short")).toBe(false);
  });
});
