import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EnvironmentReading } from "@/lib/db/types";
import {
  ENV_ANOMALY_DISCLAIMER,
  envStatusBadge,
  formatMetricValue,
  metricLabel,
} from "@/lib/station/view-model";

export function EnvironmentStrip({
  readings,
}: {
  readings: EnvironmentReading[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cabin environment</CardTitle>
        <CardDescription>{ENV_ANOMALY_DISCLAIMER}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {readings.map((reading) => {
            const badge = envStatusBadge(reading.status);
            return (
              <li
                key={`${reading.zone}-${reading.metricKey}`}
                className="flex items-start justify-between gap-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {metricLabel(reading.metricKey)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatMetricValue(reading.value, reading.metricKey)}{" "}
                    {reading.unit} · {reading.zone}
                  </span>
                </div>
                <Badge
                  variant={
                    badge.tone === "nominal" ? "secondary" : "destructive"
                  }
                >
                  {badge.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
