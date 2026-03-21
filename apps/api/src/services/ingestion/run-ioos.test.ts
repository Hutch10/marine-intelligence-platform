import test from "node:test";
import assert from "node:assert/strict";
import {
  loadConfiguredIoosSources,
  runIoosIngestion,
  validateIoosRecord,
} from "./run-ioos";
import type { IoosParsedRecord } from "../../connectors/ioos/parse";
import type { SqliteDatabaseLike } from "../../db/client";

function createDb(hasObservationDuplicate = false, hasMetricDuplicate = false): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (sql.includes("FROM observations") && hasObservationDuplicate) {
            return [{ found: 1 }];
          }

          if (sql.includes("FROM station_metrics") && hasMetricDuplicate) {
            return [{ found: 1 }];
          }

          return [];
        },
        run() {},
      };
    },
    close() {},
  };
}

function createCaptureDb(captured: Array<{ sql: string; params: unknown[] }>): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          captured.push({ sql, params });
          return [];
        },
        run(...params: unknown[]) {
          captured.push({ sql, params });
        },
      };
    },
    close() {},
  };
}

function baseRecord(overrides: Partial<IoosParsedRecord> = {}): IoosParsedRecord {
  return {
    stationId: "urn:ioos:station:test:alpha",
    region: "Pacific Northwest",
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
    latitude: 47.62,
    longitude: -122.33,
    seaSurfaceTempC: 14.2,
    waveHeightM: 1.8,
    windSpeedMps: 6.4,
    pressureHpa: 1012.3,
    salinityPsu: 32.8,
    dissolvedOxygenMgL: 7.1,
    chlorophyllMgM3: 1.2,
    raw: {},
    ...overrides,
  };
}

test("loadConfiguredIoosSources parses station configuration", () => {
  const sources = loadConfiguredIoosSources({
    IOOS_STATION_IDS: "urn:ioos:station:a,urn:ioos:station:b",
    IOOS_SOURCE_URL: "https://example.test/ioos",
    IOOS_REGION_KEY: "Pacific Northwest",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(sources, [
    {
      stationId: "urn:ioos:station:a",
      sourceUrl: "https://example.test/ioos",
      regionKey: "Pacific Northwest",
    },
    {
      stationId: "urn:ioos:station:b",
      sourceUrl: "https://example.test/ioos",
      regionKey: "Pacific Northwest",
    },
  ]);
});

test("validateIoosRecord rejects schema drift", () => {
  const reason = validateIoosRecord(
    baseRecord({ observedAt: null }),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false, false),
    "Pacific Northwest",
  );

  assert.equal(reason, "schema_drift");
});

test("validateIoosRecord rejects stale timestamps", () => {
  const reason = validateIoosRecord(
    baseRecord(),
    Date.parse("2026-03-20T12:00:00.000Z"),
    6 * 60 * 60 * 1000,
    createDb(false, false),
    "Pacific Northwest",
  );

  assert.equal(reason, "timestamp_stale");
});

test("validateIoosRecord rejects impossible values", () => {
  const reason = validateIoosRecord(
    baseRecord({ salinityPsu: 92 }),
    Date.parse("2026-03-18T12:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false, false),
    "Pacific Northwest",
  );

  assert.equal(reason, "impossible_values");
});

test("validateIoosRecord rejects duplicate records", () => {
  const reason = validateIoosRecord(
    baseRecord(),
    Date.parse("2026-03-18T12:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(true, false),
    "Pacific Northwest",
  );

  assert.equal(reason, "duplicate_record");
});

test("runIoosIngestion persists observations, station_metrics, and provenance", async () => {
  const captured: Array<{ sql: string; params: unknown[] }> = [];

  const result = await runIoosIngestion({
    resolvePath: () => "marine.sqlite",
    openWritable: () => createCaptureDb(captured),
    now: (() => {
      const values = [
        Date.parse("2026-03-18T10:00:00.000Z"),
        Date.parse("2026-03-18T10:00:01.000Z"),
        Date.parse("2026-03-18T10:00:02.000Z"),
        Date.parse("2026-03-18T10:00:03.000Z"),
      ];
      let index = 0;
      return () => {
        const value = values[index] ?? values[values.length - 1] ?? Date.now();
        index += 1;
        return value;
      };
    })(),
    sources: [
      {
        sourceUrl: "https://example.test/ioos.json",
        regionKey: "Pacific Northwest",
      },
    ],
    fetchData: async () => ({
      sourceUrl: "https://example.test/ioos.json",
      body: "{}",
      fetchedAt: Date.parse("2026-03-18T10:00:00.500Z"),
    }),
    parseData: () => ({
      availableFields: ["station_id", "time", "sea_surface_temperature", "salinity"],
      records: [baseRecord()],
    }),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.polledSources, 1);
  assert.equal(result.insertedRows, 4);
  assert.equal(result.rejectedRows, 0);

  assert.ok(captured.some((entry) => entry.sql.includes("INSERT INTO observations")));
  assert.ok(captured.some((entry) => entry.sql.includes("INSERT INTO station_metrics")));
  assert.ok(captured.some((entry) => entry.sql.includes("INSERT INTO provenance_records")));
});
