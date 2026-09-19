import { NextResponse } from "next/server";

import { grokConfigured, grokModel } from "@/server/grok/client";

/**
 * The browser asks which voice path is available. It never receives an API key:
 * audio is posted to Iris, and Iris talks to Grok.
 */
export function GET(): NextResponse {
  const requested = process.env.NEXT_PUBLIC_VOICE_MODE ?? "grok";
  const configured = grokConfigured();
  const mode = requested === "grok" && configured ? "grok" : "webspeech";

  return NextResponse.json({
    mode,
    grokConfigured: configured,
    model: configured ? grokModel() : null,
    intentSource: configured ? "grok" : "keyword",
  });
}
