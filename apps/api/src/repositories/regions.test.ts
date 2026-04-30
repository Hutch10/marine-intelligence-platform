import test from "node:test";
import assert from "node:assert/strict";
import { listRegions } from "./regions";
import type { MapLayerRow, MapOverlayEntityRow, MapStatAggregates } from "./regions";
import type { SqliteDatabaseLike } from "../db/client";

interface RegionRow {
  id: string;
  name: string;
  status: string;
  summary: string;
  nearest_buoy_label: string | null;
  thermal_anomaly_label: string | null;
  current_direction_label: string | null;
}

interface SpatialSightingRow {
  id: string;
  species_id: string;
  common_name: string;
  region: string;
  station_id: string | null;
  latitude: number;
  longitude: number;
  count: number;
  verification_status: string;
  observed_at: number;
  summary: string;
  created_at: number;
}

interface SpatialMovementSignalRow {
  id: string;
  species_id: string;
  common_name: string;
  region: string;
  station_id: string | null;
  latitude: string | null;
  longitude: string | null;
  signal_id: string | null;
  investigation_id: string | null;
  movement_type: string;
  confidence: number;
  summary: string;
  created_at: number;
}

const NOW = Date.parse("2026-03-17T12:00:00.000Z");

const REGION_ROWS: RegionRow[] = [
  {
    id: "REG-NP",
    name: "North Pacific",
    status: "Elevated reef stress window",
    summary: "Thermal anomaly corridor under active monitoring.",
    nearest_buoy_label: null,
    thermal_anomaly_label: null,
    current_direction_label: null,
  },
  {
    id: "REG-ES",
    name: "Eastern Shelf",
    status: "Monitoring active",
    summary: "Shelf-edge sensor cluster with moderate nutrient drift.",
    nearest_buoy_label: null,
    thermal_anomaly_label: null,
    current_direction_label: null,
  },
];

function createDatabase(
  regionRows: RegionRow[],
  options?: {
    throwOnQuery?: boolean;
    throwOnAlertsCount?: boolean;
    throwOnInvestigationsCount?: boolean;
    throwOnBuoysCount?: boolean;
    throwOnPerRegionAlerts?: boolean;
    throwOnMapLayers?: boolean;
    throwOnOverlayEntities?: boolean;
    throwOnSpatialOverlays?: boolean;
    openAlertCount?: number;
    driftRouteCount?: number;
    trackedBuoysCount?: number;
    perRegionAlertCounts?: { region_id: string; total: number }[];
    mapLayerRows?: MapLayerRow[];
    overlayRows?: MapOverlayEntityRow[];
    spatialSightingRows?: SpatialSightingRow[];
    spatialMovementRows?: SpatialMovementSignalRow[];
  },
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (options?.throwOnQuery) {
            throw new Error("query failed");
          }

          if (sql.includes("FROM species_sightings ss") || sql.includes("FROM species_movement_signals sms")) {
            if (options?.throwOnSpatialOverlays) {
              throw new Error("spatial overlays failed");
            }

            if (sql.includes("FROM species_sightings ss")) {
              return options?.spatialSightingRows ?? [];
            }

            if (sql.includes("FROM species_movement_signals sms")) {
              return options?.spatialMovementRows ?? [];
            }
          }

          if (sql.includes("SUM(COALESCE(buoy_count, 0))") && sql.includes("FROM regions")) {
            if (options?.throwOnBuoysCount) {
              throw new Error("buoys count failed");
            }

            return [{ total: options?.trackedBuoysCount ?? 0 }];
          }

          if (sql.includes("FROM regions")) {
            return regionRows;
          }

          if (sql.includes("FROM alerts")) {
            if (sql.includes("LEFT JOIN regions")) {
              if (options?.throwOnOverlayEntities) {
                throw new Error("overlay entities failed");
              }
              return options?.overlayRows ?? [];
            }

            if (sql.includes("GROUP BY region_id")) {
              if (options?.throwOnPerRegionAlerts) {
                throw new Error("per-region alerts count failed");
              }
              return options?.perRegionAlertCounts ?? [];
            }

            if (options?.throwOnAlertsCount) {
              throw new Error("alerts count failed");
            }

            return [{ total: options?.openAlertCount ?? 0 }];
          }

          if (sql.includes("FROM investigations")) {
            if (options?.throwOnInvestigationsCount) {
              throw new Error("investigations count failed");
            }

            return [{ total: options?.driftRouteCount ?? 0 }];
          }

          if (sql.includes("FROM map_layers")) {
            if (options?.throwOnMapLayers) {
              throw new Error("map layers failed");
            }
            return options?.mapLayerRows ?? [];
          }

          return [];
        },
      };
    },
    close() {},
  };
}

test("regions repository returns DB rows with core region fields", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions.length, 2);
    assert.deepEqual(result.regions[0], {
      id: "REG-NP",
      name: "North Pacific",
      status: "Elevated reef stress window",
      summary: "Thermal anomaly corridor under active monitoring.",
      summaryMetrics: {
        region: "North Pacific",
        thermalAnomaly: null,
        currentDirection: null,
        nearestBuoy: null,
        riskStatus: "Elevated reef stress window",
        openAlerts: 0,
      },
      openAlertCount: 0,
      nearestBuoyLabel: null,
      thermalAnomalyLabel: null,
      currentDirectionLabel: null,
      centroid: null,
    });
    assert.deepEqual(result.regions[1], {
      id: "REG-ES",
      name: "Eastern Shelf",
      status: "Monitoring active",
      summary: "Shelf-edge sensor cluster with moderate nutrient drift.",
      summaryMetrics: {
        region: "Eastern Shelf",
        thermalAnomaly: null,
        currentDirection: null,
        nearestBuoy: null,
        riskStatus: "Monitoring active",
        openAlerts: 0,
      },
      openAlertCount: 0,
      nearestBuoyLabel: null,
      thermalAnomalyLabel: null,
      currentDirectionLabel: null,
      centroid: null,
    });
    assert.deepEqual(result.mapStats, {
      trackedBuoys: 0,
      activeFronts: 0,
      driftRoutes: 0,
    });
  }
});

test("regions repository returns DB mapStat counts when related tables are available", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, {
        openAlertCount: 5,
        driftRouteCount: 11,
        trackedBuoysCount: 32,
      }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.mapStats, {
      trackedBuoys: 32,
      activeFronts: 5,
      driftRoutes: 11,
    });
  }
});

test("regions repository returns null mapStats when a stat query fails", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, {
        throwOnAlertsCount: true,
        driftRouteCount: 3,
      }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions.length, 2);
    assert.equal(result.mapStats, null);
  }
});

test("regions repository returns null mapStats when the buoys count query fails", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, {
        throwOnBuoysCount: true,
      }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.mapStats, null);
  }
});

test("regions repository returns DB success with empty region list", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase([]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.regions, []);
  }
});

test("regions repository falls back with db_path_missing when the DB file does not exist", () => {
  const result = listRegions({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_path_missing" });
});

test("regions repository falls back with db_open_failed when opening the DB throws", () => {
  const result = listRegions({
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    openDatabase: () => {
      throw new Error("open failed");
    },
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_open_failed" });
});

test("regions repository falls back with db_query_failed when querying throws", () => {
  const result = listRegions({
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { throwOnQuery: true }),
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_query_failed" });
});

test("regions repository returns per-region open alert counts from the alerts table", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, {
        perRegionAlertCounts: [
          { region_id: "REG-NP", total: 2 },
          { region_id: "REG-ES", total: 1 },
        ],
      }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    const np = result.regions.find((r) => r.id === "REG-NP");
    const es = result.regions.find((r) => r.id === "REG-ES");
    assert.equal(np?.openAlertCount, 2);
    assert.equal(es?.openAlertCount, 1);
  }
});

test("regions repository returns 0 open alert count for regions with no open alerts", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, {
        perRegionAlertCounts: [],
      }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.openAlertCount, 0);
    assert.equal(result.regions[1]?.openAlertCount, 0);
  }
});

test("regions repository sets openAlertCount to null when per-region alert query fails", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { throwOnPerRegionAlerts: true }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.openAlertCount, null);
    assert.equal(result.regions[1]?.openAlertCount, null);
  }
});

test("regions repository builds summaryMetrics from factual DB region values", () => {
  const rowsWithFacts: RegionRow[] = [
    {
      ...REGION_ROWS[0],
      nearest_buoy_label: "ATLAS-19 · 18 km east",
      thermal_anomaly_label: "+2.4 °C above seasonal mean",
      current_direction_label: "ENE at 1.9 kn",
    },
  ];

  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(rowsWithFacts, {
        perRegionAlertCounts: [{ region_id: "REG-NP", total: 3 }],
      }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.regions[0]?.summaryMetrics, {
      region: "North Pacific",
      thermalAnomaly: "+2.4 °C above seasonal mean",
      currentDirection: "ENE at 1.9 kn",
      nearestBuoy: "ATLAS-19 · 18 km east",
      riskStatus: "Elevated reef stress window",
      openAlerts: 3,
    });
  }
});

test("regions repository sets summaryMetrics.openAlerts to null when alert aggregation fails", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { throwOnPerRegionAlerts: true }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.summaryMetrics.openAlerts, null);
    assert.equal(result.regions[1]?.summaryMetrics.openAlerts, null);
  }
});

test("regions repository returns nearest_buoy_label from the regions row", () => {
  const rowsWithBuoy: RegionRow[] = [
    { ...REGION_ROWS[0], nearest_buoy_label: "ATLAS-19 · 18 km east" },
    { ...REGION_ROWS[1], nearest_buoy_label: "SHELF-04 · 7 km west" },
  ];

  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(rowsWithBuoy),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.nearestBuoyLabel, "ATLAS-19 · 18 km east");
    assert.equal(result.regions[1]?.nearestBuoyLabel, "SHELF-04 · 7 km west");
  }
});

test("regions repository returns null nearestBuoyLabel when the column is null", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.nearestBuoyLabel, null);
    assert.equal(result.regions[1]?.nearestBuoyLabel, null);
  }
});

test("regions repository returns thermal_anomaly_label from the regions row", () => {
  const rowsWithThermal: RegionRow[] = [
    { ...REGION_ROWS[0], thermal_anomaly_label: "+2.4 °C above seasonal mean" },
    { ...REGION_ROWS[1], thermal_anomaly_label: null },
  ];

  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(rowsWithThermal),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.thermalAnomalyLabel, "+2.4 °C above seasonal mean");
    assert.equal(result.regions[1]?.thermalAnomalyLabel, null);
  }
});

test("regions repository returns null thermalAnomalyLabel when the column is null", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.thermalAnomalyLabel, null);
    assert.equal(result.regions[1]?.thermalAnomalyLabel, null);
  }
});

test("regions repository returns current_direction_label from the regions row", () => {
  const rowsWithDirection: RegionRow[] = [
    { ...REGION_ROWS[0], current_direction_label: "ENE at 1.9 kn" },
    { ...REGION_ROWS[1], current_direction_label: null },
  ];

  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(rowsWithDirection),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.currentDirectionLabel, "ENE at 1.9 kn");
    assert.equal(result.regions[1]?.currentDirectionLabel, null);
  }
});

test("regions repository returns null currentDirectionLabel when the column is null", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.regions[0]?.currentDirectionLabel, null);
    assert.equal(result.regions[1]?.currentDirectionLabel, null);
  }
});

test("regions repository returns mapLayers from the map_layers table", () => {
  const layerRows: MapLayerRow[] = [
    { label: "Sea Surface Temperature", description: "Thermal overlay", active: 1, accent: "cyan" },
    { label: "Buoy Network", description: "Sensor positions", active: 0, accent: "amber" },
  ];

  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { mapLayerRows: layerRows }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.mapLayers !== null);
    assert.equal(result.mapLayers?.length, 2);
    assert.equal(result.mapLayers?.[0]?.label, "Sea Surface Temperature");
    assert.equal(result.mapLayers?.[0]?.active, 1);
    assert.equal(result.mapLayers?.[1]?.label, "Buoy Network");
    assert.equal(result.mapLayers?.[1]?.active, 0);
  }
});

test("regions repository returns null mapLayers when the map_layers query fails", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { throwOnMapLayers: true }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.mapLayers, null);
  }
});

test("regions repository returns overlayEntities from alerts joined to regions", () => {
  const overlayRows: MapOverlayEntityRow[] = [
    {
      id: "ALT-214",
      label: "Thermal spike detected in reef-edge grid",
      region: "North Pacific",
      severity: "high",
      status: "Open",
      detail: "Elevated surface temperature exceeded the seasonal envelope across two adjacent cells.",
      detectedAt: "2026-03-13T11:49:00.000Z",
    },
  ];

  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { overlayRows }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.overlayEntities, overlayRows);
  }
});

test("regions repository returns null overlayEntities when the alert overlay query fails", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { throwOnOverlayEntities: true }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.overlayEntities, null);
  }
});

test("regions repository returns non-null mapStats when all count queries succeed", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, {
        openAlertCount: 7,
        driftRouteCount: 4,
        trackedBuoysCount: 18,
      }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.mapStats !== null, "mapStats should be non-null");
    const stats = result.mapStats as MapStatAggregates;
    assert.equal(stats.activeFronts, 7);
    assert.equal(stats.driftRoutes, 4);
    assert.equal(stats.trackedBuoys, 18);
  }
});

test("regions repository returns null mapStats when any count query fails", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, { throwOnInvestigationsCount: true }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.mapStats, null);
  }
});

test("regions repository returns spatial overlays with sightings movement signals hotspots and corridor foundations", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(REGION_ROWS, {
        spatialSightingRows: [
          {
            id: "SIGHT-001",
            species_id: "SP-BLUE-WHALE",
            common_name: "Blue Whale",
            region: "North Pacific",
            station_id: "STA-NPC-01",
            latitude: 34.71,
            longitude: -143.11,
            count: 2,
            verification_status: "verified",
            observed_at: NOW - 10_000,
            summary: "Two tagged whales observed near the corridor edge.",
            created_at: NOW - 10_000,
          },
          {
            id: "SIGHT-002",
            species_id: "SP-BLUE-WHALE",
            common_name: "Blue Whale",
            region: "North Pacific",
            station_id: "STA-NPC-01",
            latitude: 34.69,
            longitude: -143.15,
            count: 1,
            verification_status: "verified",
            observed_at: NOW - 20_000,
            summary: "Single whale surfaced on the outer edge.",
            created_at: NOW - 20_000,
          },
        ],
        spatialMovementRows: [
          {
            id: "MOV-001",
            species_id: "SP-BLUE-WHALE",
            common_name: "Blue Whale",
            region: "North Pacific",
            station_id: "STA-NPC-01",
            latitude: "34.68",
            longitude: "-143.14",
            signal_id: "SIG-001",
            investigation_id: "TRK-201",
            movement_type: "route_deviation",
            confidence: 84,
            summary: "Route deviation aligned with the anomaly corridor.",
            created_at: NOW - 5_000,
          },
        ],
      }),
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.spatialOverlays !== null);
    assert.equal(result.spatialOverlays?.sightings.length, 2);
    assert.equal(result.spatialOverlays?.movementSignals.length, 1);
    assert.equal(result.spatialOverlays?.hotspots[0]?.id, "HOTSPOT-STA-NPC-01");
    assert.equal(result.spatialOverlays?.corridorsFoundation[0]?.id, "CORRIDOR-NORTH-PACIFIC");
    assert.equal(result.spatialOverlays?.windowDays, 14);
  }
});

test("regions repository returns empty spatial overlays safely when no recent species activity exists", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { spatialSightingRows: [], spatialMovementRows: [] }),
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.spatialOverlays !== null);
    assert.deepEqual(result.spatialOverlays?.sightings, []);
    assert.deepEqual(result.spatialOverlays?.movementSignals, []);
    assert.deepEqual(result.spatialOverlays?.hotspots, []);
    assert.deepEqual(result.spatialOverlays?.corridorsFoundation, []);
  }
});

test("regions repository returns null spatial overlays when overlay queries fail", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(REGION_ROWS, { throwOnSpatialOverlays: true }),
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.spatialOverlays, null);
  }
});
