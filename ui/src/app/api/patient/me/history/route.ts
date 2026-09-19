import { NextResponse } from "next/server";

import { summarizeTimeline } from "@/server/grok/timeline";
import { SessionInvalidError, requireActiveSession } from "@/server/iris/context";
import { buildPatientTimeline } from "@/server/iris/patient-view";
import { patientIdForActor } from "@/server/iris/seed-data";

/**
 * A patient's own access history, and only their own.
 *
 * The record is chosen by the credential, never by the request: there is no
 * patient id in the URL to change. A clinician's session is refused here even
 * though they can read the same events through the chart, because this is the
 * patient's copy of the trail and it belongs to them.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";

  try {
    const { actor } = await requireActiveSession(sessionId);
    const patientId = patientIdForActor(actor.id);

    if (actor.role !== "patient" || !patientId) {
      return NextResponse.json(
        { error: "This view belongs to the patient." },
        { status: 403 },
      );
    }

    const entries = await buildPatientTimeline(patientId);
    const timeline = await summarizeTimeline(entries);

    return NextResponse.json(
      { patient: { id: patientId, name: actor.fullName }, timeline },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
