import { test } from "node:test";
import assert from "node:assert/strict";
import { parseErddapCsv, splitCsvLine } from "./parse";

// ─── splitCsvLine ─────────────────────────────────────────────────────────────

test("splitCsvLine splits a simple comma-separated line", () => {
  assert.deepEqual(splitCsvLine("a,b,c"), ["a", "b", "c"]);
});

test("splitCsvLine handles quoted fields with commas inside", () => {
  assert.deepEqual(splitCsvLine('"hello, world",42'), ["hello, world", "42"]);
});

test("splitCsvLine handles empty fields", () => {
  assert.deepEqual(splitCsvLine("a,,c"), ["a", "", "c"]);
});

test("splitCsvLine handles a single field", () => {
  assert.deepEqual(splitCsvLine("only"), ["only"]);
});

// ─── parseErddapCsv — header/units row handling ───────────────────────────────

const MINIMAL_CSV = [
  "time,station_id,sea_water_temperature,sea_surface_wave_significant_height,wind_speed,air_pressure",
  "UTC,,,m,m/s,hPa",
  "2024-03-27T12:00:00Z,urn:ioos:station:wmo:41009,25.2,1.4,6.2,1014.5",
  "2024-03-27T12:00:00Z,urn:ioos:station:wmo:41010,26.1,0.9,4.1,1015.2",
].join("\n");

test("returns expected record count", () => {
  const result = parseErddapCsv(MINIMAL_CSV);
  assert.equal(result.records.length, 2);
});

test("exposes column names from header row", () => {
  const result = parseErddapCsv(MINIMAL_CSV);
  assert.ok(result.columns.includes("station_id"));
  assert.ok(result.columns.includes("time"));
  assert.ok(result.columns.includes("sea_water_temperature"));
});

// ─── Station ID normalisation ─────────────────────────────────────────────────

test("strips IOOS WMO URN prefix from station_id", () => {
  const result = parseErddapCsv(MINIMAL_CSV);
  assert.equal(result.records[0]?.stationId, "41009");
  assert.equal(result.records[1]?.stationId, "41010");
});

test("preserves bare station IDs that are not URNs", () => {
  const csv = [
    "time,station_id,sea_water_temperature",
    "UTC,,degree_C",
    "2024-03-27T00:00:00Z,41013,24.0",
  ].join("\n");

  const result = parseErddapCsv(csv);
  assert.equal(result.records[0]?.stationId, "41013");
});

test("returns null stationId for NaN or empty value", () => {
  const csv = [
    "time,station_id,sea_water_temperature",
    "UTC,,degree_C",
    "2024-03-27T00:00:00Z,NaN,24.0",
    "2024-03-27T00:00:00Z,,24.0",
  ].join("\n");

  const result = parseErddapCsv(csv);
  assert.equal(result.records[0]?.stationId, null);
  assert.equal(result.records[1]?.stationId, null);
});

// ─── Numeric field parsing ────────────────────────────────────────────────────

test("parses SST, wave height, wind speed, pressure correctly", () => {
  const result = parseErddapCsv(MINIMAL_CSV);
  const rec = result.records[0]!;

  assert.ok(Math.abs((rec.seaSurfaceTempC ?? 0) - 25.2) < 0.001);
  assert.ok(Math.abs((rec.waveHeightM ?? 0) - 1.4) < 0.001);
  assert.ok(Math.abs((rec.windSpeedMps ?? 0) - 6.2) < 0.001);
  assert.ok(Math.abs((rec.pressureHpa ?? 0) - 1014.5) < 0.001);
});

test("returns null for NaN numeric fields", () => {
  const csv = [
    "time,station_id,sea_water_temperature,wind_speed",
    "UTC,,,m/s",
    "2024-03-27T00:00:00Z,urn:ioos:station:wmo:41009,NaN,NaN",
  ].join("\n");

  const result = parseErddapCsv(csv);
  assert.equal(result.records[0]?.seaSurfaceTempC, null);
  assert.equal(result.records[0]?.windSpeedMps, null);
});

// ─── Timestamp parsing ────────────────────────────────────────────────────────

test("parses ISO-8601 time column to epoch milliseconds", () => {
  const result = parseErddapCsv(MINIMAL_CSV);
  const observedAt = result.records[0]?.observedAt;

  assert.equal(typeof observedAt, "number");
  assert.equal(observedAt, Date.parse("2024-03-27T12:00:00Z"));
});

test("returns null observedAt for invalid timestamp", () => {
  const csv = [
    "time,station_id,sea_water_temperature",
    "UTC,,degree_C",
    "not-a-time,41009,24.0",
  ].join("\n");

  const result = parseErddapCsv(csv);
  assert.equal(result.records[0]?.observedAt, null);
});

// ─── Extended variable coverage ───────────────────────────────────────────────

test("parses salinity when present", () => {
  const csv = [
    "time,station_id,sea_water_practical_salinity",
    "UTC,,PSU",
    "2024-03-27T00:00:00Z,41009,36.2",
  ].join("\n");

  const result = parseErddapCsv(csv);
  assert.ok(Math.abs((result.records[0]?.salinityPsu ?? 0) - 36.2) < 0.001);
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

test("returns empty results for body with fewer than 2 lines", () => {
  assert.equal(parseErddapCsv("").records.length, 0);
  assert.equal(parseErddapCsv("time,station_id").records.length, 0);
});

test("ignores blank trailing lines", () => {
  const csv = MINIMAL_CSV + "\n\n\n";
  assert.equal(parseErddapCsv(csv).records.length, 2);
});

test("handles CRLF line endings", () => {
  const csv = MINIMAL_CSV.replace(/\n/g, "\r\n");
  const result = parseErddapCsv(csv);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0]?.stationId, "41009");
});

test("preserves raw field map on each record", () => {
  const result = parseErddapCsv(MINIMAL_CSV);
  const raw = result.records[0]?.raw;

  assert.ok(raw !== undefined);
  assert.equal(raw!["station_id"], "urn:ioos:station:wmo:41009");
  assert.equal(raw!["time"], "2024-03-27T12:00:00Z");
});
