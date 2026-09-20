/** Simulated one-way light-time from deep space to ground. */
export const SPACE_DOWNLINK_MS = 20 * 60 * 1000;

export function applySpaceDownlinkDelay(actualReceivedAt: Date): Date {
  return new Date(actualReceivedAt.getTime() + SPACE_DOWNLINK_MS);
}

export function fromLoggedReceived(loggedReceivedAt: Date, sentAt: Date) {
  const loggedLatencyMs = Math.max(
    0,
    loggedReceivedAt.getTime() - sentAt.getTime(),
  );
  // Treat ~20-minute Tiger rows as delayed even if sentAt and receive
  // clocks are slightly skewed (a full 20m stamp is 1_200_000 ms).
  if (loggedLatencyMs >= SPACE_DOWNLINK_MS - 60_000) {
    const actualReceivedAt = new Date(
      loggedReceivedAt.getTime() - SPACE_DOWNLINK_MS,
    );
    return {
      actualReceivedAt:
        actualReceivedAt.getTime() < sentAt.getTime()
          ? sentAt
          : actualReceivedAt,
      actualLatencyMs: Math.max(
        0,
        actualReceivedAt.getTime() - sentAt.getTime(),
      ),
      loggedLatencyMs,
    };
  }
  return {
    actualReceivedAt: loggedReceivedAt,
    actualLatencyMs: loggedLatencyMs,
    loggedLatencyMs,
  };
}

export function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

export function formatLatency(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - minutes * 60);
  return `${minutes}m ${seconds}s`;
}
