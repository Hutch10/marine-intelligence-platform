import test from "node:test";
import assert from "node:assert/strict";
import {
  loadConfiguredCrwTargets,
  validateCrwRecord,
} from "./run-crw";
import type { CrwParsedRecord } from "../../connectors/coral-reef-watch/parse";
import type { SqliteDatabaseLike } from "../../db/client";

function createDb(hasDuplicate = false): SqliteDatabaseLike {
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
    close() {},
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

test("validateCrwRecord rejects schema drift when required metrics are missing", () => {
  const reason = validateCrwRecord(
    baseRecord({ dhw: null }),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "schema_drift");
});

test("validateCrwRecord rejects stale timestamps", () => {
  const reason = validateCrwRecord(
    baseRecord(),
    Date.parse("2026-03-20T12:00:00.000Z"),
    6 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "timestamp_stale");
});

test("validateCrwRecord rejects impossible value ranges", () => {
  const reason = validateCrwRecord(
    baseRecord({ hotSpotC: 44 }),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "impossible_values");
});

test("validateCrwRecord rejects duplicate records", () => {
  const reason = validateCrwRecord(
    baseRecord(),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(true),
  );

  assert.equal(reason, "duplicate_record");
});
