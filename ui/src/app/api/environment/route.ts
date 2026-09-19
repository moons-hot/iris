import { NextResponse } from "next/server";

import { getEnvironmentReadings } from "@/lib/db/queries";

export const runtime = "nodejs";

export function GET() {
  const readings = getEnvironmentReadings();
  const anomalyCount = readings.filter((r) => r.status !== "nominal").length;

  return NextResponse.json({
    missionDay: readings[0]?.recordedAtMissionDay ?? null,
    readings,
    summary: {
      total: readings.length,
      anomalies: anomalyCount,
    },
  });
}
