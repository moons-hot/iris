import { NextResponse } from "next/server";

import { grokConfigured, grokTranscribe } from "@/server/grok/client";

export const maxDuration = 30;

/**
 * Audio in, text out. Raw audio is held only for the length of this request and
 * is never written to storage.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!grokConfigured()) {
    return NextResponse.json(
      { error: "Grok voice is not configured.", fallback: "webspeech" },
      { status: 501 },
    );
  }

  const form = await request.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No audio supplied." }, { status: 400 });
  }

  const text = await grokTranscribe(file, "utterance.webm");
  if (!text) {
    return NextResponse.json(
      { error: "Transcription failed.", fallback: "webspeech" },
      { status: 502 },
    );
  }

  return NextResponse.json({ text });
}
