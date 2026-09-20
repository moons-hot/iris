"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type Metric = {
  label: string;
  value: number;
  unit: string;
  baseline: number;
  direction: "stable" | "up" | "down";
  history: number[];
  historyText?: string[];
};
type Snapshot = {
  astronaut: { id: string; name: string; missionDay: number };
  scenario: "nominal" | "mild" | "dire";
  vitals: Metric[];
  cabin: Metric[];
  space: Metric[];
  peers: { id: string; name: string; status: string; heartRate: number }[];
};
type Finding = {
  text: string;
  severity: "high" | "monitor";
  citations: { id: string; title: string; source: string }[];
  speak: string;
};
type CommsLog = {
  id: string;
  sentAt: string;
  receivedAt: string;
  latencyMs: number;
  channel: "typed" | "voice" | "speak";
  direction: "uplink" | "downlink";
  crewId: string;
  summary: string;
};

function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[1.75rem] bg-card/90 p-5 shadow-[var(--panel-shadow)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function MetricTile({ metric }: { metric: Metric }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">
        {metric.value}
        <span
          className={
            metric.unit.startsWith("/")
              ? "text-sm font-normal text-muted-foreground"
              : "ml-1 text-sm font-normal text-muted-foreground"
          }
        >
          {metric.unit}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Baseline{" "}
        {metric.label === "Blood pressure"
          ? "112/72 mmHg"
          : `${metric.baseline}${metric.unit}`}{" "}
        · {metric.direction}
      </p>
    </div>
  );
}

function FlareStatus({ metric }: { metric: Metric }) {
  const active = metric.value >= 1;
  return (
    <div
      className={cn(
        "flex min-h-[6.5rem] flex-col justify-center rounded-[1.5rem] px-4 py-3",
        active ? "bg-destructive/12" : "bg-muted/60",
      )}
    >
      <p className="text-xs text-muted-foreground">Solar flare</p>
      <p
        className={cn(
          "mt-1 text-3xl font-medium tracking-tight",
          active && "text-destructive",
        )}
      >
        {active ? "Active" : "Quiet"}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {active
          ? "SPE in progress · move to shielding"
          : "No event · hull exposure nominal"}
      </p>
    </div>
  );
}

export default function StationPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [logs, setLogs] = useState<CommsLog[]>([]);
  const [logsConfigured, setLogsConfigured] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const refreshLogs = useCallback(async () => {
    const response = await fetch("/api/logs");
    if (!response.ok) return;
    const result = (await response.json()) as {
      configured?: boolean;
      logs?: CommsLog[];
    };
    setLogsConfigured(Boolean(result.configured));
    setLogs(result.logs ?? []);
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/monitoring/tick");
    if (response.ok) setSnapshot(await response.json());
    await refreshLogs();
  }, [refreshLogs]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1600);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function speak(text: string) {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const type = response.headers.get("Content-Type") ?? "";
    if (response.ok && type.startsWith("audio/")) {
      const url = URL.createObjectURL(await response.blob());
      new Audio(url).play().catch(() => undefined);
    } else if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  async function investigate(report = message, voiceAssessment?: string) {
    if (!report.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/investigations/active/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: report,
          voiceAssessment,
          sentAt: new Date().toISOString(),
        }),
      });
      const result = (await response.json()) as Finding;
      setFinding(result);
      setMessage("");
      await speak(result.speak);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function selectScenario(scenario: "mild" | "dire") {
    await fetch("/api/monitoring/tick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    await refresh();
    setFinding(null);
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const media = new MediaRecorder(stream);
    chunks.current = [];
    media.ondataavailable = (event) => chunks.current.push(event.data);
    media.onstop = async () => {
      setRecording(false);
      stream.getTracks().forEach((track) => track.stop());
      const form = new FormData();
      form.set(
        "audio",
        new File(
          [new Blob(chunks.current, { type: media.mimeType })],
          "astronaut-report.webm",
          { type: media.mimeType },
        ),
      );
      form.set("sentAt", new Date().toISOString());
      const response = await fetch("/api/voice", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        transcript: string;
        voiceAssessment: string;
      };
      await investigate(result.transcript, result.voiceAssessment);
    };
    recorder.current = media;
    media.start();
    setRecording(true);
  }

  if (!snapshot)
    return (
      <main
        className="grid min-h-screen place-items-center"
        suppressHydrationWarning
      >
        <p className="text-sm text-muted-foreground">
          Initializing onboard monitors…
        </p>
      </main>
    );

  const heart = snapshot.vitals[0];
  const radiation = snapshot.space.find((metric) => metric.label === "Hull radiation");
  const flare = snapshot.space.find((metric) => metric.label === "Solar flare");
  const spe = snapshot.space.find((metric) => metric.label === "SPE flux");
  const dire = snapshot.scenario === "dire";
  const flareActive = (flare?.value ?? 0) >= 1;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-full bg-foreground text-background">
              <span className="font-serif text-lg leading-none">Ir</span>
            </div>
            <div>
              <p className="text-sm font-medium">Iris</p>
              <p className="text-xs text-muted-foreground">Onboard crew station</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                dire
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {flareActive ? "Solar flare" : "Nominal"}
            </span>
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
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-[5.5rem] place-items-center rounded-full bg-card/90 text-center shadow-[var(--panel-shadow)]">
            <span className="text-2xl font-medium leading-none tabular-nums">
              {snapshot.astronaut.missionDay}
            </span>
            <span className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">
              Mission day
            </span>
          </div>
          <Button
            variant={snapshot.scenario === "mild" ? "default" : "secondary"}
            onClick={() => void selectScenario("mild")}
          >
            Mild symptoms
          </Button>
          <Button
            variant={dire ? "destructive" : "secondary"}
            className={dire ? "bg-destructive text-white hover:bg-destructive/90" : ""}
            onClick={() => void selectScenario("dire")}
          >
            Dire watch
          </Button>
        </div>

        <Panel className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:gap-10">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-3xl tracking-tight md:text-4xl">
              {loading ? "Looking into it…" : "Hey, how are you feeling?"}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              You are the crew who needs help. Iris reads vitals, cabin air,
              suit pressure, and solar weather against your baseline, then
              names the next evidence to collect.
            </p>
            <Input
              className="mt-5"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) =>
                event.key === "Enter" && void investigate()
              }
              placeholder="Just ask me anything"
            />
          </div>
          <button
            type="button"
            onClick={() => void toggleRecording()}
            aria-label="Record voice report"
            className={cn(
              "grid size-24 shrink-0 place-items-center self-center rounded-full shadow-[var(--mic-shadow)] transition md:self-auto",
              recording
                ? "bg-destructive text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/85",
            )}
          >
            <Mic className="size-8" />
          </button>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-12">
          <Panel className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Crew</p>
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

          <Panel className="lg:col-span-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Investigation</p>
              {finding ? (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium",
                      finding.severity === "high"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {finding.severity === "high" ? "High priority" : "Monitoring"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void speak(finding.speak)}
                    aria-label="Repeat spoken guidance"
                  >
                    <Volume2 />
                  </Button>
                </div>
              ) : null}
            </div>
            {finding ? (
              <div>
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {finding.text.replaceAll("## ", "").replaceAll("**", "")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {finding.citations.map((citation) => (
                    <span
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
                      key={citation.id}
                      title={citation.source}
                    >
                      {citation.id}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                {flareActive
                  ? `A solar flare is active and hull radiation is ${radiation?.value ?? "elevated"} mSv/h. Report flashes, nausea, breathlessness, or suit-pressure warnings so Iris can compare them with this window.`
                  : heart
                    ? `Heart rate is ${heart.value} bpm against a resting baseline of ${heart.baseline}. Cabin air and solar weather are in view — report if something feels off.`
                    : "Speak or type a report when something feels off."}
              </p>
            )}
          </Panel>

          <Panel className="lg:col-span-5">
            <p className="mb-4 text-sm text-muted-foreground">Comms log</p>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {logsConfigured
                  ? "Nothing in the log yet. Ask Iris to stamp sent and received times."
                  : "Set TIGER_DATABASE_URL to store sent and received times."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {logs.slice(0, 5).map((log) => (
                  <div key={log.id}>
                    <p className="truncate text-sm">{log.summary}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {log.channel} · sent {formatClock(log.sentAt)} · recv{" "}
                      {formatClock(log.receivedAt)} · {log.latencyMs} ms
                    </p>
                  </div>
                ))}
              </div>
            )}
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
      </div>
    </main>
  );
}
