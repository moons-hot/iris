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
  const form = await request.formData();
  const audio = form.get("audio");
  const suppliedTranscript = form.get("transcript");

  if (typeof suppliedTranscript === "string" && suppliedTranscript.trim()) {
    return Response.json({
      transcript: suppliedTranscript.trim(),
      voiceAssessment: assessVoice(suppliedTranscript),
    });
  }
  if (!(audio instanceof File)) {
    return Response.json(
      { error: "Provide an audio file or transcript" },
      { status: 400 },
    );
  }

  if (!process.env.XAI_API_KEY) {
    return Response.json(
      {
        transcript:
          "Audio received. Configure XAI_API_KEY to enable Grok Voice transcription.",
        voiceAssessment: "audio captured; transcription provider unavailable",
        demoFallback: true,
      },
      { status: 202 },
    );
  }

  const upstream = new FormData();
  upstream.set("file", audio);
  upstream.set("model", "grok-voice");
  const response = await fetch("https://api.x.ai/v1/audio/transcriptions", {
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
  return Response.json({
    transcript,
    voiceAssessment: assessVoice(transcript),
  });
}
