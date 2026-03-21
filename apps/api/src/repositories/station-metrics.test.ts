import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureStationMetricsTable,
  insertStationMetricRecord,
  stationMetricExists,
} from "./station-metrics";
import type { SqliteDatabaseLike } from "../db/client";

function createCaptureDb(rows: unknown[] = []): {
  db: SqliteDatabaseLike;
  captured: Array<{ sql: string; params: unknown[] }>;
} {
  const captured: Array<{ sql: string; params: unknown[] }> = [];

  const db: SqliteDatabaseLike = {
    prepare(sql: string) {
      return {
        run(...params: unknown[]) {
          captured.push({ sql, params });
        },
        all(...params: unknown[]) {
          captured.push({ sql, params });
          if (sql.includes("SELECT 1 AS found")) {
            return rows;
          }
          return [];
        },
      };
    },
    close() {},
  };

  return { db, captured };
}

test("ensureStationMetricsTable creates table and index", () => {
  const { db, captured } = createCaptureDb();

  ensureStationMetricsTable(db);

  assert.equal(captured.length, 2);
  assert.ok(captured[0]?.sql.includes("CREATE TABLE IF NOT EXISTS station_metrics"));
  assert.ok(captured[1]?.sql.includes("CREATE INDEX IF NOT EXISTS idx_station_metrics_source_identity"));
});

test("stationMetricExists returns true when duplicate exists", () => {
  const { db } = createCaptureDb([{ found: 1 }]);

  const exists = stationMetricExists(db, {
    source: "ioos_regional",
    stationId: "urn:ioos:station:test:alpha",
    regionKey: "Pacific Northwest",
    metricType: "salinity_psu",
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
  });

  assert.equal(exists, true);
});

test("insertStationMetricRecord inserts normalized metric row", () => {
  const { db, captured } = createCaptureDb();

  const id = insertStationMetricRecord(db, {
    stationId: "urn:ioos:station:test:alpha",
    regionKey: "Pacific Northwest",
    metricType: "salinity_psu",
    metricValue: 32.8,
    metricUnit: "psu",
    source: "ioos_regional",
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
    ingestionRunId: "ING-1",
    sourceTimestamp: "2026-03-18T10:00:00.000Z",
    sourceReference: "https://example.test/ioos.json",
    createdAt: Date.parse("2026-03-18T10:05:00.000Z"),
  });

  assert.ok(id.startsWith("STM-salinity_psu-"));
  assert.equal(captured.filter((entry) => entry.sql.includes("INSERT INTO station_metrics")).length, 1);
});
