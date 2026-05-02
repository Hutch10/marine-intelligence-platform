import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionRiskScoreRouteResponse,
} from "./region-risk";

test("example-region is rejected in production truth mode when DB-backed truth evidence is unavailable", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowConfig = process.env.MARINE_ALLOW_CONFIG_ONLY_TRUTH_ENTITIES;

  process.env.NODE_ENV = "production";
  process.env.MARINE_ALLOW_CONFIG_ONLY_TRUTH_ENTITIES = "false";

  try {
    const response = await buildRegionRiskScoreRouteResponse("example-region", {
      getRegionConfig: () => ({
        id: "example-region",
        name: "Example Region",
        stationIds: ["station-1", "station-2"],
        minimumHealthyStationRequirement: 1,
        crwRegionKey: "example-key",
      }),
      hasPath: () => false,
    });

    assert.equal(response.status, 404);
    assert.deepEqual(response.json, { message: "Unknown region example-region" });
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalAllowConfig === undefined) {
      delete process.env.MARINE_ALLOW_CONFIG_ONLY_TRUTH_ENTITIES;
    } else {
      process.env.MARINE_ALLOW_CONFIG_ONLY_TRUTH_ENTITIES = originalAllowConfig;
    }
  }
});
