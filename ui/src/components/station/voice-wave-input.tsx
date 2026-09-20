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
  grokReady?: boolean;
  grokLive?: boolean;
  grokText?: string;
  transcribing?: boolean;
  placeholder?: string;
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

export function VoiceWaveInput({
  value,
  onChange,
  onSubmit,
  recording,
  stream,
  grokReady = false,
  grokLive = false,
  grokText = "",
  transcribing = false,
  placeholder = "Type a symptom report or question…",
}: VoiceWaveInputProps) {
  const levels = useVoiceLevels(stream, recording || transcribing);
  const active = recording || transcribing;

  if (!active) {
    return (
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onSubmit()}
        placeholder={placeholder}
      />
    );
  }

  const caption = transcribing
    ? grokReady
      ? "Grok Voice is transcribing the full report…"
      : "Transcribing onboard…"
    : grokText ||
      (grokReady
        ? "Speak — Grok Voice is listening live"
        : "Listening… Grok Voice is not configured");

  return (
    <div
      className={cn(
        "flex h-20 w-full min-w-0 flex-col justify-center rounded-lg border bg-input/30 px-3 py-1.5",
        grokLive
          ? "border-emerald-400/70 ring-3 ring-emerald-400/25"
          : "border-primary/50 ring-3 ring-primary/20",
      )}
      aria-live="polite"
      aria-label={
        grokLive
          ? "Grok Voice is transcribing live speech"
          : "Listening to astronaut voice input"
      }
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide",
            grokLive ? "text-emerald-400" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              grokLive ? "animate-pulse bg-emerald-400" : "bg-muted-foreground/50",
            )}
          />
          {grokReady ? "Grok Voice" : "Onboard mic"}
          {grokLive ? " · live" : recording ? " · capturing" : ""}
        </span>
      </div>
      <div className="flex h-8 items-end justify-center gap-[3px]">
        {levels.map((level, index) => (
          <span
            key={index}
            className={cn(
              "w-[2px] rounded-full transition-[height] duration-75",
              grokLive ? "bg-emerald-400" : "bg-primary",
            )}
            style={{ height: `${Math.max(14, level * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-1 truncate text-center text-[11px] text-muted-foreground">
        {caption}
      </p>
    </div>
  );
}
