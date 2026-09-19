"use client";

import { ActivityIcon, DatabaseIcon, LinkIcon, TriangleAlertIcon, ZapIcon } from "lucide-react";
import useSWR from "swr";

import { getJson } from "@/lib/fetcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AccessEvent {
  time: string;
  eventId: string;
  actorId: string | null;
  actorRole: string | null;
  patientId: string | null;
  purpose: string | null;
  resourceType: string | null;
  decision: string;
  reason: string | null;
  breakGlass: boolean;
  metadata: Record<string, unknown>;
  eventHash: string;
}

interface Dashboard {
  source: "tiger" | "memory";
  totalEvents: number;
  today: {
    total: number;
    allowed: number;
    restricted: number;
    denied: number;
    breakGlass: number;
  };
  byPurpose: Array<{ purpose: string; count: number; share: number }>;
  breakGlass: AccessEvent[];
  recent: AccessEvent[];
  anomalies: Array<{
    actorId: string;
    actorName: string;
    overrides: number;
    departments: string[];
  }>;
  chainVerified: boolean;
}

export default function SecurityPage() {
  // Short interval so actions performed during the demo appear within seconds.
  const { data } = useSWR<Dashboard>(
    "/api/security/dashboard",
    getJson,
    { refreshInterval: 3000 },
  );

  if (!data) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading access activity...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Access activity
          </h1>
          <p className="text-sm text-muted-foreground">
            Every request, restriction and override, as a time-series.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <DatabaseIcon data-icon="inline-start" />
            {data.source === "tiger" ? "Tiger Data" : "in-memory store"}
          </Badge>
          <Badge
            variant="outline"
            className={
              data.chainVerified
                ? "border-allowed/50 text-allowed"
                : "border-restricted/50 text-restricted"
            }
          >
            <LinkIcon data-icon="inline-start" />
            {data.chainVerified ? "Audit chain verified" : "Chain mismatch"}
          </Badge>
          <Badge variant="secondary">{data.totalEvents.toLocaleString()} events</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Requests today" value={data.today.total} />
        <Metric label="Allowed" value={data.today.allowed} tone="allowed" />
        <Metric label="Restricted" value={data.today.restricted} tone="limited" />
        <Metric
          label="Emergency overrides"
          value={data.today.breakGlass}
          tone="emergency"
        />
      </div>

      {data.anomalies.length > 0 ? (
        <Alert className="border-limited/50 bg-limited/10">
          <TriangleAlertIcon className="text-limited" />
          <AlertTitle className="text-limited">Unusual activity</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            {data.anomalies.map((anomaly) => (
              <span key={anomaly.actorId}>
                {anomaly.actorName}: {anomaly.overrides} emergency overrides today
                {anomaly.departments.length > 0
                  ? ` across ${anomaly.departments.length} department${anomaly.departments.length === 1 ? "" : "s"}`
                  : ""}
                . Compliance review recommended.
              </span>
            ))}
            <span className="pt-1 text-xs">
              Emergency access remains enabled. Frequency changes review priority,
              never availability.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access by purpose</CardTitle>
            <CardDescription>
              From the 5-minute continuous aggregate.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.byPurpose.map((row) => (
              <div key={row.purpose} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize">
                    {row.purpose.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round(row.share * 100)}%
                  </span>
                </div>
                <Progress value={row.share * 100} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Break-glass activity</CardTitle>
            <CardDescription>Today, newest first.</CardDescription>
            <CardAction>
              <Badge variant="outline" className="border-emergency/50 text-emergency">
                <ZapIcon data-icon="inline-start" />
                {data.breakGlass.length}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.breakGlass.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No emergency overrides today.
              </p>
            ) : (
              <ScrollArea className="h-56">
                <div className="flex flex-col gap-2 pr-3">
                  {data.breakGlass.map((event) => (
                    <div
                      key={event.eventId}
                      className="flex flex-col gap-1 rounded-lg border border-emergency/30 bg-emergency/5 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {new Date(event.time).toLocaleTimeString()} -{" "}
                          {event.actorId}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {event.patientId}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {event.reason ?? "Emergency access"}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ActivityIcon className="size-4" />
            Live event stream
          </CardTitle>
          <CardDescription>
            Hash-chained, so altering a past event breaks every later hash.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead className="text-right">Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((event) => (
                <TableRow key={event.eventId}>
                  <TableCell className="text-xs">
                    {new Date(event.time).toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {event.actorId ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {event.patientId ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {event.purpose?.replace(/_/g, " ") ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {event.resourceType?.replace(/_/g, " ") ?? "-"}
                  </TableCell>
                  <TableCell>
                    <DecisionBadge
                      decision={event.decision}
                      breakGlass={event.breakGlass}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                    {event.eventHash.slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "allowed" | "limited" | "emergency";
}) {
  const toneClass =
    tone === "allowed"
      ? "text-allowed"
      : tone === "limited"
        ? "text-limited"
        : tone === "emergency"
          ? "text-emergency"
          : undefined;

  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-3xl ${toneClass ?? ""}`}>
          {value.toLocaleString()}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function DecisionBadge({
  decision,
  breakGlass,
}: {
  decision: string;
  breakGlass: boolean;
}) {
  if (breakGlass) {
    return (
      <Badge variant="outline" className="border-emergency/50 text-emergency">
        break-glass
      </Badge>
    );
  }
  if (decision === "deny") {
    return (
      <Badge variant="outline" className="border-restricted/50 text-restricted">
        denied
      </Badge>
    );
  }
  if (decision === "restrict") {
    return (
      <Badge variant="outline" className="border-limited/50 text-limited">
        restricted
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-allowed/50 text-allowed">
      {decision}
    </Badge>
  );
}
