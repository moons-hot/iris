import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CrewSelector } from "@/components/station/crew-selector";
import { EnvironmentStrip } from "@/components/station/environment-strip";
import { InvestigationPanel } from "@/components/station/investigation-panel";
import { MonitoringProvider } from "@/components/station/monitoring-provider";
import { RoutineCheckHint } from "@/components/station/routine-check-hint";
import { StationHeader } from "@/components/station/station-header";
import { VitalsSummary } from "@/components/station/vitals-summary";
import { buildCrewTrendReport } from "@/lib/baseline/trends";
import {
  getCrewById,
  getCrewMeasurementHistory,
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

  const measurementHistory = getCrewMeasurementHistory(crewId);
  const trendReport = buildCrewTrendReport(
    crewId,
    mission.missionDay,
    measurementHistory,
  );
  const vitals = buildVitalCards(
    crewRecord.baselines,
    crewRecord.recentMeasurements,
    { crewId, missionTrends: trendReport.trends },
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

      <MonitoringProvider
        crewId={crewId}
        initialVitals={vitals}
        initialTrendReport={trendReport}
      >
        <RoutineCheckHint />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,20rem)]">
          <section className="flex flex-col gap-4">
            <CrewSelector crew={mission.crew} selectedId={crewId} />
            <VitalsSummary crewId={crewId} fallbackVitals={vitals} />
          </section>

          <section className="min-h-56">
            <InvestigationPanel crewId={crewId} />
          </section>

          <section>
            <EnvironmentStrip readings={environment} />
          </section>
        </div>
      </MonitoringProvider>
    </div>
  );
}
