import { describe, expect, it } from "vitest";

import {
  getCrewById,
  getEnvironmentReadings,
  getMissionState,
} from "@/lib/db/queries";
import {
  DEFAULT_CREW_ID,
  ENV_ANOMALY_DISCLAIMER,
  INVESTIGATION_DISCLAIMER,
  buildVitalCards,
  envStatusBadge,
  isInvestigationSafeCopy,
  resolveCrewId,
} from "@/lib/station/view-model";

describe("resolveCrewId", () => {
  const roster = ["A01", "A02", "A03", "A04"];

  it("defaults to A02 when no crew is requested", () => {
    expect(resolveCrewId(undefined, roster)).toEqual({
      crewId: DEFAULT_CREW_ID,
      unknownRequested: false,
    });
  });

  it("accepts a rostered crew id", () => {
    expect(resolveCrewId("a03", roster)).toEqual({
      crewId: "A03",
      unknownRequested: false,
    });
  });

  it("falls back to A02 for an unknown id", () => {
    expect(resolveCrewId("Z99", roster)).toEqual({
      crewId: "A02",
      unknownRequested: true,
    });
  });
});

describe("station vitals for A02", () => {
  it("shows personal HR baseline near 62 and population band 60–100", () => {
    const data = getCrewById("A02");
    expect(data).not.toBeNull();
    const cards = buildVitalCards(data!.baselines, data!.recentMeasurements);
    const hr = cards.find((card) => card.metricKey === "heart_rate");

    expect(hr?.personalMean).toBe(62);
    expect(hr?.populationLow).toBe(60);
    expect(hr?.populationHigh).toBe(100);
    expect(hr?.latestValue).toBeTypeOf("number");
    expect(hr?.unit).toBe("bpm");
  });

  it("includes latest SpO2 and temperature from seed", () => {
    const data = getCrewById("A02");
    const cards = buildVitalCards(data!.baselines, data!.recentMeasurements);
    expect(cards.map((card) => card.metricKey)).toEqual([
      "heart_rate",
      "spo2",
      "temp_c",
    ]);
    expect(cards.every((card) => card.latestValue !== null)).toBe(true);
  });
});

describe("cabin environment", () => {
  it("marks CO2 as above nominal without causal copy", () => {
    const readings = getEnvironmentReadings();
    const co2 = readings.find((reading) => reading.metricKey === "co2_ppm");
    expect(co2?.status).toBe("above_nominal");
    expect(envStatusBadge(co2!.status)).toEqual({
      label: "above nominal",
      tone: "off_nominal",
    });
    expect(isInvestigationSafeCopy(ENV_ANOMALY_DISCLAIMER)).toBe(true);
  });
});

describe("mission header contract", () => {
  it("exposes day 180, 18 minute comm delay, and four crew", () => {
    const mission = getMissionState();
    expect(mission.missionDay).toBe(180);
    expect(mission.commDelayMinutesOneWay).toBe(18);
    expect(mission.linkStatus).toBe("connected");
    expect(mission.crew.map((member) => member.id)).toEqual([
      "A01",
      "A02",
      "A03",
      "A04",
    ]);
  });
});

describe("investigation-safe copy", () => {
  it("keeps the station disclaimer non-diagnostic", () => {
    expect(isInvestigationSafeCopy(INVESTIGATION_DISCLAIMER)).toBe(true);
    expect(isInvestigationSafeCopy("CO2 caused the headache")).toBe(false);
  });
});
