import { parseSentAt, recordCommsLog } from "@/lib/tiger";

export const runtime = "nodejs";

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
      log,
    });
  }
  if (!(audio instanceof File)) {
    return Response.json(
      { error: "Provide an audio file or transcript" },
      { status: 400 },
    );
  }

  if (!process.env.XAI_API_KEY) {
    const transcript =
      "Audio received. Configure XAI_API_KEY to enable Grok Voice transcription.";
    const log = await recordCommsLog({
      sentAt,
      receivedAt,
      channel: "voice",
      summary: `${audio.name || "audio"} (${audio.size} bytes)`,
    });
    return Response.json(
      {
        transcript,
        voiceAssessment: "audio captured; transcription provider unavailable",
        demoFallback: true,
        log,
      },
      { status: 202 },
    );
  }

  // xAI STT: model must be appended before file.
  // https://docs.x.ai/docs/guides/voice
  const upstream = new FormData();
  upstream.set("model", "grok-voice-transcribe-2.0");
  upstream.set("file", audio, audio.name || "recording.wav");
  const response = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: upstream,
  });
  if (!response.ok) {
    return Response.json(
      {
        error: "Grok Voice transcription failed",
        detail: await response.text(),
      },
      { status: 502 },
    );
  }
  const result = (await response.json()) as { text?: string };
  const transcript = result.text ?? "";
  const log = await recordCommsLog({
    sentAt,
    receivedAt,
    channel: "voice",
    summary: transcript || `${audio.name || "audio"} (${audio.size} bytes)`,
  });
  return Response.json({
    transcript,
    voiceAssessment: assessVoice(transcript),
    log,
  });
}
