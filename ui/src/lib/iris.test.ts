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

  it("exposes hull radiation, solar flare, and SPE flux as space weather", () => {
    const quiet = getSnapshot();
    expect(quiet.space.map((metric) => metric.label)).toEqual([
      "Hull radiation",
      "Solar flare",
      "SPE flux",
    ]);
    expect(quiet.space.find((metric) => metric.label === "Solar flare")?.unit).toBe(
      "quiet",
    );
    setScenario("dire");
    const storm = getSnapshot();
    expect(storm.space.find((metric) => metric.label === "Solar flare")?.unit).toBe(
      "active",
    );
    expect(
      storm.cabin.find((metric) => metric.label === "Cabin pressure")?.unit,
    ).toBe("kPa");
    expect(storm.cabin.map((metric) => metric.label)).toEqual([
      "Cabin O₂",
      "Cabin CO₂",
      "Cabin pressure",
      "Suit pressure",
    ]);
    expect(storm.vitals.map((metric) => metric.label)).toEqual([
      "Heart rate",
      "Blood pressure",
      "Temperature",
      "SpO₂",
      "Resp. rate",
    ]);
  });
});
