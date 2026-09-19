import { NextResponse } from "next/server";

import {
  SessionInvalidError,
  activeBreakGlassPatientId,
  requireActiveSession,
} from "@/server/iris/context";
import { splitName } from "@/server/iris/seed-data";
import { getStore } from "@/server/store";

export interface LookupMatch {
  id: string;
  onTeam: boolean;
  revealed: boolean;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Searching for a patient you are not treating.
 *
 * The match happens on the server against names the caller never receives. A
 * doctor off the care team learns that a record exists and nothing else, until
 * they break glass on it and accept being on the record for having done so.
 *
 * There is no rate limit here on purpose. Slowing an emergency lookup down is
 * the one failure mode this system refuses to have.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const query = (url.searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json(
      { error: "Search for at least two characters." },
      { status: 400 },
    );
  }

  try {
    const { session, actor } = await requireActiveSession(sessionId);
    if (actor.role !== "physician") {
      return NextResponse.json(
        { error: "This view belongs to the treating clinician." },
        { status: 403 },
      );
    }

    const store = getStore();

    const needle = query.toLowerCase();
    const all = await store.listPatients();
    const hits = all.filter((patient) =>
      patient.displayName.toLowerCase().includes(needle),
    );

    const emergencyPatientId = await activeBreakGlassPatientId(session.id);

    const matches: LookupMatch[] = await Promise.all(
      hits.map(async (patient): Promise<LookupMatch> => {
        const onTeam = await store.hasRelationship(actor.id, patient.id);
        const revealed = onTeam || patient.id === emergencyPatientId;
        const name = revealed ? splitName(patient.displayName) : null;
        return {
          id: patient.id,
          onTeam,
          revealed,
          firstName: name?.firstName ?? null,
          lastName: name?.lastName ?? null,
        };
      }),
    );

    await store.appendEvents([
      {
        actorId: actor.id,
        actorRole: actor.role,
        deviceId: session.deviceId,
        patientId: null,
        encounterId: null,
        sessionId: session.id,
        purpose: session.purpose,
        task: null,
        resourceType: "patient_lookup",
        decision: "allow",
        reason: "Patient search outside the care team",
        breakGlass: false,
        latencyMs: null,
        metadata: {
          matches: matches.length,
          offTeam: matches.filter((match) => !match.onTeam).length,
          revealed: matches.filter((match) => match.revealed).length,
        },
      },
    ]);

    return NextResponse.json(
      { matches },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
