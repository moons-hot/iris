import { NextResponse } from "next/server";
import { z } from "zod";

import { takeChallenge } from "@/server/iris/challenges";
import {
  SessionInvalidError,
  buildLens,
  requireActiveSession,
} from "@/server/iris/context";
import { deviceResponse, verifyDeviceResponse } from "@/server/iris/crypto";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  confirmationId: z.string().min(3),
  reason: z.string().min(4),
  response: z.string().optional(),
  simulate: z.boolean().optional(),
});

const WINDOW_MINUTES = 15;

/**
 * Step two: capture the stated reason, verify the physical button press, open a
 * time-limited emergency window.
 *
 * Emergency access is granted to any authenticated clinician who asks for it. The
 * system's job is to record it and raise it for review, not to argue.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { session, actor } = await requireActiveSession(parsed.data.sessionId);
    const store = getStore();

    const challenge = takeChallenge(parsed.data.confirmationId);
    if (challenge?.sessionId !== session.id) {
      return NextResponse.json(
        { error: "Confirmation expired. Request break-glass again." },
        { status: 410 },
      );
    }

    const patientId = challenge.payload?.patientId;
    if (!patientId) {
      return NextResponse.json({ error: "Missing patient." }, { status: 400 });
    }

    const found = await store.getDeviceWithUser(session.deviceId);
    if (!found) {
      return NextResponse.json({ error: "Unknown device." }, { status: 404 });
    }

    const simulated = parsed.data.simulate === true;
    const response = simulated
      ? deviceResponse(found.device.secretHex, challenge.nonce)
      : (parsed.data.response ?? "");

    if (!verifyDeviceResponse(found.device.secretHex, challenge.nonce, response)) {
      // A failed physical confirmation is logged, and the clinician can retry.
      await store.appendEvents([
        {
          actorId: actor.id,
          actorRole: actor.role,
          deviceId: session.deviceId,
          patientId,
          encounterId: null,
          sessionId: session.id,
          purpose: "emergency_treatment",
          task: "break_glass_confirmation",
          resourceType: "break_glass",
          decision: "deny",
          reason: "Physical confirmation on the Iris Key was not verified",
          breakGlass: true,
          latencyMs: null,
          metadata: { simulated },
        },
      ]);
      return NextResponse.json(
        { error: "Physical confirmation failed. Press the button on your Iris Key." },
        { status: 401 },
      );
    }

    const until = new Date(Date.now() + WINDOW_MINUTES * 60_000).toISOString();
    await store.updateSession(session.id, {
      breakGlassUntil: until,
      breakGlassReason: parsed.data.reason,
      purpose: "emergency_treatment",
      task: "emergency_context",
    });

    const recentBreakGlass = await store.listEvents({
      actorId: actor.id,
      limit: 200,
    });
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const overridesToday = recentBreakGlass.filter(
      (event) =>
        event.breakGlass &&
        event.decision === "allow" &&
        new Date(event.time).getTime() >= todayStart,
    ).length;

    await store.appendEvents([
      {
        actorId: actor.id,
        actorRole: actor.role,
        deviceId: session.deviceId,
        patientId,
        encounterId: null,
        sessionId: session.id,
        purpose: "emergency_treatment",
        task: "emergency_context",
        resourceType: "expanded_clinical_record",
        decision: "allow",
        reason: parsed.data.reason,
        breakGlass: true,
        latencyMs: null,
        metadata: {
          reason: parsed.data.reason,
          expiresAt: until,
          physicalConfirmation: true,
          simulated,
          department: actor.department,
          flaggedForReview: true,
          overridesToday: overridesToday + 1,
        },
      },
    ]);

    const lens = await buildLens({
      sessionId: session.id,
      patientId,
      purpose: "emergency_treatment",
      task: "emergency_context",
    });

    return NextResponse.json({
      lens,
      expiresAt: until,
      reason: parsed.data.reason,
      // Frequency drives review priority. It never blocks access.
      anomalyFlagged: overridesToday + 1 >= 3,
      overridesToday: overridesToday + 1,
    });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
