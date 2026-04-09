import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBaselineAnomalyAlerts,
  scoreBaselineAnomalies,
  type BaselineObservationInput,
} from "./baseline-anomaly";

function makeObservation(
  observedAt: string,
  overrides: Partial<BaselineObservationInput> = {},
): BaselineObservationInput {
  return {
    stationId: "46042",
    observedAt: Date.parse(observedAt),
    seaSurfaceTempC: 26,
    waveHeightM: 1.2,
    windSpeedMps: 6.5,
    pressureHpa: 1011,
    sourceTimestamp: observedAt,
    ...overrides,
  };
}

test("scoreBaselineAnomalies uses seasonal month bucket when enough samples exist", () => {
  const current = makeObservation("2026-03-15T00:00:00.000Z", { seaSurfaceTempC: 30 });
  const history = Array.from({ length: 10 }, (_, index) =>
    makeObservation(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, { seaSurfaceTempC: 26 + index * 0.05 }),
  );

  const result = scoreBaselineAnomalies(current, history, { minSamples: 8 });
  const sst = result.find((item) => item.field === "seaSurfaceTempC");

  assert.ok(sst);
  assert.equal(sst.usedSeasonalBucket, true);
  assert.ok((sst.zScore ?? 0) > 2);
});

test("scoreBaselineAnomalies falls back to rolling window when seasonal samples are sparse", () => {
  const current = makeObservation("2026-03-15T00:00:00.000Z", { waveHeightM: 4.5 });
  const history = [
    makeObservation("2026-02-01T00:00:00.000Z", { waveHeightM: 1.2 }),
    makeObservation("2026-02-02T00:00:00.000Z", { waveHeightM: 1.1 }),
    makeObservation("2026-02-03T00:00:00.000Z", { waveHeightM: 1.3 }),
    makeObservation("2026-02-04T00:00:00.000Z", { waveHeightM: 1.2 }),
  ];

  const result = scoreBaselineAnomalies(current, history, { minSamples: 8 });
  const wave = result.find((item) => item.field === "waveHeightM");

  assert.ok(wave);
  assert.equal(wave.usedSeasonalBucket, false);
  assert.ok((wave.zScore ?? 0) > 2);
});

test("buildBaselineAnomalyAlerts emits warnings above the z-score threshold and includes neighbor delta", () => {
  const current = makeObservation("2026-03-15T00:00:00.000Z", { seaSurfaceTempC: 31.5 });
  const history = Array.from({ length: 12 }, (_, index) =>
    makeObservation(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, { seaSurfaceTempC: 26 + index * 0.05 }),
  );
  const neighborObservations = [
    makeObservation("2026-03-15T00:00:00.000Z", { stationId: "41009", seaSurfaceTempC: 27.1 }),
  ];

  const alerts = buildBaselineAnomalyAlerts(current, history, {
    zScoreThreshold: 2,
    neighborObservations,
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.ruleType, "high_sea_temperature");
  assert.ok((alerts[0]?.detail ?? "").includes("Neighbor delta"));
});

test("scoreBaselineAnomalies applies the global stdDev floor and z-score clamp", () => {
  const current = makeObservation("2026-03-15T00:00:00.000Z", { seaSurfaceTempC: 35 });
  const history = Array.from({ length: 12 }, (_, index) =>
    makeObservation(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, {
      seaSurfaceTempC: index % 2 === 0 ? 25 : 25.01,
    }),
  );

  const result = scoreBaselineAnomalies(current, history, { minSamples: 8 });
  const sst = result.find((item) => item.field === "seaSurfaceTempC");

  assert.ok(sst);
  assert.equal(sst.stdDev, 0.5);
  assert.equal(sst.zScore, 5);
});

test("scoreBaselineAnomalies treats CRW DHW at or below mean as neutral", () => {
  const current = makeObservation("2026-03-15T00:00:00.000Z");
  const history = Array.from({ length: 12 }, (_, index) =>
    makeObservation(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
  );

  const result = scoreBaselineAnomalies(current, history, {
    minSamples: 8,
    crwCurrent: {
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse("2026-03-15T00:00:00.000Z"),
      sourceTimestamp: "2026-03-15T00:00:00.000Z",
      sstAnomalyC: 1.2,
      hotSpotC: 0.4,
      dhw: 0.8,
      stressLevel: "bleaching_watch",
    },
    crwHistory: Array.from({ length: 10 }, (_, index) => ({
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
      sourceTimestamp: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      sstAnomalyC: 0.5 + index * 0.05,
      hotSpotC: 0.2 + index * 0.02,
      dhw: 0.8,
      stressLevel: "bleaching_watch",
    })),
  });
  const dhw = result.find((item) => item.field === "crwDhw");

  assert.ok(dhw);
  assert.equal(dhw.stdDev, 0.5);
  assert.equal(dhw.zScore, 0);
});

test("scoreBaselineAnomalies keeps every zScore within the global clamp", () => {
  const current = makeObservation("2026-03-20T00:00:00.000Z", {
    seaSurfaceTempC: 40,
    waveHeightM: 9,
    windSpeedMps: 30,
    pressureHpa: 970,
  });
  const history = Array.from({ length: 12 }, (_, index) =>
    makeObservation(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, {
      seaSurfaceTempC: 25 + (index % 2) * 0.01,
      waveHeightM: 1.2 + (index % 2) * 0.01,
      windSpeedMps: 5 + (index % 2) * 0.01,
      pressureHpa: 1014 - (index % 2) * 0.01,
    }),
  );

  const result = scoreBaselineAnomalies(current, history, {
    minSamples: 8,
    crwCurrent: {
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse("2026-03-20T00:00:00.000Z"),
      sourceTimestamp: "2026-03-20T00:00:00.000Z",
      sstAnomalyC: 4.5,
      hotSpotC: 3.2,
      dhw: 10.5,
      stressLevel: "alert_level_2",
    },
    crwHistory: Array.from({ length: 10 }, (_, index) => ({
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
      sourceTimestamp: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      sstAnomalyC: 0.5 + index * 0.02,
      hotSpotC: 0.1 + index * 0.01,
      dhw: 0.4 + index * 0.02,
      stressLevel: "bleaching_watch",
    })),
  });

  for (const stat of result) {
    if (stat.zScore !== null) {
      assert.equal(stat.zScore >= -5 && stat.zScore <= 5, true);
    }
  }
});

test("scoreBaselineAnomalies never returns a negative CRW DHW zScore", () => {
  const current = makeObservation("2026-03-20T00:00:00.000Z");
  const history = Array.from({ length: 10 }, (_, index) =>
    makeObservation(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
  );

  const belowMean = scoreBaselineAnomalies(current, history, {
    minSamples: 8,
    crwCurrent: {
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse("2026-03-20T00:00:00.000Z"),
      sourceTimestamp: "2026-03-20T00:00:00.000Z",
      sstAnomalyC: 1.1,
      hotSpotC: 0.3,
      dhw: 1.5,
      stressLevel: "watch",
    },
    crwHistory: Array.from({ length: 10 }, (_, index) => ({
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
      sourceTimestamp: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      sstAnomalyC: 0.6,
      hotSpotC: 0.2,
      dhw: 2 + index * 0.1,
      stressLevel: "watch",
    })),
  });
  const aboveMean = scoreBaselineAnomalies(current, history, {
    minSamples: 8,
    crwCurrent: {
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse("2026-03-20T00:00:00.000Z"),
      sourceTimestamp: "2026-03-20T00:00:00.000Z",
      sstAnomalyC: 1.1,
      hotSpotC: 0.3,
      dhw: 7.5,
      stressLevel: "alert_level_1",
    },
    crwHistory: Array.from({ length: 10 }, (_, index) => ({
      stationId: null,
      regionKey: "Southeast Florida",
      observedAt: Date.parse(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
      sourceTimestamp: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      sstAnomalyC: 0.6,
      hotSpotC: 0.2,
      dhw: 2 + index * 0.1,
      stressLevel: "watch",
    })),
  });

  const belowMeanDhw = belowMean.find((item) => item.field === "crwDhw");
  const aboveMeanDhw = aboveMean.find((item) => item.field === "crwDhw");

  assert.ok(belowMeanDhw);
  assert.ok(aboveMeanDhw);
  assert.equal((belowMeanDhw?.zScore ?? 0) >= 0, true);
  assert.equal((aboveMeanDhw?.zScore ?? 0) >= 0, true);
});
