import test from "node:test";
import assert from "node:assert/strict";
import {
  loadConfiguredNdbcStations,
  runNdbcIngestion,
  validateMappedObservation,
} from "./run-ndbc";
import type { SqliteDatabaseLike } from "../../db/client";
import type { NdbcMappedObservation } from "../../connectors/ndbc/map";
import type { ResolvedStationRiskThreshold } from "../../repositories/station-risk-thresholds";

function createDb(hasDuplicate = false): any {
  return {
    async execute(sql: string) {
      if (sql.includes("FROM observations") && hasDuplicate) {
        return [{ found: 1 }];
      }
      return [];
    },
    async close() {},
  };
}

function baseObservation(overrides: Partial<NdbcMappedObservation> = {}): NdbcMappedObservation {
  return {
    stationId: "46042",
    observedAt: Date.parse("2026-03-18T10:50:00.000Z"),
    seaSurfaceTempC: 17.1,
    waveHeightM: 1.24,
    windSpeedMps: 7.0,
    pressureHpa: 1015.6,
    source: "noaa_ndbc",
    sourceFeed: "https://www.ndbc.noaa.gov/data/realtime2/46042.txt",
    sourceTimestamp: "2026-03-18T10:50:00.000Z",
    rawLine: "26 03 18 10 50 ...",
    ...overrides,
  };
}

test("loadConfiguredNdbcStations parses comma-separated station ids", () => {
  const stations = loadConfiguredNdbcStations({ NDBC_STATION_IDS: "46042, 41009" } as NodeJS.ProcessEnv);

  assert.deepEqual(stations, [
    { stationId: "46042" },
    { stationId: "41009" },
  ]);
});

test("validateMappedObservation rejects stale timestamps", async () => {
  const now = Date.parse("2026-03-18T20:00:00.000Z");
  const observation = baseObservation({ observedAt: Date.parse("2026-03-18T10:50:00.000Z") });

  const reason = await validateMappedObservation(observation, now, 2 * 60 * 60 * 1000, createDb(false));

  assert.equal(reason, "timestamp_stale");
});

test("validateMappedObservation rejects impossible values", async () => {
  const now = Date.parse("2026-03-18T11:00:00.000Z");
  const observation = baseObservation({ seaSurfaceTempC: 65 });

  const reason = await validateMappedObservation(observation, now, 6 * 60 * 60 * 1000, createDb(false));

  assert.equal(reason, "impossible_values");
});

test("validateMappedObservation rejects duplicate station timestamp rows", async () => {
  const now = Date.parse("2026-03-18T11:00:00.000Z");
  const observation = baseObservation();

  const reason = await validateMappedObservation(observation, now, 6 * 60 * 60 * 1000, createDb(true));

  assert.equal(reason, "duplicate_row");
});

function createSQLiteDb(): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => unknown;
      };
      close: () => void;
    };
  };

  const raw = new DatabaseSync(":memory:");

  return {
    prepare(sql: string) {
      return raw.prepare(sql);
    },
    close() {
      raw.close();
    },
  };
}

test("runNdbcIngestion resolves thresholds once per observation and passes them into anomaly evaluation", async () => {
  const db = createSQLiteDb();
  const resolvedThresholds: ResolvedStationRiskThreshold[] = [
    {
      metric: "seaSurfaceTempC",
      comparator: "above",
      thresholdValue: 27.5,
      ruleType: "high_sea_temperature",
      severity: "warning",
      source: "station_override",
    },
    {
      metric: "waveHeightM",
      comparator: "above",
      thresholdValue: 5,
      ruleType: "high_wave_height",
      severity: "warning",
      source: "default",
    },
    {
      metric: "windSpeedMps",
      comparator: "above",
      thresholdValue: 20,
      ruleType: "high_wind_speed",
      severity: "warning",
      source: "default",
    },
    {
      metric: "pressureHpa",
      comparator: "below",
      thresholdValue: 960,
      ruleType: "low_pressure_system",
      severity: "warning",
      source: "default",
    },
  ];

  const thresholdCalls: Array<{ stationId: string | null | undefined }> = [];
  const anomalyCalls: Array<{ thresholds?: ResolvedStationRiskThreshold[] }> = [];

  const result = await runNdbcIngestion({
    resolvePath: () => "test.sqlite",
    openWritable: () => db,
    now: () => Date.parse("2026-03-18T11:00:00.000Z"),
    stations: [{ stationId: "46042", feedUrl: "https://example.invalid/46042.txt" }],
    fetchRealtimeText: async () => ({
      stationId: "46042",
      feedUrl: "https://example.invalid/46042.txt",
      body: "ignored",
      fetchedAt: Date.parse("2026-03-18T11:00:00.000Z"),
      statusCode: 200,
      contentType: "text/plain",
    }),
    parseStationData: () => [],
    mapRows: () => [
      baseObservation({
        stationId: "46042",
        observedAt: Date.parse("2026-03-18T10:50:00.000Z"),
        sourceTimestamp: "2026-03-18T10:50:00.000Z",
        seaSurfaceTempC: 28.2,
      }),
    ],
    resolveThresholds: (stationId) => {
      thresholdCalls.push({ stationId });
      return resolvedThresholds;
    },
    evaluateAnomalies: (_observation, options = {}) => {
      anomalyCalls.push({ thresholds: options.thresholds });
      return [];
    },
    getAdapter: () => {
      return {
        async execute(sql: string, params: unknown[] = []) {
          if (sql.includes("FROM observations") && Date.now() % 2 === 0) { // dummy condition
            // In the real test we might want to check params
          }
          return [];
        },
        async close() {},
      } as any;
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.insertedRows, 1);
  assert.equal(result.stationDiagnostics.length, 1);
  assert.equal(result.stationDiagnostics[0]?.stationId, "46042");
  assert.equal(result.stationDiagnostics[0]?.status, "healthy");
  assert.equal(result.stationDiagnostics[0]?.latestObservationTimestamp, "2026-03-18T10:50:00.000Z");
  assert.deepEqual(result.stationDiagnostics[0]?.usableMetricCoverage.metricsPresent, [
    "seaSurfaceTempC",
    "waveHeightM",
    "windSpeedMps",
    "pressureHpa",
  ]);
  assert.equal(result.stationDiagnostics[0]?.missingFieldRates.seaSurfaceTempC, 1);
  assert.equal(thresholdCalls.length, 1);
  assert.equal(thresholdCalls[0]?.stationId, "46042");
  assert.equal(anomalyCalls.length, 1);
  assert.deepEqual(anomalyCalls[0]?.thresholds, resolvedThresholds);
});

test("runNdbcIngestion fails loudly when no stations are configured", async () => {
  const db = createSQLiteDb();

  const result = await runNdbcIngestion({
    resolvePath: () => "test.sqlite",
    openWritable: () => db,
    stations: [],
    getAdapter: () => {
      return {
        async execute() { return []; },
        async close() {},
      } as any;
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.insertedRows, 0);
  assert.deepEqual(result.stationDiagnostics, []);
  assert.equal(result.error, "NDBC ingestion misconfigured: NDBC_STATION_IDS resolved to zero enabled stations.");
});

test("runNdbcIngestion fails loudly when a fetch yields no usable records", async () => {
  const db = createSQLiteDb();
  const logs: string[] = [];

  const result = await runNdbcIngestion({
    resolvePath: () => "test.sqlite",
    openWritable: () => db,
    now: () => Date.parse("2026-03-18T11:00:00.000Z"),
    stations: [{ stationId: "46042", feedUrl: "https://example.invalid/46042.txt" }],
    fetchRealtimeText: async () => ({
      stationId: "46042",
      feedUrl: "https://example.invalid/46042.txt",
      body: "ignored",
      fetchedAt: Date.parse("2026-03-18T11:00:00.000Z"),
      statusCode: 200,
      contentType: "text/plain",
    }),
    parseStationData: () => [],
    mapRows: () => [],
    logLine: (line) => {
      logs.push(line);
    },
    getAdapter: () => {
      return {
        async execute() { return []; },
        async close() {},
      } as any;
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.stationDiagnostics.length, 1);
  assert.equal(result.stationDiagnostics[0]?.stationId, "46042");
  assert.deepEqual(result.stationDiagnostics[0]?.rejectionBreakdown, { transient_failure: 1 });
  assert.equal(result.rejectionReasons.transient_failure, 1);
  assert.equal(result.error, "NDBC ingestion did not yield any usable station observations.");
  assert.ok(logs.some((line) => line.includes("resolved DB path: test.sqlite")));
  assert.ok(logs.some((line) => line.includes("configured station count: 1")));
  assert.ok(logs.some((line) => line.includes("fetching station 46042 from ")));
  assert.ok(logs.some((line) => line.includes("fetched record count before validation: 0")));
});
