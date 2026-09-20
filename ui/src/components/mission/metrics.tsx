import type { ReactNode } from "react";

import type { Metric } from "@/lib/mission-types";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[1.75rem] bg-card/90 p-5 shadow-[var(--panel-shadow)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function MetricTile({ metric }: { metric: Metric }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums">
        {metric.value}
        <span
          className={
            metric.unit.startsWith("/")
              ? "text-sm font-normal text-muted-foreground"
              : "ml-1 text-sm font-normal text-muted-foreground"
          }
        >
          {metric.unit}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Baseline{" "}
        {metric.label === "Blood pressure"
          ? "112/72 mmHg"
          : `${metric.baseline}${metric.unit.startsWith("/") ? "" : " "}${metric.unit}`}{" "}
        · {metric.direction}
      </p>
    </div>
  );
}

export function FlareStatus({ metric }: { metric: Metric }) {
  const active = metric.value >= 1;
  return (
    <div
      className={cn(
        "flex min-h-[6.5rem] flex-col justify-center rounded-[1.5rem] px-4 py-3",
        active ? "bg-destructive/12" : "bg-muted/60",
      )}
    >
      <p className="text-xs text-muted-foreground">Solar flare</p>
      <p
        className={cn(
          "mt-1 text-3xl font-medium tracking-tight",
          active && "text-destructive",
        )}
      >
        {active ? "Active" : "Quiet"}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {active
          ? "SPE in progress · move to shielding"
          : "No event · hull exposure nominal"}
      </p>
    </div>
  );
}
