import { NextResponse } from "next/server";
import { z } from "zod";

import { createClinicalHandoff } from "@/server/iris/actions";
import { SessionInvalidError } from "@/server/iris/context";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
  specialty: z.string().min(2).default("Cardiology"),
  clinicianContext: z.string().max(8000).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await createClinicalHandoff(parsed.data);
    return NextResponse.json({
      action: result.action,
      included: result.included,
      excluded: result.excluded,
    });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
