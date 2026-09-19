"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2Icon,
  CpuIcon,
  KeyRoundIcon,
  LockIcon,
  TriangleAlertIcon,
  UsbIcon,
} from "lucide-react";

import useSWR from "swr";

import { getJson } from "@/lib/fetcher";
import { useSession } from "@/components/iris/session-provider";
import type { SessionState } from "@/hooks/use-iris-session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

interface DeviceOption {
  id: string;
  label: string;
}

const ROLE_HOME: Record<string, string> = {
  physician: "/provider",
  nurse: "/provider",
  reception: "/provider",
  engineer: "/engineer",
};

export default function HomePage() {
  const router = useRouter();
  const { state, connect, connectSimulated, signOut, serialSupported } =
    useSession();
  const { data } = useSWR<{ devices: DeviceOption[]; store: string }>(
    "/api/patients",
    getJson,
  );
  const devices = data?.devices ?? [];
  const storeKind = data?.store ?? "";

  useEffect(() => {
    if (state.status !== "authenticated" || !state.actor) return;
    const destination = ROLE_HOME[state.actor.role] ?? "/provider";
    const timer = setTimeout(() => router.push(destination), 900);
    return () => clearTimeout(timer);
  }, [router, state.actor, state.status]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-14">
      <div className="flex flex-col gap-3">
        <Badge variant="secondary" className="w-fit">
          Purpose-bound patient context
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight">
          Most systems ask whether you can open the chart.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Iris also asks why you are opening it right now, and what you actually
          need for that task. Start by presenting your Iris Key.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-4" />
              Hardware authentication
            </CardTitle>
            <CardDescription>
              The Iris Key answers a server-issued challenge with an HMAC over a
              per-device secret. The browser only carries the message.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SessionPanel state={state} />

            {state.status === "authenticated" ? (
              <Button variant="outline" onClick={() => void signOut()}>
                End session
              </Button>
            ) : (
              <Button
                onClick={() => void connect()}
                disabled={!serialSupported || state.status === "connecting"}
              >
                <UsbIcon data-icon="inline-start" />
                Connect Iris Key over USB
              </Button>
            )}

            {!serialSupported ? (
              <Alert>
                <TriangleAlertIcon />
                <AlertTitle>WebSerial is unavailable in this browser</AlertTitle>
                <AlertDescription>
                  Use Chrome or Edge to talk to the board, or start a simulated
                  key below.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col items-start gap-3">
            <Separator />
            <p className="text-xs text-muted-foreground">
              A hardware-backed credential verifies a registered device tied to a
              user. It does not prove, on its own, which human is holding it.
            </p>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CpuIcon className="size-4" />
              No board to hand?
            </CardTitle>
            <CardDescription>
              Simulated keys follow the identical challenge-response path, signed
              server-side. Every event they produce is tagged{" "}
              <code className="text-xs">simulated</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {devices.map((device) => (
              <Button
                key={device.id}
                variant="outline"
                className="justify-start"
                onClick={() => void connectSimulated(device.id)}
                disabled={state.status === "connecting"}
              >
                <LockIcon data-icon="inline-start" />
                {device.label}
              </Button>
            ))}
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading devices...</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Store: {storeKind === "tiger" ? "Tiger Data" : "in-memory (no DATABASE_URL set)"}
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

function SessionPanel({ state }: { state: SessionState }) {
  if (state.status === "connecting") {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
        <Spinner />
        <div>
          <p className="text-sm font-medium">Authenticating...</p>
          <p className="text-xs text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === "authenticated" && state.actor) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-allowed/40 bg-allowed/5 p-4">
        <div className="flex items-center gap-2 text-allowed">
          <CheckCircle2Icon className="size-4" />
          <span className="text-sm font-medium">Iris Key verified</span>
        </div>
        <p className="text-lg font-semibold">{state.actor.name}</p>
        <p className="text-sm text-muted-foreground">
          {state.actor.role} - {state.actor.department}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="outline">{state.deviceId}</Badge>
          {state.simulated ? <Badge variant="secondary">simulated</Badge> : null}
        </div>
      </div>
    );
  }

  if (state.status === "terminated") {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Hardware presence lost - session terminated</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
      <LockIcon className="size-4 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Locked</p>
        <p className="text-xs text-muted-foreground">
          {state.message ?? "Waiting for an Iris Key."}
        </p>
      </div>
    </div>
  );
}
