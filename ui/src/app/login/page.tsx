"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, UsbIcon } from "lucide-react";

import { useSession } from "@/components/iris/session-provider";
import { roleHome } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

const DEMO_DOCTOR_DEVICE = "IRIS-0042";
const DEMO_PATIENT_DEVICE = "IRIS-PATIENT-1048";

export default function LoginPage() {
  const router = useRouter();
  const { state, connect, connectSimulated, signOut, serialSupported } =
    useSession();

  // The credential decides where you land. There is no role picker, because a
  // role you can choose is not a role.
  const home = roleHome(state.actor?.role);

  useEffect(() => {
    if (state.status !== "authenticated" || !home) return;
    // A beat on the confirmation, so the key is visibly accepted rather than
    // the screen just vanishing.
    const timer = setTimeout(() => router.push(home), 900);
    return () => clearTimeout(timer);
  }, [home, router, state.status]);

  const connecting = state.status === "connecting";
  const authenticated = state.status === "authenticated";

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Card className="w-96">
        <CardContent className="flex flex-col items-center gap-5 py-4 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            IR
          </span>

          {authenticated && state.actor ? (
            <div className="flex flex-col items-center gap-1">
              <CheckCircle2Icon className="size-5 text-allowed" />
              <p className="text-lg font-semibold">{state.actor.name}</p>
              <p className="text-sm text-muted-foreground">
                {state.actor.department}
              </p>
              {home ? null : (
                <p className="pt-2 text-sm text-restricted">
                  This key has no view in this build.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight">
                Insert your CareKey
              </h1>
              <p className="text-sm text-muted-foreground">
                There is no password. The key answers a challenge from the
                server and stays present for as long as you are signed in.
              </p>
            </div>
          )}

          {connecting ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {state.message ?? "Checking the key..."}
            </div>
          ) : null}

          {authenticated ? (
            home ? null : (
              <Button variant="outline" onClick={() => void signOut()}>
                End session
              </Button>
            )
          ) : (
            <div className="flex w-full flex-col gap-3">
              <Button
                onClick={() => void connect()}
                disabled={!serialSupported || connecting}
              >
                <UsbIcon data-icon="inline-start" />
                Connect
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  or use a demo key
                </span>
                <Separator className="flex-1" />
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => void connectSimulated(DEMO_DOCTOR_DEVICE)}
                  disabled={connecting}
                >
                  Doctor - Dr. Maya Chen
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void connectSimulated(DEMO_PATIENT_DEVICE)}
                  disabled={connecting}
                >
                  Patient - Maya Patel
                </Button>
              </div>
            </div>
          )}

          {state.status === "locked" && state.message ? (
            <p className="text-sm text-restricted">{state.message}</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
