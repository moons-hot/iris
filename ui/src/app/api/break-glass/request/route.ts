import { NextResponse } from "next/server";
import { z } from "zod";

import { createChallenge } from "@/server/iris/challenges";
import { SessionInvalidError, requireActiveSession } from "@/server/iris/context";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
});

/**
 * Step one of break-glass: record that it was requested and hand back a nonce
 * that the Iris Key must sign when the clinician physically confirms.
 *
 * This step never evaluates whether the emergency is "good enough".
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { session, actor } = await requireActiveSession(parsed.data.sessionId);
    const store = getStore();

    const challenge = createChallenge({
      deviceId: session.deviceId,
      kind: "confirm",
      sessionId: session.id,
      payload: { patientId: parsed.data.patientId, reason: null },
    });

    await store.appendEvents([
      {
        actorId: actor.id,
        actorRole: actor.role,
        deviceId: session.deviceId,
        patientId: parsed.data.patientId,
        encounterId: null,
        sessionId: session.id,
        purpose: "emergency_treatment",
        task: "break_glass_requested",
        resourceType: "break_glass",
        decision: "requested",
        reason: "Break-glass requested, awaiting reason and physical confirmation",
        breakGlass: true,
        latencyMs: null,
        metadata: { confirmationId: challenge.id },
      },
    ]);

    return NextResponse.json({
      confirmationId: challenge.id,
      nonce: challenge.nonce,
      prompt: "State the reason for emergency access.",
    });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
