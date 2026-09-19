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
import { VoiceWaveInput } from "@/components/station/voice-wave-input";
import {
  captureSerialAudio,
  createPcmTap,
  openEsp32Serial,
  type BrowserSerialPort,
} from "@/lib/astronaut-mic";
import { mergeLiveTranscript } from "@/lib/voice-wave";
import { pickAudioInput, type VoiceInputKind } from "@/lib/usb-voice";

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
  possibleConcerns?: string[];
  recommendedActions?: string[];
  source?: "grok" | "onboard-demo";
  voiceEngine?: "grok-voice" | "onboard-demo" | "supplied";
  heard?: string;
  ttsEngine?: "grok-voice" | "browser";
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
  const [voiceSource, setVoiceSource] = useState<VoiceInputKind | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [grokReady, setGrokReady] = useState(false);
  const [grokLive, setGrokLive] = useState(false);
  const [grokText, setGrokText] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const serialAbort = useRef<AbortController | null>(null);
  const serialPort = useRef<BrowserSerialPort | null>(null);
  const stopLiveTap = useRef<(() => void) | null>(null);
  const liveInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/monitoring/tick");
    if (response.ok) setSnapshot(await response.json());
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1600);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    void fetch("/api/voice")
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { grokVoice?: boolean } | null) => {
        setGrokReady(Boolean(status?.grokVoice));
      })
      .catch(() => setGrokReady(false));
  }, []);

  async function speak(text: string): Promise<"grok-voice" | "browser"> {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const type = response.headers.get("Content-Type") ?? "";
    if (response.ok && type.startsWith("audio/")) {
      const url = URL.createObjectURL(await response.blob());
      new Audio(url).play().catch(() => undefined);
      return "grok-voice";
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
    return "browser";
  }

  async function sendLiveChunk(file: File) {
    if (liveInFlight.current) return;
    liveInFlight.current = true;
    try {
      const form = new FormData();
      form.set("audio", file);
      const response = await fetch("/api/voice/live", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        transcript?: string;
        source?: string;
        live?: boolean;
      };
      if (result.source === "grok-voice" && result.transcript?.trim()) {
        setGrokLive(true);
        setGrokText((current) =>
          mergeLiveTranscript(current, result.transcript ?? ""),
        );
      }
    } catch {
      setGrokLive(false);
    } finally {
      liveInFlight.current = false;
    }
  }

  async function investigate(
    report = message,
    voiceAssessment?: string,
    telemetry?: Snapshot | null,
  ) {
    const packet = telemetry ?? snapshot;
    const text = report.trim();
    if (!text) return;
    setLoading(true);
    try {
      const response = await fetch("/api/investigations/active/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          voiceAssessment,
          telemetry: packet,
        }),
      });
      const result = (await response.json()) as Finding;
      const ttsEngine = await speak(result.speak);
      setFinding({ ...result, ttsEngine });
      setMessage("");
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

  async function submitVoiceCapture(audio?: File, transcript?: string) {
    setLoading(true);
    setTranscribing(true);
    const form = new FormData();
    if (audio) form.set("audio", audio);
    if (transcript) form.set("transcript", transcript);
    if (!audio && !transcript) {
      form.set("transcript", "Voice report captured after scenario start.");
    }
    const [voiceResponse, tickResponse] = await Promise.all([
      fetch("/api/voice", {
        method: "POST",
        body: form,
      }),
      fetch("/api/monitoring/tick"),
    ]);
    const result = (await voiceResponse.json()) as {
      transcript?: string;
      voiceAssessment?: string;
      source?: "grok-voice" | "onboard-demo" | "supplied";
    };
    const heard =
      result.transcript?.trim() ||
      transcript?.trim() ||
      grokText.trim() ||
      "Voice report captured after scenario start.";
    if (result.source === "grok-voice") {
      setGrokLive(true);
      setGrokText(heard);
    }
    const live = tickResponse.ok
      ? ((await tickResponse.json()) as Snapshot)
      : snapshot;
    if (live) setSnapshot(live);
    setTranscribing(false);
    await investigate(heard, result.voiceAssessment, live);
    setFinding((current) =>
      current
        ? {
            ...current,
            voiceEngine: result.source,
            heard,
          }
        : current,
    );
  }

  function startBrowserRecording(stream: MediaStream, kind: VoiceInputKind) {
    const media = new MediaRecorder(stream);
    chunks.current = [];
    media.ondataavailable = (event) => chunks.current.push(event.data);
    media.onstop = async () => {
      stopLiveTap.current?.();
      stopLiveTap.current = null;
      setRecording(false);
      setAudioStream(null);
      stream.getTracks().forEach((track) => track.stop());
      const file = new File(
        [new Blob(chunks.current, { type: media.mimeType })],
        "astronaut-report.webm",
        { type: media.mimeType },
      );
      await submitVoiceCapture(file);
    };
    recorder.current = media;
    setVoiceSource(kind);
    setAudioStream(stream);
    setGrokText("");
    setGrokLive(false);
    stopLiveTap.current?.();
    stopLiveTap.current = createPcmTap(stream, (file) => {
      void sendLiveChunk(file);
    });
    media.start();
    setRecording(true);
  }

  async function startEsp32SerialRecording() {
    const port = await openEsp32Serial();
    serialPort.current = port;
    const abort = new AbortController();
    serialAbort.current = abort;
    stopLiveTap.current?.();
    stopLiveTap.current = null;
    setVoiceSource("esp32");
    setRecording(true);
    try {
      const captured = await captureSerialAudio(port, abort.signal);
      await submitVoiceCapture(captured.file, captured.transcript);
    } finally {
      setRecording(false);
      setAudioStream(null);
      serialAbort.current = null;
      serialPort.current = null;
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      serialAbort.current?.abort();
      return;
    }

    let esp32Connected = false;
    try {
      const response = await fetch("/api/voice/devices");
      if (response.ok) {
        const inventory = (await response.json()) as { connected?: boolean };
        esp32Connected = Boolean(inventory.connected);
      }
    } catch {
      esp32Connected = false;
    }

    if (esp32Connected) {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const inputs = await navigator.mediaDevices.enumerateDevices();
        const pick = pickAudioInput(inputs, true);
        if (pick.mode === "audio" && pick.deviceId) {
          const currentId = probe.getAudioTracks()[0]?.getSettings().deviceId;
          if (currentId && currentId === pick.deviceId) {
            startBrowserRecording(probe, "esp32");
            return;
          }
          probe.getTracks().forEach((track) => track.stop());
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: pick.deviceId } },
          });
          startBrowserRecording(stream, "esp32");
          return;
        }
        probe.getTracks().forEach((track) => track.stop());
        await startEsp32SerialRecording();
        return;
      } catch {
        // ESP32 was seen on USB but could not be opened; use the MacBook mic.
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startBrowserRecording(stream, "macbook");
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={grokReady ? "secondary" : "outline"}
              className={
                grokLive || recording
                  ? "border-emerald-400/50 text-emerald-400"
                  : undefined
              }
            >
              <span
                className={`mr-1 inline-block size-1.5 rounded-full ${
                  grokLive
                    ? "animate-pulse bg-emerald-400"
                    : grokReady
                      ? "bg-emerald-500/70"
                      : "bg-muted-foreground/50"
                }`}
              />
              {grokLive
                ? "Grok Voice live"
                : grokReady
                  ? "Grok Voice ready"
                  : "Grok Voice offline"}
            </Badge>
            <Badge
              variant={snapshot.scenario === "dire" ? "destructive" : "secondary"}
            >
              <Radio data-icon="inline-start" />{" "}
              {snapshot.scenario === "dire"
                ? "elevated monitoring"
                : "monitoring nominal"}
            </Badge>
          </div>
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
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
                        {finding.voiceEngine === "grok-voice" ? (
                          <Badge className="border-emerald-400/40 text-emerald-400">
                            Heard by Grok Voice
                          </Badge>
                        ) : null}
                        {finding.ttsEngine === "grok-voice" ? (
                          <Badge variant="outline">Spoken by Grok Voice</Badge>
                        ) : null}
                        {finding.source === "grok" ? (
                          <Badge variant="outline">Iris via Grok</Badge>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void speak(finding.speak)}
                        aria-label="Repeat spoken guidance"
                      >
                        <Volume2 />
                      </Button>
                    </div>
                    {finding.heard && finding.voiceEngine === "grok-voice" ? (
                      <p className="rounded-md border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs leading-5">
                        <span className="font-semibold text-emerald-400">
                          Grok Voice heard:{" "}
                        </span>
                        {finding.heard}
                      </p>
                    ) : null}
                    {finding.possibleConcerns?.length ? (
                      <div className="space-y-3 text-sm leading-6">
                        <section>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Possible concerns to investigate
                          </p>
                          <ul className="mt-1 list-disc space-y-1 pl-4">
                            {finding.possibleConcerns.map((concern) => (
                              <li key={concern}>{concern}</li>
                            ))}
                          </ul>
                        </section>
                        {finding.recommendedActions?.length ? (
                          <section>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Immediate actions
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {finding.recommendedActions.map((action) => (
                                <li key={action}>{action}</li>
                              ))}
                            </ul>
                          </section>
                        ) : null}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-6">
                        {finding.text
                          .replaceAll("## ", "")
                          .replaceAll("**", "")}
                      </div>
                    )}
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
                <div className="flex items-center gap-2">
                  <VoiceWaveInput
                    value={message}
                    onChange={setMessage}
                    onSubmit={() => void investigate()}
                    recording={recording}
                    stream={audioStream}
                    grokReady={grokReady}
                    grokLive={grokLive}
                    grokText={grokText}
                    transcribing={transcribing}
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
                    aria-label={
                      voiceSource === "esp32"
                        ? "Record voice report with ESP32 USB microphone"
                        : "Record voice report with MacBook microphone"
                    }
                    title={
                      voiceSource === "esp32"
                        ? "ESP32 USB microphone"
                        : "MacBook microphone"
                    }
                  >
                    <Mic />
                  </Button>
                </div>
                {voiceSource || grokReady ? (
                  <p className="text-xs text-muted-foreground">
                    {recording
                      ? grokLive
                        ? "Grok Voice is hearing this live via "
                        : "Capturing audio for Grok Voice via "
                      : grokReady
                        ? "Grok Voice will transcribe speech from "
                        : "Voice input: "}
                    {voiceSource === "esp32"
                      ? "ESP32 USB"
                      : "MacBook microphone"}
                  </p>
                ) : null}
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
