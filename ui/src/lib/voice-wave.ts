export const VOICE_WAVE_BARS = 36;

export function levelsFromFrequencyData(
  data: Uint8Array,
  barCount = VOICE_WAVE_BARS,
): number[] {
  if (data.length === 0) {
    return Array.from({ length: barCount }, () => 0.08);
  }
  const step = Math.max(1, Math.floor(data.length / barCount));
  return Array.from({ length: barCount }, (_, index) => {
    let sum = 0;
    let count = 0;
    const start = index * step;
    const end = Math.min(data.length, start + step);
    for (let i = start; i < end; i += 1) {
      sum += data[i] ?? 0;
      count += 1;
    }
    const average = count ? sum / count : 0;
    return Math.min(1, Math.max(0.08, average / 255));
  });
}

export function mergeLiveTranscript(previous: string, incoming: string) {
  const next = incoming.trim();
  if (!next) return previous;
  if (!previous) return next;
  if (next.startsWith(previous) || next.includes(previous)) return next;
  if (previous.includes(next)) return previous;
  return `${previous} ${next}`.replace(/\s+/g, " ").trim();
}

export function idleVoiceLevels(
  tick: number,
  barCount = VOICE_WAVE_BARS,
): number[] {
  return Array.from({ length: barCount }, (_, index) => {
    const wave =
      0.22 +
      Math.abs(Math.sin(tick / 8 + index * 0.35)) * 0.28 +
      Math.abs(Math.sin(tick / 14 + index * 0.18)) * 0.18;
    return Math.min(1, wave);
  });
}
