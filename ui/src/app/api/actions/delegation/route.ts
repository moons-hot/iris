import { NextResponse } from "next/server";
import { z } from "zod";

import { createEngineeringDelegation } from "@/server/iris/actions";
import { SessionInvalidError } from "@/server/iris/context";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
  encounterId: z.string().nullish(),
  minutes: z.number().int().min(5).max(120).default(30),
  reason: z.string().min(4).default("Debug medication reconciliation"),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const store = getStore();
    const encounters = await store.listEncounters(parsed.data.patientId);
    const delegation = await createEngineeringDelegation({
      sessionId: parsed.data.sessionId,
      patientId: parsed.data.patientId,
      encounterId: parsed.data.encounterId ?? encounters[0]?.id ?? null,
      minutes: parsed.data.minutes,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ delegation });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}

/** Returns only delegations that are still live, so expiry is decided server-side. */
export async function GET(): Promise<NextResponse> {
  const store = getStore();
  const delegations = await store.listDelegationsForRole("engineer");
  const now = Date.now();
  return NextResponse.json(
    {
      delegations: delegations.filter(
        (delegation) =>
          !delegation.revokedAt &&
          new Date(delegation.expiresAt).getTime() > now,
      ),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
