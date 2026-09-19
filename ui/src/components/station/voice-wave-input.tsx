"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "cn";
import {
  idleVoiceLevels,
  levelsFromFrequencyData,
  VOICE_WAVE_BARS,
} from "@/lib/voice-wave";

type VoiceWaveInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  recording: boolean;
  stream: MediaStream | null;
  placeholder?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
  stop: () => void;
};

function useVoiceLevels(stream: MediaStream | null, active: boolean) {
  const [levels, setLevels] = useState(() => idleVoiceLevels(0));

  useEffect(() => {
    if (!active) {
      setLevels(idleVoiceLevels(0));
      return;
    }

    if (!stream) {
      let frame = 0;
      const id = window.setInterval(() => {
        frame += 1;
        setLevels(idleVoiceLevels(frame));
      }, 80);
      return () => window.clearInterval(id);
    }

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const draw = () => {
      analyser.getByteFrequencyData(data);
      setLevels(levelsFromFrequencyData(data, VOICE_WAVE_BARS));
      raf = window.requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.cancelAnimationFrame(raf);
      source.disconnect();
      void context.close();
    };
  }, [active, stream]);

  return levels;
}

function useLiveTranscript(recording: boolean) {
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (!recording) {
      setTranscript("");
      return;
    }

    const Speech =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).SpeechRecognition ??
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).webkitSpeechRecognition;

    if (!Speech) return;

    const recognition = new Speech();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let next = "";
      for (let i = 0; i < event.results.length; i += 1) {
        next += event.results[i]?.[0]?.transcript ?? "";
      }
      setTranscript(next.trim());
    };
    try {
      recognition.start();
    } catch {
      return;
    }
    return () => {
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        // already stopped
      }
    };
  }, [recording]);

  return transcript;
}

export function VoiceWaveInput({
  value,
  onChange,
  onSubmit,
  recording,
  stream,
  placeholder = "Type a symptom report or question…",
}: VoiceWaveInputProps) {
  const liveTranscript = useLiveTranscript(recording);
  const levels = useVoiceLevels(stream, recording);

  if (!recording) {
    return (
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onSubmit()}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-16 w-full min-w-0 flex-col justify-center rounded-lg border border-primary/50 bg-input/30 px-3 py-1.5",
        "ring-3 ring-primary/20",
      )}
      aria-live="polite"
      aria-label="Listening to astronaut voice input"
    >
      <div className="flex h-8 items-end justify-center gap-[3px]">
        {levels.map((level, index) => (
          <span
            key={index}
            className="w-[2px] rounded-full bg-primary transition-[height] duration-75"
            style={{ height: `${Math.max(14, level * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-1 truncate text-center text-[11px] text-muted-foreground">
        {liveTranscript || "Listening… speak your report"}
      </p>
    </div>
  );
}
