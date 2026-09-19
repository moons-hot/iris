import type { BaselineComparison } from "./compare";

export function personalBaselineStatusLabel(
  crewId: string,
  comparison: BaselineComparison,
  metricLabel: string,
): string {
  if (!comparison.isSignificant) {
    return `Within usual range for ${crewId}`;
  }

  const mean = Math.round(comparison.personalMean * 10) / 10;
  if (comparison.status === "elevated_vs_personal_baseline") {
    return `Significant vs ${crewId} baseline (~${mean} ${comparison.unit}) — ${metricLabel} elevated`;
  }
  return `Significant vs ${crewId} baseline (~${mean} ${comparison.unit}) — ${metricLabel} lower than usual`;
}

export function populationContextLabel(
  crewId: string,
  withinPopulation: boolean,
): string {
  if (withinPopulation) {
    return `Population norms can still look acceptable while ${crewId}'s personal pattern shifts.`;
  }
  return `Also outside typical population range — personal baseline remains the primary reference on mission.`;
}

export function isWithinPopulation(
  value: number,
  low: number,
  high: number,
): boolean {
  return value >= low && value <= high;
}

export type MissionDriftStatus = "stable" | "drifting_over_mission";

export function missionDriftLabel(
  crewId: string,
  metricLabel: string,
  status: MissionDriftStatus,
): string {
  if (status === "stable") {
    return `${metricLabel} trend stable for ${crewId} this mission.`;
  }
  return `Gradual ${metricLabel.toLowerCase()} shift vs early mission for ${crewId} — routine check may help before symptoms worsen.`;
}
