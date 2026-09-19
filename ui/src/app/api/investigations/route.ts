import { NextResponse } from "next/server";
import { z } from "zod";

import { getActiveInvestigationForCrew, createInvestigation } from "@/lib/investigation/service";

export const runtime = "nodejs";

const createSchema = z.object({
  crewId: z.string().min(1),
  reportedSymptoms: z.array(z.string()).min(1),
});

export async function GET(request: Request) {
  const crewId = new URL(request.url).searchParams.get("crewId");
  if (!crewId) {
    return NextResponse.json(
      { error: "Query parameter crewId is required." },
      { status: 400 },
    );
  }

  const active = getActiveInvestigationForCrew(crewId);
  return NextResponse.json({ investigation: active });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const investigation = createInvestigation(
      parsed.data.crewId,
      parsed.data.reportedSymptoms,
    );
    return NextResponse.json({ investigation }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create investigation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
