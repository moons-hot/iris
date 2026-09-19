"use client";

import { Spinner } from "@/components/ui/spinner";
import type { PipelineStepView } from "@/lib/pipeline";

const DEFAULT_STEPS: PipelineStepView[] = [
  { id: "intent", label: "Understanding intent", status: "pending" },
  { id: "population", label: "Searching Snowflake", status: "pending" },
  { id: "policy", label: "Applying Iris policy", status: "pending" },
  { id: "answer", label: "Answer", status: "pending" },
];

export function PipelineSteps({
  steps,
  busy,
}: {
  steps: PipelineStepView[] | null;
  busy: boolean;
}) {
  const display =
    steps ??
    DEFAULT_STEPS.map((step, index) => ({
      ...step,
      status: busy
        ? index === 0
          ? ("active" as const)
          : ("pending" as const)
        : step.status,
    }));

  return (
    <ol className="flex flex-col gap-1">
      {display.map((step) => {
        const active =
          step.status === "active" ||
          (busy && step.status === "pending" && !steps);
        return (
          <li
            key={step.id}
            className="text-muted-foreground flex items-center gap-2 text-xs"
          >
            {step.status === "complete" ? (
              <span className="text-allowed">✓</span>
            ) : step.status === "skipped" ? (
              <span>—</span>
            ) : active || step.status === "active" ? (
              <Spinner className="size-3" />
            ) : (
              <span className="inline-block size-3 rounded-full border" />
            )}
            <span
              className={
                step.status === "complete" ? "text-foreground" : undefined
              }
            >
              {step.label}
              {step.status === "skipped" ? " (skipped)" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
