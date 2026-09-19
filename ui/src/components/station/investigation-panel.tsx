"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EvidenceBoard } from "@/components/station/evidence-board";
import { useMonitoring } from "@/components/station/monitoring-provider";

type InvestigationPanelProps = {
  crewId: string;
};

export function InvestigationPanel({ crewId }: InvestigationPanelProps) {
  const { investigation, streamNote } = useMonitoring();

  return (
    <Card className="flex h-full min-h-[28rem] flex-col">
      <CardHeader>
        <CardTitle>Investigation</CardTitle>
        <CardDescription>
          MED-1 layers onboard streams with spacecraft, RadLab, and OSDR
          evidence — investigation support, not a diagnosis.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">Onboard stream</p>
          <p className="text-muted-foreground">
            {streamNote ??
              "Waiting for next biosensor packet from existing spacecraft systems…"}
          </p>
        </div>

        {!investigation ? (
          <p className="text-sm text-muted-foreground">
            Monitoring {crewId} via existing wearable and cabin feeds. An
            investigation opens automatically when personal baseline deviation is
            detected on the live stream.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{investigation.scope}</Badge>
              <Badge variant="secondary">{investigation.status}</Badge>
              <span className="text-xs text-muted-foreground">
                ID {investigation.id.slice(0, 8)}…
              </span>
            </div>

            {investigation.recommendedNext ? (
              <Card size="sm" className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-base">Next collection step</CardTitle>
                  <CardDescription>
                    {investigation.recommendedNext.detail}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium">
                    {investigation.recommendedNext.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Values are ingested automatically from the biosensor stream
                    on each telemetry tick.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">
                Stream ingestion complete for this event. Evidence board is ready
                for ground medical packaging.
              </p>
            )}

            <Separator />

            <div className="flex max-h-36 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                System log
              </p>
              {investigation.transcript.map((entry) => (
                <p key={entry.id} className="text-sm">
                  <span className="font-medium text-foreground">
                    {entry.role === "med1"
                      ? "MED-1"
                      : entry.role === "system"
                        ? "Onboard"
                        : crewId}
                    :
                  </span>{" "}
                  {entry.content}
                </p>
              ))}
            </div>

            <EvidenceBoard evidence={investigation.evidence} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
