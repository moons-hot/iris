"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  HeartPulse,
  Mic,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Volume2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Metric = {
  label: string;
  value: number;
  unit: string;
  baseline: number;
  direction: "stable" | "up" | "down";
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

function MetricList({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="flex flex-col gap-3">
      {metrics.map((metric) => (
        <div
          className="flex items-center justify-between gap-3"
          key={metric.label}
        >
          <div>
            <p className="text-sm font-medium">{metric.label}</p>
            <p className="text-xs text-muted-foreground">
              Baseline {metric.baseline}
              {metric.unit}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm">
              {metric.value}
              {metric.unit}
            </p>
            <p className="text-xs text-muted-foreground">{metric.direction}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StationPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/monitoring/tick");
    if (response.ok) setSnapshot(await response.json());
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
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
        body: JSON.stringify({ message: report, voiceAssessment }),
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
      <main className="grid min-h-screen place-items-center">
        <p className="text-muted-foreground">Initializing onboard monitors…</p>
      </main>
    );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--secondary),_var(--background)_46%)] p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Iris</h1>
              <p className="text-xs text-muted-foreground">
                Onboard health investigation · Day{" "}
                {snapshot.astronaut.missionDay}
              </p>
            </div>
          </div>
          <Badge
            variant={snapshot.scenario === "dire" ? "destructive" : "secondary"}
          >
            <Radio data-icon="inline-start" />{" "}
            {snapshot.scenario === "dire"
              ? "elevated monitoring"
              : "monitoring nominal"}
          </Badge>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse /> A01 · personal metrics
              </CardTitle>
              <CardDescription>
                {snapshot.astronaut.name} — baseline-aware comparison
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricList metrics={snapshot.vitals} />
            </CardContent>
          </Card>

          <section className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot /> Iris investigation
                </CardTitle>
                <CardDescription>
                  Report symptoms in your own words. Iris will identify the next
                  useful evidence—not make a diagnosis.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {finding ? (
                  <article className="flex flex-col gap-3 rounded-lg bg-muted p-4">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={
                          finding.severity === "high"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {finding.severity === "high"
                          ? "high-priority"
                          : "monitoring"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void speak(finding.speak)}
                        aria-label="Repeat spoken guidance"
                      >
                        <Volume2 />
                      </Button>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6">
                      {finding.text.replaceAll("## ", "").replaceAll("**", "")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {finding.citations.map((citation) => (
                        <Badge
                          variant="outline"
                          key={citation.id}
                          title={citation.source}
                        >
                          {citation.id}
                        </Badge>
                      ))}
                    </div>
                  </article>
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Iris is ready. Describe how you feel, or select a simulation
                    below.
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) =>
                      event.key === "Enter" && void investigate()
                    }
                    placeholder="Type a symptom report or question…"
                  />
                  <Button onClick={() => void investigate()} disabled={loading}>
                    <Send data-icon="inline-start" />
                    {loading ? "Investigating" : "Ask Iris"}
                  </Button>
                  <Button
                    variant={recording ? "destructive" : "outline"}
                    size="icon"
                    onClick={() => void toggleRecording()}
                    aria-label="Record voice report"
                  >
                    <Mic />
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Judge simulation controls</CardTitle>
                <CardDescription>
                  Click a scenario, then speak or type the associated report.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void selectScenario("mild")}
                >
                  <Activity data-icon="inline-start" />
                  Mild: breathless + headache
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void selectScenario("dire")}
                >
                  <ShieldAlert data-icon="inline-start" />
                  Dire: radiation + visual symptoms
                </Button>
              </CardContent>
            </Card>
          </section>

          <div className="flex flex-col gap-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Thermometer /> Cabin telemetry
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MetricList metrics={snapshot.cabin} />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>External space</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricList metrics={snapshot.space} />
              </CardContent>
            </Card>
          </div>
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Other crew — historical context</CardTitle>
            <CardDescription>
              Read-only peer data supports hypothesis generation, never a direct
              diagnosis.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {snapshot.peers.map((peer) => (
              <div
                className="flex items-center justify-between rounded-lg bg-muted p-3"
                key={peer.id}
              >
                <div>
                  <p className="font-medium">
                    {peer.id} · {peer.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{peer.status}</p>
                </div>
                <span className="font-mono text-sm">{peer.heartRate} bpm</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
