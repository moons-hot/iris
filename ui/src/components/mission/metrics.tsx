import type { ReactNode } from "react";

import type { Metric, Scenario } from "@/lib/mission-types";
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

/** 0 = default, 1 = light red (drift), 2 = medium, 3 = deep red (major). */
export type MetricAlert = 0 | 1 | 2 | 3;

/** Drop from baseline is the hazard. */
const LOW_IS_BAD =
  /^(SpO|Cabin O|Cabin pressure|Suit pressure|Blood pressure)/i;
/** Rise from baseline is the hazard. */
const HIGH_IS_BAD =
  /^(Heart rate|Temperature|Resp|Cabin CO|Hull radiation|SPE|Solar flare)/i;

/**
 * Color numbers by mission state:
 * 1 nominal → no red
 * 2 mild drift → soft red on slight offs (cap 2)
 * 3 dire / flare → deeper red on major offs (up to 3)
 */
export function metricAlert(
  metric: Metric,
  scenario: Scenario = "nominal",
): MetricAlert {
  if (scenario === "nominal") return 0;
  if (metric.label === "Solar flare") {
    return scenario === "dire" && metric.value >= 1 ? 3 : 0;
  }

  const baseline =
    Math.abs(metric.baseline) < 1e-6 ? 1 : Math.abs(metric.baseline);
  const delta = metric.value - metric.baseline;
  const rel = Math.abs(delta) / baseline;
  const lowBad = LOW_IS_BAD.test(metric.label);
  const highBad = HIGH_IS_BAD.test(metric.label);
  const concerning = lowBad
    ? delta < 0
    : highBad
      ? delta > 0
      : Math.abs(delta) > 0;
  if (!concerning) return 0;

  let level: MetricAlert = 0;
  if (/Hull radiation|SPE/i.test(metric.label)) {
    if (metric.value >= metric.baseline * 3 || rel >= 1) level = 3;
    else if (rel >= 0.35) level = 2;
    else if (rel >= 0.15) level = 1;
  } else if (lowBad && Math.abs(delta) >= 8) {
    level = 3;
  } else if (rel >= 0.25 || Math.abs(delta) >= 14) {
    level = 3;
  } else if (rel >= 0.12 || Math.abs(delta) >= 7) {
    level = 2;
  } else if (rel >= 0.04 || Math.abs(delta) >= 3) {
    level = 1;
  }

  // Drift state stays soft — never the deepest red.
  if (scenario === "mild" && level > 2) return 2;
  if (scenario === "mild" && level === 0 && concerning) return 1;
  return level;
}

/** Plain red text shades — no glow. */
function alertTextClass(level: MetricAlert) {
  if (level === 3)
    return "text-[oklch(0.48_0.16_25)] dark:text-[oklch(0.72_0.12_25)]";
  if (level === 2)
    return "text-[oklch(0.55_0.13_30)] dark:text-[oklch(0.76_0.1_30)]";
  if (level === 1)
    return "text-[oklch(0.58_0.09_40)] dark:text-[oklch(0.78_0.07_40)]";
  return undefined;
}

export function MetricTile({
  metric,
  scenario = "nominal",
}: {
  metric: Metric;
  scenario?: Scenario;
}) {
  const level = metricAlert(metric, scenario);
  const alertColor = alertTextClass(level);

  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{metric.label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-medium tracking-tight tabular-nums",
          alertColor,
        )}
      >
        {metric.value}
        <span
          className={cn(
            metric.unit.startsWith("/")
              ? "text-sm font-normal"
              : "ml-1 text-sm font-normal",
            alertColor ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {metric.unit}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Baseline{" "}
        {metric.label === "Blood pressure"
          ? "118/74 mmHg"
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
        active ? "bg-destructive/10" : "bg-muted/60",
      )}
    >
      <p className="text-xs text-muted-foreground">Solar flare</p>
      <p
        className={cn(
          "mt-1 text-3xl font-medium tracking-tight",
          active &&
            "text-[oklch(0.48_0.16_25)] dark:text-[oklch(0.72_0.12_25)]",
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
