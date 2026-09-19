"use client";

import { useState } from "react";
import { EyeIcon, ShieldCheckIcon, ZapIcon } from "lucide-react";
import useSWR from "swr";

import { getJson } from "@/lib/fetcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
}

const PATIENTS = [
  { id: "P1048", name: "Maya Patel" },
  { id: "P2210", name: "Daniel Osei" },
  { id: "P3187", name: "Renata Silva" },
];

export default function PatientPage() {
  const [patientId, setPatientId] = useState("P1048");

  const { data, isLoading } = useSWR<{ timeline: TimelineEntry[] }>(
    `/api/patient/${patientId}/history`,
    getJson,
    { refreshInterval: 5000 },
  );

  const timeline = data?.timeline ?? [];
  const loading = isLoading;
  const emergencyCount = timeline.filter((entry) => entry.kind === "emergency").length;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Who accessed my information?
          </h1>
          <p className="text-sm text-muted-foreground">
            Every time someone opened your record, why they opened it, and what
            kind of information they saw.
          </p>
        </div>
        <div className="flex gap-2">
          {PATIENTS.map((patient) => (
            <Button
              key={patient.id}
              size="sm"
              variant={patient.id === patientId ? "default" : "outline"}
              onClick={() => setPatientId(patient.id)}
            >
              {patient.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Card className="flex-1">
          <CardHeader>
            <CardDescription>Times your record was opened</CardDescription>
            <CardTitle className="text-2xl">{timeline.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="flex-1">
          <CardHeader>
            <CardDescription>Emergency access</CardDescription>
            <CardTitle className="text-2xl text-emergency">
              {emergencyCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your history...</p>
        ) : null}
        {!loading && timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has opened your record yet.
          </p>
        ) : null}

        {timeline.map((entry) => (
          <Card
            key={entry.id}
            className={
              entry.kind === "emergency"
                ? "border-emergency/50 bg-emergency/5"
                : undefined
            }
          >
            <CardHeader>
              <CardDescription>
                {new Date(entry.time).toLocaleString([], {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </CardDescription>
              <CardTitle className="text-base">{entry.actorName}</CardTitle>
              <CardDescription className="capitalize">
                {entry.department || entry.actorRole}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Why</p>
                <p className="text-sm">{entry.purposeText}</p>
              </div>

              {entry.emergencyReason ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Reason given
                  </p>
                  <p className="text-sm">{entry.emergencyReason}</p>
                </div>
              ) : null}

              {entry.viewed.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    What they saw
                  </p>
                  <p className="text-sm">{entry.viewed.join(", ")}</p>
                </div>
              ) : null}

              {entry.reduced.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Seen only in a reduced form
                  </p>
                  <p className="text-sm">
                    {entry.reduced.join(", ")} - for example an age range instead
                    of your date of birth, or a study code instead of your name.
                  </p>
                </div>
              ) : null}

              <Separator />

              <div className="flex flex-wrap items-center gap-2">
                {entry.kind === "emergency" ? (
                  <Badge
                    variant="outline"
                    className="border-emergency/50 text-emergency"
                  >
                    <ZapIcon data-icon="inline-start" />
                    Emergency access
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-allowed/50 text-allowed"
                  >
                    <ShieldCheckIcon data-icon="inline-start" />
                    Normal access
                  </Badge>
                )}
                {entry.withheld > 0 ? (
                  <Badge variant="secondary">
                    <EyeIcon data-icon="inline-start" />
                    {entry.withheld} field{entry.withheld === 1 ? "" : "s"} withheld
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Emergency access is never blocked when a clinician needs it. It is always
        recorded and raised for review, and you can see it here.
      </p>
    </main>
  );
}
