"use client";

import { useEffect, useReducer, useRef } from "react";
import { ZapIcon } from "lucide-react";

function remainingMs(until: string): number {
  return Math.max(0, new Date(until).getTime() - Date.now());
}

function countdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The emergency window, visible for as long as it is open.
 *
 * It sticks to the top of the chart rather than sitting in the flow: a doctor
 * who scrolls into the behavioural health note should not have to scroll back
 * up to find out they are reading it under break-glass.
 */
export function EmergencyBanner({
  until,
  reason,
  onExpire,
}: {
  until: string | null;
  reason: string | null;
  onExpire: () => void;
}) {
  // The clock is the external system here: the tick only asks for a re-render,
  // and the time left is derived during that render.
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const expired = useRef<string | null>(null);

  useEffect(() => {
    if (!until) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until]);

  const left = until ? remainingMs(until) : 0;

  useEffect(() => {
    if (!until || left > 0 || expired.current === until) return;
    expired.current = until;
    onExpire();
  }, [left, onExpire, until]);

  if (!until || left === 0) return null;

  return (
    <div className="sticky top-14 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emergency/50 bg-emergency/10 px-4 py-3 backdrop-blur">
      <ZapIcon className="size-4 shrink-0 text-emergency" />
      <span className="text-sm font-medium text-emergency">
        Emergency access - {countdown(left)} left
      </span>
      <span className="text-xs text-muted-foreground">
        Recorded and flagged for review.
        {reason
          ? ` You said: "${reason}"`
          : " Add a reason from the break-glass dialog when you can."}
      </span>
    </div>
  );
}
