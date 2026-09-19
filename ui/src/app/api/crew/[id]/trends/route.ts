import { NextResponse } from "next/server";

import { buildCrewTrendReport } from "@/lib/baseline/trends";
import { getCrewById, getCrewMeasurementHistory, getMissionState } from "@/lib/db/queries";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const crewId = id.toUpperCase();
  const crew = getCrewById(crewId);

  if (!crew) {
    return NextResponse.json(
      { error: `Crew member ${crewId} not found on this mission.` },
      { status: 404 },
    );
  }

  const mission = getMissionState();
  const history = getCrewMeasurementHistory(crewId);
  const report = buildCrewTrendReport(crewId, mission.missionDay, history);

  return NextResponse.json(report);
}
