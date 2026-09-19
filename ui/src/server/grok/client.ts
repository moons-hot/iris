const DEFAULT_BASE_URL = "https://api.x.ai/v1";

export function grokBaseUrl(): string {
  return process.env.GROK_BASE_URL ?? DEFAULT_BASE_URL;
}

export function grokModel(): string {
  return process.env.GROK_MODEL ?? "grok-4-fast";
}

export function grokConfigured(): boolean {
  return Boolean(process.env.GROK_API_KEY);
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatChoice {
  message?: { content?: string };
}

interface ChatResponse {
  choices?: ChatChoice[];
}

/**
 * Single place where anything leaves the building for the model.
 *
 * Callers must pass content that the policy engine already authorized. The API
 * key stays server-side; the browser never sees it.
 */
export async function grokChat(
  messages: ChatMessage[],
  options: { json?: boolean; temperature?: number } = {},
): Promise<string | null> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${grokBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: grokModel(),
        messages,
        temperature: options.temperature ?? 0.2,
        ...(options.json
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`Grok chat failed: ${response.status}`);
      return null;
    }

    const payload = (await response.json()) as ChatResponse;
    return payload.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.warn("Grok chat error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function grokTranscribe(
  audio: Blob,
  filename: string,
): Promise<string | null> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return null;

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", process.env.GROK_TRANSCRIBE_MODEL ?? "grok-voice-stt");

  try {
    const response = await fetch(`${grokBaseUrl()}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      console.warn(`Grok transcription failed: ${response.status}`);
      return null;
    }
    const payload = (await response.json()) as { text?: string };
    return payload.text ?? null;
  } catch (error) {
    console.warn("Grok transcription error", error);
    return null;
  }
}

export async function grokSpeak(text: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(`${grokBaseUrl()}/audio/speech`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROK_TTS_MODEL ?? "grok-voice-tts",
        voice: process.env.GROK_TTS_VOICE ?? "ember",
        input: text,
      }),
    });
    if (!response.ok) {
      console.warn(`Grok speech failed: ${response.status}`);
      return null;
    }
    return await response.arrayBuffer();
  } catch (error) {
    console.warn("Grok speech error", error);
    return null;
  }
}
