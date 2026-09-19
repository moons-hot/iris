import { NextResponse } from "next/server";
import { z } from "zod";

import {
  clearPresence,
  getPresenceNonce,
  setPresenceNonce,
} from "@/server/iris/challenges";
import { breakGlassActive } from "@/server/iris/context";
import { deviceResponse, verifyDeviceResponse } from "@/server/iris/crypto";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  response: z.string().optional(),
  simulate: z.boolean().optional(),
});

/**
 * The heartbeat. Each beat is a fresh signed challenge, so a session stays open
 * only while the Iris Key keeps answering.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const store = getStore();
  const session = await store.getSession(parsed.data.sessionId);
  if (!session || session.endedAt) {
    return NextResponse.json(
      { alive: false, reason: session?.endReason ?? "Session not found." },
      { status: 410 },
    );
  }

  const pending = getPresenceNonce(session.id);
  if (!pending) {
    return NextResponse.json(
      { alive: false, reason: "No presence challenge outstanding." },
      { status: 410 },
    );
  }

  const found = await store.getDeviceWithUser(session.deviceId);
  if (!found) {
    return NextResponse.json({ alive: false, reason: "Unknown device." }, { status: 410 });
  }

  const simulated = parsed.data.simulate === true || pending.simulated;
  const response = simulated
    ? deviceResponse(found.device.secretHex, pending.nonce)
    : (parsed.data.response ?? "");

  if (!verifyDeviceResponse(found.device.secretHex, pending.nonce, response)) {
    await endSession(session.id, "DEVICE_RESPONSE_INVALID", session.deviceId, session.actorId);
    return NextResponse.json(
      { alive: false, reason: "Iris Key stopped responding correctly." },
      { status: 401 },
    );
  }

  const updated = await store.updateSession(session.id, {
    lastPresenceAt: new Date().toISOString(),
  });
  const next = setPresenceNonce(session.id, session.deviceId, simulated);

  return NextResponse.json({
    alive: true,
    nextNonce: next.nonce,
    breakGlass: updated ? breakGlassActive(updated) : false,
    breakGlassUntil: updated?.breakGlassUntil ?? null,
  });
}

async function endSession(
  sessionId: string,
  reason: string,
  deviceId: string,
  actorId: string,
): Promise<void> {
  const store = getStore();
  await store.updateSession(sessionId, {
    endedAt: new Date().toISOString(),
    endReason: reason,
  });
  clearPresence(sessionId);
  await store.appendEvents([
    {
      actorId,
      actorRole: null,
      deviceId,
      patientId: null,
      encounterId: null,
      sessionId,
      purpose: null,
      task: null,
      resourceType: "session",
      decision: "session_end",
      reason,
      breakGlass: false,
      latencyMs: null,
      metadata: {},
    },
  ]);
}
