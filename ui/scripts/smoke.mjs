/**
 * Walks the judge demo end to end against a running dev server.
 *
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

let failures = 0;

function check(label, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`${status}  ${label}${detail ? ` - ${detail}` : ""}`);
}

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function get(path) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: await response.json() };
}

function types(lens, predicate = () => true) {
  return lens.fragments
    .filter((fragment) => predicate(fragment))
    .map((fragment) => fragment.fragmentType)
    .sort();
}

function allowed(lens) {
  return types(lens, (fragment) => fragment.decision !== "deny");
}

async function authenticate(deviceId) {
  const challenge = await post("/api/auth/challenge", {
    deviceId,
    simulated: true,
  });
  const verified = await post("/api/auth/verify", {
    challengeId: challenge.body.challengeId,
    simulate: true,
  });
  return verified.body;
}

async function main() {
  console.log(`\nIris smoke test against ${base}\n`);

  // Scene 1: hardware authentication.
  const rejected = await post("/api/auth/challenge", { deviceId: "IRIS-NOPE" });
  check("unregistered Iris Key is rejected", rejected.status === 404);

  const doctor = await authenticate("IRIS-0042");
  check(
    "IRIS-0042 authenticates as Dr. Maya Chen",
    doctor.actor?.name === "Dr. Maya Chen" && doctor.actor?.role === "physician",
    doctor.actor?.name,
  );
  const sessionId = doctor.sessionId;

  // Presence beat keeps the session alive.
  const beat = await post("/api/session/presence", {
    sessionId,
    simulate: true,
  });
  check("presence beat keeps the session alive", beat.body.alive === true);

  // Scene 2: same doctor, same patient, different purpose.
  const treatment = await post("/api/context", {
    sessionId,
    patientId: "P1048",
    purpose: "treatment",
  });
  const treatmentAllowed = allowed(treatment.body.lens);
  check(
    "treatment lens includes cardiac context",
    treatmentAllowed.includes("cardiac_history") &&
      treatmentAllowed.includes("medications") &&
      treatmentAllowed.includes("allergies"),
    treatmentAllowed.join(","),
  );
  check(
    "treatment lens withholds psychiatric note and billing",
    !treatmentAllowed.includes("psychiatric_note") &&
      !treatmentAllowed.includes("billing"),
  );
  check(
    "restricted fields carry no plaintext",
    treatment.body.lens.fragments
      .filter((fragment) => fragment.decision === "deny")
      .every((fragment) => fragment.value === null),
  );

  const research = await post("/api/context", {
    sessionId,
    patientId: "P1048",
    purpose: "research",
  });
  const researchLens = research.body.lens;
  const nameFragment = researchLens.fragments.find(
    (fragment) => fragment.fragmentType === "name",
  );
  const dobFragment = researchLens.fragments.find(
    (fragment) => fragment.fragmentType === "date_of_birth",
  );
  check(
    "research lens pseudonymises the name",
    nameFragment?.value === "Patient P1048",
    nameFragment?.value,
  );
  check(
    "research lens reduces DOB to an age band",
    /^Age \d+-\d+$/.test(dobFragment?.value ?? ""),
    dobFragment?.value,
  );
  check(
    "research lens drops contact details",
    !allowed(researchLens).includes("phone") &&
      !allowed(researchLens).includes("address"),
  );
  check(
    "purpose change alters the view",
    JSON.stringify(treatmentAllowed) !== JSON.stringify(allowed(researchLens)),
  );

  // Voice intent extraction drives the purpose.
  const voice = await post("/api/voice/interpret", {
    sessionId,
    patientId: "P1048",
    utterance: "I'm evaluating Maya's chest pain, show me what matters",
  });
  check(
    "voice request is classified as treatment",
    voice.body.intent?.purpose === "treatment" &&
      voice.body.tool === "requestPatientContext",
    `${voice.body.intent?.purpose}/${voice.body.intent?.task}`,
  );
  check("voice request returns a scoped answer", Boolean(voice.body.answer));

  const nsaid = await post("/api/voice/interpret", {
    sessionId,
    patientId: "P1048",
    utterance: "What do I need to know before prescribing this patient an NSAID?",
  });
  check(
    "prescribing question maps to medication_prescription",
    nsaid.body.intent?.purpose === "medication_prescription",
    nsaid.body.intent?.purpose,
  );

  // Scene 3: conversation to action.
  const handoff = await post("/api/voice/interpret", {
    sessionId,
    patientId: "P1048",
    utterance: "Create a cardiology handoff",
  });
  check(
    "handoff action creates a saved artifact",
    handoff.body.tool === "createClinicalHandoff" &&
      Boolean(handoff.body.action?.id),
  );
  check(
    "handoff reports included and excluded fields",
    (handoff.body.included?.length ?? 0) > 0 &&
      (handoff.body.excluded?.length ?? 0) > 0,
    `${handoff.body.included?.length} in / ${handoff.body.excluded?.length} out`,
  );

  // Scene 4: break-glass.
  const breakGlassIntent = await post("/api/voice/interpret", {
    sessionId,
    patientId: "P1048",
    utterance: "Break glass",
  });
  check(
    "break glass utterance requests emergency access",
    breakGlassIntent.body.requiresBreakGlass === true,
  );

  const requested = await post("/api/break-glass/request", {
    sessionId,
    patientId: "P1048",
  });
  check(
    "break-glass request returns a confirmation nonce",
    Boolean(requested.body.confirmationId && requested.body.nonce),
  );

  const confirmed = await post("/api/break-glass/confirm", {
    sessionId,
    confirmationId: requested.body.confirmationId,
    reason:
      "Patient became unconscious after a suspected overdose and I need the complete medication history.",
    simulate: true,
  });
  const emergencyAllowed = allowed(confirmed.body.lens);
  check(
    "break-glass opens expanded clinical context",
    confirmed.body.lens?.breakGlass === true &&
      emergencyAllowed.includes("psychiatric_note"),
    emergencyAllowed.join(","),
  );
  check(
    "break-glass still withholds billing",
    !emergencyAllowed.includes("billing"),
  );
  check(
    "break-glass window is time limited",
    Boolean(confirmed.body.expiresAt) &&
      new Date(confirmed.body.expiresAt).getTime() > Date.now(),
  );

  // Engineer delegation. Uses a patient nothing has been delegated for, so the
  // check does not depend on delegations left behind by an earlier run.
  const engineerNoDelegation = await authenticate("IRIS-ENGINEER-07");
  const blocked = await post("/api/context", {
    sessionId: engineerNoDelegation.sessionId,
    patientId: "P3187",
    purpose: "engineering_debug",
  });
  check(
    "engineer with no delegation sees nothing",
    blocked.body.lens?.allowedCount === 0,
    `${blocked.body.lens?.allowedCount} allowed`,
  );

  const delegation = await post("/api/actions/delegation", {
    sessionId,
    patientId: "P1048",
    minutes: 30,
    reason: "Debug duplicate medication reconciliation rows",
  });
  check(
    "clinician can create a 30-minute scoped delegation",
    Boolean(delegation.body.delegation?.id),
  );

  const engineer = await authenticate("IRIS-ENGINEER-07");
  const scoped = await post("/api/context", {
    sessionId: engineer.sessionId,
    patientId: "P1048",
    purpose: "engineering_debug",
  });
  const scopedAllowed = allowed(scoped.body.lens);
  check(
    "delegated engineer sees only the delegated scope",
    JSON.stringify(scopedAllowed) ===
      JSON.stringify(["encounter_metadata", "medications", "technical_metadata"]),
    scopedAllowed.join(","),
  );
  const meds = scoped.body.lens.fragments.find(
    (fragment) => fragment.fragmentType === "medications",
  );
  check(
    "engineer sees medication shape, not medication values",
    !meds?.value?.includes("Warfarin") && meds?.transform === "technical_shape",
    meds?.value?.split("\n")[0],
  );
  check(
    "engineer never sees the patient name",
    !scopedAllowed.includes("name"),
  );

  // Reception scheduling lens.
  const reception = await authenticate("IRIS-0203");
  const checkIn = await post("/api/context", {
    sessionId: reception.sessionId,
    patientId: "P1048",
    purpose: "scheduling",
  });
  const receptionAllowed = allowed(checkIn.body.lens);
  check(
    "reception sees check-in fields only",
    receptionAllowed.includes("appointment") &&
      receptionAllowed.includes("insurance") &&
      !receptionAllowed.includes("diagnoses") &&
      !receptionAllowed.includes("medications"),
    receptionAllowed.join(","),
  );

  // Scene 5: Tiger dashboard.
  const dashboard = await get("/api/security/dashboard");
  check(
    "dashboard reports today's activity",
    dashboard.body.today.total > 0 && dashboard.body.totalEvents > 4000,
    `${dashboard.body.today.total} today / ${dashboard.body.totalEvents} total`,
  );
  check(
    "dashboard breaks activity down by purpose",
    dashboard.body.byPurpose.length > 1,
  );
  check(
    "break-glass appears in the dashboard",
    dashboard.body.today.breakGlass > 0,
    `${dashboard.body.today.breakGlass} overrides`,
  );
  check("audit chain verifies", dashboard.body.chainVerified === true);
  check(
    "repeated overrides raise an anomaly without blocking access",
    dashboard.body.anomalies.length > 0,
    dashboard.body.anomalies.map((a) => `${a.actorName} x${a.overrides}`).join(", "),
  );

  // Scene 6: patient view.
  const history = await get("/api/patient/P1048/history");
  const emergencyEntries = history.body.timeline.filter(
    (entry) => entry.kind === "emergency",
  );
  check(
    "patient timeline is populated",
    history.body.timeline.length > 0,
    `${history.body.timeline.length} entries`,
  );
  check(
    "patient can see the emergency access and its reason",
    emergencyEntries.length > 0 &&
      emergencyEntries.some((entry) => entry.emergencyReason?.includes("overdose")),
  );
  check(
    "patient timeline uses plain language",
    history.body.timeline.every(
      (entry) => !entry.purposeText.includes("_") && entry.purposeText.length > 5,
    ),
  );

  // Session kill on loss of presence.
  const dying = await authenticate("IRIS-0117");
  await new Promise((resolve) => setTimeout(resolve, 8600));
  const afterGap = await post("/api/context", {
    sessionId: dying.sessionId,
    patientId: "P1048",
    purpose: "treatment",
  });
  check(
    "session dies when the Iris Key stops answering",
    afterGap.status === 401 && /presence lost/i.test(afterGap.body.error ?? ""),
    afterGap.body.error,
  );

  console.log(
    `\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
