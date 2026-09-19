import { NextResponse } from "next/server";
import { z } from "zod";

import { SessionInvalidError, buildLens } from "@/server/iris/context";
import { PURPOSES } from "@/server/iris/types";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
  purpose: z.enum(PURPOSES),
  task: z.string().nullish(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const store = getStore();
    await store.updateSession(parsed.data.sessionId, {
      purpose: parsed.data.purpose,
      task: parsed.data.task ?? null,
    });

    const lens = await buildLens({
      sessionId: parsed.data.sessionId,
      patientId: parsed.data.patientId,
      purpose: parsed.data.purpose,
      task: parsed.data.task ?? null,
    });
    return NextResponse.json({ lens });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
