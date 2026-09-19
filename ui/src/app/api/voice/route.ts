import {
  grokVoiceConfigured,
  GROK_VOICE_MODEL,
  transcribeWithGrokVoice,
} from "@/lib/grok-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assessVoice(transcript: string) {
  const normalized = transcript.toLowerCase();
  const cues = [
    normalized.includes("short of breath") || normalized.includes("breathless")
      ? "reported breathlessness"
      : "",
    normalized.includes("panic") ||
    normalized.includes("scared") ||
    normalized.includes("frightened")
      ? "distress language present"
      : "",
    normalized.includes("feeble") || normalized.includes("weak")
      ? "reported weak vocal delivery"
      : "",
  ].filter(Boolean);
  return cues.length
    ? cues.join("; ")
    : "no reliable prosody inference available from transcript alone";
}

export async function GET() {
  return Response.json({
    grokVoice: grokVoiceConfigured(),
    model: grokVoiceConfigured() ? GROK_VOICE_MODEL : null,
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const audio = form.get("audio");
  const suppliedTranscript = form.get("transcript");

  if (typeof suppliedTranscript === "string" && suppliedTranscript.trim()) {
    return Response.json({
      transcript: suppliedTranscript.trim(),
      voiceAssessment: assessVoice(suppliedTranscript),
      source: "supplied",
    });
  }
  if (!(audio instanceof File)) {
    return Response.json(
      { error: "Provide an audio file or transcript" },
      { status: 400 },
    );
  }

  const result = await transcribeWithGrokVoice(audio);
  const status = result.source === "grok-voice" ? 200 : 202;
  return Response.json(
    {
      ...result,
      voiceAssessment: assessVoice(result.transcript),
    },
    { status },
  );
}
