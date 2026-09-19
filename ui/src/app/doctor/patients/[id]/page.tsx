"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  MessageCircleIcon,
  MicIcon,
  SquareIcon,
  TriangleAlertIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

import { postJson } from "@/lib/fetcher";
import type { FragmentView, Lens } from "@/lib/lens";
import { BreakGlassDialog } from "@/components/iris/break-glass-dialog";
import { DoctorHandoffDialog } from "@/components/iris/doctor-handoff-dialog";
import { DoctorVisitNotes } from "@/components/iris/doctor-visit-notes";
import { EmergencyBanner } from "@/components/iris/emergency-banner";
import { LockedPanel, WrongRolePanel } from "@/components/iris/locked-panel";
import { useSession } from "@/components/iris/session-provider";
import { useVoice } from "@/hooks/use-voice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Clinical reading order. Anything not listed here is header or metadata. */
const CARD_ORDER = [
  "vitals",
  "allergies",
  "medications",
  "cardiac_history",
  "diagnoses",
  "labs",
  "procedures",
  "clinical_note",
  "psychiatric_note",
  "outcome",
];

const PURPOSES = [
  { value: "treatment", label: "Treatment" },
  { value: "research", label: "Research" },
];

function ageLine(dob: FragmentView | undefined): string | null {
  const value = dob?.value;
  if (!value) return null;
  // Research reduces the birth date to a band, which is already the line.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const born = new Date(value);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return `${age} years old - born ${value}`;
}

export default function PatientChartPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const { state, confirmOnDevice, setKeyState } = useSession();
  const voice = useVoice();

  const [purpose, setPurpose] = useState("treatment");
  const [overrideLens, setOverrideLens] = useState<Lens | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [utterance, setUtterance] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [noteCaptureActive, setNoteCaptureActive] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffFormKey, setHandoffFormKey] = useState(0);
  const [handoffCaptureActive, setHandoffCaptureActive] = useState(false);

  const captureBusy = noteCaptureActive || handoffCaptureActive;

  const sessionId = state.sessionId;

  /**
   * Each (patient, purpose) pair is one policy evaluation and one audit event,
   * so the request is keyed on exactly that and not revalidated behind our back.
   */
  const { data: lensData, mutate: reloadLens } = useSWR(
    sessionId ? (["lens", sessionId, patientId, purpose] as const) : null,
    async ([, session, patient, currentPurpose]) => {
      const payload = await postJson<{ lens: Lens }>("/api/context", {
        sessionId: session,
        patientId: patient,
        purpose: currentPurpose,
        task: null,
      });
      return payload.lens;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      onSuccess: (result) => {
        setOverrideLens(null);
        void setKeyState(
          result.breakGlass
            ? "emergency"
            : result.restrictedCount > 0
              ? "limited"
              : "authenticated",
        );
      },
      onError: (error: Error) => toast.error(error.message),
    },
  );

  // Voice answers and break-glass return a lens directly; prefer it when present.
  const lens = overrideLens ?? lensData ?? null;

  const byType = useMemo(() => {
    const map = new Map<string, FragmentView>();
    for (const fragment of lens?.fragments ?? []) {
      map.set(fragment.fragmentType, fragment);
    }
    return map;
  }, [lens]);

  const cards = CARD_ORDER.map((type) => byType.get(type)).filter(
    (fragment): fragment is FragmentView =>
      fragment !== undefined &&
      fragment.decision !== "deny" &&
      Boolean(fragment.value),
  );

  const restricted = useMemo(
    () => lens?.fragments.filter((fragment) => fragment.decision === "deny") ?? [],
    [lens],
  );

  const submitUtterance = useCallback(
    async (text: string) => {
      if (!sessionId || text.trim().length < 2) return;
      setBusy(true);
      setAnswer(null);
      try {
        const response = await fetch("/api/voice/interpret", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, patientId, utterance: text }),
        });
        const payload = (await response.json()) as {
          error?: string;
          intent?: { purpose: string };
          lens?: Lens;
          answer?: string;
          requiresBreakGlass?: boolean;
          included?: string[];
          excluded?: string[];
          action?: { title: string };
        };

        if (!response.ok) {
          toast.error(payload.error ?? "Could not interpret that request.");
          return;
        }

        if (payload.requiresBreakGlass) {
          setBreakGlassOpen(true);
          void voice.speak("Confirm emergency access, then record the reason.");
          return;
        }

        if (payload.action && payload.included) {
          toast.success(payload.action.title, {
            description: `${payload.included.length} authorized fields included, ${payload.excluded?.length ?? 0} excluded.`,
          });
          return;
        }

        // A purpose the request implies wins over the toggle, and the toggle
        // moves to match so the doctor can see which lens they are reading.
        if (
          payload.intent &&
          payload.intent.purpose !== purpose &&
          PURPOSES.some((option) => option.value === payload.intent!.purpose)
        ) {
          setPurpose(payload.intent.purpose);
        }
        if (payload.lens) setOverrideLens(payload.lens);
        if (payload.answer) setAnswer(payload.answer);
      } finally {
        setBusy(false);
      }
    },
    [patientId, purpose, sessionId, voice],
  );

  const handleMic = useCallback(async () => {
    if (captureBusy) {
      toast.message("Finish the other recording first.");
      return;
    }
    if (voice.listening) {
      voice.stop();
      return;
    }
    const text = await voice.listen();
    if (text) {
      setUtterance(text);
      await submitUtterance(text);
    }
  }, [captureBusy, submitUtterance, voice]);

  const openHandoff = useCallback(() => {
    if (captureBusy) {
      toast.message("Finish the other recording first.");
      return;
    }
    setHandoffFormKey((key) => key + 1);
    setHandoffOpen(true);
  }, [captureBusy]);

  if (state.status !== "authenticated" || !sessionId) {
    return <LockedPanel state={state} />;
  }
  if (state.actor?.role !== "physician") {
    return <WrongRolePanel actor={state.actor} />;
  }

  const visitReason = byType.get("visit_reason");
  const age = ageLine(byType.get("date_of_birth"));
  const locked = lens !== null && lens.allowedCount === 0 && !lens.breakGlass;

  return (
    <>
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-6 pb-28">
        <EmergencyBanner
          until={lens?.breakGlass ? lens.breakGlassExpiresAt : null}
          reason={lens?.breakGlassReason ?? null}
          onExpire={() => void reloadLens()}
        />

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {lens?.patient.displayName ?? patientId}
          </h1>
          {age ? <p className="text-sm text-muted-foreground">{age}</p> : null}
          {visitReason?.value ? (
            <p className="text-sm">{visitReason.value}</p>
          ) : null}
          {lens?.summary ? (
            <p className="text-sm text-muted-foreground">{lens.summary}</p>
          ) : null}
        </div>

        {lens ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-allowed/50 text-allowed">
              {lens.allowedCount} authorized
            </Badge>
            {lens.restrictedCount > 0 ? (
              <Badge
                variant="outline"
                className="border-restricted/50 text-restricted"
              >
                {lens.restrictedCount} withheld
              </Badge>
            ) : null}
            <Badge variant="secondary">{lens.purposeLabel}</Badge>
          </div>
        ) : null}

        <ToggleGroup
          type="single"
          value={purpose}
          onValueChange={(value) => {
            if (value) setPurpose(value);
          }}
          variant="outline"
          className="w-fit"
        >
          {PURPOSES.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {locked ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border px-4 py-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                This patient is not on your care team
              </p>
              <p className="text-sm text-muted-foreground">
                Nothing has been decrypted. Emergency access is available now,
                and it will be on the record.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-emergency/50 text-emergency"
              onClick={() => setBreakGlassOpen(true)}
            >
              <ZapIcon data-icon="inline-start" />
              Break glass
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {cards.map((fragment) => (
            <section
              key={fragment.id}
              className="flex flex-col gap-1.5 rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">{fragment.label}</h2>
                {fragment.decision === "allow_transformed" ? (
                  <Badge
                    variant="outline"
                    className="border-limited/50 text-limited"
                  >
                    Redacted
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {fragment.value}
              </p>
            </section>
          ))}
        </div>

        {restricted.length > 0 ? (
          <details className="rounded-lg border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              {lens?.restrictedCount ?? restricted.length} field
              {(lens?.restrictedCount ?? restricted.length) === 1 ? "" : "s"}{" "}
              withheld for this purpose
            </summary>
            <ul className="mt-3 flex flex-col gap-2">
              {restricted.map((fragment) => (
                <li
                  key={fragment.id}
                  className="flex gap-2 text-sm text-muted-foreground"
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-restricted" />
                  <span>
                    <span className="font-medium text-foreground">
                      {fragment.label}
                    </span>
                    {" — "}
                    {fragment.reason}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {lens && restricted.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Withheld fields were never decrypted for this request.{" "}
            <Link href="/patient" className="underline">
              The patient can see this access
            </Link>
            .
          </p>
        ) : null}

        {!locked ? (
          <DoctorVisitNotes
            sessionId={sessionId}
            patientId={patientId}
            onSaved={() => void reloadLens()}
            onCaptureActiveChange={setNoteCaptureActive}
            assistantOpen={panelOpen}
            onRequestCloseAssistant={() => setPanelOpen(false)}
            otherCaptureActive={handoffCaptureActive}
            onCreateHandoff={openHandoff}
          />
        ) : null}
      </main>

      {panelOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-4">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">Iris assistant</p>
              <p className="text-xs text-muted-foreground">
                Scoped answers from this chart only — not visit documentation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={utterance}
                onChange={(event) => setUtterance(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitUtterance(utterance);
                }}
                placeholder="Ask a clinical question about this patient"
                autoFocus
                disabled={captureBusy}
              />
              <Button
                variant={voice.listening ? "destructive" : "secondary"}
                size="icon"
                disabled={captureBusy}
                onClick={() => void handleMic()}
              >
                {voice.listening ? (
                  <SquareIcon className="size-4" />
                ) : (
                  <MicIcon className="size-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setPanelOpen(false)}>
                <XIcon className="size-4" />
              </Button>
            </div>

            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Evaluating policy...
              </div>
            ) : null}

            {answer ? (
              <p className="max-h-48 overflow-y-auto text-sm leading-relaxed whitespace-pre-line">
                {answer}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {lens?.breakGlass ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emergency/50 text-emergency"
                  onClick={() => setBreakGlassOpen(true)}
                >
                  <ZapIcon data-icon="inline-start" />
                  Break glass
                </Button>
              )}
              {voice.listening ? (
                <span className="text-xs text-muted-foreground">
                  Listening... {voice.interim}
                </span>
              ) : null}
              {voice.error ? (
                <span className="text-xs text-restricted">{voice.error}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <Button
          className="fixed right-6 bottom-6 z-40 gap-2 rounded-full px-4 shadow-lg"
          onClick={() => {
            if (captureBusy) {
              toast.message("Finish the other recording first.");
              return;
            }
            setPanelOpen(true);
          }}
        >
          <MessageCircleIcon className="size-5" />
          Ask Iris
        </Button>
      )}

      <DoctorHandoffDialog
        key={handoffFormKey}
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        sessionId={sessionId}
        patientId={patientId}
        onCreated={() => void reloadLens()}
        onCaptureActiveChange={setHandoffCaptureActive}
        otherCaptureActive={noteCaptureActive}
      />

      <BreakGlassDialog
        open={breakGlassOpen}
        onOpenChange={setBreakGlassOpen}
        sessionId={sessionId}
        patientId={patientId}
        simulated={state.simulated}
        confirmOnDevice={confirmOnDevice}
        onGranted={(granted) => {
          setOverrideLens(granted);
          void setKeyState("emergency");
        }}
        voice={voice}
      />
    </>
  );
}
