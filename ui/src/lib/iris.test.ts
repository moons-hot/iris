import { afterEach, describe, expect, it } from "vitest";

import { findEvidence, getSnapshot, investigationReply, setScenario } from "./iris";

afterEach(() => {
  setScenario("nominal");
});

describe("Iris onboard context", () => {
  it("compares telemetry against the astronaut's personal baseline", () => {
    const snapshot = getSnapshot();
    expect(snapshot.vitals.find((metric) => metric.label === "Heart rate")?.baseline).toBe(62);
    expect(snapshot.astronaut.id).toBe("A01");
  });

  it("adds radiation and peer evidence during the dire preset", () => {
    setScenario("dire");
    const reply = investigationReply("I feel nauseous and am seeing flashes of light");
    expect(reply.severity).toBe("high");
    expect(reply.citations.map((citation) => citation.id)).toContain("EVID-OSDR-014");
    expect(findEvidence("radiation").length).toBeGreaterThan(1);
  });

  it("keeps mild investigations in monitoring mode", () => {
    setScenario("mild");
    const reply = investigationReply("I have a headache and feel short of breath");
    expect(reply.severity).toBe("monitor");
    expect(reply.text).toContain("personal baseline");
  });
});
