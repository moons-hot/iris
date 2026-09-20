import { extractPcm16, pcm16ToWavBytes, preparePcmForStt } from "@/lib/usb-voice";

export const GROK_VOICE_MODEL = "grok-voice-transcribe-2.0";
export const GROK_VOICE_REALTIME_MODEL = "grok-voice-latest";
export const GROK_VOICE_ID = "ara";

export type GrokVoiceSource = "grok-voice" | "onboard-demo" | "supplied";

export type GrokVoiceResult = {
  transcript: string;
  voiceAssessment?: string;
  source: GrokVoiceSource;
  model?: string;
  demoFallback?: boolean;
  error?: string;
  duration?: number;
};

export const KEY_TERMS = [
  "headache",
  "breathless",
  "short of breath",
  "radiation",
  "nausea",
  "flashes",
  "CO2",
  "astronaut",
  "shielding",
];

/**
 * Speech-to-speech system prompt sent as session.instructions.
 * Edit this field to change Grok Voice's purpose.
 * Second person, fixed section order:
 * https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech/prompting-guide
 */
export const GROK_VOICE_INSTRUCTIONS = `## Role & Persona
You are Iris, a calm onboard health investigation assistant for long-duration spaceflight. You support crew member A01 against their personal baseline. The NASA Human Research Roadmap Risk 95 reference is https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=95.

## Objective
Help the astronaut describe how they feel, compare that report to live telemetry, and name the next evidence or action that would reduce uncertainty. You investigate possible concerns. You do not diagnose.

## Conversation Flow
Listen to the astronaut's first report, including the vocal cues in the crew member's communication. Repeat the key symptoms in plain language. Compare pulse, blood pressure, temperature, cabin air, and space readings to personal baseline when those values are given. Offer possible concerns to investigate and concrete next steps. Ask a clarifying question if the report is incomplete.

## Guardrails & Escalation
NEVER diagnose a disease or say that one factor caused a condition. Use uncertainty language: possible, consistent with, warrants checking. Stay within onboard health investigation. For anything outside that scope, say you do not know. If the astronaut reports collapse, unresponsiveness, severe chest pain, or an uncontrolled bleed, tell them to notify the crew medical lead immediately and move to the designated safe protocol.

## Voice & Communication Style
Spoken word only: no markdown, no bullet lists, no emojis. Give a full spoken briefing: what you heard, how it compares to personal baseline, possible concerns to investigate, and the next actions. Several sentences are fine. Do not cut the answer short. Respond only in English. Vary phrasing. If the audio is unclear, ask a short clarification instead of guessing.

## CRITICAL INSTRUCTIONS
ALWAYS treat this as an investigation, NEVER a diagnosis.
NEVER claim radiation, cabin air, or any other factor caused the symptoms.
ALWAYS compare against the astronaut's personal baseline when measurements are available.
`;

export function grokVoiceConfigured() {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function grokVoiceInstructions(override?: string) {
  return (
    override?.trim() ||
    process.env.GROK_VOICE_INSTRUCTIONS?.trim() ||
    GROK_VOICE_INSTRUCTIONS
  );
}

export function grokVoiceSession(overrides?: {
  instructions?: string;
  voice?: string;
}) {
  return {
    type: "session.update" as const,
    session: {
      instructions: grokVoiceInstructions(overrides?.instructions),
      voice: overrides?.voice ?? GROK_VOICE_ID,
      turn_detection: { type: "server_vad" as const },
      audio: {
        input: {
          format: { type: "audio/pcm" as const, rate: 16000 },
          transcription: {
            language_hint: "en",
            keyterms: KEY_TERMS,
          },
        },
        output: {
          format: { type: "audio/pcm" as const, rate: 16000 },
        },
      },
    },
  };
}

/** Rough peak/RMS for WAV/PCM uploads — helps spot silent ESP captures. */
export async function audioLoudness(file: File): Promise<{
  bytes: number;
  peak: number;
  rms: number;
}> {
  const bytes = file.size;
  const buf = new Uint8Array(await file.arrayBuffer());
  const { pcm } = extractPcm16(buf);
  if (pcm.byteLength < 4) {
    return { bytes, peak: 0, rms: 0 };
  }
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = Math.floor(pcm.byteLength / 2);
  let peak = 0;
  let sumSq = 0;
  const step = Math.max(1, Math.floor(samples / 8000));
  let counted = 0;
  for (let i = 0; i < samples; i += step) {
    const s = Math.abs(view.getInt16(i * 2, true));
    if (s > peak) peak = s;
    sumSq += s * s;
    counted += 1;
  }
  const rms = counted ? Math.sqrt(sumSq / counted) : 0;
  return { bytes, peak, rms };
}

async function postStt(
  key: string,
  form: FormData,
): Promise<
  | {
      ok: true;
      result: {
        text?: string;
        duration?: number;
        words?: { text?: string }[];
      };
    }
  | { ok: false; status: number; detail: string }
> {
  const response = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: await response.text(),
    };
  }
  return {
    ok: true,
    result: (await response.json()) as {
      text?: string;
      duration?: number;
      words?: { text?: string }[];
    },
  };
}

function buildSttForm(file: File, extras?: Record<string, string>): FormData {
  const form = new FormData();
  form.append("language", "en");
  form.append("format", "true");
  // REST default is 0.5 — ESP/I2S captures often fail that gate with empty text.
  form.append("vad_threshold", "0");
  for (const term of KEY_TERMS) form.append("keyterm", term);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) form.append(k, v);
  }
  // file MUST be last
  form.append("file", file);
  return form;
}

function transcriptFrom(result: {
  text?: string;
  words?: { text?: string }[];
}): string {
  const fromWords =
    result.words?.map((w) => w.text?.trim()).filter(Boolean).join(" ") ?? "";
  return (result.text?.trim() || fromWords).trim();
}

/** Copy into a detached Uint8Array so File/Blob accept it under strict BlobPart typing. */
function toAudioFile(
  bytes: Uint8Array,
  name: string,
  type: string,
): File {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy], name, { type });
}

export async function transcribeWithGrokVoice(
  audio: File,
): Promise<GrokVoiceResult> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    return {
      transcript:
        "Audio received. Configure XAI_API_KEY to enable Grok Voice transcription.",
      source: "onboard-demo",
      demoFallback: true,
    };
  }

  const raw = new Uint8Array(await audio.arrayBuffer());
  const extracted = extractPcm16(raw, 16000);
  const prepared = preparePcmForStt(extracted.pcm, extracted.sampleRate, 16000);
  const { pcm, sampleRate } = prepared;
  const wavBytes = pcm16ToWavBytes(pcm, sampleRate);
  const loudness = await audioLoudness(
    toAudioFile(wavBytes, "level.wav", "audio/wav"),
  );
  console.log("[iris voice / audio level]", {
    name: audio.name,
    type: audio.type,
    sourceRate: extracted.sampleRate,
    sampleRate,
    pcmBytes: pcm.byteLength,
    wavBytes: wavBytes.byteLength,
    head: Array.from(wavBytes.slice(0, 4))
      .map((b) => String.fromCharCode(b))
      .join(""),
    ...loudness,
  });
  if (loudness.peak < 200) {
    console.warn(
      "[iris voice / audio nearly silent — check ESP mic channel/gain]",
      loudness,
    );
  }

  // Always send a rewritten canonical WAV — ESP serial WAVs often sniff as format="".
  const wavFile = toAudioFile(wavBytes, "astronaut-report.wav", "audio/wav");
  let posted = await postStt(key, buildSttForm(wavFile));

  // Fallback: raw PCM with explicit format (xAI requires audio_format + sample_rate).
  if (!posted.ok && posted.status === 400) {
    console.warn(
      "[iris voice / wav stt failed, retrying raw pcm]",
      posted.detail,
    );
    const pcmFile = toAudioFile(
      pcm,
      "astronaut-report.pcm",
      "application/octet-stream",
    );
    posted = await postStt(
      key,
      buildSttForm(pcmFile, {
        audio_format: "pcm",
        sample_rate: String(sampleRate),
      }),
    );
  }

  if (!posted.ok) {
    console.error("[iris voice / stt failed]", posted.status, posted.detail);
    return {
      transcript: "",
      source: "onboard-demo",
      demoFallback: true,
      error: `Grok Voice transcription failed (${posted.status}): ${posted.detail.slice(0, 200)}`,
    };
  }

  let transcript = transcriptFrom(posted.result);
  let duration = posted.result.duration;
  if (!transcript) {
    console.warn("[iris voice / stt empty body, retrying original wav]", {
      duration,
      loudness,
      result: posted.result,
    });
    const originalWav = pcm16ToWavBytes(extracted.pcm, extracted.sampleRate);
    const retry = await postStt(
      key,
      buildSttForm(
        toAudioFile(originalWav, "astronaut-original.wav", "audio/wav"),
      ),
    );
    if (retry.ok) {
      transcript = transcriptFrom(retry.result);
      if (transcript) {
        posted = retry;
        duration = retry.result.duration;
      }
    }
  }
  if (!transcript) {
    console.warn("[iris voice / stt empty body]", {
      duration,
      loudness,
      result: posted.result,
    });
  }
  return {
    transcript,
    source: transcript ? "grok-voice" : "onboard-demo",
    model: GROK_VOICE_MODEL,
    duration,
    demoFallback: !transcript,
    error: transcript
      ? undefined
      : loudness.peak < 200
        ? "Mic audio looks silent — reseat codec / speak closer"
        : "STT returned no speech",
  };
}

