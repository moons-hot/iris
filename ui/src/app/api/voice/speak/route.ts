import { NextResponse } from "next/server";
import { z } from "zod";

import { grokConfigured, grokSpeak } from "@/server/grok/client";

const bodySchema = z.object({
  // Spoken prompts only, never patient content.
  text: z.string().min(2).max(300),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!grokConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 501 });
  }

  const audio = await grokSpeak(parsed.data.text);
  if (!audio) {
    return NextResponse.json({ error: "Speech failed" }, { status: 502 });
  }

  return new Response(audio, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
}
