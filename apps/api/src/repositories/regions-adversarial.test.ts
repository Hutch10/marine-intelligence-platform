import test from "node:test";
import assert from "node:assert/strict";
import { listRegions } from "./regions";
import type { SqliteDatabaseLike } from "../db/client";

const REGION_ROWS = [
  {
    id: "REG-ADV",
    name: "Adversarial Region",
    status: "Active",
    summary: "Testing adversarial inputs.",
    nearest_buoy_label: null,
    thermal_anomaly_label: null,
    current_direction_label: null,
  },
];

function createAdversarialDatabase(
  regionRows: any[],
  stationRows: any[],
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (sql.includes("FROM stations")) {
            // Very simple grouping logic for the mock
            const groups: Record<string, { lats: number[], lngs: number[] }> = {};
            for (const s of stationRows) {
              if (s.region_id && s.latitude !== null && s.longitude !== null) {
                if (!groups[s.region_id]) groups[s.region_id] = { lats: [], lngs: [] };
                groups[s.region_id].lats.push(Number(s.latitude));
                groups[s.region_id].lngs.push(Number(s.longitude));
              }
            }
            return Object.entries(groups).map(([region_id, data]) => ({
              region_id,
              lat: data.lats.reduce((a, b) => a + b, 0) / data.lats.length,
              lng: data.lngs.reduce((a, b) => a + b, 0) / data.lngs.length,
            }));
          }
          if (sql.includes("FROM regions")) {
            return regionRows;
          }
          if (sql.includes("FROM alerts") || sql.includes("FROM investigations") || sql.includes("FROM map_layers") || sql.includes("FROM species_sightings")) {
            return [];
          }
          return [];
        },
      };
    },
    close() {},
  };
}

test("adversarial: handles missing centroid rows (null result)", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createAdversarialDatabase(REGION_ROWS, []),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0].centroid, null);
  }
});

test("adversarial: rejects NaN/Infinity centroids via Number.isFinite", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createAdversarialDatabase(REGION_ROWS, [
      { region_id: "REG-ADV", latitude: "NaN", longitude: 10 },
      { region_id: "REG-ADV", latitude: Infinity, longitude: 10 },
    ]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    // Both stations should be ignored or result in NaN which is filtered
    assert.equal(result.regions[0].centroid, null);
  }
});

test("adversarial: out-of-range coordinates are rejected (Fixed)", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createAdversarialDatabase(REGION_ROWS, [
      { region_id: "REG-ADV", latitude: 1000, longitude: -2000 },
    ]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    // FIXED: Out-of-range should be null
    assert.equal(result.regions[0].centroid, null);
  }
});

test("adversarial: partial data (one coordinate null) is ignored", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createAdversarialDatabase(REGION_ROWS, [
      { region_id: "REG-ADV", latitude: 10, longitude: null },
    ]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0].centroid, null);
  }
});
