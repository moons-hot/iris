import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CrewSelector } from "@/components/station/crew-selector";
import { EnvironmentStrip } from "@/components/station/environment-strip";
import { InvestigationSlot } from "@/components/station/investigation-slot";
import { StationHeader } from "@/components/station/station-header";
import { VitalsSummary } from "@/components/station/vitals-summary";
import {
  getCrewById,
  getEnvironmentReadings,
  getMissionState,
} from "@/lib/db/queries";
import {
  INVESTIGATION_DISCLAIMER,
  buildStationHeader,
  buildVitalCards,
  resolveCrewId,
} from "@/lib/station/view-model";

export default async function StationPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string }>;
}) {
  const params = await searchParams;
  const mission = getMissionState();
  const rosterIds = mission.crew.map((member) => member.id);
  const { crewId, unknownRequested } = resolveCrewId(params.crew, rosterIds);
  const crewRecord = getCrewById(crewId);
  const environment = getEnvironmentReadings();

  if (!crewRecord) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Crew record unavailable</AlertTitle>
        <AlertDescription>
          Onboard storage did not return a record for {crewId}.
        </AlertDescription>
      </Alert>
    );
  }

  const vitals = buildVitalCards(
    crewRecord.baselines,
    crewRecord.recentMeasurements,
  );

  return (
    <div className="flex flex-col gap-6">
      <StationHeader header={buildStationHeader(mission)} />

      <Alert>
        <AlertTitle>Scope</AlertTitle>
        <AlertDescription>{INVESTIGATION_DISCLAIMER}</AlertDescription>
      </Alert>

      {unknownRequested ? (
        <Alert variant="destructive">
          <AlertTitle>Unknown crew id</AlertTitle>
          <AlertDescription>
            Showing {crewRecord.crew.displayName} ({crewId}) instead.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,20rem)]">
        <section className="flex flex-col gap-4">
          <CrewSelector crew={mission.crew} selectedId={crewId} />
          <VitalsSummary vitals={vitals} />
        </section>

        <section className="min-h-56">
          <InvestigationSlot />
        </section>

        <section>
          <EnvironmentStrip readings={environment} />
        </section>
      </div>
    </div>
  );
}
