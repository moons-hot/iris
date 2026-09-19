import { describe, expect, it } from "vitest";

import { getActiveInvestigationForCrew } from "@/lib/investigation/service";

import { runMonitoringTick } from "./live";

describe("runMonitoringTick", () => {
  it("eventually opens an investigation from biosensor deviation for A02", () => {
    let opened = false;
    for (let i = 0; i < 24; i++) {
      const result = runMonitoringTick("A02");
      if (result.investigationOpened) {
        opened = true;
        break;
      }
    }
    expect(opened).toBe(true);
    expect(getActiveInvestigationForCrew("A02")).not.toBeNull();
  });
});
