import { NextResponse } from "next/server";

import { buildPatientTimeline } from "@/server/iris/patient-view";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<NextResponse> {
  const { patientId } = await params;
  const timeline = await buildPatientTimeline(patientId);
  return NextResponse.json(
    { timeline },
    { headers: { "cache-control": "no-store" } },
  );
}
