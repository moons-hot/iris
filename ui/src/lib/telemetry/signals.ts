/** Simulated aggregated crew-status lines from existing onboard systems (not manual entry). */

const CREW_STATUS_SIGNALS = [
  "Wearable pattern: brief headache indicator (low confidence)",
  "Activity telemetry: reduced hydration vs 24h crew mean",
  "Sleep band: fragmented rest in prior cycle",
  "Subjective fatigue index slightly elevated",
  "No acute distress flags on voice stress monitor",
] as const;

function demoUnit(crewId: string, tick: number, salt: number): number {
  const x =
    Math.sin(tick * 12.9898 + salt + crewId.charCodeAt(1) * 0.7) * 43758.5453;
  return x - Math.floor(x);
}

export function pickMonitoringSignals(crewId: string, tick: number): string[] {
  const count = demoUnit(crewId, tick, 1) > 0.55 ? 2 : 1;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(demoUnit(crewId, tick, 10 + i) * CREW_STATUS_SIGNALS.length);
    const line = CREW_STATUS_SIGNALS[index] ?? CREW_STATUS_SIGNALS[0];
    if (!picked.includes(line)) picked.push(line);
  }
  return picked;
}
