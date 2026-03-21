import test from "node:test";
import assert from "node:assert/strict";
import {
  loadConfiguredNdbcStations,
  validateMappedObservation,
} from "./run-ndbc";
import type { SqliteDatabaseLike } from "../../db/client";
import type { NdbcMappedObservation } from "../../connectors/ndbc/map";

function createDb(hasDuplicate = false): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (sql.includes("FROM observations") && hasDuplicate) {
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

test("validateMappedObservation rejects stale timestamps", () => {
  const now = Date.parse("2026-03-18T20:00:00.000Z");
  const observation = baseObservation({ observedAt: Date.parse("2026-03-18T10:50:00.000Z") });

  const reason = validateMappedObservation(observation, now, 2 * 60 * 60 * 1000, createDb(false));

  assert.equal(reason, "timestamp_stale");
});

test("validateMappedObservation rejects impossible values", () => {
  const now = Date.parse("2026-03-18T11:00:00.000Z");
  const observation = baseObservation({ seaSurfaceTempC: 65 });

  const reason = validateMappedObservation(observation, now, 6 * 60 * 60 * 1000, createDb(false));

  assert.equal(reason, "impossible_values");
});

test("validateMappedObservation rejects duplicate station timestamp rows", () => {
  const now = Date.parse("2026-03-18T11:00:00.000Z");
  const observation = baseObservation();

  const reason = validateMappedObservation(observation, now, 6 * 60 * 60 * 1000, createDb(true));

  assert.equal(reason, "duplicate_row");
});
