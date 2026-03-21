import test from "node:test";
import assert from "node:assert/strict";
import { mapCrwRecords } from "./map";
import type { CrwParsedRecord } from "./parse";

const RECORDS: CrwParsedRecord[] = [
  {
    region: "Great Barrier Reef",
    stationId: null,
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
    sstAnomalyC: 1.8,
    hotSpotC: 1.4,
    dhw: 6.2,
    stressLevel: "alert_level_1",
    latitude: -18.28,
    longitude: 147.69,
    raw: {},
  },
];

test("mapCrwRecords maps three metrics and one signal per CRW record", () => {
  const mapped = mapCrwRecords(RECORDS);

  assert.equal(mapped.metrics.length, 3);
  assert.equal(mapped.signals.length, 1);
  assert.equal(mapped.metrics.find((entry) => entry.metricType === "hotspot_c")?.metricValue, 1.4);
  assert.equal(mapped.signals[0]?.signalLabel, "alert_level_1");
  assert.equal(mapped.signals[0]?.severity, "high");
});

test("mapCrwRecords skips records with no timestamp", () => {
  const mapped = mapCrwRecords([{ ...RECORDS[0]!, observedAt: null }]);

  assert.equal(mapped.metrics.length, 0);
  assert.equal(mapped.signals.length, 0);
});
