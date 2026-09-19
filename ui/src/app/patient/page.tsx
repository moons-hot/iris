"use client";

import { useState, type ReactNode } from "react";
import { ZapIcon } from "lucide-react";
import useSWR from "swr";

import { cn } from "cn";
import { getJson } from "@/lib/fetcher";
import { LockedPanel, WrongRolePanel } from "@/components/iris/locked-panel";
import { useSession } from "@/components/iris/session-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TimelineEntry {
  id: string;
  time: string;
  actorName: string;
  actorRole: string;
  department: string;
  purposeText: string;
  viewed: string[];
  reduced: string[];
  withheld: number;
  kind: "normal" | "emergency" | "system";
  emergencyReason: string | null;
  summary: string;
}

function whenShort(time: string): string {
  return new Date(time).toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function whenFull(time: string): string {
  return new Date(time).toLocaleString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    physician: "Doctor",
    nurse: "Nurse",
    reception: "Front desk",
    engineer: "Technical staff",
    compliance: "Compliance",
  };
  return labels[role] ?? role.replace(/_/g, " ");
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function AccessEntryDetails({ entry }: { entry: TimelineEntry }) {
  const where =
    entry.department.trim().length > 0
      ? entry.department
      : "Department not recorded";

  return (
    <div className="flex flex-col gap-3">
      <DetailRow label="When">{whenFull(entry.time)}</DetailRow>
      <DetailRow label="Who">{entry.actorName}</DetailRow>
      <DetailRow label="Their role">{roleLabel(entry.actorRole)}</DetailRow>
      <DetailRow label="Where">{where}</DetailRow>
      <DetailRow label="Why they opened your record">{entry.purposeText}</DetailRow>

      {entry.kind === "emergency" ? (
        <DetailRow label="Type of access">
          <span className="inline-flex items-center gap-1.5 text-emergency">
            <ZapIcon className="size-3.5" />
            Emergency access
          </span>
        </DetailRow>
      ) : null}

      {entry.emergencyReason ? (
        <DetailRow label="Reason they gave">
          &ldquo;{entry.emergencyReason}&rdquo;
        </DetailRow>
      ) : null}

      {entry.viewed.length > 0 ? (
        <DetailRow label="What they saw">{entry.viewed.join(", ")}</DetailRow>
      ) : null}

      {entry.reduced.length > 0 ? (
        <DetailRow label="Shown only in a reduced form">
          {entry.reduced.join(", ")}
          <p className="pt-1 text-xs text-muted-foreground">
            For example, an age range instead of your full date of birth, or a
            study code instead of your name.
          </p>
        </DetailRow>
      ) : null}

      {entry.withheld > 0 ? (
        <DetailRow label="What stayed closed">
          {entry.withheld} part{entry.withheld === 1 ? "" : "s"} of your record
          were not opened for this purpose.
        </DetailRow>
      ) : null}
    </div>
  );
}

function AccessEntryTile({
  entry,
  emergency = false,
  onSelect,
}: {
  entry: TimelineEntry;
  emergency?: boolean;
  onSelect: (entry: TimelineEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40",
        emergency
          ? "border-emergency/50 bg-emergency/5"
          : "border-border bg-card",
      )}
    >
      <span className="text-xs text-muted-foreground">{whenShort(entry.time)}</span>
      <p className="text-sm leading-relaxed">{entry.summary}</p>
      <span className="text-xs text-muted-foreground">Tap for full details</span>
    </button>
  );
}

export default function PatientPage() {
  const { state } = useSession();
  const sessionId = state.sessionId;
  const [selected, setSelected] = useState<TimelineEntry | null>(null);

  const { data, isLoading } = useSWR<{ timeline: TimelineEntry[] }>(
    sessionId ? `/api/patient/me/history?sessionId=${sessionId}` : null,
    getJson,
    { refreshInterval: 5000 },
  );

  const timeline = data?.timeline ?? [];
  const emergency = timeline.filter((entry) => entry.kind === "emergency");
  const normal = timeline.filter((entry) => entry.kind !== "emergency");

  if (state.status !== "authenticated" || !sessionId) {
    return <LockedPanel state={state} />;
  }
  if (state.actor?.role !== "patient") {
    return <WrongRolePanel actor={state.actor} />;
  }

  return (
    <>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Who accessed my information?
          </h1>
          <p className="text-sm text-muted-foreground">
            Every time someone opened {state.actor.name}&rsquo;s record, and why.
            Tap a summary to open the full details.
          </p>
        </div>

        {isLoading && timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading your history...</p>
        ) : null}

        {!isLoading && timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has opened your record yet.
          </p>
        ) : null}

        {emergency.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-emergency">
              <ZapIcon className="size-4" />
              Emergency access
            </h2>
            {emergency.map((entry) => (
              <AccessEntryTile
                key={entry.id}
                entry={entry}
                emergency
                onSelect={setSelected}
              />
            ))}
          </div>
        ) : null}

        {normal.length > 0 ? (
          <div className="flex flex-col gap-2">
            {emergency.length > 0 ? (
              <h2 className="pb-1 text-sm font-medium">Everything else</h2>
            ) : null}
            {normal.map((entry) => (
              <AccessEntryTile key={entry.id} entry={entry} onSelect={setSelected} />
            ))}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Emergency access is never blocked when a clinician needs it. It is
          always recorded and raised for review, and you can see it here.
        </p>
      </main>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle
                  className={cn(
                    selected.kind === "emergency" && "flex items-center gap-2 text-emergency",
                  )}
                >
                  {selected.kind === "emergency" ? (
                    <>
                      <ZapIcon className="size-4" />
                      Emergency access
                    </>
                  ) : (
                    "Access to your record"
                  )}
                </DialogTitle>
                <DialogDescription className="text-left leading-relaxed">
                  {selected.summary}
                </DialogDescription>
              </DialogHeader>
              <AccessEntryDetails entry={selected} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
