import {
  grokVoiceConfigured,
  grokVoiceInstructions,
  GROK_VOICE_MODEL,
  GROK_VOICE_REALTIME_MODEL,
  transcribeWithGrokVoice,
} from "@/lib/grok-voice";
import { parseSentAt, recordCommsLog } from "@/lib/tiger";

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
    realtimeModel: grokVoiceConfigured() ? GROK_VOICE_REALTIME_MODEL : null,
    instructions: grokVoiceInstructions(),
  });
}

export async function POST(request: Request) {
  const receivedAt = new Date();
  const form = await request.formData();
  const audio = form.get("audio");
  const suppliedTranscript = form.get("transcript");
  const sentAt = parseSentAt(form.get("sentAt"), receivedAt);

  if (typeof suppliedTranscript === "string" && suppliedTranscript.trim()) {
    const transcript = suppliedTranscript.trim();
    const log = await recordCommsLog({
      sentAt,
      receivedAt,
      channel: "voice",
      summary: transcript,
    });
    return Response.json({
      transcript,
      voiceAssessment: assessVoice(suppliedTranscript),
      source: "supplied",
      log,
    });
  }
  if (!(audio instanceof File)) {
    return Response.json(
      { error: "Provide an audio file or transcript" },
      { status: 400 },
    );
  }

  const result = await transcribeWithGrokVoice(audio);
  const log = await recordCommsLog({
    sentAt,
    receivedAt,
    channel: "voice",
    summary:
      result.transcript.trim() ||
      `${audio.name || "audio"} (${audio.size} bytes)`,
  });
  const status = result.source === "grok-voice" ? 200 : 202;
  return Response.json(
    {
      ...result,
      voiceAssessment: assessVoice(result.transcript),
      log,
    },
    { status },
  );
}
