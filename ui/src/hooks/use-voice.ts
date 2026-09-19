"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceMode = "grok" | "webspeech";

interface VoiceConfig {
  mode: VoiceMode;
  grokConfigured: boolean;
  model: string | null;
  intentSource: "grok" | "keyword";
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

/**
 * Voice capture with two paths behind one interface.
 *
 * `grok`: audio is posted to Iris, Iris calls the Grok voice API, and the API key
 * never reaches the browser. `webspeech`: the browser transcribes locally. Either
 * way the resulting text goes through the same intent and policy pipeline.
 */
export function useVoice() {
  const [config, setConfig] = useState<VoiceConfig>({
    mode: "webspeech",
    grokConfigured: false,
    model: null,
    intentSource: "keyword",
  });
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/voice/config")
      .then((response) => response.json() as Promise<VoiceConfig>)
      .then((payload) => {
        if (active) setConfig(payload);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const startGrok = useCallback(async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "utterance.webm");

      try {
        const response = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: form,
        });
        const payload = (await response.json()) as {
          text?: string;
          error?: string;
          fallback?: string;
        };
        if (payload.text) {
          resolveRef.current?.(payload.text);
        } else {
          // Grok unavailable: fall back for the rest of the session.
          setConfig((previous) => ({ ...previous, mode: "webspeech" }));
          setError(
            payload.error
              ? `${payload.error} Switched to browser transcription.`
              : "Transcription failed.",
          );
          resolveRef.current?.("");
        }
      } catch {
        setError("Transcription failed.");
        resolveRef.current?.("");
      } finally {
        resolveRef.current = null;
        setListening(false);
      }
    };

    recorder.start();
    setListening(true);
  }, []);

  const startWebSpeech = useCallback((): void => {
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setError("This browser cannot transcribe speech. Type the request instead.");
      resolveRef.current?.("");
      resolveRef.current = null;
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = "";
    recognition.onresult = (event) => {
      let text = "";
      const { length } = event.results;
      for (let index = 0; index < length; index += 1) {
        const result: SpeechRecognitionResultLike | undefined =
          event.results[index];
        if (!result) continue;
        text += result[0].transcript;
        if (result.isFinal) finalText = text;
      }
      setInterim(text);
    };
    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone permission was denied."
          : "Speech recognition failed.",
      );
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      resolveRef.current?.(finalText.trim());
      resolveRef.current = null;
    };

    recognition.start();
    setListening(true);
  }, []);

  /** Starts listening and resolves with the transcript when the user stops. */
  const listen = useCallback(async (): Promise<string> => {
    setError(null);
    const transcript = new Promise<string>((resolve) => {
      resolveRef.current = resolve;
    });

    try {
      if (config.mode === "grok") {
        await startGrok();
      } else {
        startWebSpeech();
      }
    } catch (caught) {
      setListening(false);
      setError(
        caught instanceof Error ? caught.message : "Could not access the microphone.",
      );
      resolveRef.current = null;
      return "";
    }

    return transcript;
  }, [config.mode, startGrok, startWebSpeech]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    recognitionRef.current?.stop();
  }, []);

  /** Spoken prompts only. Patient content is never sent for synthesis. */
  const speak = useCallback(
    async (text: string) => {
      if (config.mode !== "grok") return;
      try {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        const audio = new Audio(
          URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" })),
        );
        await audio.play();
      } catch {
        // Speech is a nicety; never block the flow on it.
      }
    },
    [config.mode],
  );

  return { config, listening, interim, error, listen, stop, speak };
}
