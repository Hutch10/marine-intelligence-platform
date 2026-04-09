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

test("mapNdbcRowsToObservations backfills recent SST and wave height gaps from older rows", () => {
  const mapped = mapNdbcRowsToObservations("41009", "https://example.test/41009.txt", [
    {
      timestamp: { year: 2026, month: 3, day: 25, hour: 18, minute: 30 },
      fields: { WTMP: "MM", WVHT: "MM", WSPD: "5.0", PRES: "1019.7" },
      rawLine: "2026 03 25 18 30 ...",
    },
    {
      timestamp: { year: 2026, month: 3, day: 25, hour: 18, minute: 20 },
      fields: { WTMP: "MM", WVHT: "2.1", WSPD: "5.0", PRES: "1019.8" },
      rawLine: "2026 03 25 18 20 ...",
    },
    {
      timestamp: { year: 2026, month: 3, day: 25, hour: 17, minute: 50 },
      fields: { WTMP: "24.6", WVHT: "2.2", WSPD: "5.0", PRES: "1020.3" },
      rawLine: "2026 03 25 17 50 ...",
    },
  ]);

  assert.equal(mapped[0]?.seaSurfaceTempC, 24.6);
  assert.equal(mapped[0]?.waveHeightM, 2.1);
});
