"use client";

import { useCallback, useState } from "react";
import { ClockIcon, TerminalIcon } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

import { getJson, postJson } from "@/lib/fetcher";
import type { Lens } from "@/app/provider/page";
import { FragmentCard } from "@/components/iris/fragment-card";
import { LockedPanel } from "@/components/iris/locked-panel";
import { useSession } from "@/components/iris/session-provider";
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

interface Delegation {
  id: string;
  createdBy: string;
  patientId: string;
  encounterId: string | null;
  purpose: string;
  scope: string[];
  reason: string;
  expiresAt: string;
}

export default function EngineerPage() {
  const { state } = useSession();
  const [lens, setLens] = useState<Lens | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const sessionId = state.sessionId;

  const { data } = useSWR<{ delegations: Delegation[] }>(
    "/api/actions/delegation",
    getJson,
    { refreshInterval: 5000 },
  );

  // The API only returns delegations that have not expired or been revoked.
  const delegations = data?.delegations ?? [];

  const openScopedView = useCallback(
    async (delegation: Delegation) => {
      if (!sessionId) return;
      setSelected(delegation.id);
      try {
        const payload = await postJson<{ lens: Lens }>("/api/context", {
          sessionId,
          patientId: delegation.patientId,
          purpose: "engineering_debug",
          task: "medication_reconciliation_debug",
        });
        setLens(payload.lens);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not open the scoped view.",
        );
      }
    },
    [sessionId],
  );

  if (state.status !== "authenticated" || !sessionId) {
    return <LockedPanel state={state} />;
  }

  const isEngineer = state.actor?.role === "engineer";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {state.actor?.name} - {state.actor?.role}, {state.actor?.department}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Scoped technical access
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Engineers do not inherit patient access from their role. A clinician
          grants a narrow, time-limited delegation, and the engineer authenticates
          with their own Iris Key.
        </p>
      </div>

      {!isEngineer ? (
        <Alert>
          <TerminalIcon />
          <AlertTitle>This view is for clinical systems engineers</AlertTitle>
          <AlertDescription>
            You are signed in as {state.actor?.role}. Delegations are only usable
            by the role they were granted to.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Active delegations</CardTitle>
          <CardDescription>
            Granted by a clinician, expiring automatically.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{delegations.length} active</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {delegations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active delegations. Ask a clinician to grant a scoped debug view.
            </p>
          ) : (
            delegations.map((delegation) => (
              <div
                key={delegation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    {delegation.patientId}
                    {delegation.encounterId ? ` - ${delegation.encounterId}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {delegation.reason}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {delegation.scope.map((field) => (
                      <Badge key={field} variant="secondary" className="text-xs">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ClockIcon className="size-3" />
                    expires {new Date(delegation.expiresAt).toLocaleTimeString()}
                  </span>
                  <Button
                    size="sm"
                    variant={selected === delegation.id ? "default" : "outline"}
                    onClick={() => void openScopedView(delegation)}
                  >
                    Open scoped view
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {lens ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <h2 className="text-xl font-semibold">
                {lens.patient.pseudonym}
              </h2>
              <p className="text-sm text-muted-foreground">{lens.summary}</p>
            </div>
            <Badge variant="secondary">{lens.purposeLabel}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lens.fragments.map((fragment) => (
              <FragmentCard key={fragment.id} fragment={fragment} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Identity, contact details and unrelated clinical content were never
            decrypted for this view. Medication values are reduced to their shape,
            which is enough to debug a duplicate-row fault.
          </p>
        </div>
      ) : null}
    </main>
  );
}
