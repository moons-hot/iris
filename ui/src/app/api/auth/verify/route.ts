import { NextResponse } from "next/server";
import { z } from "zod";

import { setPresenceNonce, takeChallenge } from "@/server/iris/challenges";
import { deviceResponse, verifyDeviceResponse } from "@/server/iris/crypto";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  challengeId: z.string().min(3),
  response: z.string().optional(),
  /**
   * Development convenience: when no board is plugged in the server signs the
   * challenge itself. Every event created this way is tagged `simulated`.
   */
  simulate: z.boolean().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const challenge = takeChallenge(parsed.data.challengeId);
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expired. Re-present the Iris Key." },
      { status: 410 },
    );
  }

  const store = getStore();
  const found = await store.getDeviceWithUser(challenge.deviceId);
  if (!found) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }

  const simulated = parsed.data.simulate === true;
  if (simulated && process.env.IRIS_ALLOW_SIMULATED_KEY === "false") {
    return NextResponse.json(
      { error: "Simulated Iris Keys are disabled in this environment." },
      { status: 403 },
    );
  }

  const response = simulated
    ? deviceResponse(found.device.secretHex, challenge.nonce)
    : (parsed.data.response ?? "");

  const valid = verifyDeviceResponse(
    found.device.secretHex,
    challenge.nonce,
    response,
  );

  if (!valid) {
    await store.appendEvents([
      {
        actorId: found.user.id,
        actorRole: found.user.role,
        deviceId: found.device.id,
        patientId: null,
        encounterId: null,
        sessionId: null,
        purpose: null,
        task: null,
        resourceType: "device",
        decision: "deny",
        reason: "Challenge-response verification failed",
        breakGlass: false,
        latencyMs: null,
        metadata: { simulated },
      },
    ]);
    return NextResponse.json(
      { error: "Iris Key could not be verified." },
      { status: 401 },
    );
  }

  const session = await store.createSession({
    actorId: found.user.id,
    deviceId: found.device.id,
    purpose: null,
  });

  const presence = setPresenceNonce(session.id, found.device.id, simulated);

  await store.appendEvents([
    {
      actorId: found.user.id,
      actorRole: found.user.role,
      deviceId: found.device.id,
      patientId: null,
      encounterId: null,
      sessionId: session.id,
      purpose: null,
      task: null,
      resourceType: "session",
      decision: "login",
      reason: "Hardware-backed credential verified",
      breakGlass: false,
      latencyMs: null,
      metadata: { simulated, deviceLabel: found.device.label },
    },
  ]);

  return NextResponse.json({
    sessionId: session.id,
    presenceNonce: presence.nonce,
    simulated,
    actor: {
      id: found.user.id,
      name: found.user.fullName,
      role: found.user.role,
      department: found.user.department,
    },
    device: { id: found.device.id, label: found.device.label },
  });
}
