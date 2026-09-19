"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileTextIcon,
  MicIcon,
  SquareIcon,
  TriangleAlertIcon,
  UserIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

import { getJson, postJson } from "@/lib/fetcher";
import { BreakGlassDialog } from "@/components/iris/break-glass-dialog";
import { FragmentCard, type FragmentView } from "@/components/iris/fragment-card";
import { LockedPanel } from "@/components/iris/locked-panel";
import { useSession } from "@/components/iris/session-provider";
import { useVoice } from "@/hooks/use-voice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface Lens {
  sessionId: string;
  actor: { id: string; name: string; role: string; department: string };
  patient: { id: string; displayName: string; pseudonym: string };
  purpose: string;
  effectivePurpose: string;
  purposeLabel: string;
  task: string | null;
  breakGlass: boolean;
  breakGlassExpiresAt: string | null;
  breakGlassReason: string | null;
  fragments: FragmentView[];
  allowedCount: number;
  restrictedCount: number;
  summary: string;
  ruleId: string | null;
}

const PURPOSE_OPTIONS = [
  { value: "treatment", label: "Treatment" },
  { value: "medication_prescription", label: "Prescribing" },
  { value: "research", label: "Research" },
];

interface PatientOption {
  id: string;
  displayName: string;
}

export default function ProviderPage() {
  const { state, confirmOnDevice, setKeyState } = useSession();
  const voice = useVoice();

  const [patientId, setPatientId] = useState("P1048");
  const [purpose, setPurpose] = useState("treatment");
  const [overrideLens, setOverrideLens] = useState<Lens | null>(null);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerSource, setAnswerSource] = useState<string | null>(null);
  const [detectedIntent, setDetectedIntent] = useState<string | null>(null);
  const [utterance, setUtterance] = useState("");
  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [handoff, setHandoff] = useState<{
    title: string;
    included: string[];
    excluded: string[];
  } | null>(null);

  const sessionId = state.sessionId;

  const { data: patientData } = useSWR<{ patients: PatientOption[] }>(
    "/api/patients",
    getJson,
  );
  const patients = patientData?.patients ?? [];

  /**
   * Each (patient, purpose) pair is one policy evaluation and one audit event, so
   * the request is keyed on exactly that and not revalidated behind our back.
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

  const submitUtterance = useCallback(
    async (text: string) => {
      if (!sessionId || text.trim().length < 2) return;
      setLoading(true);
      setAnswer(null);
      try {
        const response = await fetch("/api/voice/interpret", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, patientId, utterance: text }),
        });
        const payload = (await response.json()) as {
          error?: string;
          intent?: { purpose: string; task: string | null; source: string; action: string };
          tool?: string;
          lens?: Lens;
          answer?: string;
          answerSource?: string;
          requiresBreakGlass?: boolean;
          action?: { title: string };
          included?: string[];
          excluded?: string[];
          delegation?: { id: string; expiresAt: string; scope: string[] };
        };

        if (!response.ok) {
          toast.error(payload.error ?? "Could not interpret that request.");
          return;
        }

        if (payload.intent) {
          setDetectedIntent(
            `${payload.tool} - purpose ${payload.intent.purpose}${
              payload.intent.task ? `, task ${payload.intent.task}` : ""
            } (${payload.intent.source})`,
          );
          if (payload.intent.purpose !== purpose && payload.lens) {
            setPurpose(payload.intent.purpose);
          }
        }

        if (payload.requiresBreakGlass) {
          setBreakGlassOpen(true);
          void voice.speak("State the reason for emergency access.");
          return;
        }

        if (payload.delegation) {
          toast.success("Scoped engineering delegation created", {
            description: `Expires ${new Date(payload.delegation.expiresAt).toLocaleTimeString()} - scope: ${payload.delegation.scope.join(", ")}`,
          });
          return;
        }

        if (payload.action && payload.included) {
          setHandoff({
            title: payload.action.title,
            included: payload.included,
            excluded: payload.excluded ?? [],
          });
          toast.success("Handoff created", {
            description: `${payload.included.length} fields included, ${payload.excluded?.length ?? 0} excluded.`,
          });
          return;
        }

        if (payload.lens) setOverrideLens(payload.lens);
        if (payload.answer) {
          setAnswer(payload.answer);
          setAnswerSource(payload.answerSource ?? null);
        }
      } finally {
        setLoading(false);
      }
    },
    [patientId, purpose, sessionId, voice],
  );

  const handleMic = useCallback(async () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    const text = await voice.listen();
    if (text) {
      setUtterance(text);
      await submitUtterance(text);
    }
  }, [submitUtterance, voice]);

  const createHandoff = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/actions/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, patientId, specialty: "Cardiology" }),
      });
      const payload = (await response.json()) as {
        action?: { title: string };
        included?: string[];
        excluded?: string[];
        error?: string;
      };
      if (!response.ok || !payload.action) {
        toast.error(payload.error ?? "Could not create the handoff.");
        return;
      }
      setHandoff({
        title: payload.action.title,
        included: payload.included ?? [],
        excluded: payload.excluded ?? [],
      });
      toast.success("Cardiology handoff created");
      void reloadLens();
    } finally {
      setLoading(false);
    }
  }, [patientId, reloadLens, sessionId]);

  const grantEngineering = useCallback(async () => {
    if (!sessionId) return;
    const response = await fetch("/api/actions/delegation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        patientId,
        minutes: 30,
        reason: "Debug duplicate medication reconciliation rows",
      }),
    });
    const payload = (await response.json()) as {
      delegation?: { expiresAt: string };
      error?: string;
    };
    if (!response.ok || !payload.delegation) {
      toast.error(payload.error ?? "Could not create the delegation.");
      return;
    }
    toast.success("30-minute engineering delegation created", {
      description: "Alex Kim must authenticate with their own Iris Key.",
    });
  }, [patientId, sessionId]);

  const allowed = useMemo(
    () => lens?.fragments.filter((fragment) => fragment.decision !== "deny") ?? [],
    [lens],
  );
  const restricted = useMemo(
    () => lens?.fragments.filter((fragment) => fragment.decision === "deny") ?? [],
    [lens],
  );

  if (state.status !== "authenticated" || !sessionId) {
    return <LockedPanel state={state} />;
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {state.actor?.name} - {state.actor?.role}, {state.actor?.department}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Iris Lens</h1>
        </div>
        <div className="flex items-center gap-2">
          {patients.map((patient) => (
            <Button
              key={patient.id}
              size="sm"
              variant={patient.id === patientId ? "default" : "outline"}
              onClick={() => setPatientId(patient.id)}
            >
              <UserIcon data-icon="inline-start" />
              {patient.displayName}
            </Button>
          ))}
        </div>
      </div>

      {lens?.breakGlass ? (
        <Alert className="border-emergency/50 bg-emergency/10">
          <ZapIcon className="text-emergency" />
          <AlertTitle className="text-emergency">Emergency access active</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            <span>Reason: {lens.breakGlassReason}</span>
            <span>
              Expires{" "}
              {lens.breakGlassExpiresAt
                ? new Date(lens.breakGlassExpiresAt).toLocaleTimeString()
                : "shortly"}
              . This event has been logged and flagged for review.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current purpose</CardTitle>
          <CardDescription>
            Same account, same patient. The purpose decides the view.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{lens?.ruleId ?? "no rule"}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            value={purpose}
            onValueChange={(value) => {
              if (value) setPurpose(value);
            }}
            variant="outline"
          >
            {PURPOSE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={utterance}
              onChange={(event) => setUtterance(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitUtterance(utterance);
              }}
              placeholder="Ask Iris - e.g. I'm evaluating Maya's chest pain, show me what matters"
              className="min-w-72 flex-1"
            />
            <Button
              variant={voice.listening ? "destructive" : "secondary"}
              onClick={() => void handleMic()}
            >
              {voice.listening ? (
                <SquareIcon data-icon="inline-start" />
              ) : (
                <MicIcon data-icon="inline-start" />
              )}
              {voice.listening ? "Stop" : "Voice"}
            </Button>
            <Button onClick={() => void submitUtterance(utterance)} disabled={loading}>
              Ask
            </Button>
            <Separator orientation="vertical" className="h-8" />
            <Button variant="outline" onClick={() => void createHandoff()}>
              <FileTextIcon data-icon="inline-start" />
              Create handoff
            </Button>
            <Button variant="outline" onClick={() => void grantEngineering()}>
              <WrenchIcon data-icon="inline-start" />
              Grant engineering view
            </Button>
            <Button
              variant="outline"
              className="border-emergency/50 text-emergency"
              onClick={() => setBreakGlassOpen(true)}
            >
              <ZapIcon data-icon="inline-start" />
              Break glass
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Voice: {voice.config.mode === "grok" ? "Grok voice API" : "browser transcription"}
            </span>
            <span>Intent: {voice.config.intentSource}</span>
            {voice.listening ? (
              <span className="text-foreground">Listening... {voice.interim}</span>
            ) : null}
            {voice.error ? <span className="text-restricted">{voice.error}</span> : null}
            {detectedIntent ? <Badge variant="secondary">{detectedIntent}</Badge> : null}
          </div>
        </CardContent>
      </Card>

      {answer ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scoped answer</CardTitle>
            <CardDescription>
              Generated from authorized fields only
              {answerSource ? ` (${answerSource})` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-line">{answer}</p>
          </CardContent>
        </Card>
      ) : null}

      {handoff ? (
        <Card className="border-allowed/40 bg-allowed/5">
          <CardHeader>
            <CardTitle className="text-base">{handoff.title}</CardTitle>
            <CardDescription>
              {handoff.included.length} authorized fields included,{" "}
              {handoff.excluded.length} unrelated fields excluded. Audit event
              created.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-allowed">Included</p>
              {handoff.included.map((item) => (
                <span key={item} className="text-xs text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-restricted">Excluded</p>
              {handoff.excluded.map((item) => (
                <span key={item} className="text-xs text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {lens ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <h2 className="text-xl font-semibold">
                {lens.patient.displayName}
              </h2>
              <p className="text-sm text-muted-foreground">{lens.summary}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-allowed/50 text-allowed">
                {lens.allowedCount} authorized
              </Badge>
              <Badge
                variant="outline"
                className="border-restricted/50 text-restricted"
              >
                {lens.restrictedCount} restricted
              </Badge>
              <Badge variant="secondary">{lens.purposeLabel}</Badge>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Evaluating policy...
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {allowed.map((fragment) => (
              <FragmentCard
                key={fragment.id}
                fragment={fragment}
                emergency={lens.breakGlass}
              />
            ))}
          </div>

          {restricted.length > 0 ? (
            <>
              <div className="flex items-center gap-2 pt-2">
                <TriangleAlertIcon className="size-4 text-restricted" />
                <h3 className="text-sm font-medium">
                  Restricted for this purpose
                </h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {restricted.map((fragment) => (
                  <FragmentCard key={fragment.id} fragment={fragment} />
                ))}
              </div>
            </>
          ) : null}

          <p className="pt-2 text-xs text-muted-foreground">
            Restricted fields were never decrypted for this request.{" "}
            <Link href="/patient" className="underline">
              The patient can see this access
            </Link>
            .
          </p>
        </div>
      ) : null}

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
    </main>
  );
}
