import { NextResponse } from "next/server";
import { z } from "zod";

import { interpretClinicianUtterance } from "@/server/ai/agent";
import { SessionInvalidError } from "@/server/iris/context";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
  utterance: z.string().min(2),
});

/**
 * Text and voice share this route. Grok may choose tools; Iris policy still
 * decides what is decrypted.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const payload = await interpretClinicianUtterance(parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
