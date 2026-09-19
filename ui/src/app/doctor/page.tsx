"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, SearchIcon, ZapIcon } from "lucide-react";
import useSWR from "swr";

import { getJson } from "@/lib/fetcher";
import { BreakGlassDialog } from "@/components/iris/break-glass-dialog";
import { LockedPanel, WrongRolePanel } from "@/components/iris/locked-panel";
import { useSession } from "@/components/iris/session-provider";
import { useVoice } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface CareTeamPatient {
  id: string;
  firstName: string;
  lastName: string;
  reasonForVisit: string | null;
}

interface LookupMatch {
  id: string;
  onTeam: boolean;
  revealed: boolean;
  firstName: string | null;
  lastName: string | null;
}

export default function DoctorPage() {
  const { state, confirmOnDevice, setKeyState } = useSession();
  const voice = useVoice();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [breakGlassFor, setBreakGlassFor] = useState<string | null>(null);

  const sessionId = state.sessionId;

  // Every keystroke would otherwise be a policy-audited request.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: listData, isLoading } = useSWR<{ patients: CareTeamPatient[] }>(
    sessionId ? `/api/doctor/patients?sessionId=${sessionId}` : null,
    getJson,
    { revalidateOnFocus: false },
  );

  const { data: lookupData, mutate: reloadLookup } = useSWR<{
    matches: LookupMatch[];
  }>(
    sessionId && query.length >= 2
      ? `/api/doctor/lookup?sessionId=${sessionId}&q=${encodeURIComponent(query)}`
      : null,
    getJson,
    { revalidateOnFocus: false },
  );

  const yourPatients = listData?.patients ?? [];
  const offTeam = (lookupData?.matches ?? []).filter((match) => !match.onTeam);

  const handleGranted = useCallback(async () => {
    await setKeyState("emergency");
    await reloadLookup();
  }, [reloadLookup, setKeyState]);

  if (state.status !== "authenticated" || !sessionId) {
    return <LockedPanel state={state} />;
  }
  if (state.actor?.role !== "physician") {
    return <WrongRolePanel actor={state.actor} />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {state.actor?.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {state.actor?.department}
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or reason for visit"
          className="pl-9"
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Your patients</h2>
        {isLoading && yourPatients.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Loading...</p>
        ) : null}

        {!isLoading && yourPatients.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No patients are assigned to you yet.
          </p>
        ) : null}

        {yourPatients.map((patient) => (
          <Link
            key={patient.id}
            href={`/doctor/patients/${patient.id}`}
            className="flex items-center gap-4 border-b px-1 py-3 transition-colors last:border-b-0 hover:bg-muted/50"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">
                {patient.firstName} {patient.lastName}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {patient.reasonForVisit ?? "No open encounter"}
              </span>
            </div>
            <ChevronRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {offTeam.length > 0 ? (
        <div className="flex flex-col gap-3">
          <Separator />
          <p className="text-xs text-muted-foreground">
            {offTeam.length === 1
              ? "1 other record matches this search."
              : `${offTeam.length} other records match this search.`}
          </p>

          {offTeam.map((match) => (
            <div
              key={match.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
            >
              {match.revealed ? (
                <Link
                  href={`/doctor/patients/${match.id}`}
                  className="flex min-w-0 flex-col"
                >
                  <span className="text-sm font-medium">
                    {match.firstName} {match.lastName}
                  </span>
                  <span className="text-xs text-emergency">
                    Open under emergency access
                  </span>
                </Link>
              ) : (
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    Not on your care team
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Nothing about this patient is released until you say why you
                    need it.
                  </span>
                </div>
              )}

              {match.revealed ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto border-emergency/50 text-emergency"
                  onClick={() => setBreakGlassFor(match.id)}
                >
                  <ZapIcon data-icon="inline-start" />
                  Break glass
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {breakGlassFor ? (
        <BreakGlassDialog
          open
          onOpenChange={(next) => {
            if (!next) setBreakGlassFor(null);
          }}
          sessionId={sessionId}
          patientId={breakGlassFor}
          simulated={state.simulated}
          confirmOnDevice={confirmOnDevice}
          onGranted={() => void handleGranted()}
          voice={voice}
        />
      ) : null}
    </main>
  );
}
