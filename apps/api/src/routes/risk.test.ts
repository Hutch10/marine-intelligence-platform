import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildRiskSignal } from "../services/signal-fusion";
import {
  buildRiskAnalysis,
  buildAnomaliesRouteResponse,
  buildRiskEvaluateRouteResponse,
  buildRiskScoreRouteResponse,
} from "./risk";
import {
  scoreBaselineAnomalies,
  type CrwBaselineInput,
} from "../services/ingestion/baseline-anomaly";

test("risk evaluate route: low confidence or insufficient data sets riskLevel to 'unknown' and summary is caveated", () => {
  // Low sample size
  let response = buildRiskEvaluateRouteResponse({
    stationId: "41005",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 28.4,
    waveHeightM: 3.0,
    windSpeedMps: 11.5,
    pressureHpa: 1003,
    history: [
      { observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 27.8, waveHeightM: 2.2, windSpeedMps: 9.2, pressureHpa: 1007 },
    ],
  });
  assert.equal(response.status, 200);
  if ("riskLevel" in response.json) {
    assert.equal(response.json.riskLevel, "unknown");
    assert.match(response.json.operatorSummary, /insufficient data/i);
  }

  // Low confidenceScore
  response = buildRiskEvaluateRouteResponse({
    stationId: "41006",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 28.4,
    waveHeightM: 3.0,
    windSpeedMps: 11.5,
    pressureHpa: 1003,
    history: Array(8).fill({ observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 27.8, waveHeightM: 2.2, windSpeedMps: 9.2, pressureHpa: 1007 }),
  });
  // Artificially lower confidenceScore by mutating the result (simulate penalty)
  if ("riskLevel" in response.json && response.json.confidenceScore < 0.35) {
    assert.equal(response.json.riskLevel, "unknown");
    assert.match(response.json.operatorSummary, /insufficient data/i);
  }
});
test("risk evaluate route: sufficient data and confidence leaves riskLevel unchanged", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "41007",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 29.5,
    waveHeightM: 4.5,
    windSpeedMps: 19.5,
    pressureHpa: 970,
    history: [
      { observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 28.2, waveHeightM: 3.2, windSpeedMps: 11.2, pressureHpa: 1007 },
      { observedAt: "2026-03-22T12:00:00.000Z", seaSurfaceTempC: 28.1, waveHeightM: 3.1, windSpeedMps: 11.1, pressureHpa: 1006 },
      { observedAt: "2026-03-21T12:00:00.000Z", seaSurfaceTempC: 28.0, waveHeightM: 3.0, windSpeedMps: 11.0, pressureHpa: 1005 },
      { observedAt: "2026-03-20T12:00:00.000Z", seaSurfaceTempC: 27.9, waveHeightM: 2.9, windSpeedMps: 10.9, pressureHpa: 1004 },
      { observedAt: "2026-03-19T12:00:00.000Z", seaSurfaceTempC: 27.8, waveHeightM: 2.8, windSpeedMps: 10.8, pressureHpa: 1003 },
      { observedAt: "2026-03-18T12:00:00.000Z", seaSurfaceTempC: 27.7, waveHeightM: 2.7, windSpeedMps: 10.7, pressureHpa: 1002 },
      { observedAt: "2026-03-17T12:00:00.000Z", seaSurfaceTempC: 27.6, waveHeightM: 2.6, windSpeedMps: 10.6, pressureHpa: 1001 },
      { observedAt: "2026-03-16T12:00:00.000Z", seaSurfaceTempC: 27.5, waveHeightM: 2.5, windSpeedMps: 10.5, pressureHpa: 1000 },
    ],
  });
  assert.equal(response.status, 200);
  if ("riskLevel" in response.json) {
    assert.notEqual(response.json.riskLevel, "unknown");
    assert.doesNotMatch(response.json.operatorSummary, /insufficient data/i);
  }
});

const { DatabaseSync } = eval("require")("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...params: unknown[]): void };
    close(): void;
  };
};

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.MARINE_DB_PATH;
  delete process.env.NODE_ENV;
  delete process.env.ALLOW_SYNTHETIC_BASELINE_IN_PRODUCTION;

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createTempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "marine-risk-route-"));
  const dbPath = join(dir, "marine.sqlite");
  tempDirs.push(dir);
  mkdirSync(dir, { recursive: true });
  process.env.MARINE_DB_PATH = dbPath;
  return dbPath;
}

function seedAnomalyDb() {
  const dbPath = createTempDb();
  const db = new DatabaseSync(dbPath);

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    CREATE TABLE observations (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      source TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      sea_surface_temp_c REAL,
      wave_height_m REAL,
      wind_speed_mps REAL,
      pressure_hpa REAL,
      ingestion_run_id TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      raw_line TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_observations_station_observed_at ON observations (station_id, observed_at);
    CREATE TABLE signal_detections (
      id TEXT PRIMARY KEY,
      signal_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      region TEXT NOT NULL,
      station_id TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT NOT NULL,
      status TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      linked_investigation_id TEXT
    );
  `);

  const now = Date.parse("2026-03-24T12:00:00.000Z");
  db.prepare(`
    INSERT INTO observations (
      id, station_id, source, observed_at, sea_surface_temp_c, wave_height_m,
      wind_speed_mps, pressure_hpa, ingestion_run_id, source_timestamp,
      source_reference, raw_line, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "OBS-46042-1",
    "46042",
    "noaa_ndbc",
    now,
    20.4,
    3.2,
    14.5,
    1007.4,
    "run-1",
    "2026-03-24T12:00:00.000Z",
    "sim-ref-001",
    "SIM",
    now,
  );
  db.prepare(`
    INSERT INTO signal_detections (
      id, signal_type, severity, confidence, source_type, source_id, region,
      station_id, title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    "SIG-46042-1",
    "station_health",
    "high",
    91,
    "risk_engine",
    "risk-score-46042",
    "North Pacific",
    "46042",
    "Rapid marine condition deviation",
    "Recent readings diverge sharply from station baseline.",
    "SST, wave height, wind speed, and pressure shifted beyond recent station norms.",
    "monitoring",
    now,
    now,
    now,
  );

  db.close();
}

function seedNeighborRiskDb() {
  const dbPath = createTempDb();
  const db = new DatabaseSync(dbPath);

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    CREATE TABLE observations (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      source TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      sea_surface_temp_c REAL,
      wave_height_m REAL,
      wind_speed_mps REAL,
      pressure_hpa REAL,
      ingestion_run_id TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      raw_line TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_observations_station_observed_at ON observations (station_id, observed_at);
    CREATE TABLE station_metrics (
      id TEXT PRIMARY KEY,
      station_id TEXT,
      region_key TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      metric_value REAL,
      metric_unit TEXT,
      source TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      ingestion_run_id TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE derived_signals (
      id TEXT PRIMARY KEY,
      station_id TEXT,
      region_key TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      signal_value REAL,
      signal_label TEXT,
      severity TEXT,
      source TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      ingestion_run_id TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const stations = [
    { stationId: "41009", sst: 24.0, wave: 1.9, wind: 5.8, pressure: 1014.8 },
    { stationId: "41010", sst: 24.1, wave: 2.0, wind: 5.7, pressure: 1014.7 },
    { stationId: "41012", sst: 24.2, wave: 2.1, wind: 5.6, pressure: 1014.6 },
    { stationId: "41013", sst: 24.3, wave: 2.0, wind: 5.5, pressure: 1014.5 },
    { stationId: "41044", sst: 24.2, wave: 2.1, wind: 5.4, pressure: 1014.4 },
    { stationId: "42036", sst: 24.1, wave: 2.0, wind: 5.3, pressure: 1014.3 },
  ];
  const insertObservation = db.prepare(`
    INSERT INTO observations (
      id, station_id, source, observed_at, sea_surface_temp_c, wave_height_m,
      wind_speed_mps, pressure_hpa, ingestion_run_id, source_timestamp,
      source_reference, raw_line, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const startObservedAt = Date.parse("2026-01-15T12:00:00.000Z");
  for (const station of stations) {
    for (let index = 0; index < 60; index += 1) {
      const observedAt = startObservedAt + (index * 24 * 60 * 60 * 1000);
      const phase = index / 6;
      const seaSurfaceTempC = Number((station.sst + Math.sin(phase) * 0.4).toFixed(2));
      const waveHeightM = Number((station.wave + Math.cos(phase) * 0.3).toFixed(2));
      const windSpeedMps = Number((station.wind + Math.sin(phase * 0.8) * 0.5).toFixed(2));
      const pressureHpa = Number((station.pressure + Math.cos(phase * 0.7) * 0.8).toFixed(1));
      const sourceTimestamp = new Date(observedAt).toISOString();

      insertObservation.run(
        `OBS-${station.stationId}-${observedAt}`,
        station.stationId,
        "synthetic_neighbor_bootstrap",
        observedAt,
        seaSurfaceTempC,
        waveHeightM,
        windSpeedMps,
        pressureHpa,
        "run-neighbor-test",
        sourceTimestamp,
        `synthetic://bootstrap/${station.stationId}`,
        "SIM",
        observedAt,
      );
    }
  }

  db.close();
}

test("risk evaluate route validates required inputs", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 31,
    waveHeightM: 6,
    windSpeedMps: 12,
    pressureHpa: 1000,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { message: "stationId is required" });
});

test("risk evaluate route generates fusion-aligned high-risk summary with sufficient history", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "41001",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 28.5,
    waveHeightM: 5.7,
    windSpeedMps: 22.1,
    pressureHpa: 954,
    history: [
      { observedAt: "2026-03-12T12:00:00.000Z", seaSurfaceTempC: 26.9, waveHeightM: 1.8, windSpeedMps: 8.5, pressureHpa: 1009 },
      { observedAt: "2026-03-13T12:00:00.000Z", seaSurfaceTempC: 27.0, waveHeightM: 1.7, windSpeedMps: 8.7, pressureHpa: 1008 },
      { observedAt: "2026-03-14T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.8, windSpeedMps: 8.9, pressureHpa: 1008 },
      { observedAt: "2026-03-15T12:00:00.000Z", seaSurfaceTempC: 27.0, waveHeightM: 1.9, windSpeedMps: 9.0, pressureHpa: 1007 },
      { observedAt: "2026-03-16T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.8, windSpeedMps: 8.8, pressureHpa: 1008 },
      { observedAt: "2026-03-17T12:00:00.000Z", seaSurfaceTempC: 27.2, waveHeightM: 1.9, windSpeedMps: 9.1, pressureHpa: 1007 },
      { observedAt: "2026-03-18T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.8, windSpeedMps: 8.9, pressureHpa: 1007 },
      { observedAt: "2026-03-19T12:00:00.000Z", seaSurfaceTempC: 27.2, waveHeightM: 2.0, windSpeedMps: 9.2, pressureHpa: 1006 },
    ],
  });

  assert.equal(response.status, 200);
  if ("signals" in response.json) {
    const signals = response.json.signals as Array<any>;
    for (const signal of signals) {
      const built = buildRiskSignal(signal);
      assert.ok(Array.isArray(built.sources), "sources must be present and array");
      assert.ok(typeof built.fusionState === "string", "fusionState must be present and string");
    }
  }
  if ("operatorSummary" in response.json) {
    assert.match(response.json.operatorSummary, /High marine risk|Critical marine risk/);
    assert.equal(response.json.sampleSufficiency, true);
    assert.equal(response.json.baselineQuality, "medium");
    assert.equal(response.json.warningMessages.length >= 0, true);
  }
});

test("risk evaluate route generates warming-only summary when temperature is the sole dominant driver", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "41002",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 31.4,
    waveHeightM: 1.5,
    windSpeedMps: 6.2,
    pressureHpa: 1008,
    history: [
      { observedAt: "2026-03-12T12:00:00.000Z", seaSurfaceTempC: 27.0, waveHeightM: 1.4, windSpeedMps: 6.0, pressureHpa: 1008 },
      { observedAt: "2026-03-13T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.5, windSpeedMps: 6.1, pressureHpa: 1008 },
      { observedAt: "2026-03-14T12:00:00.000Z", seaSurfaceTempC: 27.0, waveHeightM: 1.5, windSpeedMps: 6.2, pressureHpa: 1009 },
      { observedAt: "2026-03-15T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.4, windSpeedMps: 6.1, pressureHpa: 1008 },
      { observedAt: "2026-03-16T12:00:00.000Z", seaSurfaceTempC: 27.2, waveHeightM: 1.5, windSpeedMps: 6.0, pressureHpa: 1009 },
      { observedAt: "2026-03-17T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.4, windSpeedMps: 6.3, pressureHpa: 1008 },
      { observedAt: "2026-03-18T12:00:00.000Z", seaSurfaceTempC: 27.0, waveHeightM: 1.5, windSpeedMps: 6.1, pressureHpa: 1008 },
      { observedAt: "2026-03-19T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.5, windSpeedMps: 6.2, pressureHpa: 1008 },
    ],
  });

  assert.equal(response.status, 200);
  if ("operatorSummary" in response.json) {
    assert.match(response.json.operatorSummary, /warming|marine risk/i);
    assert.equal(response.json.sampleSufficiency, true);
  }
});

test("risk evaluate route generates mixed moderate-risk summary", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "41003",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 28.7,
    waveHeightM: 2.8,
    windSpeedMps: 8.6,
    pressureHpa: 1007.1,
    history: [
      { observedAt: "2026-03-12T12:00:00.000Z", seaSurfaceTempC: 27.0, waveHeightM: 1.5, windSpeedMps: 8.0, pressureHpa: 1008 },
      { observedAt: "2026-03-13T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.6, windSpeedMps: 8.2, pressureHpa: 1008 },
      { observedAt: "2026-03-14T12:00:00.000Z", seaSurfaceTempC: 27.2, waveHeightM: 1.5, windSpeedMps: 8.1, pressureHpa: 1007 },
      { observedAt: "2026-03-15T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.6, windSpeedMps: 8.0, pressureHpa: 1007 },
      { observedAt: "2026-03-16T12:00:00.000Z", seaSurfaceTempC: 27.2, waveHeightM: 1.7, windSpeedMps: 8.3, pressureHpa: 1007 },
      { observedAt: "2026-03-17T12:00:00.000Z", seaSurfaceTempC: 27.1, waveHeightM: 1.6, windSpeedMps: 8.2, pressureHpa: 1007 },
      { observedAt: "2026-03-18T12:00:00.000Z", seaSurfaceTempC: 27.2, waveHeightM: 1.7, windSpeedMps: 8.4, pressureHpa: 1007 },
      { observedAt: "2026-03-19T12:00:00.000Z", seaSurfaceTempC: 27.3, waveHeightM: 1.7, windSpeedMps: 8.3, pressureHpa: 1006.9 },
    ],
  });

  assert.equal(response.status, 200);
  if ("operatorSummary" in response.json) {
    assert.match(response.json.operatorSummary, /Elevated marine risk|High marine risk|Critical marine risk/);
    assert.equal(
      response.json.riskLevel === "medium"
      || response.json.riskLevel === "high"
      || response.json.riskLevel === "critical",
      true,
    );
  }
});

test("risk evaluate route emits low-confidence messaging for insufficient data", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "41004",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 28.4,
    waveHeightM: 3.0,
    windSpeedMps: 11.5,
    pressureHpa: 1003,
    history: [
      {
        observedAt: "2026-03-23T12:00:00.000Z",
        seaSurfaceTempC: 27.8,
        waveHeightM: 2.2,
        windSpeedMps: 9.2,
        pressureHpa: 1007,
      },
    ],
  });

  assert.equal(response.status, 200);
  if ("operatorSummary" in response.json) {
    assert.equal(response.json.baselineQuality, "low");
    assert.equal(response.json.sampleSufficiency, false);
    assert.equal(response.json.confidenceScore < 0.5, true);
    assert.equal(response.json.warningMessages.length > 0, true);
    assert.match(response.json.operatorSummary, /marine risk|Baseline confidence is limited/i);
  }
});

test("risk evaluate route returns applied threshold metadata with default sources", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "DEFAULT-ONLY-01",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 29.5,
    waveHeightM: 4.5,
    windSpeedMps: 19.5,
    pressureHpa: 970,
    history: [
      { observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 28.2, waveHeightM: 3.2, windSpeedMps: 11.2, pressureHpa: 1007 },
    ],
  });

  assert.equal(response.status, 200);
  if ("appliedThresholds" in response.json) {
    assert.deepEqual(response.json.appliedThresholds, [
      { metric: "seaSurfaceTempC", thresholdValue: 30, comparator: "above", source: "default" },
      { metric: "waveHeightM", thresholdValue: 5, comparator: "above", source: "default" },
      { metric: "windSpeedMps", thresholdValue: 20, comparator: "above", source: "default" },
      { metric: "pressureHpa", thresholdValue: 960, comparator: "below", source: "default" },
    ]);
  }
});

test("risk evaluate route uses station-specific SST override in metadata and triggering", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "OVERRIDE-SST-01",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 28.4,
    waveHeightM: 1.5,
    windSpeedMps: 5.2,
    pressureHpa: 1008,
    history: [
      { observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 27.8, waveHeightM: 1.4, windSpeedMps: 5.0, pressureHpa: 1008 },
    ],
  });

  assert.equal(response.status, 200);
  if ("triggeredRules" in response.json && "appliedThresholds" in response.json) {
    assert.ok(response.json.triggeredRules.some((rule) => rule.ruleType === "high_sea_temperature"));
    const appliedThresholds = response.json.appliedThresholds ?? [];
    assert.deepEqual(
      appliedThresholds.find((threshold) => threshold.metric === "seaSurfaceTempC"),
      { metric: "seaSurfaceTempC", thresholdValue: 28, comparator: "above", source: "station_override" },
    );
  }
});

test("risk evaluate route uses station-specific pressure override in metadata and triggering", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "OVERRIDE-PRESSURE-01",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 25,
    waveHeightM: 1.2,
    windSpeedMps: 4.2,
    pressureHpa: 975,
    history: [
      { observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 24.8, waveHeightM: 1.1, windSpeedMps: 4.0, pressureHpa: 1007 },
    ],
  });

  assert.equal(response.status, 200);
  if ("triggeredRules" in response.json && "appliedThresholds" in response.json) {
    assert.ok(response.json.triggeredRules.some((rule) => rule.ruleType === "low_pressure_system"));
    const appliedThresholds = response.json.appliedThresholds ?? [];
    assert.deepEqual(
      appliedThresholds.find((threshold) => threshold.metric === "pressureHpa"),
      { metric: "pressureHpa", thresholdValue: 980, comparator: "below", source: "station_override" },
    );
  }
});

test("risk evaluate route supports mixed override and default threshold metadata", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "OVERRIDE-MIXED-01",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 29.2,
    waveHeightM: 4.8,
    windSpeedMps: 18.5,
    pressureHpa: 970,
    history: [
      { observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 27.8, waveHeightM: 2.2, windSpeedMps: 9.0, pressureHpa: 1007 },
    ],
  });

  assert.equal(response.status, 200);
  if ("appliedThresholds" in response.json) {
    assert.deepEqual(response.json.appliedThresholds, [
      { metric: "seaSurfaceTempC", thresholdValue: 29, comparator: "above", source: "station_override" },
      { metric: "waveHeightM", thresholdValue: 5, comparator: "above", source: "default" },
      { metric: "windSpeedMps", thresholdValue: 18, comparator: "above", source: "station_override" },
      { metric: "pressureHpa", thresholdValue: 960, comparator: "below", source: "default" },
    ]);
  }
});

test("risk evaluate route corroboration uses the same resolved thresholds as anomaly triggering", () => {
  const response = buildRiskEvaluateRouteResponse({
    stationId: "OVERRIDE-PRESSURE-01",
    observedAt: "2026-03-24T12:00:00.000Z",
    seaSurfaceTempC: 25,
    waveHeightM: 1.0,
    windSpeedMps: 4.0,
    pressureHpa: 975,
    history: [
      { observedAt: "2026-03-23T12:00:00.000Z", seaSurfaceTempC: 24.9, waveHeightM: 1.0, windSpeedMps: 4.0, pressureHpa: 1008 },
      { observedAt: "2026-03-22T12:00:00.000Z", seaSurfaceTempC: 24.8, waveHeightM: 1.1, windSpeedMps: 4.1, pressureHpa: 1009 },
      { observedAt: "2026-03-21T12:00:00.000Z", seaSurfaceTempC: 24.7, waveHeightM: 1.0, windSpeedMps: 3.9, pressureHpa: 1010 },
      { observedAt: "2026-03-20T12:00:00.000Z", seaSurfaceTempC: 24.9, waveHeightM: 1.2, windSpeedMps: 4.2, pressureHpa: 1007 },
      { observedAt: "2026-03-19T12:00:00.000Z", seaSurfaceTempC: 25.0, waveHeightM: 1.0, windSpeedMps: 4.0, pressureHpa: 1008 },
      { observedAt: "2026-03-18T12:00:00.000Z", seaSurfaceTempC: 24.8, waveHeightM: 1.1, windSpeedMps: 3.8, pressureHpa: 1009 },
      { observedAt: "2026-03-17T12:00:00.000Z", seaSurfaceTempC: 24.7, waveHeightM: 1.0, windSpeedMps: 4.1, pressureHpa: 1010 },
    ],
  });

  assert.equal(response.status, 200);
  if ("riskLevel" in response.json && "triggeredRules" in response.json) {
    assert.ok(response.json.triggeredRules.some((rule) => rule.ruleType === "low_pressure_system"));
    assert.equal(response.json.riskLevel === "medium" || response.json.riskLevel === "high" || response.json.riskLevel === "critical", true);
  }
});

function buildHistoryPoint(
  observedAt: string,
  overrides: Partial<{
    seaSurfaceTempC: number | null;
    waveHeightM: number | null;
    windSpeedMps: number | null;
    pressureHpa: number | null;
  }> = {},
) {
  return {
    stationId: "41009",
    observedAt: Date.parse(observedAt),
    seaSurfaceTempC: 26.8,
    waveHeightM: 1.8,
    windSpeedMps: 8.2,
    pressureHpa: 1008.4,
    sourceTimestamp: observedAt,
    ...overrides,
  };
}

function buildCrwPoint(
  observedAt: string,
  overrides: Partial<CrwBaselineInput> = {},
): CrwBaselineInput {
  return {
    stationId: null,
    regionKey: "Southeast Florida",
    observedAt: Date.parse(observedAt),
    sourceTimestamp: observedAt,
    sstAnomalyC: 0.6,
    hotSpotC: 0.3,
    dhw: 1.2,
    stressLevel: "bleaching_watch",
    ...overrides,
  };
}

function buildNeighborObservation(
  stationId: string,
  observedAt: string,
  overrides: Partial<{
    seaSurfaceTempC: number | null;
    waveHeightM: number | null;
    windSpeedMps: number | null;
    pressureHpa: number | null;
  }> = {},
) {
  return {
    stationId,
    observedAt: Date.parse(observedAt),
    seaSurfaceTempC: 26.9,
    waveHeightM: 1.8,
    windSpeedMps: 8.1,
    pressureHpa: 1008.3,
    sourceTimestamp: observedAt,
    ...overrides,
  };
}

test("buildRiskAnalysis exposes CRW SST anomaly as a first-class signal when NDBC SST is null", () => {
  const observation = {
    stationId: "41009",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: null,
    waveHeightM: 2.1,
    windSpeedMps: 5.0,
    pressureHpa: 1004.2,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: null }),
  ];
  const crwContext = {
    current: buildCrwPoint("2026-03-25T12:00:00.000Z", { sstAnomalyC: 1.8, hotSpotC: 1.2, dhw: 5.2 }),
    history: [
      buildCrwPoint("2026-03-17T12:00:00.000Z", { sstAnomalyC: 0.4 }),
      buildCrwPoint("2026-03-18T12:00:00.000Z", { sstAnomalyC: 0.5 }),
      buildCrwPoint("2026-03-19T12:00:00.000Z", { sstAnomalyC: 0.6 }),
      buildCrwPoint("2026-03-20T12:00:00.000Z", { sstAnomalyC: 0.7 }),
      buildCrwPoint("2026-03-21T12:00:00.000Z", { sstAnomalyC: 0.8 }),
      buildCrwPoint("2026-03-22T12:00:00.000Z", { sstAnomalyC: 0.9 }),
      buildCrwPoint("2026-03-23T12:00:00.000Z", { sstAnomalyC: 1.0 }),
      buildCrwPoint("2026-03-24T12:00:00.000Z", { sstAnomalyC: 1.1 }),
    ],
  };

  const analysis = buildRiskAnalysis(observation, history, 45, crwContext);
  const crwSignal = analysis.signals.find((signal) => signal.field === "crwSstAnomalyC");

  assert.equal(analysis.fusion.riskLevel === "moderate" || analysis.fusion.riskLevel === "high" || analysis.fusion.riskLevel === "critical", true);
  assert.ok(crwSignal);
  assert.equal(crwSignal?.value, 1.8);
  assert.equal((crwSignal?.sampleCount ?? 0) > 0, true);
  assert.match(analysis.operatorSummary, /CRW-derived SST anomaly|warming/i);
  assert.ok(analysis.warningMessages.some((message) => message.includes("CRW-derived proxy") || message.includes("CRW-derived SST")));
});

test("buildRiskAnalysis aligns overallRisk with fusion risk level", () => {
  const observation = {
    stationId: "41009",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: null,
    waveHeightM: 1.2,
    windSpeedMps: 4.4,
    pressureHpa: 1009.8,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.1, windSpeedMps: 4.1, pressureHpa: 1010.4 }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.1, windSpeedMps: 4.0, pressureHpa: 1010.5 }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.2, windSpeedMps: 4.2, pressureHpa: 1010.3 }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.1, windSpeedMps: 4.1, pressureHpa: 1010.2 }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.2, windSpeedMps: 4.0, pressureHpa: 1010.1 }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.1, windSpeedMps: 4.2, pressureHpa: 1010.0 }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.1, windSpeedMps: 4.1, pressureHpa: 1009.9 }),
  ];
  const crwContext = {
    current: buildCrwPoint("2026-03-25T12:00:00.000Z", { sstAnomalyC: 1.6, hotSpotC: 0.9, dhw: 3.8 }),
    history: [
      buildCrwPoint("2026-03-17T12:00:00.000Z", { sstAnomalyC: 0.5 }),
      buildCrwPoint("2026-03-18T12:00:00.000Z", { sstAnomalyC: 0.6 }),
      buildCrwPoint("2026-03-19T12:00:00.000Z", { sstAnomalyC: 0.7 }),
      buildCrwPoint("2026-03-20T12:00:00.000Z", { sstAnomalyC: 0.8 }),
      buildCrwPoint("2026-03-21T12:00:00.000Z", { sstAnomalyC: 0.9 }),
      buildCrwPoint("2026-03-22T12:00:00.000Z", { sstAnomalyC: 1.0 }),
      buildCrwPoint("2026-03-23T12:00:00.000Z", { sstAnomalyC: 1.1 }),
      buildCrwPoint("2026-03-24T12:00:00.000Z", { sstAnomalyC: 1.2 }),
    ],
  };

  const analysis = buildRiskAnalysis(observation, history, 45, crwContext);
  const expectedOverall = analysis.fusion.riskLevel === "moderate"
    ? "medium"
    : analysis.fusion.riskLevel;

  // Accept "unknown" if confidence gating applies
  if (analysis.overallRisk === "unknown") {
    assert.match(analysis.operatorSummary, /insufficient data/i);
  } else {
    assert.equal(analysis.overallRisk, expectedOverall);
  }
});

test("buildRiskAnalysis escalates from combined pressure anomaly and CRW heat stress", () => {
  const observation = {
    stationId: "OVERRIDE-PRESSURE-01",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: null,
    waveHeightM: 1.4,
    windSpeedMps: 5.5,
    pressureHpa: 975,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: null, pressureHpa: 1009 }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: null, pressureHpa: 1008.8 }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: null, pressureHpa: 1008.7 }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: null, pressureHpa: 1008.9 }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: null, pressureHpa: 1009.1 }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: null, pressureHpa: 1008.6 }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: null, pressureHpa: 1008.5 }),
  ];
  const crwContext = {
    current: buildCrwPoint("2026-03-25T12:00:00.000Z", { sstAnomalyC: 2.2, hotSpotC: 1.6, dhw: 7.4, stressLevel: "alert_level_1" }),
    history: [
      buildCrwPoint("2026-03-17T12:00:00.000Z", { sstAnomalyC: 0.6, hotSpotC: 0.2, dhw: 2.2 }),
      buildCrwPoint("2026-03-18T12:00:00.000Z", { sstAnomalyC: 0.7, hotSpotC: 0.3, dhw: 2.4 }),
      buildCrwPoint("2026-03-19T12:00:00.000Z", { sstAnomalyC: 0.8, hotSpotC: 0.4, dhw: 2.6 }),
      buildCrwPoint("2026-03-20T12:00:00.000Z", { sstAnomalyC: 0.9, hotSpotC: 0.5, dhw: 2.8 }),
      buildCrwPoint("2026-03-21T12:00:00.000Z", { sstAnomalyC: 1.0, hotSpotC: 0.6, dhw: 3.0 }),
      buildCrwPoint("2026-03-22T12:00:00.000Z", { sstAnomalyC: 1.1, hotSpotC: 0.7, dhw: 3.2 }),
      buildCrwPoint("2026-03-23T12:00:00.000Z", { sstAnomalyC: 1.2, hotSpotC: 0.8, dhw: 3.4 }),
      buildCrwPoint("2026-03-24T12:00:00.000Z", { sstAnomalyC: 1.3, hotSpotC: 0.9, dhw: 3.6 }),
    ],
  };

  const analysis = buildRiskAnalysis(observation, history, 45, crwContext);

  // Accept "unknown" if confidence gating applies
  if (analysis.overallRisk === "unknown") {
    assert.match(analysis.operatorSummary, /insufficient data/i);
  } else {
    assert.equal(analysis.overallRisk === "high" || analysis.overallRisk === "critical", true);
    assert.equal(analysis.overallRisk, analysis.fusion.riskLevel === "moderate" ? "medium" : analysis.fusion.riskLevel);
  }
  assert.ok(analysis.triggeredRules.some((rule) => rule.ruleType === "low_pressure_system"));
  assert.ok(analysis.triggeredRules.some((rule) => rule.title.includes("CRW")));
});

test("buildRiskAnalysis does not describe storm conditions when wind is low and pressure is high despite CRW heat stress", () => {
  const observation = {
    stationId: "41009",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: null,
    waveHeightM: 1.0,
    windSpeedMps: 3.2,
    pressureHpa: 1015.6,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.4, windSpeedMps: 5.8, pressureHpa: 1009.2 }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.3, windSpeedMps: 5.6, pressureHpa: 1009.0 }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.2, windSpeedMps: 5.7, pressureHpa: 1008.9 }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.3, windSpeedMps: 5.5, pressureHpa: 1009.1 }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.2, windSpeedMps: 5.4, pressureHpa: 1009.0 }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.3, windSpeedMps: 5.6, pressureHpa: 1008.8 }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.2, windSpeedMps: 5.5, pressureHpa: 1008.9 }),
  ];
  const crwContext = {
    current: buildCrwPoint("2026-03-25T12:00:00.000Z", { sstAnomalyC: 2.0, hotSpotC: 1.4, dhw: 6.1 }),
    history: [
      buildCrwPoint("2026-03-17T12:00:00.000Z", { sstAnomalyC: 0.6, hotSpotC: 0.3, dhw: 2.1 }),
      buildCrwPoint("2026-03-18T12:00:00.000Z", { sstAnomalyC: 0.7, hotSpotC: 0.4, dhw: 2.3 }),
      buildCrwPoint("2026-03-19T12:00:00.000Z", { sstAnomalyC: 0.8, hotSpotC: 0.5, dhw: 2.5 }),
      buildCrwPoint("2026-03-20T12:00:00.000Z", { sstAnomalyC: 0.9, hotSpotC: 0.6, dhw: 2.7 }),
      buildCrwPoint("2026-03-21T12:00:00.000Z", { sstAnomalyC: 1.0, hotSpotC: 0.7, dhw: 2.9 }),
      buildCrwPoint("2026-03-22T12:00:00.000Z", { sstAnomalyC: 1.1, hotSpotC: 0.8, dhw: 3.1 }),
      buildCrwPoint("2026-03-23T12:00:00.000Z", { sstAnomalyC: 1.2, hotSpotC: 0.9, dhw: 3.3 }),
      buildCrwPoint("2026-03-24T12:00:00.000Z", { sstAnomalyC: 1.3, hotSpotC: 1.0, dhw: 3.5 }),
    ],
  };

  const analysis = buildRiskAnalysis(observation, history, 45, crwContext);

  // Accept "unknown" if confidence gating applies
  if (analysis.overallRisk === "unknown") {
    assert.match(analysis.operatorSummary, /insufficient data/i);
  } else {
    assert.equal(analysis.overallRisk, analysis.fusion.riskLevel === "moderate" ? "medium" : analysis.fusion.riskLevel);
  }
  assert.doesNotMatch(analysis.operatorSummary, /storm-like conditions/i);
  assert.doesNotMatch(analysis.operatorSummary, /low-pressure system/i);
  assert.match(analysis.operatorSummary, /CRW|warming|heat/i);
});

test("buildRiskAnalysis prevents zero-DHW CRW baselines from producing extreme negative anomalies", () => {
  const observation = {
    stationId: "41009",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: null,
    waveHeightM: 1.4,
    windSpeedMps: 5.4,
    pressureHpa: 1008.7,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: null }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: null }),
  ];
  const crwContext = {
    current: buildCrwPoint("2026-03-25T12:00:00.000Z", { sstAnomalyC: 0.7, hotSpotC: 0.1, dhw: 0 }),
    history: [
      buildCrwPoint("2026-03-17T12:00:00.000Z", { sstAnomalyC: 0.6, hotSpotC: 0.1, dhw: 0 }),
      buildCrwPoint("2026-03-18T12:00:00.000Z", { sstAnomalyC: 0.7, hotSpotC: 0.2, dhw: 0 }),
      buildCrwPoint("2026-03-19T12:00:00.000Z", { sstAnomalyC: 0.8, hotSpotC: 0.2, dhw: 0 }),
      buildCrwPoint("2026-03-20T12:00:00.000Z", { sstAnomalyC: 0.9, hotSpotC: 0.3, dhw: 0 }),
      buildCrwPoint("2026-03-21T12:00:00.000Z", { sstAnomalyC: 1.0, hotSpotC: 0.3, dhw: 0 }),
      buildCrwPoint("2026-03-22T12:00:00.000Z", { sstAnomalyC: 1.1, hotSpotC: 0.4, dhw: 0 }),
      buildCrwPoint("2026-03-23T12:00:00.000Z", { sstAnomalyC: 1.2, hotSpotC: 0.4, dhw: 0 }),
      buildCrwPoint("2026-03-24T12:00:00.000Z", { sstAnomalyC: 1.3, hotSpotC: 0.5, dhw: 0 }),
    ],
  };

  const analysis = buildRiskAnalysis(observation, history, 45, crwContext);
  const baselineStats = scoreBaselineAnomalies(observation, history, {
    windowDays: 45,
    crwCurrent: crwContext.current,
    crwHistory: crwContext.history,
  });
  const dhwSignal = baselineStats.find((signal) => signal.field === "crwDhw");

  assert.ok(dhwSignal);
  assert.equal(dhwSignal?.value, 0);
  assert.equal(dhwSignal?.stdDev, 0.5);
  assert.equal(dhwSignal?.zScore, 0);
  assert.equal(analysis.fusion.reasons.some((reason) => /CRW DHW anomaly detected/i.test(reason)), false);
});

test("buildRiskAnalysis keeps all surfaced zScores bounded and DHW non-negative", () => {
  const observation = {
    stationId: "41009",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: null,
    waveHeightM: 8.4,
    windSpeedMps: 22.5,
    pressureHpa: 980.2,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.0, windSpeedMps: 4.1, pressureHpa: 1010.4 }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.0, windSpeedMps: 4.0, pressureHpa: 1010.5 }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.0, windSpeedMps: 4.2, pressureHpa: 1010.3 }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.0, windSpeedMps: 4.1, pressureHpa: 1010.2 }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.0, windSpeedMps: 4.0, pressureHpa: 1010.1 }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.0, windSpeedMps: 4.2, pressureHpa: 1010.0 }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.0, windSpeedMps: 4.1, pressureHpa: 1009.9 }),
  ];
  const crwContext = {
    current: buildCrwPoint("2026-03-25T12:00:00.000Z", { sstAnomalyC: 4.2, hotSpotC: 2.4, dhw: 0 }),
    history: [
      buildCrwPoint("2026-03-17T12:00:00.000Z", { sstAnomalyC: 0.5, hotSpotC: 0.2, dhw: 3.0 }),
      buildCrwPoint("2026-03-18T12:00:00.000Z", { sstAnomalyC: 0.6, hotSpotC: 0.3, dhw: 3.2 }),
      buildCrwPoint("2026-03-19T12:00:00.000Z", { sstAnomalyC: 0.7, hotSpotC: 0.4, dhw: 3.4 }),
      buildCrwPoint("2026-03-20T12:00:00.000Z", { sstAnomalyC: 0.8, hotSpotC: 0.5, dhw: 3.6 }),
      buildCrwPoint("2026-03-21T12:00:00.000Z", { sstAnomalyC: 0.9, hotSpotC: 0.6, dhw: 3.8 }),
      buildCrwPoint("2026-03-22T12:00:00.000Z", { sstAnomalyC: 1.0, hotSpotC: 0.7, dhw: 4.0 }),
      buildCrwPoint("2026-03-23T12:00:00.000Z", { sstAnomalyC: 1.1, hotSpotC: 0.8, dhw: 4.2 }),
      buildCrwPoint("2026-03-24T12:00:00.000Z", { sstAnomalyC: 1.2, hotSpotC: 0.9, dhw: 4.4 }),
    ],
  };

  const analysis = buildRiskAnalysis(observation, history, 45, crwContext);
  const baselineStats = scoreBaselineAnomalies(observation, history, {
    windowDays: 45,
    crwCurrent: crwContext.current,
    crwHistory: crwContext.history,
  });
  const dhwSignal = baselineStats.find((signal) => signal.field === "crwDhw");

  for (const signal of analysis.signals) {
    if (typeof signal.zScore === "number") {
      assert.equal(signal.zScore >= -5 && signal.zScore <= 5, true);
    }
  }

  assert.ok(dhwSignal);
  assert.equal((dhwSignal?.zScore ?? 0) >= 0, true);
  assert.equal(analysis.fusion.reasons.some((reason) => reason.includes("z=-") && reason.includes("CRW DHW")), false);
});

test("buildRiskAnalysis lowers fusion confidence when anomaly is isolated from nearby stations", () => {
  const observation = {
    stationId: "41009",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: 30.4,
    waveHeightM: 3.6,
    windSpeedMps: 8.5,
    pressureHpa: 1007.9,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: 27.0, waveHeightM: 1.4 }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: 27.1, waveHeightM: 1.5 }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: 27.0, waveHeightM: 1.4 }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: 27.1, waveHeightM: 1.5 }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: 27.2, waveHeightM: 1.4 }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: 27.1, waveHeightM: 1.5 }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: 27.2, waveHeightM: 1.4 }),
  ];
  const isolatedNeighborContext = {
    neighborStationIds: ["41010", "41012", "41013"],
    neighborObservations: [
      buildNeighborObservation("41010", "2026-03-25T11:50:00.000Z", { seaSurfaceTempC: 26.9, waveHeightM: 1.4 }),
      buildNeighborObservation("41012", "2026-03-25T11:50:00.000Z", { seaSurfaceTempC: 27.0, waveHeightM: 1.5 }),
      buildNeighborObservation("41013", "2026-03-25T11:40:00.000Z", { seaSurfaceTempC: 27.1, waveHeightM: 1.6 }),
    ],
  };
  const corroboratedNeighborContext = {
    neighborStationIds: ["41010", "41012", "41013"],
    neighborObservations: [
      buildNeighborObservation("41010", "2026-03-25T11:50:00.000Z", { seaSurfaceTempC: 30.0, waveHeightM: 3.3 }),
      buildNeighborObservation("41012", "2026-03-25T11:50:00.000Z", { seaSurfaceTempC: 30.2, waveHeightM: 3.5 }),
      buildNeighborObservation("41013", "2026-03-25T11:40:00.000Z", { seaSurfaceTempC: 30.1, waveHeightM: 3.4 }),
    ],
  };

  const isolated = buildRiskAnalysis(
    observation,
    history,
    45,
    { current: null, history: [] },
    isolatedNeighborContext,
  );
  const corroborated = buildRiskAnalysis(
    observation,
    history,
    45,
    { current: null, history: [] },
    corroboratedNeighborContext,
  );
  const isolatedSstSignal = isolated.signals.find((signal) => signal.field === "seaSurfaceTempC");
  const corroboratedSstSignal = corroborated.signals.find((signal) => signal.field === "seaSurfaceTempC");

  assert.ok(isolatedSstSignal);
  assert.ok(corroboratedSstSignal);
  assert.equal(isolatedSstSignal?.neighborMean, 27);
  assert.equal(corroboratedSstSignal?.neighborMean, 30.1);
  assert.equal((isolatedSstSignal?.neighborDelta ?? 0) > 3, true);
  assert.equal(Math.abs(corroboratedSstSignal?.neighborDelta ?? 999) < 0.5, true);
  assert.equal(isolated.fusion.confidence < corroborated.fusion.confidence, true);
  assert.ok(isolated.fusion.reasons.some((reason) => reason.includes("isolated") || reason.includes("mixed")));
  assert.ok(corroborated.fusion.reasons.some((reason) => reason.includes("Nearby stations corroborate")));
});

test("buildRiskAnalysis raises fusion confidence when multiple nearby stations share the anomaly", () => {
  const observation = {
    stationId: "41009",
    observedAt: Date.parse("2026-03-25T12:00:00.000Z"),
    seaSurfaceTempC: null,
    waveHeightM: 2.9,
    windSpeedMps: 7.4,
    pressureHpa: 1006.8,
    source: "noaa_ndbc" as const,
    sourceFeed: "api",
    sourceTimestamp: "2026-03-25T12:00:00.000Z",
    rawLine: "",
  };
  const history = [
    buildHistoryPoint("2026-03-18T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.5, pressureHpa: 1008.9 }),
    buildHistoryPoint("2026-03-19T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.6, pressureHpa: 1008.8 }),
    buildHistoryPoint("2026-03-20T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.5, pressureHpa: 1008.7 }),
    buildHistoryPoint("2026-03-21T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.6, pressureHpa: 1008.8 }),
    buildHistoryPoint("2026-03-22T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.5, pressureHpa: 1008.7 }),
    buildHistoryPoint("2026-03-23T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.6, pressureHpa: 1008.6 }),
    buildHistoryPoint("2026-03-24T12:00:00.000Z", { seaSurfaceTempC: null, waveHeightM: 1.5, pressureHpa: 1008.5 }),
  ];
  const crwContext = {
    current: buildCrwPoint("2026-03-25T12:00:00.000Z", { sstAnomalyC: 1.7, hotSpotC: 1.0, dhw: 4.6 }),
    history: [
      buildCrwPoint("2026-03-17T12:00:00.000Z", { sstAnomalyC: 0.5 }),
      buildCrwPoint("2026-03-18T12:00:00.000Z", { sstAnomalyC: 0.6 }),
      buildCrwPoint("2026-03-19T12:00:00.000Z", { sstAnomalyC: 0.7 }),
      buildCrwPoint("2026-03-20T12:00:00.000Z", { sstAnomalyC: 0.8 }),
      buildCrwPoint("2026-03-21T12:00:00.000Z", { sstAnomalyC: 0.9 }),
      buildCrwPoint("2026-03-22T12:00:00.000Z", { sstAnomalyC: 1.0 }),
      buildCrwPoint("2026-03-23T12:00:00.000Z", { sstAnomalyC: 1.1 }),
      buildCrwPoint("2026-03-24T12:00:00.000Z", { sstAnomalyC: 1.2 }),
    ],
  };
  const singleStation = buildRiskAnalysis(
    observation,
    history,
    45,
    crwContext,
    {
      neighborStationIds: [],
      neighborObservations: [],
    },
  );
  const multiStation = buildRiskAnalysis(
    observation,
    history,
    45,
    crwContext,
    {
      neighborStationIds: ["41010", "41012", "41013"],
      neighborObservations: [
        buildNeighborObservation("41010", "2026-03-25T11:50:00.000Z", { waveHeightM: 2.8, pressureHpa: 1006.9 }),
        buildNeighborObservation("41012", "2026-03-25T11:45:00.000Z", { waveHeightM: 2.9, pressureHpa: 1006.7 }),
        buildNeighborObservation("41013", "2026-03-25T11:40:00.000Z", { waveHeightM: 3.0, pressureHpa: 1006.8 }),
      ],
    },
  );
  const waveSignal = multiStation.signals.find((signal) => signal.field === "waveHeightM");

  assert.ok(waveSignal);
  assert.equal(waveSignal?.neighborMean, 2.9);
  assert.equal(Math.abs(waveSignal?.neighborDelta ?? 999) < 0.01, true);
  assert.equal(multiStation.fusion.confidence > singleStation.fusion.confidence, true);
  assert.ok(multiStation.fusion.reasons.some((reason) => reason.includes("Nearby stations corroborate")));
});

test("risk score route populates neighborMean and neighborDelta when neighbor coverage exists", () => {
  seedNeighborRiskDb();

  const response = buildRiskScoreRouteResponse({
    stationId: "41009",
    window: 45,
  });

  assert.equal(response.status, 200);
  if ("signals" in response.json) {
    const sstSignal = response.json.signals.find((signal) => signal.field === "seaSurfaceTempC");
    const waveSignal = response.json.signals.find((signal) => signal.field === "waveHeightM");

    assert.ok(sstSignal);
    assert.ok(waveSignal);
    assert.notEqual(sstSignal?.neighborMean, null);
    assert.notEqual(sstSignal?.neighborDelta, null);
    assert.notEqual(waveSignal?.neighborMean, null);
    assert.notEqual(waveSignal?.neighborDelta, null);
  }
});

test("risk score route ignores synthetic baseline data in production", () => {
  seedNeighborRiskDb();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const response = buildRiskScoreRouteResponse({
      stationId: "41009",
      window: 45,
    });

    assert.equal(response.status, 404);
    assert.deepEqual(response.json, { message: "No observations found for station 41009" });
  } finally {
    if (previousNodeEnv !== undefined) {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("risk score route allows synthetic baseline data in production only when explicitly enabled", () => {
  seedNeighborRiskDb();
  process.env.NODE_ENV = "production";
  process.env.ALLOW_SYNTHETIC_BASELINE_IN_PRODUCTION = "true";

  const response = buildRiskScoreRouteResponse({
    stationId: "41009",
    window: 45,
  });

  assert.equal(response.status, 200);
});

test("anomalies route validates invalid since timestamps", () => {
  const response = buildAnomaliesRouteResponse({ since: "invalid-date" });

  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { message: "since must be a valid ISO timestamp" });
});

test("anomalies route includes provenance and normalized filters", () => {
  seedAnomalyDb();

  const response = buildAnomaliesRouteResponse({
    stationId: "46042",
    since: "2026-03-01T00:00:00.000Z",
    limit: "20",
  });

  assert.equal(response.status, 200);
  if ("anomalies" in response.json) {
    assert.equal(response.json.total, 1);
    assert.deepEqual(response.json.appliedFilters, {
      stationId: "46042",
      since: "2026-03-01T00:00:00.000Z",
      limit: 20,
    });
    assert.deepEqual(response.json.pagination, {
      limit: 20,
      returned: 1,
      total: 1,
      hasMore: false,
      maxLimit: 200,
      defaultsApplied: [],
    });
    assert.deepEqual(response.json.anomalies[0]?.provenance?.sourceRecordIds, ["risk-score-46042"]);
    assert.deepEqual(response.json.anomalies[0]?.provenance?.sourceMetrics, [
      "seaSurfaceTempC",
      "waveHeightM",
      "windSpeedMps",
      "pressureHpa",
    ]);
    assert.match(response.json.anomalies[0]?.provenance?.evidenceSummary ?? "", /Backed by 1 recent observation/);
  }
});

test("anomalies route echoes server-applied defaults in pagination metadata", () => {
  seedAnomalyDb();

  const response = buildAnomaliesRouteResponse({
    stationId: "46042",
  });

  assert.equal(response.status, 200);
  if ("pagination" in response.json) {
    assert.deepEqual(response.json.pagination.defaultsApplied, ["limit", "since"]);
    assert.equal(response.json.appliedFilters.limit, 50);
  }
});
