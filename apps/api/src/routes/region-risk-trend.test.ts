import test from "node:test";
import assert from "node:assert/strict";
import { buildRegionRiskTrendRouteResponse } from "./region-risk-trend";
import { buildV1RegionRiskTrendRouteResponse } from "./v1-region-risk-trend";

test("region risk trend route returns 404 when score route cannot resolve the region", () => {
  const response = buildRegionRiskTrendRouteResponse("unknown-region", {
    buildScoreResponse: () => ({
      status: 404,
      json: { message: "Unknown region unknown-region" },
    }),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.json, { message: "Unknown region unknown-region" });
});

test("region risk trend route returns trend and forecast guidance", () => {
  const response = buildRegionRiskTrendRouteResponse("southeast-florida", {
    buildScoreResponse: () => ({
      status: 200,
      json: {
        region_id: "southeast-florida",
        region_name: "Southeast Florida",
        computed_at: "2026-03-25T18:00:00.000Z",
        risk_level: "high",
        confidence_score: 0.82,
        weighted_score: 0.71,
        coverage: {
          configured_station_count: 6,
          analyzed_station_count: 4,
          healthy_station_count: 3,
          minimum_healthy_station_requirement: 3,
          coverage_ratio: 0.67,
          meets_minimum_healthy_stations: true,
        },
        dominant_drivers: ["surface warming", "higher seas"],
        top_contributing_stations: [],
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
    listSnapshots: () => ({
      source: "db",
      snapshots: [
        {
          id: "RRS-1",
          regionId: "southeast-florida",
          regionName: "Southeast Florida",
          computedAt: "2026-03-25T12:00:00.000Z",
          regionalRiskLevel: "medium",
          regionalConfidence: 0.71,
          weightedRegionalScore: 0.52,
          healthyStationCount: 3,
          analyzedStationCount: 4,
          stationCountWithElevatedRisk: 3,
          corroboratingHealthyStationCount: 3,
          dominantDrivers: ["surface warming"],
          crwSupported: false,
          operatorSummary: "Prior summary",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  if ("trend" in response.json) {
    assert.equal(response.json.trend.direction, "rising");
    assert.equal(response.json.forecast.next_12h.risk_level === "high" || response.json.forecast.next_12h.risk_level === "critical", true);
  }
});

test("v1 region risk trend route maps internal output into the public response", () => {
  const response = buildV1RegionRiskTrendRouteResponse("southeast-florida", () => ({
    status: 200,
    json: {
      region_id: "southeast-florida",
      region_name: "Southeast Florida",
      computed_at: "2026-03-25T18:00:00.000Z",
      current: {
        risk_level: "high",
        confidence_score: 0.81,
        weighted_score: 0.72,
        coverage: {
          configured_station_count: 6,
          analyzed_station_count: 4,
          healthy_station_count: 3,
          minimum_healthy_station_requirement: 3,
          coverage_ratio: 0.67,
          meets_minimum_healthy_stations: true,
        },
        dominant_drivers: ["surface warming"],
        corroborating_healthy_station_count: 3,
        crw_support: {
          supported: true,
          reason: "CRW support",
          region_key: "Southeast Florida",
        },
        operator_summary: "Internal summary",
      },
      trend: {
        direction: "rising",
        strength: "moderate",
        delta_score: 0.18,
        persistence: 0.66,
        prior_6h_score: 0.54,
        prior_12h_score: 0.48,
        prior_24h_score: 0.41,
      },
      forecast: {
        next_12h: {
          risk_level: "high",
          projected_score: 0.79,
          confidence: 0.84,
        },
        next_24h: {
          risk_level: "critical",
          projected_score: 0.9,
          confidence: 0.84,
        },
      },
      operator_summary: "Trend summary",
    },
  }));

  assert.equal(response.status, 200);
  if ("regionId" in response.json) {
    assert.equal(response.json.regionId, "southeast-florida");
    assert.equal(response.json.currentRisk.riskLevel, "high");
    assert.equal(response.json.trend.direction, "rising");
    assert.equal(response.json.forecast.next24h.riskLevel, "critical");
  }
});
