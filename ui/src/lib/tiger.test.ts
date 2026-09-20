import { describe, expect, it } from "vitest";

import {
  SPACE_DOWNLINK_MS,
  applySpaceDownlinkDelay,
  formatLatency,
  fromLoggedReceived,
} from "./format";
import { latencyMs, parseSentAt } from "./tiger";

describe("Tiger Data comms timestamps", () => {
  it("parses a client sentAt stamp", () => {
    const sent = parseSentAt("2026-09-19T22:57:00.250Z");
    expect(sent.toISOString()).toBe("2026-09-19T22:57:00.250Z");
  });

  it("falls back when sentAt is missing", () => {
    const fallback = new Date("2026-09-19T22:57:01.000Z");
    expect(parseSentAt(undefined, fallback)).toEqual(fallback);
  });

  it("computes received-minus-sent latency in milliseconds", () => {
    const sentAt = new Date("2026-09-19T22:57:00.000Z");
    const receivedAt = new Date("2026-09-19T22:57:00.184Z");
    expect(latencyMs(sentAt, receivedAt)).toBe(184);
  });

  it("adds a 20-minute light-time delay for Tiger logs", () => {
    const actual = new Date("2026-09-19T22:57:00.184Z");
    const logged = applySpaceDownlinkDelay(actual);
    expect(logged.getTime() - actual.getTime()).toBe(SPACE_DOWNLINK_MS);
    expect(logged.toISOString()).toBe("2026-09-19T23:17:00.184Z");
  });

  it("keeps onboard actual time instant while exposing the delayed log", () => {
    const sentAt = new Date("2026-09-19T22:57:00.000Z");
    const actualReceivedAt = new Date("2026-09-19T22:57:00.184Z");
    const loggedReceivedAt = applySpaceDownlinkDelay(actualReceivedAt);
    const split = fromLoggedReceived(loggedReceivedAt, sentAt);

    expect(split.actualLatencyMs).toBe(184);
    expect(split.loggedLatencyMs).toBe(SPACE_DOWNLINK_MS + 184);
    expect(split.actualReceivedAt.toISOString()).toBe(
      actualReceivedAt.toISOString(),
    );
  });

  it("still recovers actual time when sentAt is slightly ahead of receive", () => {
    const sentAt = new Date("2026-09-20T00:35:00.000Z");
    const loggedReceivedAt = new Date("2026-09-20T00:54:18.621Z");
    const split = fromLoggedReceived(loggedReceivedAt, sentAt);
    expect(split.loggedLatencyMs).toBeGreaterThan(19 * 60 * 1000);
    expect(split.actualLatencyMs).toBeLessThan(60 * 1000);
  });

  it("does not subtract 20 minutes from logs written before the delay", () => {
    const sentAt = new Date("2026-09-19T22:57:00.000Z");
    const receivedAt = new Date("2026-09-19T22:57:00.184Z");
    const split = fromLoggedReceived(receivedAt, sentAt);
    expect(split.actualLatencyMs).toBe(184);
    expect(split.loggedLatencyMs).toBe(184);
  });

  it("formats the light-time delay for ground operators", () => {
    expect(formatLatency(184)).toBe("184 ms");
    expect(formatLatency(SPACE_DOWNLINK_MS + 184)).toBe("20m 0s");
  });
});
