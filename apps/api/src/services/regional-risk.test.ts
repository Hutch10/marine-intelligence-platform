import test from "node:test";
import assert from "node:assert/strict";
import type { MarineRegionConfig } from "./region-config";
import { aggregateRegionalRisk, type RegionalStationRiskInput } from "./regional-risk";

const NOW_MS = Date.parse("2026-03-25T18:00:00.000Z");

const REGION: MarineRegionConfig = {
  id: "southeast-florida",
  name: "Southeast Florida",
  stationIds: ["41009", "41010", "41012", "41013", "41044", "42036"],
  crwRegionKey: "Southeast Florida",
  minimumHealthyStationRequirement: 3,
};

function makeStation(
  stationId: string,
  options: Partial<RegionalStationRiskInput> & {
    riskLevel?: RegionalStationRiskInput["riskLevel"];
    confidenceScore?: number;
    zScore?: number;
    healthStatus?: "healthy" | "degraded" | "failed";
    ageMs?: number;
  } = {},
): RegionalStationRiskInput {
  const observedAt = new Date(NOW_MS - (options.ageMs ?? (2 * 60 * 60 * 1000))).toISOString();

  return {
    stationId,
    observedAt,
    riskLevel: options.riskLevel ?? "low",
    confidenceScore: options.confidenceScore ?? 0.72,
    operatorSummary: options.operatorSummary ?? `${stationId} summary`,
    signals: (options.signals ?? [{
      field: "seaSurfaceTempC",
      value: 28.4,
      mean: 26.1,
      stdDev: 0.7,
      zScore: options.zScore ?? (options.riskLevel === "low" ? 0.2 : 2.6),
      sampleCount: 14,
      neighborMean: 28.1,
      neighborDelta: 0.3,
      sources: ["NDBC"],
      fusionState: "single",
    }]).map(signal => ({
      ...signal,
      sources: signal.sources ?? ["NDBC"],
      fusionState: signal.fusionState ?? "single",
    })),
    fusion: options.fusion ?? {
      neighborInfluence: "supporting",
      contributors: [],
      reasons: [],
    },
    stationHealth: options.stationHealth ?? {
      stationId,
      status: options.healthStatus ?? "healthy",
      lastSuccessfulIngestionAt: observedAt,
      latestObservationTimestamp: observedAt,
      latestObservationAgeMs: options.ageMs ?? (2 * 60 * 60 * 1000),
      usableMetricCoverage: {
        presentCount: 4,
        totalCount: 4,
        metricsPresent: ["seaSurfaceTempC", "waveHeightM", "windSpeedMps", "pressureHpa"],
      },
      missingFieldRates: {
        seaSurfaceTempC: 0,
        waveHeightM: 0,
        windSpeedMps: 0,
        pressureHpa: 0,
      },
      rejectionBreakdown: {},
      lastFetchUrl: "https://example.test",
    },
  };
}

test("low coverage reduces regional confidence", () => {
  const result = aggregateRegionalRisk({
    region: REGION,
    stationAnalyses: [
      makeStation("41009", { riskLevel: "high", confidenceScore: 0.82 }),
    ],
    now: () => NOW_MS,
    computedAt: new Date(NOW_MS).toISOString(),
  });
  const covered = aggregateRegionalRisk({
    region: REGION,
    stationAnalyses: [
      makeStation("41009", { riskLevel: "high", confidenceScore: 0.82 }),
      makeStation("41010", { riskLevel: "medium", confidenceScore: 0.76 }),
      makeStation("41012", { riskLevel: "medium", confidenceScore: 0.74 }),
    ],
    now: () => NOW_MS,
    computedAt: new Date(NOW_MS).toISOString(),
  });

  assert.equal(result.coverage.meetsMinimumHealthyStations, false);
  assert.equal(result.coverage.analyzedStationCount, 1);
  assert.equal(result.regionalConfidence < covered.regionalConfidence, true);
});

test("three corroborating healthy stations raise regional confidence", () => {
  const sparse = aggregateRegionalRisk({
    region: REGION,
    stationAnalyses: [
      makeStation("41009", { riskLevel: "medium", confidenceScore: 0.7 }),
      makeStation("41010", { riskLevel: "low", confidenceScore: 0.62, zScore: 0.4 }),
      makeStation("41012", { riskLevel: "low", confidenceScore: 0.64, zScore: 0.3 }),
    ],
    now: () => NOW_MS,
    computedAt: new Date(NOW_MS).toISOString(),
  });
  const corroborated = aggregateRegionalRisk({
    region: REGION,
    stationAnalyses: [
      makeStation("41009", { riskLevel: "medium", confidenceScore: 0.78 }),
      makeStation("41010", { riskLevel: "medium", confidenceScore: 0.76 }),
      makeStation("41012", { riskLevel: "medium", confidenceScore: 0.8 }),
    ],
    now: () => NOW_MS,
    computedAt: new Date(NOW_MS).toISOString(),
  });

  assert.equal(corroborated.corroboratingHealthyStationCount, 3);
  assert.equal(corroborated.regionalConfidence > sparse.regionalConfidence, true);
});

test("single-station anomaly does not over-escalate the region", () => {
  const result = aggregateRegionalRisk({
    region: REGION,
    stationAnalyses: [
      makeStation("41009", { riskLevel: "critical", confidenceScore: 0.92, zScore: 5 }),
      makeStation("41010", { riskLevel: "low", confidenceScore: 0.74, zScore: 0.2 }),
      makeStation("41012", { riskLevel: "low", confidenceScore: 0.7, zScore: 0.1 }),
      makeStation("41013", { riskLevel: "low", confidenceScore: 0.72, zScore: 0.3 }),
    ],
    now: () => NOW_MS,
    computedAt: new Date(NOW_MS).toISOString(),
  });

  assert.notEqual(result.regionalRiskLevel, "critical");
  assert.equal(result.corroboratingHealthyStationCount <= 1, true);
});

test("CRW support can strengthen a regional decision", () => {
  const withoutCrw = aggregateRegionalRisk({
    region: REGION,
    stationAnalyses: [
      makeStation("41009", { riskLevel: "medium", confidenceScore: 0.72 }),
      makeStation("41010", { riskLevel: "medium", confidenceScore: 0.74 }),
      makeStation("41012", { riskLevel: "medium", confidenceScore: 0.7 }),
    ],
    now: () => NOW_MS,
    computedAt: new Date(NOW_MS).toISOString(),
  });
  const withCrw = aggregateRegionalRisk({
    region: REGION,
    stationAnalyses: [
      makeStation("41009", { riskLevel: "medium", confidenceScore: 0.72 }),
      makeStation("41010", { riskLevel: "medium", confidenceScore: 0.74 }),
      makeStation("41012", { riskLevel: "medium", confidenceScore: 0.7 }),
    ],
    crwContext: {
      regionKey: "Southeast Florida",
      current: {
        stationId: null,
        regionKey: "Southeast Florida",
        observedAt: NOW_MS,
        sourceTimestamp: new Date(NOW_MS).toISOString(),
        sstAnomalyC: 1.4,
        hotSpotC: 0.8,
        dhw: 4.8,
        stressLevel: "alert_level_1",
      },
      historyCount: 42,
    },
    now: () => NOW_MS,
    computedAt: new Date(NOW_MS).toISOString(),
  });

  assert.equal(withCrw.crwSupport.supported, true);
  assert.equal(withCrw.regionalConfidence > withoutCrw.regionalConfidence, true);
  assert.equal(withCrw.weightedRegionalScore >= withoutCrw.weightedRegionalScore, true);
});
