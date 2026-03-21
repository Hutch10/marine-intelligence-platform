import test from "node:test";
import assert from "node:assert/strict";
import { mapNdbcRowsToObservations } from "./map";
import type { NdbcParsedRow } from "./parse";

const ROWS: NdbcParsedRow[] = [
  {
    timestamp: { year: 2026, month: 3, day: 18, hour: 9, minute: 50 },
    fields: { WTMP: "16.9", WVHT: "1.10", WSPD: "6.5", PRES: "1015.1" },
    rawLine: "26 03 18 09 50 ...",
  },
  {
    timestamp: { year: 2026, month: 3, day: 18, hour: 10, minute: 50 },
    fields: { WTMP: "17.1", WVHT: "1.24", WSPD: "7.0", PRES: "1015.6" },
    rawLine: "26 03 18 10 50 ...",
  },
];

test("mapNdbcRowsToObservations normalizes mapped observation values", () => {
  const mapped = mapNdbcRowsToObservations("46042", "https://example.test/46042.txt", ROWS);

  assert.equal(mapped.length, 2);
  assert.equal(mapped[0]?.stationId, "46042");
  assert.equal(mapped[0]?.seaSurfaceTempC, 17.1);
  assert.equal(mapped[0]?.waveHeightM, 1.24);
  assert.equal(mapped[0]?.windSpeedMps, 7);
  assert.equal(mapped[0]?.pressureHpa, 1015.6);
  assert.equal(mapped[0]?.source, "noaa_ndbc");
});

test("mapNdbcRowsToObservations handles MM values as null", () => {
  const mapped = mapNdbcRowsToObservations("46042", "https://example.test/46042.txt", [
    {
      timestamp: { year: 2026, month: 3, day: 18, hour: 11, minute: 50 },
      fields: { WTMP: "MM", WVHT: "MM", WSPD: "MM", PRES: "MM" },
      rawLine: "26 03 18 11 50 ...",
    },
  ]);

  assert.equal(mapped[0]?.seaSurfaceTempC, null);
  assert.equal(mapped[0]?.waveHeightM, null);
  assert.equal(mapped[0]?.windSpeedMps, null);
  assert.equal(mapped[0]?.pressureHpa, null);
});
