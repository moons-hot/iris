"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Rocket, Satellite } from "lucide-react";

import { FlareStatus, MetricTile, Panel } from "@/components/mission/metrics";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { formatClock, formatLatency, SPACE_DOWNLINK_MS } from "@/lib/format";
import type {
  CommsLog,
  FleetResponse,
  VesselCard,
  VesselKind,
  VesselStatus,
} from "@/lib/mission-types";
import { cn } from "@/lib/utils";

function CraftIcon({ kind }: { kind: VesselKind }) {
  const Icon = kind === "rocket" ? Rocket : Satellite;
  return <Icon className="size-5" />;
}

function statusLabel(status: VesselStatus) {
  if (status === "alert") return "Alert";
  if (status === "watch") return "Watch";
  return "Nominal";
}

function CraftCard({
  craft,
  selected,
  onSelect,
}: {
  craft: VesselCard;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-[1.75rem] bg-card/90 p-5 text-left shadow-[var(--panel-shadow)] transition",
        selected
          ? "ring-2 ring-primary"
          : "hover:bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="grid size-10 place-items-center rounded-full bg-muted">
          <CraftIcon kind={craft.kind} />
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium",
            craft.status === "alert"
              ? "bg-destructive/15 text-destructive"
              : craft.status === "watch"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
          )}
        >
          {statusLabel(craft.status)}
        </span>
      </div>
      <p className="mt-4 font-serif text-2xl tracking-tight">{craft.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {craft.kind} · {craft.callsign}
      </p>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {craft.crewLead.name} · {craft.heartRate} bpm
        {craft.alertCount > 0
          ? ` · ${craft.alertCount} ${craft.alertCount === 1 ? "alert" : "alerts"}`
          : ""}
      </p>
    </button>
  );
}

export default function GroundbasePage() {
  const [fleet, setFleet] = useState<FleetResponse | null>(null);
  const [selectedId, setSelectedId] = useState("asteria");
  const [logs, setLogs] = useState<CommsLog[]>([]);
  const [logsConfigured, setLogsConfigured] = useState(false);
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  const refreshFleet = useCallback(async () => {
    const fleetResponse = await fetch(`/api/fleet?id=${selectedId}`);
    if (fleetResponse.ok) setFleet(await fleetResponse.json());
  }, [selectedId]);

  const refreshLogs = useCallback(async () => {
    const logsResponse = await fetch(
      `/api/logs?limit=100&vesselId=${selectedId}`,
    );
    if (!logsResponse.ok) return;
    const result = (await logsResponse.json()) as {
      configured?: boolean;
      logs?: CommsLog[];
    };
    setLogsConfigured(Boolean(result.configured));
    setLogs(result.logs ?? []);
  }, [selectedId]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshFleet(), refreshLogs()]);
  }, [refreshFleet, refreshLogs]);

  // Fleet metrics tick live; Tiger downlink stays slower.
  useEffect(() => {
    void refresh();
    const fleetInterval = window.setInterval(() => void refreshFleet(), 2_500);
    const logsInterval = window.setInterval(() => void refreshLogs(), 90_000);
    return () => {
      window.clearInterval(fleetInterval);
      window.clearInterval(logsInterval);
    };
  }, [refresh, refreshFleet, refreshLogs]);

  if (!fleet)
    return (
      <main
        className="grid min-h-screen place-items-center"
        suppressHydrationWarning
      >
        <p className="text-sm text-muted-foreground">
          Acquiring downlink from the fleet…
        </p>
      </main>
    );

  const snapshot =
    fleet.snapshots[selectedId] ?? fleet.snapshot;
  const heart = snapshot.vitals[0];
  const radiation = snapshot.space.find(
    (metric) => metric.label === "Hull radiation",
  );
  const flare = snapshot.space.find((metric) => metric.label === "Solar flare");
  const spe = snapshot.space.find((metric) => metric.label === "SPE flux");
  const fleetAlerts = fleet.vessels.filter((craft) => craft.status !== "nominal");
  const criticalFleet = fleet.vessels.filter((craft) => craft.status === "alert");

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/station"
            className="flex items-center gap-3 rounded-full outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div
              className="grid size-12 place-items-center rounded-full"
              style={{
                background: "var(--iris-mark)",
                color: "var(--iris-mark-fg)",
              }}
            >
              <span className="font-serif text-lg leading-none">Ir</span>
            </div>
            <div>
              <p className="text-sm font-medium">Iris</p>
              <p className="text-xs text-muted-foreground">
                Mission Control
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="secondary">
              <Link href="/station">Onboard station</Link>
            </Button>
            <ThemeToggle />
            <span
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                criticalFleet.length > 0
                  ? "bg-destructive/15 text-destructive"
                  : fleetAlerts.length > 0
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {criticalFleet.length > 0
                ? `${criticalFleet.length} craft in alert`
                : fleetAlerts.length > 0
                  ? `${fleetAlerts.length} on watch`
                  : "Fleet nominal"}
            </span>
          </div>
        </header>

        {criticalFleet.length > 0 ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-[1.75rem] bg-destructive/12 px-5 py-4 text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Ground alert</p>
              <p className="mt-1 text-sm text-destructive/90">
                {`${criticalFleet
                  .map(
                    (craft) =>
                      `${craft.name} (${craft.callsign}) — ${craft.alertCount} ${craft.alertCount === 1 ? "flag" : "flags"}`,
                  )
                  .join(" · ")}. Click a craft to inspect vitals, cabin, and the delayed Tiger downlink.`}
              </p>
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-3 text-sm text-muted-foreground">Fleet</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {fleet.vessels.map((craft) => (
              <CraftCard
                key={craft.id}
                craft={craft}
                selected={craft.id === selectedId}
                onSelect={() => {
                  setSelectedId(craft.id);
                  setOpenLogId(null);
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl tracking-tight">
              {snapshot.vessel.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {snapshot.vessel.kind} {snapshot.vessel.callsign} ·{" "}
              {snapshot.vessel.destination} · mission day{" "}
              {snapshot.astronaut.missionDay} · crew lead{" "}
              {snapshot.astronaut.name}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-card/90 py-1.5 pr-4 pl-1.5 shadow-[var(--chip-shadow)]">
            <div className="grid size-8 place-items-center rounded-full bg-primary/20 text-xs font-medium">
              {snapshot.astronaut.id}
            </div>
            <div className="leading-tight">
              <p className="text-sm font-medium">{snapshot.astronaut.name}</p>
              <p className="text-[11px] text-muted-foreground">Crew lead</p>
            </div>
          </div>
        </div>

        {snapshot.alerts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {snapshot.alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "rounded-[1.5rem] px-4 py-3",
                  alert.severity === "critical"
                    ? "bg-destructive/12"
                    : "bg-muted/60",
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium",
                    alert.severity === "critical"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {alert.severity === "critical" ? "Critical" : "Watch"} ·{" "}
                  {alert.title}
                </p>
                <p className="mt-1 text-sm">{alert.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active flags on {snapshot.vessel.name}. Heart rate is{" "}
            {heart?.value ?? "—"} bpm against a resting baseline of{" "}
            {heart?.baseline ?? "—"}.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Crew leader</p>
              <p className="text-xs text-muted-foreground">vs baseline</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {snapshot.vitals.map((metric) => (
                <MetricTile key={metric.label} metric={metric} />
              ))}
            </div>
          </Panel>

          <Panel className="lg:col-span-4">
            <p className="mb-4 text-sm text-muted-foreground">Habitat</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {snapshot.cabin.map((metric) => (
                <MetricTile key={metric.label} metric={metric} />
              ))}
            </div>
          </Panel>

          <Panel className="flex flex-col gap-4 lg:col-span-4">
            <p className="text-sm text-muted-foreground">Space weather</p>
            {flare ? <FlareStatus metric={flare} /> : null}
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              {radiation ? <MetricTile metric={radiation} /> : null}
              {spe ? <MetricTile metric={spe} /> : null}
            </div>
          </Panel>
        </div>

        <Panel>
          <p className="mb-4 text-sm text-muted-foreground">Other crew</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {snapshot.peers.map((peer) => (
              <div
                className="flex items-center justify-between rounded-full bg-muted/60 py-2 pr-4 pl-2"
                key={peer.id}
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-full bg-card text-xs font-medium">
                    {peer.id}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{peer.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {peer.status}
                    </p>
                  </div>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {peer.heartRate} bpm
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="mb-5">
            <p className="text-sm text-muted-foreground">Tiger downlink</p>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Onboard send is instant. Tiger stores ground-receive{" "}
              {formatLatency(SPACE_DOWNLINK_MS)} later to match light-time
              from deep space.
            </p>
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {logsConfigured
                ? "No downlink packets yet. Speak or type on the onboard station to stamp a delayed Tiger row."
                : "Set TIGER_DATABASE_URL to store the delayed sent and received times."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead>
                  <tr className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    <th className="pb-3 pr-8 font-medium">Craft</th>
                    <th className="pb-3 pr-8 font-medium">Channel</th>
                    <th className="pb-3 pr-8 font-medium">Sent</th>
                    <th className="pb-3 pr-8 font-medium">Ground recv</th>
                    <th className="pb-3 pr-8 font-medium">Latency</th>
                    <th className="pb-3 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const alert = log.summary.startsWith("[ALERT]");
                    const open = openLogId === log.id;
                    return (
                      <tr
                        key={log.id}
                        className="cursor-pointer border-t border-border/70"
                        onClick={() =>
                          setOpenLogId(open ? null : log.id)
                        }
                      >
                        <td className="py-4 pr-8 align-top text-xs">
                          <p className="font-medium">{log.vesselId}</p>
                          <p className="text-muted-foreground">
                            {log.crewId} · {log.direction}
                          </p>
                        </td>
                        <td className="py-4 pr-8 align-top text-xs">
                          {log.channel === "voice"
                            ? "voiced"
                            : log.channel === "speak"
                              ? "Iris reply"
                              : log.channel}
                        </td>
                        <td className="py-4 pr-8 align-top font-mono text-xs tabular-nums">
                          {formatClock(log.sentAt)}
                        </td>
                        <td className="py-4 pr-8 align-top font-mono text-xs tabular-nums">
                          {formatClock(log.receivedAt)}
                        </td>
                        <td
                          className={cn(
                            "py-4 pr-8 align-top text-xs tabular-nums",
                            alert && "text-destructive",
                          )}
                        >
                          {formatLatency(log.latencyMs)}
                        </td>
                        <td className="py-4 align-top">
                          <p
                            className={cn(
                              "text-sm",
                              alert && "font-medium text-destructive",
                            )}
                          >
                            {log.summary}
                          </p>
                          {open ? (
                            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                              sent {log.sentAt}
                              <br />
                              actual recv {log.actualReceivedAt} (
                              {formatLatency(log.actualLatencyMs)})
                              <br />
                              tiger recv {log.receivedAt} (
                              {formatLatency(log.latencyMs)}, includes{" "}
                              {formatLatency(log.propagationMs)} light-time)
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
