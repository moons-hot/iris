import { NextResponse } from "next/server";

import { buildCrewTrendReport } from "@/lib/baseline/trends";
import {
  getCrewById,
  getCrewMeasurementHistory,
  getMissionState,
} from "@/lib/db/queries";
import { runMonitoringTick } from "@/lib/telemetry/live";
import { buildVitalCards } from "@/lib/station/view-model";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const crewId = new URL(request.url).searchParams.get("crewId");
  if (!crewId) {
    return NextResponse.json(
      { error: "Query parameter crewId is required." },
      { status: 400 },
    );
  }

  try {
    const tick = runMonitoringTick(crewId);
    const crew = getCrewById(tick.crewId);
    if (!crew) {
      return NextResponse.json({ error: "Crew not found." }, { status: 404 });
    }

    const mission = getMissionState();
    const history = getCrewMeasurementHistory(tick.crewId);
    const trendReport = buildCrewTrendReport(
      tick.crewId,
      mission.missionDay,
      history,
    );

    const measurements = [
      {
        metricKey: "heart_rate" as const,
        value: tick.vitals.heart_rate,
        recordedAtMissionDay: mission.missionDay,
        source: "biosensor_stream",
      },
      {
        metricKey: "spo2" as const,
        value: tick.vitals.spo2,
        recordedAtMissionDay: mission.missionDay,
        source: "biosensor_stream",
      },
      {
        metricKey: "temp_c" as const,
        value: tick.vitals.temp_c,
        recordedAtMissionDay: mission.missionDay,
        source: "biosensor_stream",
      },
    ];

    const vitals = buildVitalCards(crew.baselines, measurements, {
      crewId: tick.crewId,
      missionTrends: trendReport.trends,
    });

    return NextResponse.json({
      ...tick,
      vitals,
      trendReport,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Monitoring tick failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
