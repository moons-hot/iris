import { describe, expect, it } from "vitest";

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
});
