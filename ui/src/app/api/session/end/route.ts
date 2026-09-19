import { NextResponse } from "next/server";
import { z } from "zod";

import { clearPresence } from "@/server/iris/challenges";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  reason: z.string().default("DEVICE_REMOVED"),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const store = getStore();
  const session = await store.getSession(parsed.data.sessionId);
  if (!session) {
    return NextResponse.json({ ended: true });
  }

  if (!session.endedAt) {
    await store.updateSession(session.id, {
      endedAt: new Date().toISOString(),
      endReason: parsed.data.reason,
    });
    clearPresence(session.id);
    await store.appendEvents([
      {
        actorId: session.actorId,
        actorRole: null,
        deviceId: session.deviceId,
        patientId: null,
        encounterId: null,
        sessionId: session.id,
        purpose: session.purpose,
        task: null,
        resourceType: "session",
        decision: "session_end",
        reason: parsed.data.reason,
        breakGlass: false,
        latencyMs: null,
        metadata: {},
      },
    ]);
  }

  return NextResponse.json({ ended: true });
}
