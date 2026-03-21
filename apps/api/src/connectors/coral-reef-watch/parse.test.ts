import test from "node:test";
import assert from "node:assert/strict";
import { parseCoralReefWatchData } from "./parse";

const SAMPLE = JSON.stringify({
  records: [
    {
      region: "Great Barrier Reef",
      timestamp: "2026-03-18T10:00:00.000Z",
      sst_anomaly: 1.8,
      hotspot: 1.4,
      dhw: 6.2,
      alert_level: "alert_level_1",
      latitude: -18.2871,
      longitude: 147.6992,
    },
  ],
});

test("parseCoralReefWatchData parses CRW records and fields", () => {
  const result = parseCoralReefWatchData(SAMPLE);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.region, "Great Barrier Reef");
  assert.equal(result.records[0]?.sstAnomalyC, 1.8);
  assert.equal(result.records[0]?.hotSpotC, 1.4);
  assert.equal(result.records[0]?.dhw, 6.2);
  assert.equal(result.records[0]?.stressLevel, "alert_level_1");
  assert.ok(result.availableFields.includes("sst_anomaly"));
});

test("parseCoralReefWatchData handles geojson feature format", () => {
  const geoJson = JSON.stringify({
    features: [
      {
        properties: {
          reef_name: "Caribbean",
          analysis_time: "2026-03-18T10:00:00.000Z",
          ssta: "0.9",
          hotSpot: "0.6",
          degreeHeatingWeeks: "3.1",
          bleaching_alert_level: "watch",
        },
        geometry: {
          type: "Point",
          coordinates: [-75.1, 18.2],
        },
      },
    ],
  });

  const result = parseCoralReefWatchData(geoJson);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.region, "Caribbean");
  assert.equal(result.records[0]?.latitude, 18.2);
  assert.equal(result.records[0]?.longitude, -75.1);
  assert.equal(result.records[0]?.hotSpotC, 0.6);
});
