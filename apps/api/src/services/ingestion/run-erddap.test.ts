import test from "node:test";
import assert from "node:assert/strict";
import {
  loadConfiguredErddapSources,
  runErddapIngestion,
  validateErddapRecord,
} from "./run-erddap";
import type { ErddapParsedRecord } from "../../connectors/erddap/parse";
import type { SqliteDatabaseLike } from "../../db/client";

// ─── DB stubs ─────────────────────────────────────────────────────────────────

function createDb(hasObservationDuplicate = false, hasMetricDuplicate = false): any {
  return {
    async execute(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM observations") && hasObservationDuplicate) {
        return [{ found: 1 }];
      }

      if (sql.includes("FROM station_metrics") && hasMetricDuplicate) {
        return [{ found: 1 }];
      }

      return [];
    },
    async close() {},
  };
}

function createCaptureDb(captured: Array<{ sql: string; params: unknown[] }>): any {
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

function baseRecord(overrides: Partial<ErddapParsedRecord> = {}): ErddapParsedRecord {
  return {
    stationId: "41009",
    observedAt: Date.parse("2026-03-28T10:00:00.000Z"),
    latitude: 28.5,
    longitude: -80.2,
    seaSurfaceTempC: 25.4,
    waveHeightM: 1.2,
    windSpeedMps: 5.1,
    pressureHpa: 1013.8,
    salinityPsu: null,
    dissolvedOxygenMgL: null,
    chlorophyllMgM3: null,
    raw: {},
    ...overrides,
  };
}

// ─── loadConfiguredErddapSources ──────────────────────────────────────────────

test("loadConfiguredErddapSources returns one source per station when ERDDAP_STATION_IDS is set", () => {
  const sources = loadConfiguredErddapSources({
    ERDDAP_STATION_IDS: "41009,41010",
    ERDDAP_BASE_URL: "https://erddap.example.test/erddap",
    ERDDAP_DATASET_ID: "gov_noaa_ndbc_sos",
    ERDDAP_REGION_KEY: "southeast-florida",
  } as NodeJS.ProcessEnv);

  assert.equal(sources.length, 2);
  assert.equal(sources[0]?.stationId, "41009");
  assert.equal(sources[1]?.stationId, "41010");
  assert.equal(sources[0]?.regionKey, "southeast-florida");
  assert.equal(sources[0]?.baseUrl, "https://erddap.example.test/erddap");
});

test("loadConfiguredErddapSources returns a single unfiltered source when no station IDs configured", () => {
  const sources = loadConfiguredErddapSources({} as NodeJS.ProcessEnv);

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.stationId, undefined);
});

// ─── validateErddapRecord ─────────────────────────────────────────────────────

const RECENT_NOW = Date.parse("2026-03-28T12:00:00Z");
const STALE_MS = 48 * 60 * 60 * 1000;

test("validateErddapRecord passes a valid record", async () => {
  const db = createDb(false, false);
  const result = await validateErddapRecord(baseRecord(), RECENT_NOW, STALE_MS, db, "southeast-florida");
  assert.equal(result, null);
});

test("validateErddapRecord returns schema_drift when no measurements present", async () => {
  const db = createDb(false, false);
  const record = baseRecord({
    seaSurfaceTempC: null,
    waveHeightM: null,
    windSpeedMps: null,
    pressureHpa: null,
    salinityPsu: null,
    dissolvedOxygenMgL: null,
    chlorophyllMgM3: null,
  });

  const result = await validateErddapRecord(record, RECENT_NOW, STALE_MS, db, "r");
  assert.equal(result, "schema_drift");
});

test("validateErddapRecord returns schema_drift when stationId is null", async () => {
  const db = createDb(false, false);
  const result = await validateErddapRecord(baseRecord({ stationId: null }), RECENT_NOW, STALE_MS, db, "r");
  assert.equal(result, "schema_drift");
});

test("validateErddapRecord returns schema_drift when observedAt is null", async () => {
  const db = createDb(false, false);
  const result = await validateErddapRecord(baseRecord({ observedAt: null }), RECENT_NOW, STALE_MS, db, "r");
  assert.equal(result, "schema_drift");
});

test("validateErddapRecord returns timestamp_stale for old observation", async () => {
  const db = createDb(false, false);
  const oldRecord = baseRecord({ observedAt: RECENT_NOW - STALE_MS - 1000 });
  const result = await validateErddapRecord(oldRecord, RECENT_NOW, STALE_MS, db, "r");
  assert.equal(result, "timestamp_stale");
});

test("validateErddapRecord returns impossible_values for out-of-range SST", async () => {
  const db = createDb(false, false);
  const result = await validateErddapRecord(baseRecord({ seaSurfaceTempC: 60 }), RECENT_NOW, STALE_MS, db, "r");
  assert.equal(result, "impossible_values");
});

test("validateErddapRecord returns duplicate_record when observation already exists", async () => {
  const db = createDb(true, false);
  const result = await validateErddapRecord(baseRecord(), RECENT_NOW, STALE_MS, db, "r");
  assert.equal(result, "duplicate_record");
});

// ─── runErddapIngestion — happy path ──────────────────────────────────────────

test("runErddapIngestion inserts one observation for a valid record", async () => {
  const captured: Array<{ sql: string; params: unknown[] }> = [];
  const db = createCaptureDb(captured);

  let tick = RECENT_NOW;
  const nowFn = () => tick++;

  const result = await runErddapIngestion({
    resolvePath: () => "/tmp/test.sqlite",
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
    now: nowFn,
    staleAfterMs: STALE_MS,
    sources: [{ baseUrl: "https://erddap.test/erddap", regionKey: "southeast-florida" }],
    fetchData: async () => ({
      sourceUrl: "https://erddap.test/erddap/tabledap/test.csv?time,station_id,sea_water_temperature",
      body: [
        "time,station_id,sea_water_temperature",
        "UTC,,degree_C",
        `${new Date(RECENT_NOW - 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z")},urn:ioos:station:wmo:41009,25.4`,
      ].join("\n"),
      fetchedAt: RECENT_NOW,
    }),
    parseData: (body) => {
      // Delegate to real parser.
      const { parseErddapCsv } = require("../../connectors/erddap/parse");
      return parseErddapCsv(body);
    },
    mapData: (records, ref, region) => {
      const { mapErddapRecords } = require("../../connectors/erddap/map");
      return mapErddapRecords(records, ref, region);
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.insertedRows, 1);
  assert.equal(result.rejectedRows, 0);

  const insertSql = captured.find((c) => c.sql.includes("INSERT INTO observations"));
  assert.ok(insertSql, "expected an INSERT INTO observations statement");
});

test("runErddapIngestion counts schema_drift when columns are missing", async () => {
  let tick = RECENT_NOW;
  const db = createCaptureDb([]);

  const result = await runErddapIngestion({
    resolvePath: () => "/tmp/test.sqlite",
    openWritable: () => db,
    getAdapter: () => {
      return {
        async execute() { return []; },
        async close() {},
      } as any;
    },
    now: () => tick++,
    staleAfterMs: STALE_MS,
    sources: [{ regionKey: "r" }],
    fetchData: async () => ({
      sourceUrl: "https://erddap.test/tabledap/test.csv?only_latitude",
      // Body has no station_id or time column — should fail schema check.
      body: ["latitude", "degree", "28.5"].join("\n"),
      fetchedAt: RECENT_NOW,
    }),
    parseData: (body) => {
      const { parseErddapCsv } = require("../../connectors/erddap/parse");
      return parseErddapCsv(body);
    },
    mapData: (_records, _ref, _region) => ({ observations: [], metrics: [] }),
  });

  assert.equal(result.rejectionReasons.schema_drift > 0, true);
});

test("runErddapIngestion returns failed status when fetch throws", async () => {
  const db = createCaptureDb([]);
  let tick = RECENT_NOW;

  const result = await runErddapIngestion({
    resolvePath: () => "/tmp/test.sqlite",
    openWritable: () => db,
    getAdapter: () => {
      return {
        async execute() { return []; },
        async close() {},
      } as any;
    },
    now: () => tick++,
    staleAfterMs: STALE_MS,
    sources: [{ regionKey: "r" }],
    fetchData: async () => {
      throw new Error("network unreachable");
    },
    parseData: () => ({ records: [], columns: [] }),
    mapData: () => ({ observations: [], metrics: [] }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error, "network unreachable");
});

test("runErddapIngestion skips disabled sources", async () => {
  const db = createCaptureDb([]);
  let tick = RECENT_NOW;
  let fetchCalled = false;

  await runErddapIngestion({
    resolvePath: () => "/tmp/test.sqlite",
    openWritable: () => db,
    getAdapter: () => {
      return {
        async execute() { return []; },
        async close() {},
      } as any;
    },
    now: () => tick++,
    staleAfterMs: STALE_MS,
    sources: [{ regionKey: "r", enabled: false }],
    fetchData: async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    },
    parseData: () => ({ records: [], columns: [] }),
    mapData: () => ({ observations: [], metrics: [] }),
  });

  assert.equal(fetchCalled, false);
});
