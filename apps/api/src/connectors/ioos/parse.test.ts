import test from "node:test";
import assert from "node:assert/strict";
import { parseIoosData } from "./parse";

const SAMPLE = JSON.stringify({
  records: [
    {
      station_id: "urn:ioos:station:test:alpha",
      region: "Pacific Northwest",
      time: "2026-03-18T10:00:00.000Z",
      sea_surface_temperature: 14.2,
      wave_height_m: 1.8,
      wind_speed_mps: 6.4,
      pressure_hpa: 1012.3,
      salinity: 32.8,
      dissolved_oxygen: 7.1,
      chlorophyll_a: 1.2,
      latitude: 47.62,
      longitude: -122.33,
    },
  ],
});

test("parseIoosData parses canonical IOOS records", () => {
  const result = parseIoosData(SAMPLE);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.stationId, "urn:ioos:station:test:alpha");
  assert.equal(result.records[0]?.region, "Pacific Northwest");
  assert.equal(result.records[0]?.seaSurfaceTempC, 14.2);
  assert.equal(result.records[0]?.salinityPsu, 32.8);
  assert.ok(Number.isFinite(result.records[0]?.observedAt ?? NaN));
  assert.ok(result.availableFields.includes("sea_surface_temperature"));
});

test("parseIoosData parses GeoJSON-like features", () => {
  const geoJson = JSON.stringify({
    features: [
      {
        properties: {
          platform_code: "urn:ioos:station:test:beta",
          site_name: "North Atlantic",
          phenomenonTime: "2026-03-18T11:00:00.000Z",
          sst: "11.4",
          salinity_psu: "35.1",
          oxygen_mg_l: "6.2",
        },
        geometry: {
          type: "Point",
          coordinates: [-70.1, 41.5],
        },
      },
    ],
  });

  const result = parseIoosData(geoJson);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.stationId, "urn:ioos:station:test:beta");
  assert.equal(result.records[0]?.region, "North Atlantic");
  assert.equal(result.records[0]?.seaSurfaceTempC, 11.4);
  assert.equal(result.records[0]?.salinityPsu, 35.1);
  assert.equal(result.records[0]?.longitude, -70.1);
  assert.equal(result.records[0]?.latitude, 41.5);
});
