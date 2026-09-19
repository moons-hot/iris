import { describe, expect, it } from "vitest";

import { GET as getCrew } from "@/app/api/crew/[id]/route";
import { GET as getEnvironment } from "@/app/api/environment/route";
import { GET as getMission } from "@/app/api/mission/route";

describe("mission APIs used by the station", () => {
  it("returns the seeded mission roster", async () => {
    const response = getMission();
    const body = (await response.json()) as {
      missionDay: number;
      commDelayMinutesOneWay: number;
      crew: Array<{ id: string }>;
    };
    expect(response.status).toBe(200);
    expect(body.missionDay).toBe(180);
    expect(body.commDelayMinutesOneWay).toBe(18);
    expect(body.crew).toHaveLength(4);
  });

  it("returns A02 baselines from /api/crew/A02", async () => {
    const response = await getCrew(
      new Request("http://localhost/api/crew/A02"),
      {
        params: Promise.resolve({ id: "A02" }),
      },
    );
    const body = (await response.json()) as {
      baselines: Array<{ metricKey: string; personalMean: number }>;
    };
    expect(response.status).toBe(200);
    const hr = body.baselines.find((entry) => entry.metricKey === "heart_rate");
    expect(hr?.personalMean).toBe(62);
  });

  it("returns cabin CO2 as a non-nominal reading", async () => {
    const response = getEnvironment();
    const body = (await response.json()) as {
      readings: Array<{ metricKey: string; status: string }>;
    };
    expect(response.status).toBe(200);
    const co2 = body.readings.find((entry) => entry.metricKey === "co2_ppm");
    expect(co2?.status).toBe("above_nominal");
  });
});
