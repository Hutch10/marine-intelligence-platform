import test from "node:test";
import assert from "node:assert/strict";
import { evaluateNdbcAnomalies } from "./ndbc-alert-evaluator";
import type { NdbcMappedObservation } from "../../connectors/ndbc/map";
import type { BaselineObservationInput } from "./baseline-anomaly";
import type { ResolvedStationRiskThreshold } from "../../repositories/station-risk-thresholds";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeObs(
  overrides: Partial<
    Pick<NdbcMappedObservation, "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa" | "observedAt" | "sourceTimestamp">
  > & { stationId?: string } = {},
): NdbcMappedObservation {
  return {
    stationId: overrides.stationId ?? "46042",
    observedAt: 1_700_000_000_000,
    seaSurfaceTempC: overrides.seaSurfaceTempC ?? 20,
    waveHeightM: overrides.waveHeightM ?? 1.5,
    windSpeedMps: overrides.windSpeedMps ?? 5,
    pressureHpa: overrides.pressureHpa ?? 1013,
    source: "noaa_ndbc",
    sourceFeed: "https://www.ndbc.noaa.gov/data/realtime2/46042.txt",
    sourceTimestamp: "2023-11-15T00:00:00.000Z",
    rawLine: "2023 11 15 00 00 99 1.5 5.0 MM 20.0 1013.0",
  };
}

function makeThresholds(
  overrides: Partial<Record<ResolvedStationRiskThreshold["metric"], number>> = {},
): ResolvedStationRiskThreshold[] {
  return [
    {
      metric: "seaSurfaceTempC",
      comparator: "above",
      thresholdValue: overrides.seaSurfaceTempC ?? 30,
      ruleType: "high_sea_temperature",
      severity: "warning",
      source: overrides.seaSurfaceTempC !== undefined ? "station_override" : "default",
    },
    {
      metric: "waveHeightM",
      comparator: "above",
      thresholdValue: overrides.waveHeightM ?? 5,
      ruleType: "high_wave_height",
      severity: "warning",
      source: overrides.waveHeightM !== undefined ? "station_override" : "default",
    },
    {
      metric: "windSpeedMps",
      comparator: "above",
      thresholdValue: overrides.windSpeedMps ?? 20,
      ruleType: "high_wind_speed",
      severity: "warning",
      source: overrides.windSpeedMps !== undefined ? "station_override" : "default",
    },
    {
      metric: "pressureHpa",
      comparator: "below",
      thresholdValue: overrides.pressureHpa ?? 960,
      ruleType: "low_pressure_system",
      severity: "warning",
      source: overrides.pressureHpa !== undefined ? "station_override" : "default",
    },
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("evaluateNdbcAnomalies returns empty array when all readings are within thresholds", () => {
  const result = evaluateNdbcAnomalies(makeObs());
  assert.equal(result.length, 0);
});

test("evaluateNdbcAnomalies returns empty array when all sensor fields are null", () => {
  const result = evaluateNdbcAnomalies(
    makeObs({ seaSurfaceTempC: null, waveHeightM: null, windSpeedMps: null, pressureHpa: null }),
  );
  assert.equal(result.length, 0);
});

// ─── SST threshold ────────────────────────────────────────────────────────────

test("evaluateNdbcAnomalies triggers high_sea_temperature when SST > 30 °C", () => {
  const result = evaluateNdbcAnomalies(makeObs({ seaSurfaceTempC: 30.1 }));
  const alert = result.find((a) => a.ruleType === "high_sea_temperature");
  assert.ok(alert, "expected high_sea_temperature alert");
  assert.equal(alert.type, "create");
  assert.equal(alert.severity, "warning");
  assert.equal(alert.source, "noaa_ndbc:46042");
  assert.ok(alert.title.includes("30.1"), `title should include value: ${alert.title}`);
});

test("evaluateNdbcAnomalies does NOT trigger high_sea_temperature when SST === 30 °C", () => {
  const result = evaluateNdbcAnomalies(makeObs({ seaSurfaceTempC: 30 }));
  assert.equal(result.find((a) => a.ruleType === "high_sea_temperature"), undefined);
});

test("evaluateNdbcAnomalies does NOT trigger high_sea_temperature when SST is null", () => {
  const result = evaluateNdbcAnomalies(makeObs({ seaSurfaceTempC: null }));
  assert.equal(result.find((a) => a.ruleType === "high_sea_temperature"), undefined);
});

// ─── Wave height threshold ────────────────────────────────────────────────────

test("evaluateNdbcAnomalies triggers high_wave_height when wave > 5 m", () => {
  const result = evaluateNdbcAnomalies(makeObs({ waveHeightM: 5.5 }));
  const alert = result.find((a) => a.ruleType === "high_wave_height");
  assert.ok(alert, "expected high_wave_height alert");
  assert.ok(alert.title.includes("5.5"), `title should include value: ${alert.title}`);
});

test("evaluateNdbcAnomalies does NOT trigger high_wave_height when wave === 5 m", () => {
  const result = evaluateNdbcAnomalies(makeObs({ waveHeightM: 5 }));
  assert.equal(result.find((a) => a.ruleType === "high_wave_height"), undefined);
});

test("evaluateNdbcAnomalies does NOT trigger high_wave_height when wave is null", () => {
  const result = evaluateNdbcAnomalies(makeObs({ waveHeightM: null }));
  assert.equal(result.find((a) => a.ruleType === "high_wave_height"), undefined);
});

// ─── Wind speed threshold ─────────────────────────────────────────────────────

test("evaluateNdbcAnomalies triggers high_wind_speed when wind > 20 m/s", () => {
  const result = evaluateNdbcAnomalies(makeObs({ windSpeedMps: 21 }));
  const alert = result.find((a) => a.ruleType === "high_wind_speed");
  assert.ok(alert, "expected high_wind_speed alert");
  assert.ok((alert.detail ?? "").includes("21.0 m/s"), `detail should include value: ${alert.detail}`);
});

test("evaluateNdbcAnomalies does NOT trigger high_wind_speed when wind === 20 m/s", () => {
  const result = evaluateNdbcAnomalies(makeObs({ windSpeedMps: 20 }));
  assert.equal(result.find((a) => a.ruleType === "high_wind_speed"), undefined);
});

// ─── Pressure threshold ───────────────────────────────────────────────────────

test("evaluateNdbcAnomalies triggers low_pressure_system when pressure < 960 hPa", () => {
  const result = evaluateNdbcAnomalies(makeObs({ pressureHpa: 955 }));
  const alert = result.find((a) => a.ruleType === "low_pressure_system");
  assert.ok(alert, "expected low_pressure_system alert");
  assert.ok(alert.title.includes("955"), `title should include value: ${alert.title}`);
});

test("evaluateNdbcAnomalies does NOT trigger low_pressure_system when pressure === 960 hPa", () => {
  const result = evaluateNdbcAnomalies(makeObs({ pressureHpa: 960 }));
  assert.equal(result.find((a) => a.ruleType === "low_pressure_system"), undefined);
});

test("evaluateNdbcAnomalies does NOT trigger low_pressure_system when pressure is null", () => {
  const result = evaluateNdbcAnomalies(makeObs({ pressureHpa: null }));
  assert.equal(result.find((a) => a.ruleType === "low_pressure_system"), undefined);
});

// ─── Multiple alerts ──────────────────────────────────────────────────────────

test("evaluateNdbcAnomalies returns multiple alerts when several thresholds are exceeded", () => {
  const result = evaluateNdbcAnomalies(
    makeObs({ seaSurfaceTempC: 32, waveHeightM: 7, windSpeedMps: 25, pressureHpa: 950 }),
  );
  assert.equal(result.length, 4);
  const ruleTypes = result.map((a) => a.ruleType);
  assert.ok(ruleTypes.includes("high_sea_temperature"));
  assert.ok(ruleTypes.includes("high_wave_height"));
  assert.ok(ruleTypes.includes("high_wind_speed"));
  assert.ok(ruleTypes.includes("low_pressure_system"));
});

// ─── Source formatting ────────────────────────────────────────────────────────

test("evaluateNdbcAnomalies prefixes source with 'noaa_ndbc:' + station ID", () => {
  const obs = makeObs({ seaSurfaceTempC: 31, stationId: "41009" });
  const result = evaluateNdbcAnomalies(obs);
  assert.equal(result[0]?.source, "noaa_ndbc:41009");
  assert.equal(result[0]?.stationId, "41009");
});

// ─── Detail content ───────────────────────────────────────────────────────────

test("evaluateNdbcAnomalies includes source timestamp in detail message", () => {
  const obs = makeObs({ seaSurfaceTempC: 35 });
  const result = evaluateNdbcAnomalies(obs);
  assert.ok((result[0]?.detail ?? "").includes(obs.sourceTimestamp));
});

test("evaluateNdbcAnomalies adds a baseline anomaly alert when history shows a strong z-score", () => {
  const obs = makeObs({ seaSurfaceTempC: 27.8, stationId: "46042" });
  const history: BaselineObservationInput[] = Array.from({ length: 12 }, (_, index) => ({
    stationId: "46042",
    observedAt: Date.parse(`2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    seaSurfaceTempC: 24 + index * 0.03,
    waveHeightM: 1.5,
    windSpeedMps: 5,
    pressureHpa: 1013,
    sourceTimestamp: `2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const result = evaluateNdbcAnomalies(obs, { baselineHistory: history, baseline: { zScoreThreshold: 2 } });

  const alert = result.find((item) => item.ruleType === "high_sea_temperature");
  assert.ok(alert);
  assert.ok((alert.detail ?? "").includes("z-score"));
});

test("evaluateNdbcAnomalies preserves default thresholds when no station override exists", () => {
  const result = evaluateNdbcAnomalies(makeObs({ stationId: "DEFAULT-ONLY-01", seaSurfaceTempC: 29.5 }));
  assert.equal(result.find((a) => a.ruleType === "high_sea_temperature"), undefined);
});

test("evaluateNdbcAnomalies uses station-specific SST override when configured", () => {
  const result = evaluateNdbcAnomalies(
    makeObs({ stationId: "CUSTOM-SST-01", seaSurfaceTempC: 28.4 }),
    { thresholds: makeThresholds({ seaSurfaceTempC: 28 }) },
  );
  const alert = result.find((a) => a.ruleType === "high_sea_temperature");
  assert.ok(alert, "expected high_sea_temperature alert under station override");
  assert.ok((alert.detail ?? "").includes("> 28.0 °C"), `detail should include override threshold: ${alert?.detail}`);
});

test("evaluateNdbcAnomalies uses station-specific pressure override when configured", () => {
  const result = evaluateNdbcAnomalies(
    makeObs({ stationId: "CUSTOM-PRESSURE-01", pressureHpa: 975 }),
    { thresholds: makeThresholds({ pressureHpa: 980 }) },
  );
  const alert = result.find((a) => a.ruleType === "low_pressure_system");
  assert.ok(alert, "expected low_pressure_system alert under station override");
  assert.ok((alert.detail ?? "").includes("< 980 hPa"), `detail should include override threshold: ${alert?.detail}`);
});

test("evaluateNdbcAnomalies supports mixed station overrides and defaults together", () => {
  const result = evaluateNdbcAnomalies(
    makeObs({
      stationId: "CUSTOM-MIXED-01",
      seaSurfaceTempC: 29.2,
      windSpeedMps: 18.5,
      waveHeightM: 4.8,
      pressureHpa: 970,
    }),
    {
      thresholds: makeThresholds({ seaSurfaceTempC: 29, windSpeedMps: 18 }),
    },
  );
  const ruleTypes = result.map((alert) => alert.ruleType);
  assert.ok(ruleTypes.includes("high_sea_temperature"));
  assert.ok(ruleTypes.includes("high_wind_speed"));
  assert.equal(ruleTypes.includes("high_wave_height"), false);
  assert.equal(ruleTypes.includes("low_pressure_system"), false);
});

test("evaluateNdbcAnomalies lowers SST threshold using seasonal baseline deviation", () => {
  const obs = makeObs({
    stationId: "46042",
    observedAt: Date.parse("2023-11-15T00:00:00.000Z"),
    sourceTimestamp: "2023-11-15T00:00:00.000Z",
    seaSurfaceTempC: 25.3,
  });
  const history: BaselineObservationInput[] = Array.from({ length: 12 }, (_, index) => ({
    stationId: "46042",
    observedAt: Date.parse(`2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    seaSurfaceTempC: 24 + ((index % 3) * 0.2),
    waveHeightM: 1.5,
    windSpeedMps: 5,
    pressureHpa: 1013,
    sourceTimestamp: `2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const result = evaluateNdbcAnomalies(obs, { baselineHistory: history, baseline: { zScoreThreshold: 2 } });
  const alert = result.find((item) => item.ruleType === "high_sea_temperature");

  assert.ok(alert, "expected hybrid SST threshold alert");
  assert.ok((alert.detail ?? "").includes("Baseline-adjusted threshold applied"), alert?.detail);
  assert.match(alert.detail ?? "", /> 25\.[0-9] °C/);
  assert.ok((alert.detail ?? "").includes("seasonal baseline"), alert?.detail);
});

test("evaluateNdbcAnomalies preserves static threshold when baseline deviation is below hybrid gate", () => {
  const obs = makeObs({
    stationId: "46042",
    observedAt: Date.parse("2023-11-15T00:00:00.000Z"),
    sourceTimestamp: "2023-11-15T00:00:00.000Z",
    seaSurfaceTempC: 25.3,
  });
  const history: BaselineObservationInput[] = Array.from({ length: 12 }, (_, index) => ({
    stationId: "46042",
    observedAt: Date.parse(`2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    seaSurfaceTempC: 24.8 + index * 0.1,
    waveHeightM: 1.5,
    windSpeedMps: 5,
    pressureHpa: 1013,
    sourceTimestamp: `2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const result = evaluateNdbcAnomalies(obs, { baselineHistory: history, baseline: { zScoreThreshold: 2 } });

  assert.equal(result.find((item) => item.ruleType === "high_sea_temperature"), undefined);
});

test("evaluateNdbcAnomalies raises low-pressure sensitivity using seasonal baseline deviation", () => {
  const obs = makeObs({
    stationId: "46042",
    observedAt: Date.parse("2023-11-15T00:00:00.000Z"),
    sourceTimestamp: "2023-11-15T00:00:00.000Z",
    pressureHpa: 995,
  });
  const history: BaselineObservationInput[] = Array.from({ length: 12 }, (_, index) => ({
    stationId: "46042",
    observedAt: Date.parse(`2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    seaSurfaceTempC: 24,
    waveHeightM: 1.5,
    windSpeedMps: 5,
    pressureHpa: 1008 + ((index % 3) * 1.5),
    sourceTimestamp: `2023-11-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));

  const result = evaluateNdbcAnomalies(obs, { baselineHistory: history, baseline: { zScoreThreshold: 2 } });
  const alert = result.find((item) => item.ruleType === "low_pressure_system");

  assert.ok(alert, "expected hybrid low pressure alert");
  assert.ok((alert.detail ?? "").includes("< 1007"), alert?.detail);
  assert.ok((alert.detail ?? "").includes("Baseline-adjusted threshold applied"), alert?.detail);
});
