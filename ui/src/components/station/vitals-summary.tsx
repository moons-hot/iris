import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatMetricValue,
  type VitalCardModel,
} from "@/lib/station/view-model";

export function VitalsSummary({ vitals }: { vitals: VitalCardModel[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
      {vitals.map((vital) => (
        <Card key={vital.metricKey} size="sm">
          <CardHeader>
            <CardTitle>{vital.label}</CardTitle>
            <CardDescription>
              Personal baseline{" "}
              {formatMetricValue(vital.personalMean, vital.metricKey)}{" "}
              {vital.unit}
              {vital.personalMin !== null && vital.personalMax !== null
                ? ` (${formatMetricValue(vital.personalMin, vital.metricKey)}–${formatMetricValue(vital.personalMax, vital.metricKey)})`
                : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p className="text-2xl font-semibold tabular-nums">
              {vital.latestValue === null
                ? "—"
                : `${formatMetricValue(vital.latestValue, vital.metricKey)} ${vital.unit}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Population{" "}
              {formatMetricValue(vital.populationLow, vital.metricKey)}–
              {formatMetricValue(vital.populationHigh, vital.metricKey)}{" "}
              {vital.unit}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
