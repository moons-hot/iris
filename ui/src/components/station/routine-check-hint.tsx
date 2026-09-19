"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMonitoring } from "@/components/station/monitoring-provider";

export function RoutineCheckHint() {
  const { trendReport } = useMonitoring();

  if (!trendReport.suggestRoutineCheck || !trendReport.routineCheckReason) {
    return null;
  }

  return (
    <Alert className="border-amber-500/30 bg-amber-500/5">
      <AlertTitle>Routine check suggested</AlertTitle>
      <AlertDescription>{trendReport.routineCheckReason}</AlertDescription>
    </Alert>
  );
}
