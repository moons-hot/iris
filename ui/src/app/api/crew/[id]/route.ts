import { NextResponse } from "next/server";

import { getCrewById } from "@/lib/db/queries";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const crewId = id.toUpperCase();
  const data = getCrewById(crewId);

  if (!data) {
    return NextResponse.json(
      { error: `Crew member ${crewId} not found on this mission.` },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
