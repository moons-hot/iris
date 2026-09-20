import { afterEach, describe, expect, it } from "vitest";

import {
  alertsFor,
  findEvidence,
  getFleet,
  getSnapshot,
  investigationReply,
  setScenario,
} from "./iris";

afterEach(() => {
  setScenario("nominal");
});

describe("Iris onboard context", () => {
  it("compares telemetry against the astronaut's personal baseline", () => {
    const snapshot = getSnapshot();
    expect(snapshot.vitals.find((metric) => metric.label === "Heart rate")?.baseline).toBe(72);
    expect(snapshot.astronaut.id).toBe("A01");
  });

  it("streams about 15 fluctuating samples for each live metric", () => {
    const snapshot = getSnapshot();
    const series = [
      ...snapshot.vitals,
      ...snapshot.cabin,
      ...snapshot.space,
    ];
    for (const metric of series) {
      expect(metric.history).toHaveLength(15);
      expect(metric.history.at(-1)).toBe(metric.value);
      const unique = new Set(metric.history);
      if (metric.label !== "Solar flare") {
        expect(unique.size).toBeGreaterThan(1);
      }
    }
    const pressure = snapshot.vitals.find((metric) => metric.label === "Blood pressure");
    expect(pressure?.historyText).toHaveLength(15);
    expect(pressure?.historyText?.every((sample) => /^\d+\/\d+$/.test(sample))).toBe(true);
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
    expect(reply.text).toContain("## Predictions");
    expect(reply.text).toContain("## Historical analysis");
    expect(reply.text).toMatch(/baseline/i);
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

  it("raises heart rate, blood pressure, and temperature in the mild preset", () => {
    setScenario("mild");
    const snapshot = getSnapshot();
    const hr = snapshot.vitals.find((metric) => metric.label === "Heart rate");
    const bp = snapshot.vitals.find((metric) => metric.label === "Blood pressure");
    const temp = snapshot.vitals.find((metric) => metric.label === "Temperature");
    const spo2 = snapshot.vitals.find((metric) => metric.label === "SpO₂");
    const rr = snapshot.vitals.find((metric) => metric.label === "Resp. rate");

    expect(hr?.value).toBeGreaterThan(74);
    expect(hr?.direction).toBe("up");
    expect(bp?.value).toBeGreaterThan(120);
    expect(bp?.direction).toBe("up");
    expect(temp?.value).toBeGreaterThan(36.9);
    expect(temp?.direction).toBe("up");
    expect(spo2?.value).toBeLessThan(98);
    expect(spo2?.direction).toBe("down");
    expect(rr?.value).toBeGreaterThan(15);
    expect(rr?.direction).toBe("up");
  });

  it("makes dire telemetry dangerous and elevates radiation plus solar flare", () => {
    setScenario("dire");
    const snapshot = getSnapshot();
    const hr = snapshot.vitals.find((metric) => metric.label === "Heart rate");
    const bp = snapshot.vitals.find((metric) => metric.label === "Blood pressure");
    const temp = snapshot.vitals.find((metric) => metric.label === "Temperature");
    const radiation = snapshot.space.find((metric) => metric.label === "Hull radiation");
    const flare = snapshot.space.find((metric) => metric.label === "Solar flare");

    expect(hr?.value).toBeGreaterThan(105);
    expect(bp?.value).toBeLessThan(95);
    expect(temp?.value).toBeGreaterThan(38.2);
    expect(radiation?.value).toBeGreaterThan(2);
    expect(radiation?.direction).toBe("up");
    expect(flare?.value).toBeGreaterThanOrEqual(1);
    expect(flare?.direction).toBe("up");
  });

  it("raises peer heart rates during a solar-flare window and keeps them moving", () => {
    setScenario("nominal");
    const quiet = getSnapshot();
    const quietPeers = Object.fromEntries(
      quiet.peers.map((peer) => [peer.id, peer.heartRate]),
    );

    setScenario("dire");
    const flareA = getSnapshot();
    const flareB = getSnapshot();

    expect(flareA.peers).toHaveLength(2);
    for (const peer of flareA.peers) {
      const resting = quietPeers[peer.id] ?? 60;
      expect(peer.heartRate).toBeGreaterThan(resting + 20);
      expect(peer.status).not.toBe("nominal");
    }

    const moved = flareA.peers.some((peer, index) => {
      const next = flareB.peers[index];
      return next != null && next.heartRate !== peer.heartRate;
    });
    expect(moved).toBe(true);
  });

  it("lists independent craft for groundbase with alerts on Kepler", () => {
    const fleet = getFleet("kepler");
    expect(fleet.vessels.map((vessel) => vessel.id)).toEqual([
      "asteria",
      "helios",
      "kepler",
      "selene",
    ]);
    expect(Object.keys(fleet.snapshots)).toEqual([
      "asteria",
      "helios",
      "kepler",
      "selene",
    ]);
    expect(fleet.snapshot.vessel.id).toBe("kepler");
    expect(fleet.snapshots.kepler?.vessel.kind).toBe("rocket");
    expect(fleet.snapshot.alerts.length).toBeGreaterThan(0);
    expect(
      fleet.snapshot.alerts.some((alert) => alert.severity === "critical"),
    ).toBe(true);
    expect(fleet.vessels.find((vessel) => vessel.id === "kepler")?.status).toBe(
      "alert",
    );
  });

  it("keeps Asteria on the live station scenario", () => {
    setScenario("dire");
    const fleet = getFleet("asteria");
    expect(fleet.snapshot.scenario).toBe("dire");
    expect(fleet.vessels.find((vessel) => vessel.id === "asteria")?.status).toBe(
      "alert",
    );
  });

  it("flags suit-pressure loss on Selene", () => {
    const fleet = getFleet("selene");
    const suit = fleet.snapshot.cabin.find(
      (metric) => metric.label === "Suit pressure",
    );
    expect(suit?.value).toBeLessThan(27);
    expect(alertsFor(fleet.snapshot, "Selene").some((alert) => alert.id === "suit")).toBe(
      true,
    );
  });

  it("turns a voice report plus live telemetry into possible concerns and next actions", () => {
    setScenario("dire");
    const snapshot = getSnapshot();
    const reply = investigationReply(
      "I feel nauseous and I am seeing flashes of light",
      "reported breathlessness; distress language present",
      snapshot,
    );

    expect(reply.telemetry.astronaut.join(" ")).toMatch(/Heart rate/i);
    expect(reply.telemetry.spacecraft.join(" ")).toMatch(/CO₂|CO2/i);
    expect(reply.telemetry.environment.join(" ")).toMatch(/Radiation/i);
    expect(reply.text).toContain("## Predictions");
    expect(reply.text).toContain("## What could be causing these symptoms");
    expect(reply.text).toContain("EVID-OSDR-014");
    expect(reply.possibleConcerns.length).toBeGreaterThan(0);
    expect(reply.recommendedActions.join(" ")).toMatch(/shielding/i);
    expect(reply.severity).toBe("high");
    expect(reply.speak).toMatch(/OSDR/i);
    expect(reply.speak).toMatch(/shielding/i);
    expect(reply.speak).not.toMatch(/\d+\s*bpm/i);
    expect(reply.speak.split(/[.!?]+/).filter((s) => s.trim()).length).toBeLessThanOrEqual(5);
  });
});
