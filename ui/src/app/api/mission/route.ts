import { NextResponse } from "next/server";

import { getMissionState } from "@/lib/db/queries";

export const runtime = "nodejs";

export function GET() {
  const mission = getMissionState();
  return NextResponse.json(mission);
}
