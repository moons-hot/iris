"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Volume2 } from "lucide-react";

import { FlareStatus, MetricTile, Panel } from "@/components/mission/metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatClock, formatLatency } from "@/lib/format";
import type { CommsLog, Snapshot } from "@/lib/mission-types";
import { cn } from "@/lib/utils";
import {
    IrisEspLink,
    IRIS_PCM_RATE,
    applyPcm16Gain,
} from "@/lib/esp32-serial";
import { createPcmTap } from "@/lib/astronaut-mic";
import { startBrowserStt, type BrowserSttSession } from "@/lib/browser-stt";
import { truncateAtSentence, investigationSections } from "@/lib/speak-text";
import { mergeLiveTranscript } from "@/lib/voice-wave";
import { pcm16ToWav } from "@/lib/usb-voice";

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
};

export default function StationPage() {
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [message, setMessage] = useState("");
    const [finding, setFinding] = useState<Finding | null>(null);
    const [loading, setLoading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [logs, setLogs] = useState<CommsLog[]>([]);
    const [logsConfigured, setLogsConfigured] = useState(false);
    const [espLinked, setEspLinked] = useState(false);
    const [espBusy, setEspBusy] = useState(false);
    const [grokReady, setGrokReady] = useState(false);
    const [grokLive, setGrokLive] = useState(false);
    const [grokText, setGrokText] = useState("");
    const grokTextRef = useRef("");
    const recorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const esp = useRef<IrisEspLink | null>(null);
    const stopLiveTap = useRef<(() => void) | null>(null);
    const liveInFlight = useRef(false);
    const browserStt = useRef<BrowserSttSession | null>(null);

    function setLiveHeard(text: string, live = true) {
        grokTextRef.current = text;
        setGrokText(text);
        if (live) setGrokLive(true);
    }

    function clearLiveHeard() {
        grokTextRef.current = "";
        setGrokText("");
        setGrokLive(false);
    }

    function startBrowserSttBackup() {
        void browserStt.current?.stop().catch(() => undefined);
        browserStt.current = startBrowserStt({
            onPartial: (text) => {
                const heard = text.trim();
                if (!heard) return;
                setLiveHeard(heard);
            },
        });
    }

    async function stopBrowserSttBackup() {
        const session = browserStt.current;
        browserStt.current = null;
        if (!session) return "";
        try {
            return (await session.stop()).trim();
        } catch {
            return "";
        }
    }

    function resolveHeardTranscript(
        grokHeard: string,
        browserHeard: string,
        liveHeard: string,
    ) {
        const primary = grokHeard.trim();
        if (primary) {
            return { heard: primary, backup: false as const };
        }
        const backup = browserHeard.trim() || liveHeard.trim();
        return {
            heard: backup,
            backup: Boolean(backup),
        };
    }

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

    const refreshSnapshot = useCallback(async () => {
        const response = await fetch("/api/monitoring/tick");
        if (response.ok) setSnapshot(await response.json());
    }, []);

    const refresh = useCallback(async () => {
        await refreshSnapshot();
        await refreshLogs();
    }, [refreshLogs, refreshSnapshot]);

    // Live telemetry: poll often so vitals, cabin, space, and peers keep moving.
    // Logs stay on-demand so Tiger is not hit every tick.
    useEffect(() => {
        void refresh();
        const interval = window.setInterval(
            () => void refreshSnapshot(),
            2_500,
        );
        return () => window.clearInterval(interval);
    }, [refresh, refreshSnapshot]);

    useEffect(() => {
        void fetch("/api/voice")
            .then((response) => (response.ok ? response.json() : null))
            .then((status: { grokVoice?: boolean } | null) => {
                setGrokReady(Boolean(status?.grokVoice));
            })
            .catch(() => setGrokReady(false));
    }, []);

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
            };
            if (result.source === "grok-voice" && result.transcript?.trim()) {
                setLiveHeard(
                    mergeLiveTranscript(
                        grokTextRef.current,
                        result.transcript ?? "",
                    ),
                );
            }
        } catch {
            setGrokLive(false);
        } finally {
            liveInFlight.current = false;
        }
    }

    async function speak(text: string) {
        const spoken = truncateAtSentence(text);
        if (!spoken) return;
        console.log("[iris downlink / bot says]", spoken);
        try {
            const response = await fetch("/api/voice/speak", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: spoken }),
            });
            const type = (
                response.headers.get("Content-Type") ?? ""
            ).toLowerCase();
            // Laptop speakers only — skip ESP PCM playback for cleaner/faster audio.
            if (response.ok && type.startsWith("audio/")) {
                const blob = await response.blob();
                const playable = type.includes("pcm")
                    ? pcm16ToWav(
                          applyPcm16Gain(
                              new Uint8Array(await blob.arrayBuffer()),
                              0.85,
                          ),
                          IRIS_PCM_RATE,
                      )
                    : blob;
                const url = URL.createObjectURL(playable);
                await new Promise<void>((resolve) => {
                    const audio = new Audio(url);
                    audio.onended = () => {
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    audio.onerror = () => {
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    audio.play().catch(() => resolve());
                });
                return;
            }
            if ("speechSynthesis" in window) {
                await new Promise<void>((resolve) => {
                    const utter = new SpeechSynthesisUtterance(spoken);
                    utter.rate = 1.05;
                    utter.onend = () => resolve();
                    utter.onerror = () => resolve();
                    window.speechSynthesis.speak(utter);
                });
            }
        } catch (error) {
            console.error("[iris downlink / speak failed]", error);
        }
    }

    async function connectEsp() {
        if (esp.current?.connected) {
            await esp.current.disconnect().catch(() => undefined);
            esp.current = null;
            setEspLinked(false);
            return;
        }
        const link = new IrisEspLink();
        try {
            await link.connect();
            esp.current = link;
            setEspLinked(true);
            if (!link.hasAudio) {
                window.alert(
                    "IrisKey linked, but audio init failed. Check the codec seating and Serial Monitor for errors.",
                );
            }
        } catch (error) {
            await link.disconnect().catch(() => undefined);
            esp.current = null;
            setEspLinked(false);
            window.alert(
                error instanceof Error
                    ? error.message
                    : "Could not connect to IrisKey over Web Serial.",
            );
        }
    }

    async function investigate(
        report = message,
        voiceAssessment?: string,
        channel: "typed" | "voice" = "typed",
    ) {
        if (!report.trim()) return;
        console.log("[iris uplink / crew said]", report.trim());
        if (voiceAssessment) {
            console.log("[iris uplink / voice assessment]", voiceAssessment);
        }
        setLoading(true);
        try {
            const response = await fetch("/api/investigations/active/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: report,
                    voiceAssessment,
                    telemetry: snapshot,
                    sentAt: new Date().toISOString(),
                    channel,
                }),
            });
            const result = (await response.json()) as Finding;
            console.log(
                "[iris downlink / heard]",
                result.heard ?? report.trim(),
            );
            console.log(
                "[iris downlink / finding]",
                result.text ?? result.speak,
            );
            setFinding({
                ...result,
                voiceEngine: result.voiceEngine,
                heard: result.heard ?? report.trim(),
            });
            setMessage("");
            const spoken = truncateAtSentence(
                result.speak?.trim() ||
                    result.text
                        ?.replace(/[#*_`[\]]/g, " ")
                        .replace(/\s+/g, " ")
                        .trim() ||
                    "",
            );
            if (spoken) await speak(spoken);
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
        if (esp.current?.connected) {
            if (espBusy) return;
            if (recording) {
                setEspBusy(true);
                try {
                    const wav = await esp.current.stopRecording();
                    setRecording(false);
                    const browserHeard = await stopBrowserSttBackup();
                    const liveHeard = grokTextRef.current.trim();
                    const form = new FormData();
                    form.set(
                        "audio",
                        new File([wav], "astronaut-report.wav", {
                            type: "audio/wav",
                        }),
                    );
                    form.set("crewId", "A01");
                    form.set("sentAt", new Date().toISOString());
                    let result: {
                        transcript?: string;
                        voiceAssessment?: string;
                        source?: Finding["voiceEngine"];
                        error?: string;
                    } = {};
                    try {
                        const response = await fetch("/api/voice", {
                            method: "POST",
                            body: form,
                        });
                        result = (await response.json()) as typeof result;
                    } catch (error) {
                        console.error("[iris uplink / stt request failed]", error);
                    }
                    const { heard, backup } = resolveHeardTranscript(
                        result.transcript ?? "",
                        browserHeard,
                        liveHeard,
                    );
                    console.log(
                        "[iris uplink / transcript]",
                        heard || "(empty)",
                    );
                    console.log(
                        "[iris uplink / voice source]",
                        backup ? "browser-stt" : result.source,
                    );
                    if (result.error)
                        console.error(
                            "[iris uplink / stt error]",
                            result.error,
                        );
                    if (backup) {
                        console.log(
                            "[iris uplink / browser stt backup]",
                            heard,
                        );
                    }
                    if (!heard) {
                        window.alert(
                            result.error ??
                                "Could not transcribe that recording. Try again closer to the mic.",
                        );
                        return;
                    }
                    await investigate(
                        heard,
                        backup ? undefined : result.voiceAssessment,
                        "voice",
                    );
                    setFinding((current) =>
                        current
                            ? {
                                  ...current,
                                  voiceEngine: backup
                                      ? "supplied"
                                      : result.source,
                                  heard,
                              }
                            : current,
                    );
                } catch (error) {
                    console.error("[iris uplink / esp record failed]", error);
                    setRecording(false);
                    await stopBrowserSttBackup();
                    try {
                        if (esp.current?.connected) await esp.current.ping();
                    } catch {
                        if (esp.current) {
                            await esp.current
                                .disconnect()
                                .catch(() => undefined);
                            esp.current = null;
                            setEspLinked(false);
                        }
                    }
                    window.alert(
                        error instanceof Error
                            ? error.message
                            : "IrisKey recording failed — reconnect and try again.",
                    );
                } finally {
                    setEspBusy(false);
                }
                return;
            }
            setEspBusy(true);
            try {
                await esp.current.startRecording();
                clearLiveHeard();
                startBrowserSttBackup();
                setRecording(true);
            } catch (error) {
                console.error("[iris uplink / esp start failed]", error);
                await stopBrowserSttBackup();
                try {
                    if (esp.current?.connected) await esp.current.ping();
                } catch {
                    if (esp.current) {
                        await esp.current.disconnect().catch(() => undefined);
                        esp.current = null;
                        setEspLinked(false);
                    }
                }
                window.alert(
                    error instanceof Error
                        ? error.message
                        : "Could not start IrisKey recording — reconnect and try again.",
                );
            } finally {
                setEspBusy(false);
            }
            return;
        }

        if (recording) {
            recorder.current?.stop();
            stopLiveTap.current?.();
            stopLiveTap.current = null;
            return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
        });
        const media = new MediaRecorder(stream);
        chunks.current = [];
        media.ondataavailable = (event) => chunks.current.push(event.data);
        media.onstop = async () => {
            stopLiveTap.current?.();
            stopLiveTap.current = null;
            setRecording(false);
            stream.getTracks().forEach((track) => track.stop());
            const browserHeard = await stopBrowserSttBackup();
            const liveHeard = grokTextRef.current.trim();
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
            let result: {
                transcript?: string;
                voiceAssessment?: string;
                source?: Finding["voiceEngine"];
                error?: string;
            } = {};
            try {
                const response = await fetch("/api/voice", {
                    method: "POST",
                    body: form,
                });
                result = (await response.json()) as typeof result;
            } catch (error) {
                console.error("[iris uplink / stt request failed]", error);
            }
            const { heard, backup } = resolveHeardTranscript(
                result.transcript ?? "",
                browserHeard,
                liveHeard,
            );
            console.log("[iris uplink / transcript]", heard || "(empty)");
            console.log(
                "[iris uplink / voice source]",
                backup ? "browser-stt" : result.source,
            );
            if (result.error)
                console.error("[iris uplink / stt error]", result.error);
            if (backup) {
                console.log("[iris uplink / browser stt backup]", heard);
            }
            if (!heard) {
                window.alert(
                    result.error ??
                        "Could not transcribe that recording. Try again closer to the mic.",
                );
                return;
            }
            if (!backup && result.source === "grok-voice") {
                setLiveHeard(heard);
            }
            await investigate(
                heard,
                backup ? undefined : result.voiceAssessment,
                "voice",
            );
            setFinding((current) =>
                current
                    ? {
                          ...current,
                          voiceEngine: backup ? "supplied" : result.source,
                          heard,
                      }
                    : current,
            );
        };
        recorder.current = media;
        clearLiveHeard();
        startBrowserSttBackup();
        stopLiveTap.current = createPcmTap(stream, (file) => {
            void sendLiveChunk(file);
        });
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
    const radiation = snapshot.space.find(
        (metric) => metric.label === "Hull radiation",
    );
    const flare = snapshot.space.find(
        (metric) => metric.label === "Solar flare",
    );
    const spe = snapshot.space.find((metric) => metric.label === "SPE flux");
    const dire = snapshot.scenario === "dire";
    const flareActive = (flare?.value ?? 0) >= 1;

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
                            <span className="font-serif text-lg leading-none">
                                Ir
                            </span>
                        </div>
                        <div>
                            <p className="text-sm font-medium">Iris</p>
                            <p className="text-xs text-muted-foreground">
                                Onboard crew station
                            </p>
                        </div>
                    </Link>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button asChild variant="secondary">
                            <Link href="/groundbase">Mission Control</Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                void connectEsp().catch(() => undefined)
                            }
                        >
                            {espLinked ? "Disconnect IrisKey" : "Connect IrisKey"}
                        </Button>
                        <span
                            className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-medium",
                                espLinked
                                    ? "bg-primary/15 text-primary"
                                    : "bg-muted text-muted-foreground",
                            )}
                        >
                            {espLinked ? "IrisKey linked" : "IrisKey offline"}
                        </span>
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
                                <p className="text-sm font-medium">
                                    {snapshot.astronaut.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Crew lead
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex size-[5.75rem] shrink-0 flex-col items-center justify-center rounded-full bg-card shadow-[var(--panel-shadow)]">
                        <span className="text-[1.65rem] font-medium leading-none tabular-nums tracking-tight">
                            {snapshot.astronaut.missionDay}
                        </span>
                        <span className="mt-1.5 text-center text-[9px] leading-3 tracking-[0.16em] text-muted-foreground uppercase">
                            Days in
                            <br />
                            space
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            className={cn(
                                "rounded-full",
                                snapshot.scenario === "mild" &&
                                    "bg-foreground text-background hover:bg-foreground/90",
                            )}
                            onClick={() => void selectScenario("mild")}
                        >
                            Simulate vitals drift
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                                "rounded-full border-destructive/40 text-destructive hover:bg-destructive/10",
                                dire &&
                                    "border-transparent bg-destructive text-white hover:bg-destructive/90",
                            )}
                            onClick={() => void selectScenario("dire")}
                        >
                            Simulate flare event
                        </Button>
                    </div>
                </div>

                <div className="sticky top-0 z-20 -mx-1 bg-background/90 px-1 pb-2 backdrop-blur-md">
                    <Panel className="flex flex-col gap-5 p-6">
                        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="font-serif text-3xl tracking-tight md:text-4xl">
                                            {loading
                                                ? "Looking into it…"
                                                : "Hey, how are you feeling?"}
                                        </h2>
                                        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                                            Tell Iris how you feel. It compares
                                            your report with your live vitals,
                                            cabin air, and space weather against
                                            your personal baseline, then names
                                            what to check next.
                                        </p>
                                    </div>
                                </div>
                                <Input
                                    className="mt-5"
                                    value={message}
                                    onChange={(event) =>
                                        setMessage(event.target.value)
                                    }
                                    onKeyDown={(event) =>
                                        event.key === "Enter" &&
                                        void investigate()
                                    }
                                    placeholder="Just ask me anything"
                                />
                                {recording || grokText ? (
                                    <p className="mt-2 truncate text-xs text-muted-foreground">
                                        {grokLive
                                            ? `Grok Voice heard: ${grokText || "listening…"}`
                                            : grokReady
                                              ? "Grok Voice is capturing this report…"
                                              : "Recording locally…"}
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col items-center gap-2 self-center md:self-start">
                                <button
                                    type="button"
                                    onClick={() => void toggleRecording()}
                                    disabled={loading || espBusy}
                                    aria-label={
                                        recording
                                            ? "Stop recording voice report"
                                            : espLinked
                                              ? "Record voice report on IrisKey mic"
                                              : "Record voice report on laptop mic"
                                    }
                                    className={cn(
                                        "grid size-24 place-items-center rounded-full shadow-[var(--mic-shadow)] transition disabled:opacity-60",
                                        recording && "bg-destructive text-white",
                                    )}
                                    style={
                                        recording
                                            ? undefined
                                            : {
                                                  background: "var(--mic-accent)",
                                                  color: "var(--mic-accent-fg)",
                                              }
                                    }
                                >
                                    <Mic className="size-8" />
                                </button>
                                <p className="max-w-[7.5rem] text-center text-[11px] leading-tight text-muted-foreground">
                                    Mic:{" "}
                                    {espLinked
                                        ? "IrisKey (preferred)"
                                        : "IrisKey"}
                                </p>
                            </div>
                        </div>
                    </Panel>
                </div>

                {finding
                    ? (() => {
                          const sections = investigationSections(finding.text);
                          const hasSections =
                              sections.predictions.length +
                                  sections.historicalAnalysis.length +
                                  sections.possibleCauses.length >
                              0;
                          return (
                              <Panel className="flex flex-col gap-5 p-6">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                      <h2 className="font-serif text-2xl tracking-tight">
                                          Analysis
                                      </h2>
                                      <div className="flex items-center gap-2">
                                          <span
                                              className={cn(
                                                  "rounded-full px-2.5 py-1 text-[11px] font-medium",
                                                  finding.severity === "high"
                                                      ? "bg-destructive/15 text-destructive"
                                                      : "bg-muted text-muted-foreground",
                                              )}
                                          >
                                              {finding.severity === "high"
                                                  ? "High priority"
                                                  : "Monitoring"}
                                          </span>
                                          <Button
                                              variant="ghost"
                                              size="icon-sm"
                                              onClick={() =>
                                                  void speak(finding.speak)
                                              }
                                              aria-label="Repeat spoken guidance"
                                          >
                                              <Volume2 />
                                          </Button>
                                      </div>
                                  </div>
                                  {finding.heard &&
                                  finding.voiceEngine === "grok-voice" ? (
                                      <p className="text-xs text-muted-foreground">
                                          Grok Voice heard: {finding.heard}
                                      </p>
                                  ) : null}
                                  {hasSections ? (
                                      <div className="space-y-5">
                                          {(
                                              [
                                                  {
                                                      title: "Predictions",
                                                      body: sections.predictions,
                                                  },
                                                  {
                                                      title: "What could be causing these symptoms",
                                                      body: sections.possibleCauses,
                                                  },
                                                  {
                                                      title: "Historical analysis",
                                                      body: sections.historicalAnalysis,
                                                  },
                                              ] as const
                                          ).map((section) =>
                                              section.body.length ? (
                                                  <section
                                                      key={section.title}
                                                      className="rounded-2xl bg-muted/45 px-4 py-4"
                                                  >
                                                      <h3 className="font-serif text-lg tracking-tight">
                                                          {section.title}
                                                      </h3>
                                                      <div className="mt-2 space-y-3 text-sm leading-7 text-foreground/90">
                                                          {section.body.map(
                                                              (paragraph) => (
                                                                  <p
                                                                      key={
                                                                          paragraph
                                                                      }
                                                                  >
                                                                      {
                                                                          paragraph
                                                                      }
                                                                  </p>
                                                              ),
                                                          )}
                                                      </div>
                                                  </section>
                                              ) : null,
                                          )}
                                      </div>
                                  ) : (
                                      <p className="whitespace-pre-wrap text-sm leading-6">
                                          {finding.text
                                              .replaceAll("## ", "")
                                              .replaceAll("**", "")}
                                      </p>
                                  )}
                                  <div className="flex flex-wrap gap-2">
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
                              </Panel>
                          );
                      })()
                    : null}

                <div className="grid gap-4 lg:grid-cols-12">
                    <Panel className="lg:col-span-4">
                        <div className="mb-4 flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                Crew
                            </p>
                            <p className="text-xs text-muted-foreground">
                                vs baseline
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                            {snapshot.vitals.map((metric) => (
                                <MetricTile
                                    key={metric.label}
                                    metric={metric}
                                />
                            ))}
                        </div>
                    </Panel>

                    <Panel className="lg:col-span-4">
                        <p className="mb-4 text-sm text-muted-foreground">
                            Habitat
                        </p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                            {snapshot.cabin.map((metric) => (
                                <MetricTile
                                    key={metric.label}
                                    metric={metric}
                                />
                            ))}
                        </div>
                    </Panel>

                    <Panel className="flex flex-col gap-4 lg:col-span-4">
                        <p className="text-sm text-muted-foreground">
                            Space weather
                        </p>
                        {flare ? <FlareStatus metric={flare} /> : null}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                            {radiation ? (
                                <MetricTile metric={radiation} />
                            ) : null}
                            {spe ? <MetricTile metric={spe} /> : null}
                        </div>
                    </Panel>
                </div>

                <div className="grid gap-4 lg:grid-cols-12">
                    <Panel className="lg:col-span-7">
                        <p className="mb-3 text-sm text-muted-foreground">
                            Investigation
                        </p>
                        {finding?.recommendedActions?.length ? (
                            <div className="space-y-3 text-sm leading-6">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Immediate actions
                                    </p>
                                    <ul className="mt-1 list-disc space-y-1 pl-4">
                                        {finding.recommendedActions.map(
                                            (action) => (
                                                <li key={action}>{action}</li>
                                            ),
                                        )}
                                    </ul>
                                </div>
                                {finding.possibleConcerns?.length ? (
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground">
                                            Working concerns
                                        </p>
                                        <ul className="mt-1 list-disc space-y-1 pl-4">
                                            {finding.possibleConcerns.map(
                                                (concern) => (
                                                    <li key={concern}>
                                                        {concern}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <p className="text-sm leading-6 text-muted-foreground">
                                {flareActive
                                    ? `A solar flare is active and hull radiation is ${radiation?.value ?? "elevated"} mSv/h. Use the report box above when flashes, nausea, breathlessness, or suit-pressure warnings show up.`
                                    : heart
                                      ? `Heart rate is ${heart.value} bpm against a resting baseline of ${heart.baseline}. Cabin air and solar weather are in view — report above if something feels off.`
                                      : "Use the report box at the top when something feels off. Iris will expand that panel with predictions, historical OSDR analysis, and possible causes."}
                            </p>
                        )}
                    </Panel>

                    <Panel className="lg:col-span-5">
                        <p className="mb-4 text-sm text-muted-foreground">
                            Comms log
                        </p>
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
                                        <p className="truncate text-sm">
                                            {log.summary}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            {log.channel === "voice"
                                                ? "voiced"
                                                : log.channel === "typed"
                                                  ? "typed"
                                                  : log.channel === "speak"
                                                    ? "Iris reply"
                                                    : log.channel}{" "}
                                            · {log.direction} · sent{" "}
                                            {formatClock(log.sentAt)} · recv{" "}
                                            {formatClock(
                                                log.actualReceivedAt ??
                                                    log.receivedAt,
                                            )}{" "}
                                            ·{" "}
                                            {formatLatency(
                                                log.actualLatencyMs ??
                                                    log.latencyMs,
                                            )}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>

                <Panel>
                    <p className="mb-4 text-sm text-muted-foreground">
                        Other crew
                    </p>
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
                                        <p className="text-sm font-medium">
                                            {peer.name}
                                        </p>
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
