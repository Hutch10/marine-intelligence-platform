import test from "node:test";
import assert from "node:assert/strict";
import { mapIoosRecords } from "./map";
import type { IoosParsedRecord } from "./parse";

const RECORDS: IoosParsedRecord[] = [
  {
    stationId: "urn:ioos:station:test:alpha",
    region: "Pacific Northwest",
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
    latitude: 47.62,
    longitude: -122.33,
    seaSurfaceTempC: 14.2,
    waveHeightM: 1.8,
    windSpeedMps: 6.4,
    pressureHpa: 1012.3,
    salinityPsu: 32.8,
    dissolvedOxygenMgL: 7.1,
    chlorophyllMgM3: 1.2,
    raw: { station_id: "urn:ioos:station:test:alpha" },
  },
];

test("mapIoosRecords maps observations and metrics", () => {
  const mapped = mapIoosRecords(RECORDS, "https://example.test/ioos.json", "Pacific Northwest");

  assert.equal(mapped.observations.length, 1);
  assert.equal(mapped.metrics.length, 3);
  assert.equal(mapped.observations[0]?.source, "ioos_regional");
  assert.equal(mapped.observations[0]?.seaSurfaceTempC, 14.2);
  assert.equal(mapped.metrics.find((entry) => entry.metricType === "salinity_psu")?.metricValue, 32.8);
  assert.equal(mapped.metrics.find((entry) => entry.metricType === "dissolved_oxygen_mg_l")?.metricUnit, "mg_l");
});

test("mapIoosRecords skips rows missing required identity fields", () => {
  const mapped = mapIoosRecords(
    [
      {
        ...RECORDS[0]!,
        stationId: null,
      },
      {
        ...RECORDS[0]!,
        observedAt: null,
      },
    ],
    "https://example.test/ioos.json",
  );

  assert.equal(mapped.observations.length, 0);
  assert.equal(mapped.metrics.length, 0);
});
