import test from "node:test";
import assert from "node:assert/strict";
import {
  listLatestLiveConditions,
  readLatestLiveConditionsFromDb,
} from "./observations";
import type { AsyncDbAdapter } from "../db/async-client";

function createDatabase(rows: unknown[]): AsyncDbAdapter {
  return {
    async execute() {
      return rows;
    },
    close() {},
  } as unknown as AsyncDbAdapter;
}

test("readLatestLiveConditionsFromDb maps latest observation rows", async () => {
  const db = createDatabase([
    {
      station_id: "46042",
      observed_at: Date.parse("2026-03-18T10:50:00.000Z"),
      sea_surface_temp_c: 17.1,
      wave_height_m: 1.24,
      wind_speed_mps: 7,
      pressure_hpa: 1015.6,
    },
  ]);

  const rows = await readLatestLiveConditionsFromDb(db);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.stationId, "46042");
  assert.equal(rows[0]?.sstC, 17.1);
});

test("listLatestLiveConditions returns db_path_missing when no db file exists", async () => {
  const result = await listLatestLiveConditions({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_path_missing" });
});

test("listLatestLiveConditions returns db source when read succeeds", async () => {
  const result = await listLatestLiveConditions({
    resolvePath: () => "ok.sqlite",
    hasPath: () => true,
    getAdapter: () =>
      createDatabase([
        {
          station_id: "41009",
          observed_at: Date.parse("2026-03-18T10:40:00.000Z"),
          sea_surface_temp_c: 23.3,
          wave_height_m: 1.7,
          wind_speed_mps: 5.2,
          pressure_hpa: 1013.2,
        },
      ]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.conditions.length, 1);
    assert.equal(result.conditions[0]?.stationId, "41009");
  }
});
