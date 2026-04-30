import test from "node:test";
import assert from "node:assert/strict";
import {
  loadConfiguredCrwTargets,
  runCrwIngestion,
  validateCrwRecord,
} from "./run-crw";
import type { CrwParsedRecord } from "../../connectors/coral-reef-watch/parse";
import type { SqliteDatabaseLike } from "../../db/client";
import { CRW_SOURCE } from "../../connectors/coral-reef-watch/constants";

function createDb(hasDuplicate = false): any {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (sql.includes("FROM derived_signals") && hasDuplicate) {
            return [{ found: 1 }];
          }
          return [];
        },
        run() {},
      };
    },
    async execute(sql: string) {
      if (sql.includes("FROM derived_signals") && hasDuplicate) {
        return [{ found: 1 }];
      }

      return [];
    },
    async close() {},
  };
}

function baseRecord(overrides: Partial<CrwParsedRecord> = {}): CrwParsedRecord {
  return {
    region: "Great Barrier Reef",
    stationId: null,
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
    sstAnomalyC: 1.8,
    hotSpotC: 1.4,
    dhw: 6.2,
    stressLevel: "alert_level_1",
    latitude: -18.2,
    longitude: 147.6,
    raw: {},
    ...overrides,
  };
}

test("loadConfiguredCrwTargets parses region configuration", () => {
  const targets = loadConfiguredCrwTargets({ CRW_TARGET_REGIONS: "Great Barrier Reef,Caribbean" } as NodeJS.ProcessEnv);

  assert.deepEqual(targets, [
    { region: "Great Barrier Reef" },
    { region: "Caribbean" },
  ]);
});

test("validateCrwRecord rejects schema drift when required metrics are missing", async () => {
  const reason = await validateCrwRecord(
    baseRecord({ dhw: null }),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "schema_drift");
});

test("validateCrwRecord rejects stale timestamps", async () => {
  const reason = await validateCrwRecord(
    baseRecord(),
    Date.parse("2026-03-20T12:00:00.000Z"),
    6 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "timestamp_stale");
});

test("validateCrwRecord rejects impossible value ranges", async () => {
  const reason = await validateCrwRecord(
    baseRecord({ hotSpotC: 44 }),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "impossible_values");
});

test("validateCrwRecord rejects duplicate records", async () => {
  const reason = await validateCrwRecord(
    baseRecord(),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(true),
  );

  assert.equal(reason, "duplicate_record");
});

test("runCrwIngestion persists CRW metrics, signals, and provenance with canonical source", async () => {
  const captured: Array<{ sql: string; params: unknown[] }> = [];
  const db: any = {
    prepare(sql: string) {
      return {
        run(...params: unknown[]) {
          captured.push({ sql, params });
        },
        all(...params: unknown[]) {
          captured.push({ sql, params });

          if (sql.includes("FROM derived_signals") && sql.includes("reef_bleaching_alert_level")) {
            return [];
          }

          return [];
        },
      };
    },
    close() {},
  };

  const observedAt = Date.parse("2026-03-18T10:00:00.000Z");

  const result = await runCrwIngestion({
    resolvePath: () => "marine.sqlite",
    openWritable: () => db,
    getAdapter: () => {
      return {
        async execute(sql: string, params: unknown[] = []) {
          captured.push({ sql, params });
          return [];
        },
        async close() {},
      } as any;
    },
    now: () => observedAt,
    fetchData: async () => ({
      body: "{}",
      sourceUrl: "https://example.invalid/crw.json",
      fetchedAt: observedAt,
      statusCode: 200,
      contentType: "application/json",
    }),
    parseData: () => ({
      availableFields: ["sst_anomaly", "hotspot", "dhw", "alert_level"],
      records: [baseRecord()],
    }),
    mapData: () => ({
      metrics: [
        {
          stationId: null,
          region: "Great Barrier Reef",
          observedAt,
          metricType: "sst_anomaly_c",
          metricValue: 1.8,
          metricUnit: "celsius",
          sourceTimestamp: new Date(observedAt).toISOString(),
        },
        {
          stationId: null,
          region: "Great Barrier Reef",
          observedAt,
          metricType: "hotspot_c",
          metricValue: 1.4,
          metricUnit: "celsius",
          sourceTimestamp: new Date(observedAt).toISOString(),
        },
        {
          stationId: null,
          region: "Great Barrier Reef",
          observedAt,
          metricType: "dhw",
          metricValue: 6.2,
          metricUnit: "week",
          sourceTimestamp: new Date(observedAt).toISOString(),
        },
      ],
      signals: [
        {
          stationId: null,
          region: "Great Barrier Reef",
          observedAt,
          signalType: "reef_bleaching_alert_level",
          signalValue: 6.2,
          signalLabel: "alert_level_1",
          severity: "high",
          sourceTimestamp: new Date(observedAt).toISOString(),
        },
      ],
    }),
    targets: [{ region: "Great Barrier Reef" }],
  });

  assert.equal(result.status, "completed");
  assert.equal(result.insertedRows, 4);

  const ingestionRun = captured.find((entry) => entry.sql.includes("INSERT INTO ingestion_runs"));
  assert.equal(ingestionRun?.params[1], CRW_SOURCE);

  const stationMetrics = captured.filter((entry) => entry.sql.includes("INSERT INTO station_metrics"));
  assert.equal(stationMetrics.length, 3);
  assert.ok(stationMetrics.every((entry) => entry.params[6] === CRW_SOURCE));

  const derivedSignals = captured.filter((entry) => entry.sql.includes("INSERT INTO derived_signals"));
  assert.equal(derivedSignals.length, 1);
  assert.equal(derivedSignals[0]?.params[7], CRW_SOURCE);

  const provenanceRecords = captured.filter((entry) => entry.sql.includes("INSERT INTO provenance_records"));
  assert.equal(provenanceRecords.length, 4);
  assert.ok(provenanceRecords.every((entry) => entry.params[2] === CRW_SOURCE));
});

test("runCrwIngestion fails loudly when no targets are configured", async () => {
  const db = createDb(false);

  const result = await runCrwIngestion({
    resolvePath: () => "marine.sqlite",
    openWritable: () => db,
    getAdapter: () => {
      return {
        async execute() { return []; },
        async close() {},
      } as any;
    },
    targets: [],
  });

  assert.equal(result.status, "failed");
  assert.equal(result.insertedRows, 0);
  assert.equal(result.error, "CRW ingestion misconfigured: CRW_TARGET_REGIONS resolved to zero enabled targets.");
});

test("runCrwIngestion fails loudly when the feed yields no usable records", async () => {
  const db = createDb(false);
  const logs: string[] = [];

  const result = await runCrwIngestion({
    resolvePath: () => "marine.sqlite",
    openWritable: () => db,
    getAdapter: () => {
      return {
        async execute() { return []; },
        async close() {},
      } as any;
    },
    fetchData: async () => ({
      body: "{}",
      sourceUrl: "https://example.invalid/crw.json",
      fetchedAt: Date.parse("2026-03-18T10:00:00.000Z"),
      statusCode: 200,
      contentType: "application/json",
    }),
    parseData: () => ({
      availableFields: ["sst_anomaly", "hotspot", "dhw", "alert_level"],
      records: [],
    }),
    targets: [{ region: "Great Barrier Reef" }],
    logLine: (line) => {
      logs.push(line);
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error, "CRW fetch returned no usable records from https://example.invalid/crw.json");
  assert.ok(logs.some((line) => line.includes("resolved DB path: marine.sqlite")));
  assert.ok(logs.some((line) => line.includes("configured target count: 1")));
  assert.ok(logs.some((line) => line.includes("fetched source https://example.invalid/crw.json")));
  assert.ok(logs.some((line) => line.includes("fetched record count before validation: 0")));
});
