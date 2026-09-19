import { NextResponse } from "next/server";

import { summarizeTimeline } from "@/server/grok/timeline";
import { buildPatientTimeline } from "@/server/iris/patient-view";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<NextResponse> {
  const { patientId } = await params;
  const entries = await buildPatientTimeline(patientId);
  const timeline = await summarizeTimeline(entries);
  return NextResponse.json(
    { timeline },
    { headers: { "cache-control": "no-store" } },
  );
}
