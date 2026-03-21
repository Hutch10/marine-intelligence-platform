import test from "node:test";
import assert from "node:assert/strict";
import { listLatestReefStress, readLatestReefStressFromDb } from "./reef-stress";
import type { SqliteDatabaseLike } from "../db/client";

function createDatabase(): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (sql.includes("FROM derived_signals")) {
            return [
              {
                station_id: null,
                region_key: "Great Barrier Reef",
                signal_label: "alert_level_1",
                observed_at: Date.parse("2026-03-18T10:00:00.000Z"),
              },
            ];
          }

          if (sql.includes("FROM station_metrics")) {
            const observedAt = Number(params[1]);

            if (!Number.isFinite(observedAt)) {
              return [];
            }

            return [
              { metric_type: "sst_anomaly_c", metric_value: 1.8 },
              { metric_type: "hotspot_c", metric_value: 1.4 },
              { metric_type: "dhw", metric_value: 6.2 },
            ];
          }

          return [];
        },
      };
    },
    close() {},
  };
}

test("readLatestReefStressFromDb builds reef stress snapshots from metrics and signals", () => {
  const rows = readLatestReefStressFromDb(createDatabase(), 20);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.region, "Great Barrier Reef");
  assert.equal(rows[0]?.hotSpotC, 1.4);
  assert.equal(rows[0]?.dhw, 6.2);
  assert.equal(rows[0]?.outputClass, "derived");
});

test("listLatestReefStress falls back when database path is missing", () => {
  const result = listLatestReefStress({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_path_missing" });
});

test("listLatestReefStress returns db source when query succeeds", () => {
  const result = listLatestReefStress({
    resolvePath: () => "reef.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.alerts.length, 1);
  }
});
