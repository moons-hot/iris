import { NextResponse } from "next/server";

import { SessionInvalidError, requireActiveSession } from "@/server/iris/context";
import { splitName } from "@/server/iris/seed-data";
import { getStore } from "@/server/store";

export interface CareTeamPatient {
  id: string;
  firstName: string;
  lastName: string;
  reasonForVisit: string | null;
}

/**
 * The doctor's own patients. Care relationship decides membership, so this list
 * never needs a policy evaluation: it carries a name and an encounter reason,
 * both of which the attending already holds.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  try {
    const { session, actor } = await requireActiveSession(sessionId);
    if (actor.role !== "physician") {
      return NextResponse.json(
        { error: "This view belongs to the treating clinician." },
        { status: 403 },
      );
    }

    const store = getStore();

    const all = await store.listPatients();
    const onTeam = await Promise.all(
      all.map(async (patient) =>
        (await store.hasRelationship(actor.id, patient.id)) ? patient : null,
      ),
    );

    const patients: CareTeamPatient[] = [];
    for (const patient of onTeam) {
      if (!patient) continue;
      const encounters = await store.listEncounters(patient.id);
      // Most recent encounter wins; `listEncounters` is not ordered in memory.
      const latest = [...encounters].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      )[0];
      const { firstName, lastName } = splitName(patient.displayName);
      patients.push({
        id: patient.id,
        firstName,
        lastName,
        reasonForVisit: latest?.reason ?? null,
      });
    }

    const filtered = query
      ? patients.filter((patient) =>
          [patient.firstName, patient.lastName, patient.reasonForVisit ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : patients;

    filtered.sort((a, b) => a.lastName.localeCompare(b.lastName));

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
        resourceType: "care_team_list",
        decision: "allow",
        reason: "Care-team patient list",
        breakGlass: false,
        latencyMs: null,
        // The search text itself is never logged: it is what the doctor typed
        // about a patient, which is exactly the thing an audit trail leaks.
        metadata: { count: filtered.length, query: Boolean(query) },
      },
    ]);

    return NextResponse.json(
      { patients: filtered },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}
