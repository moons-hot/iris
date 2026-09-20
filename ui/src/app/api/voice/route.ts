import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

const VOICE_CAPTURE_DIR = path.join(process.cwd(), "tmp", "voice-captures");

async function saveRawVoiceCapture(audio: File) {
  const bytes = Buffer.from(await audio.arrayBuffer());
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = audio.name.includes(".")
    ? audio.name.slice(audio.name.lastIndexOf("."))
    : ".wav";
  const base = `${stamp}-raw`;
  await mkdir(VOICE_CAPTURE_DIR, { recursive: true });
  const audioPath = path.join(VOICE_CAPTURE_DIR, `${base}${ext}`);
  await writeFile(audioPath, bytes);
  console.log("[iris voice / saved raw]", audioPath, `(${bytes.byteLength} bytes)`);
  return { audioPath, base, bytes };
}

async function saveVoiceCaptureNote(
  base: string,
  note: { transcript: string; source: string; error?: string },
) {
  const notePath = path.join(VOICE_CAPTURE_DIR, `${base}.txt`);
  const body = [
    `transcript: ${note.transcript || "(empty)"}`,
    `source: ${note.source}`,
    note.error ? `error: ${note.error}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  await writeFile(notePath, `${body}\n`, "utf8");
  console.log("[iris voice / saved note]", notePath);
}

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
  const vesselId =
    typeof form.get("vesselId") === "string" && form.get("vesselId")
      ? String(form.get("vesselId"))
      : "asteria";

  if (typeof suppliedTranscript === "string" && suppliedTranscript.trim()) {
    const transcript = suppliedTranscript.trim();
    console.log("[iris voice / crew said]", transcript);
    console.log("[iris voice / source]", "supplied");
    const log = await recordCommsLog({
      sentAt,
      receivedAt,
      channel: "voice",
      vesselId,
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

  const capture = await saveRawVoiceCapture(audio);
  // Re-wrap so STT still gets a File after we consumed the original buffer.
  const audioForStt = new File([capture.bytes], audio.name || "astronaut-report.wav", {
    type: audio.type || "audio/wav",
  });
  const result = await transcribeWithGrokVoice(audioForStt);
  await saveVoiceCaptureNote(capture.base, {
    transcript: result.transcript,
    source: result.source,
    error: result.error,
  });
  console.log("[iris voice / crew said]", result.transcript || "(empty)");
  console.log("[iris voice / source]", result.source);
  if (result.error) console.error("[iris voice / error]", result.error);
  const log = await recordCommsLog({
    sentAt,
    receivedAt,
    channel: "voice",
    vesselId,
    summary:
      result.transcript.trim() ||
      `${audio.name || "audio"} (${audio.size} bytes)`,
  });
  const status = result.source === "grok-voice" ? 200 : 202;
  return Response.json(
    {
      ...result,
      voiceAssessment: assessVoice(result.transcript),
      savedRaw: capture.audioPath,
      log,
    },
    { status },
  );
}
