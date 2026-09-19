import { NextResponse } from "next/server";
import { z } from "zod";

import { createChallenge } from "@/server/iris/challenges";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  deviceId: z.string().min(3),
  simulated: z.boolean().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const store = getStore();
  const found = await store.getDeviceWithUser(parsed.data.deviceId);
  if (!found) {
    await store.appendEvents([
      {
        actorId: null,
        actorRole: null,
        deviceId: parsed.data.deviceId,
        patientId: null,
        encounterId: null,
        sessionId: null,
        purpose: null,
        task: null,
        resourceType: "device",
        decision: "deny",
        reason: "Unregistered Iris Key presented",
        breakGlass: false,
        latencyMs: null,
        metadata: {},
      },
    ]);
    return NextResponse.json(
      { error: "This Iris Key is not registered." },
      { status: 404 },
    );
  }

  const challenge = createChallenge({
    deviceId: parsed.data.deviceId,
    kind: "auth",
    simulated: parsed.data.simulated ?? false,
  });

  return NextResponse.json({
    challengeId: challenge.id,
    nonce: challenge.nonce,
    deviceLabel: found.device.label,
  });
}
