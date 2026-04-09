import test from "node:test";
import assert from "node:assert/strict";
import type { RegionalRiskSnapshotRecord } from "../repositories/regional-risk-snapshots";
import type { InternalRegionRiskScoreResponse } from "../routes/region-risk";
import { buildRegionalRiskTrend } from "./regional-risk-trend";

const NOW_ISO = "2026-03-25T18:00:00.000Z";

function makeCurrent(
  overrides: Partial<InternalRegionRiskScoreResponse> = {},
): InternalRegionRiskScoreResponse {
  return {
    region_id: "southeast-florida",
    region_name: "Southeast Florida",
    computed_at: NOW_ISO,
    risk_level: "medium",
    confidence_score: 0.72,
    weighted_score: 0.56,
    coverage: {
      configured_station_count: 6,
      analyzed_station_count: 4,
      healthy_station_count: 3,
      minimum_healthy_station_requirement: 3,
      coverage_ratio: 0.67,
      meets_minimum_healthy_stations: true,
    },
    dominant_drivers: ["surface warming"],
    top_contributing_stations: [],
    station_count_with_elevated_risk: 3,
    corroborating_healthy_station_count: 3,
    crw_support: {
      supported: false,
      reason: null,
      region_key: "Southeast Florida",
    },
    operator_summary: "Regional warming remains active.",
    stations: [],
    ...overrides,
  };
}

function makeSnapshot(
  computedAt: string,
  weightedRegionalScore: number,
  overrides: Partial<RegionalRiskSnapshotRecord> = {},
): RegionalRiskSnapshotRecord {
  return {
    id: `RRS-${Date.parse(computedAt)}`,
    regionId: "southeast-florida",
    regionName: "Southeast Florida",
    computedAt,
    regionalRiskLevel: weightedRegionalScore >= 0.66 ? "high" : weightedRegionalScore >= 0.38 ? "medium" : "low",
    regionalConfidence: 0.68,
    weightedRegionalScore,
    healthyStationCount: 3,
    analyzedStationCount: 4,
    stationCountWithElevatedRisk: 3,
    corroboratingHealthyStationCount: 3,
    dominantDrivers: ["surface warming"],
    crwSupported: false,
    operatorSummary: "Snapshot summary",
    ...overrides,
  };
}

test("regional trend identifies a rising pattern", () => {
  const result = buildRegionalRiskTrend({
    current: makeCurrent({ weighted_score: 0.72, risk_level: "high" }),
    history: [
      makeSnapshot("2026-03-25T12:00:00.000Z", 0.48),
      makeSnapshot("2026-03-25T06:00:00.000Z", 0.41),
      makeSnapshot("2026-03-24T18:00:00.000Z", 0.36),
    ],
  });

  assert.equal(result.trendDirection, "rising");
  assert.equal(result.deltaScore > 0.15, true);
  assert.equal(result.next12h.riskLevel === "high" || result.next12h.riskLevel === "critical", true);
});

test("regional trend identifies a falling pattern", () => {
  const result = buildRegionalRiskTrend({
    current: makeCurrent({ weighted_score: 0.34, risk_level: "low", confidence_score: 0.66 }),
    history: [
      makeSnapshot("2026-03-25T12:00:00.000Z", 0.62),
      makeSnapshot("2026-03-25T06:00:00.000Z", 0.58),
      makeSnapshot("2026-03-24T18:00:00.000Z", 0.54),
    ],
  });

  assert.equal(result.trendDirection, "falling");
  assert.equal(result.next24h.projectedScore < 0.34, true);
});

test("regional trend treats noisy spikes as stable when the baseline is similar", () => {
  const result = buildRegionalRiskTrend({
    current: makeCurrent({ weighted_score: 0.57 }),
    history: [
      makeSnapshot("2026-03-25T16:00:00.000Z", 0.59),
      makeSnapshot("2026-03-25T12:00:00.000Z", 0.54),
      makeSnapshot("2026-03-25T08:00:00.000Z", 0.58),
      makeSnapshot("2026-03-24T20:00:00.000Z", 0.55),
    ],
  });

  assert.equal(result.trendDirection, "stable");
  assert.equal(result.trendStrength, "weak");
});

test("CRW support strengthens an escalating regional forecast", () => {
  const unsupported = buildRegionalRiskTrend({
    current: makeCurrent({
      weighted_score: 0.63,
      confidence_score: 0.7,
      corroborating_healthy_station_count: 3,
    }),
    history: [
      makeSnapshot("2026-03-25T12:00:00.000Z", 0.47),
      makeSnapshot("2026-03-25T06:00:00.000Z", 0.44),
    ],
  });
  const supported = buildRegionalRiskTrend({
    current: makeCurrent({
      weighted_score: 0.63,
      confidence_score: 0.7,
      corroborating_healthy_station_count: 3,
      crw_support: {
        supported: true,
        reason: "CRW DHW is elevated.",
        region_key: "Southeast Florida",
      },
    }),
    history: [
      makeSnapshot("2026-03-25T12:00:00.000Z", 0.47),
      makeSnapshot("2026-03-25T06:00:00.000Z", 0.44),
    ],
  });

  assert.equal(supported.next24h.projectedScore > unsupported.next24h.projectedScore, true);
  assert.equal(supported.next24h.confidence > unsupported.next24h.confidence, true);
});

test("weak coverage reduces forecast confidence", () => {
  const strongCoverage = buildRegionalRiskTrend({
    current: makeCurrent({
      coverage: {
        configured_station_count: 6,
        analyzed_station_count: 4,
        healthy_station_count: 3,
        minimum_healthy_station_requirement: 3,
        coverage_ratio: 0.67,
        meets_minimum_healthy_stations: true,
      },
    }),
    history: [
      makeSnapshot("2026-03-25T12:00:00.000Z", 0.5),
      makeSnapshot("2026-03-25T06:00:00.000Z", 0.49),
    ],
  });
  const weakCoverage = buildRegionalRiskTrend({
    current: makeCurrent({
      coverage: {
        configured_station_count: 6,
        analyzed_station_count: 1,
        healthy_station_count: 1,
        minimum_healthy_station_requirement: 3,
        coverage_ratio: 0.17,
        meets_minimum_healthy_stations: false,
      },
      corroborating_healthy_station_count: 1,
    }),
    history: [
      makeSnapshot("2026-03-25T12:00:00.000Z", 0.5),
      makeSnapshot("2026-03-25T06:00:00.000Z", 0.49),
    ],
  });

  assert.equal(weakCoverage.next12h.confidence < strongCoverage.next12h.confidence, true);
  assert.equal(weakCoverage.next24h.confidence < strongCoverage.next24h.confidence, true);
});
