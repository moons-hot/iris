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
import { useMonitoring } from "@/components/station/monitoring-provider";
import {
  formatMetricValue,
  type VitalCardModel,
} from "@/lib/station/view-model";

type VitalsSummaryProps = {
  crewId: string;
  /** Initial SSR snapshot before first client tick */
  fallbackVitals?: VitalCardModel[];
};

export function VitalsSummary({ crewId, fallbackVitals }: VitalsSummaryProps) {
  const { vitals, tick } = useMonitoring();
  const cards = tick > 0 ? vitals : (fallbackVitals ?? vitals);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-sm font-medium">Personal baseline</h2>
          <p className="text-xs text-muted-foreground">
            Live biosensor stream — normal for {crewId} vs right now
          </p>
        </div>
        {tick > 0 ? (
          <Badge variant="outline" className="font-normal">
            Stream tick {tick}
          </Badge>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {cards.map((vital) => (
          <Card key={vital.metricKey} size="sm">
            <CardHeader>
              <CardTitle>{vital.label}</CardTitle>
              <CardDescription>
                Normal for {crewId}:{" "}
                {formatMetricValue(vital.personalMean, vital.metricKey)}{" "}
                {vital.unit}
                {vital.personalMin !== null && vital.personalMax !== null
                  ? ` (usual ${formatMetricValue(vital.personalMin, vital.metricKey)}–${formatMetricValue(vital.personalMax, vital.metricKey)})`
                  : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Right now (stream)</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {vital.latestValue === null
                    ? "—"
                    : `${formatMetricValue(vital.latestValue, vital.metricKey)} ${vital.unit}`}
                </p>
              </div>

              {vital.statusLabel ? (
                <Badge
                  variant={
                    vital.isSignificantDeviation ? "destructive" : "secondary"
                  }
                  className="w-fit font-normal"
                >
                  {vital.statusLabel}
                </Badge>
              ) : null}

              {vital.populationNote ? (
                <p className="text-xs text-muted-foreground">
                  {vital.populationNote}
                </p>
              ) : null}

              {vital.missionTrend?.status === "drifting_over_mission" ? (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    {vital.missionTrend.summary}
                  </p>
                </>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
