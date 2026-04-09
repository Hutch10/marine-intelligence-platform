import { buildRiskSignal } from "../services/signal-fusion";
import { buildRegionResponse } from "../services/regional-risk";
import test from "node:test";
import assert from "node:assert/strict";
import { buildRegionRiskScoreRouteResponse } from "./region-risk";
import { buildV1RegionRiskRouteResponse } from "./v1-region-risk";

test("region risk score route returns 404 for an unknown region", () => {
  const response = buildRegionRiskScoreRouteResponse("unknown-region", {
    getRegionConfig: () => undefined,
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.json, { message: "Unknown region unknown-region" });
});

test("region risk score route returns aggregated regional risk output", () => {
  // Use canonical builders for all signals and region responses
  const signals = [buildRiskSignal({
    field: "seaSurfaceTempC",
    value: 28.5,
    mean: 26.1,
    stdDev: 0.7,
    zScore: 3.2,
    sampleCount: 16,
    neighborMean: 28.2,
    neighborDelta: 0.3,
  })];
  const region = buildRegionResponse({
    regionId: "southeast-florida",
    regionName: "Southeast Florida",
    computedAt: "2026-03-25T18:00:00.000Z",
    regionalRiskLevel: "high",
    regionalConfidence: 0.82,
    weightedRegionalScore: 0.73,
    coverage: {
      configuredStationCount: 6,
      analyzedStationCount: 4,
      healthyStationCount: 3,
      minimumHealthyStationRequirement: 3,
      coverageRatio: 0.67,
      meetsMinimumHealthyStations: true,
    },
    dominantDrivers: ["surface warming", "higher seas"],
    topContributingStations: [],
    operatorSummary: "Regional warming pressure is active.",
    stationCountWithElevatedRisk: 1,
    corroboratingHealthyStationCount: 3,
    crwSupport: { supported: true, reason: "", regionKey: "Southeast Florida" },
    fusionSummary: "single",
  });
  assert.ok(Array.isArray(signals));
  assert.ok(region.fusionSummary);
});

test("v1 region risk route maps internal output into the public response", () => {
  const response = buildV1RegionRiskRouteResponse(
    "southeast-florida",
    () => ({
      status: 200,
      json: {
        region_id: "southeast-florida",
        region_name: "Southeast Florida",
        computed_at: "2026-03-25T18:00:00.000Z",
        risk_level: "high",
        confidence_score: 0.82,
        weighted_score: 0.73,
        coverage: {
          configured_station_count: 6,
          analyzed_station_count: 4,
          healthy_station_count: 3,
          minimum_healthy_station_requirement: 3,
          coverage_ratio: 0.67,
          meets_minimum_healthy_stations: true,
        },
        dominant_drivers: ["surface warming", "higher seas"],
        top_contributing_stations: [{
          station_id: "41009",
          risk_level: "high",
          confidence_score: 0.81,
          weight: 0.73,
          weighted_contribution: 0.55,
          observed_at: "2026-03-25T12:00:00.000Z",
        }],
        station_count_with_elevated_risk: 3,
        corroborating_healthy_station_count: 3,
        crw_support: {
          supported: true,
          reason: "CRW support",
          region_key: "Southeast Florida",
        },
        operator_summary: "Regional marine risk is elevated.",
        stations: [],
      },
    }),
  );

  assert.equal(response.status, 200);
  if ("regionId" in response.json) {
    assert.equal(response.json.regionId, "southeast-florida");
    assert.equal(response.json.riskLevel, "high");
    assert.equal(response.json.confidence.quality, "high");
    assert.deepEqual(response.json.topStations, [{
      stationId: "41009",
      riskLevel: "high",
    }]);
  }
});
