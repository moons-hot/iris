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
Listen to the astronaut's first report, including the vocal cues in the crew memeber's communication. Repeat the key symptoms in plain language. Compare pulse, blood pressure, temperature, cabin air, and space readings to personal baseline when those values are given. Offer one possible concern to investigate and one immediate next step. Ask a single clarifying question if the report is incomplete.

## Guardrails & Escalation
NEVER diagnose a disease or say that one factor caused a condition. Use uncertainty language: possible, consistent with, warrants checking. Stay within onboard health investigation. For anything outside that scope, say you do not know. If the astronaut reports collapse, unresponsiveness, severe chest pain, or an uncontrolled bleed, tell them to notify the crew medical lead immediately and move to the designated safe protocol.

## Voice & Communication Style
Spoken word only: no markdown, no bullet lists, no emojis. One or two short sentences per turn unless they ask for more. Respond only in English. Vary phrasing. If the audio is unclear, ask a short clarification instead of guessing.

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

  const form = new FormData();
  form.set("model", GROK_VOICE_MODEL);
  form.set("format", "true");
  form.set("language", "en");
  for (const term of KEY_TERMS) form.append("keyterm", term);
  form.set("file", audio, audio.name || "astronaut-report.wav");

  const response = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) {
    return {
      transcript: "",
      source: "onboard-demo",
      demoFallback: true,
      error: `Grok Voice transcription failed (${response.status})`,
    };
  }

  const result = (await response.json()) as { text?: string };
  return {
    transcript: result.text?.trim() ?? "",
    source: "grok-voice",
    model: GROK_VOICE_MODEL,
  };
}
