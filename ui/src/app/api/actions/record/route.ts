import { NextResponse } from "next/server";
import { z } from "zod";

import { recordEncounterNote } from "@/server/iris/actions";
import { SessionInvalidError } from "@/server/iris/context";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
  encounterId: z.string().nullish(),
  transcript: z.string().min(10),
});

/**
 * Dictation in, encrypted fragments out. The transcript is not persisted.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await recordEncounterNote({
      sessionId: parsed.data.sessionId,
      patientId: parsed.data.patientId,
      encounterId: parsed.data.encounterId ?? null,
      transcript: parsed.data.transcript,
    });
    return NextResponse.json({
      written: result.written.map((fragment) => ({
        fragmentType: fragment.fragmentType,
        label: fragment.label,
      })),
      extractedBy: result.source,
      transcriptRetained: false,
    });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
