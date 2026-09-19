import { NextResponse } from "next/server";
import { z } from "zod";

import {
  SessionInvalidError,
  breakGlassActive,
  requireActiveSession,
} from "@/server/iris/context";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
  reason: z.string().min(4),
});

/**
 * Step three: document why, after the window is already open.
 *
 * Access is never held hostage to this call. It updates the session, attaches
 * the reason to the audit trail, and lets the patient timeline show the words
 * the clinician actually gave.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { session, actor } = await requireActiveSession(parsed.data.sessionId);
    if (!breakGlassActive(session)) {
      return NextResponse.json(
        { error: "No active emergency window for this session." },
        { status: 409 },
      );
    }

    const store = getStore();
    await store.updateSession(session.id, {
      breakGlassReason: parsed.data.reason,
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
        task: "break_glass_reason",
        resourceType: "break_glass_reason",
        decision: "document",
        reason: parsed.data.reason,
        breakGlass: true,
        latencyMs: null,
        metadata: {
          reason: parsed.data.reason,
          department: actor.department,
        },
      },
    ]);

    return NextResponse.json({ ok: true, reason: parsed.data.reason });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
