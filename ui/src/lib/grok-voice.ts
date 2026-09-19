export const GROK_VOICE_MODEL = "grok-voice-transcribe-2.0";

export type GrokVoiceSource = "grok-voice" | "onboard-demo" | "supplied";

export type GrokVoiceResult = {
  transcript: string;
  voiceAssessment?: string;
  source: GrokVoiceSource;
  model?: string;
  demoFallback?: boolean;
  error?: string;
};

const KEY_TERMS = [
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

export function grokVoiceConfigured() {
  return Boolean(process.env.XAI_API_KEY?.trim());
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
