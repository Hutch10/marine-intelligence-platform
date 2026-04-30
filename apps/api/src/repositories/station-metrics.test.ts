import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureStationMetricsTable,
  insertStationMetricRecord,
  stationMetricExists,
} from "./station-metrics";
import type { AsyncDbAdapter, AsyncDbRow } from "../db/async-client";

function createCaptureAdapter(rows: unknown[] = []): {
  adapter: AsyncDbAdapter;
  captured: Array<{ sql: string; params: unknown[] }>;
} {
  const captured: Array<{ sql: string; params: unknown[] }> = [];

  const adapter: AsyncDbAdapter = {
    async execute(sql: string, params: unknown[] = []): Promise<AsyncDbRow[]> {
      captured.push({ sql, params });
      if (sql.includes("SELECT 1 AS found")) {
        return rows as AsyncDbRow[];
      }
      return [];
    },
    close() {},
  };

  return { adapter, captured };
}

test("ensureStationMetricsTable creates table and index", async () => {
  const { adapter, captured } = createCaptureAdapter();

  await ensureStationMetricsTable(adapter);

  assert.equal(captured.length, 2);
  assert.ok(captured[0]?.sql.includes("CREATE TABLE IF NOT EXISTS station_metrics"));
  assert.ok(captured[1]?.sql.includes("CREATE INDEX IF NOT EXISTS idx_station_metrics_source_identity"));
});

test("stationMetricExists returns true when duplicate exists", async () => {
  const { adapter } = createCaptureAdapter([{ found: 1 }]);

  const exists = await stationMetricExists(adapter, {
    source: "ioos_regional",
    stationId: "urn:ioos:station:test:alpha",
    regionKey: "Pacific Northwest",
    metricType: "salinity_psu",
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
  });

  assert.equal(exists, true);
});

test("insertStationMetricRecord inserts normalized metric row", async () => {
  const { adapter, captured } = createCaptureAdapter();

  const id = await insertStationMetricRecord(adapter, {
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
