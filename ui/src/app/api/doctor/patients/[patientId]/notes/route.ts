import { NextResponse } from "next/server";
import { z } from "zod";

import { SessionInvalidError } from "@/server/iris/context";
import {
  preparePhysicianNote,
  savePhysicianNote,
} from "@/server/iris/physician-notes";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  /** Typed note or edited draft to save / redact. */
  text: z.string().optional(),
  /** Raw conversation transcript; drafted by Grok, never stored. */
  transcript: z.string().optional(),
  action: z.enum(["prepare", "save"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<NextResponse> {
  const { patientId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { sessionId, text, transcript, action } = parsed.data;

  try {
    if (action === "prepare") {
      const result = await preparePhysicianNote({
        sessionId,
        patientId,
        text,
        transcript,
      });
      return NextResponse.json(result);
    }

    const toSave = text?.trim();
    if (!toSave || toSave.length < 4) {
      return NextResponse.json(
        { error: "Note text is required to save." },
        { status: 400 },
      );
    }

    const saved = await savePhysicianNote({
      sessionId,
      patientId,
      text: toSave,
    });
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error && /only treating clinicians/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
