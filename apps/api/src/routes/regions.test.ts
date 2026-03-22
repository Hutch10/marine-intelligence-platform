import test from "node:test";
import assert from "node:assert/strict";
import { buildRegionsRouteResponse } from "./regions";
import type { OceanMapSpatialOverlays } from "@marine/shared";

const DB_REGIONS = [
  {
    id: "REG-NP",
    name: "North Pacific",
    status: "Elevated reef stress window",
    summary: "Thermal anomaly corridor under active monitoring.",
  },
  {
    id: "REG-ES",
    name: "Eastern Shelf",
    status: "Monitoring active",
    summary: "Shelf-edge sensor cluster with moderate nutrient drift.",
  },
];

const SPATIAL_OVERLAYS: OceanMapSpatialOverlays = {
  categories: ["sightings", "movement_signals", "hotspots", "corridors_foundation"],
  sightings: [
    {
      id: "SIGHT-001",
      speciesId: "SP-BLUE-WHALE",
      commonName: "Blue Whale",
      region: "North Pacific",
      stationId: "STA-NPC-01",
      latitude: 34.71,
      longitude: -143.11,
      count: 2,
      verificationStatus: "verified",
      observedAt: "2026-03-13T11:04:00.000Z",
      detail: "Two tagged whales observed near the corridor edge.",
    },
  ],
  movementSignals: [
    {
      id: "MOV-001",
      speciesId: "SP-BLUE-WHALE",
      commonName: "Blue Whale",
      region: "North Pacific",
      stationId: "STA-NPC-01",
      latitude: 34.68,
      longitude: -143.14,
      locationSource: "station",
      signalId: "SIG-001",
      investigationId: "TRK-201",
      movementType: "route_deviation",
      confidence: 84,
      createdAt: "2026-03-13T11:10:00.000Z",
      detail: "Route deviation aligned with the anomaly corridor.",
    },
  ],
  hotspots: [
    {
      id: "HOTSPOT-STA-NPC-01",
      label: "STA-NPC-01 species activity hotspot",
      region: "North Pacific",
      stationId: "STA-NPC-01",
      latitude: 34.697,
      longitude: -143.13,
      hotspotType: "mixed_activity",
      severity: "high",
      recentSightingCount: 2,
      recentMovementSignalCount: 1,
      observedIndividualCount: 2,
      dominantMovementTypes: ["route_deviation"],
      topSpecies: ["Blue Whale"],
      activityScore: 3,
      detail: "2 recent sightings and 1 movement signal concentrated near the station anchor.",
    },
  ],
  corridorsFoundation: [
    {
      id: "CORRIDOR-NORTH-PACIFIC",
      label: "North Pacific corridor foundation",
      region: "North Pacific",
      priority: "high",
      hotspotIds: ["HOTSPOT-STA-NPC-01"],
      stationIds: ["STA-NPC-01"],
      movementTypes: ["route_deviation"],
      speciesNames: ["Blue Whale"],
      anchorPoints: [
        {
          label: "STA-NPC-01 species activity hotspot",
          latitude: 34.697,
          longitude: -143.13,
        },
      ],
      geometryStatus: "grouped_without_geometry",
      summary: "North Pacific corridor foundation links 1 hotspot across 1 anchor point; geometry pending.",
    },
  ],
  generatedAt: "2026-03-13T12:00:00.000Z",
  windowDays: 14,
};

test("regions route returns DB-backed region summaries", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: DB_REGIONS,
    mapStatCounts: {
      activeFronts: 5,
      driftRoutes: 11,
      trackedBuoys: 32,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.route, "GET /regions");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.regionCount, 2);
  assert.equal(response.telemetry.metricsSource, "mock");
  assert.equal(response.telemetry.mapStatsSource, "db_enriched_mock");
  assert.equal(response.telemetry.mapSource, "mock");
  assert.equal(response.telemetry.fallbackReason, undefined);

  assert.equal(response.json.regions.length, 2);
  assert.equal(response.json.regions[0]?.id, "REG-NP");
  assert.equal(response.json.regions[0]?.name, "North Pacific");
  assert.equal(response.json.regions[0]?.status, "Elevated reef stress window");
  assert.equal(
    response.json.regions[0]?.summary,
    "Thermal anomaly corridor under active monitoring.",
  );
});

test("regions route enriches metrics with DB-backed region and risk status values", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: {
      activeFronts: 5,
      driftRoutes: 11,
      trackedBuoys: 32,
    },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const regionMetric = metrics.find((metric) => metric.label === "Region");
  const riskStatusMetric = metrics.find((metric) => metric.label === "Risk status");

  assert.equal(regionMetric?.value, "North Pacific");
  assert.equal(riskStatusMetric?.value, "Elevated reef stress window");
  assert.ok(metrics.length > 0);
});

test("regions route keeps map workspace mock-derived even for DB region rows", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: {
      activeFronts: 5,
      driftRoutes: 11,
      trackedBuoys: 32,
    },
  });

  assert.ok(response.json.map.layers.length > 0);
  assert.ok(response.json.map.mapStats.length > 0);
  assert.ok(response.json.map.regionMetrics.length > 0);
  assert.ok(response.json.map.timelineSteps.length > 0);
  assert.equal(response.telemetry.mapSource, "mock");
});

test("regions route enriches mapStats Active fronts and Drift routes from DB counts", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: {
      activeFronts: 5,
      driftRoutes: 11,
      trackedBuoys: 32,
    },
  });

  const trackedBuoys = response.json.map.mapStats.find((stat) => stat.label === "Tracked buoys");
  const activeFronts = response.json.map.mapStats.find((stat) => stat.label === "Active fronts");
  const driftRoutes = response.json.map.mapStats.find((stat) => stat.label === "Drift routes");

  assert.equal(trackedBuoys?.value, "32");
  assert.equal(activeFronts?.value, "5");
  assert.equal(driftRoutes?.value, "11");
  assert.equal(response.telemetry.mapStatsSource, "db_enriched_mock");
});

test("regions route falls back per-field to mock mapStats when DB counts are unavailable", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: {
      activeFronts: null,
      driftRoutes: null,
      trackedBuoys: null,
    },
  });

  const trackedBuoys = response.json.map.mapStats.find((stat) => stat.label === "Tracked buoys");
  const activeFronts = response.json.map.mapStats.find((stat) => stat.label === "Active fronts");
  const driftRoutes = response.json.map.mapStats.find((stat) => stat.label === "Drift routes");

  assert.equal(trackedBuoys?.value, "32");
  assert.equal(activeFronts?.value, "5");
  assert.equal(driftRoutes?.value, "11");
  assert.equal(response.telemetry.mapStatsSource, "mock");
});

test("regions route keeps DB source when the DB region query returns no rows", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [],
    mapStatCounts: {
      activeFronts: 0,
      driftRoutes: 0,
      trackedBuoys: 0,
    },
  });

  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.regionCount, 0);
  assert.deepEqual(response.json.regions, []);
});

test("regions route falls back to mock regions when DB path is missing", () => {
  const response = buildRegionsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
  assert.equal(response.telemetry.metricsSource, "mock");
  assert.equal(response.telemetry.mapStatsSource, "mock");
  assert.ok(response.json.regions.length > 0);
});

test("regions route falls back to mock regions when DB open fails", () => {
  const response = buildRegionsRouteResponse({
    source: "mock",
    fallbackReason: "db_open_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
});

test("regions route falls back to mock regions when DB query fails", () => {
  const response = buildRegionsRouteResponse({
    source: "mock",
    fallbackReason: "db_query_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
});

test("regions route appends Open alerts metric when openAlertCount is DB-backed", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], openAlertCount: 3 }],
    mapStatCounts: { activeFronts: 5, driftRoutes: 11, trackedBuoys: 32 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const openAlertsMetric = metrics.find((m) => m.label === "Open alerts");
  assert.equal(openAlertsMetric?.value, "3");
  assert.equal(response.telemetry.metricsSource, "mock");
});

test("regions route builds region card metrics from repository summaryMetrics", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{
      ...DB_REGIONS[0],
      summaryMetrics: {
        region: "North Pacific",
        thermalAnomaly: "+2.4 °C above seasonal mean",
        currentDirection: "ENE at 1.9 kn",
        nearestBuoy: "ATLAS-19 · 18 km east",
        riskStatus: "Elevated reef stress window",
        openAlerts: 4,
      },
      openAlertCount: null,
      nearestBuoyLabel: null,
      thermalAnomalyLabel: null,
      currentDirectionLabel: null,
    }],
    mapStats: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  assert.equal(metrics.find((m) => m.label === "Region")?.value, "North Pacific");
  assert.equal(metrics.find((m) => m.label === "Thermal anomaly")?.value, "+2.4 °C above seasonal mean");
  assert.equal(metrics.find((m) => m.label === "Current direction")?.value, "ENE at 1.9 kn");
  assert.equal(metrics.find((m) => m.label === "Nearest buoy")?.value, "ATLAS-19 · 18 km east");
  assert.equal(metrics.find((m) => m.label === "Risk status")?.value, "Elevated reef stress window");
  assert.equal(metrics.find((m) => m.label === "Open alerts")?.value, "4");
  assert.equal(response.telemetry.metricsSource, "db");
});

test("regions route falls back per metric to mock values when repository summaryMetrics values are null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{
      ...DB_REGIONS[0],
      summaryMetrics: {
        region: "North Pacific",
        thermalAnomaly: null,
        currentDirection: null,
        nearestBuoy: null,
        riskStatus: "Elevated reef stress window",
        openAlerts: null,
      },
    }],
    mapStats: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const mockMetrics = require("../data").apiMockData.oceanMapWorkspaceData.regionMetrics;
  assert.equal(
    metrics.find((m) => m.label === "Thermal anomaly")?.value,
    mockMetrics.find((m: { label: string }) => m.label === "Thermal anomaly")?.value,
  );
  assert.equal(
    metrics.find((m) => m.label === "Current direction")?.value,
    mockMetrics.find((m: { label: string }) => m.label === "Current direction")?.value,
  );
  assert.equal(
    metrics.find((m) => m.label === "Nearest buoy")?.value,
    mockMetrics.find((m: { label: string }) => m.label === "Nearest buoy")?.value,
  );
  assert.equal(metrics.find((m) => m.label === "Open alerts"), undefined);
  assert.equal(response.telemetry.metricsSource, "mock");
});

test("regions route does not add Open alerts metric when openAlertCount is null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], openAlertCount: null }],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const openAlertsMetric = metrics.find((m) => m.label === "Open alerts");
  assert.equal(openAlertsMetric, undefined);
});

test("regions route renders 0 Open alerts metric correctly when region has no alerts", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], openAlertCount: 0 }],
    mapStatCounts: { activeFronts: 2, driftRoutes: 5, trackedBuoys: 10 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const openAlertsMetric = metrics.find((m) => m.label === "Open alerts");
  assert.equal(openAlertsMetric?.value, "0");
});

test("regions route enriches Nearest buoy metric when nearestBuoyLabel is DB-backed", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], nearestBuoyLabel: "ATLAS-19 · 18 km east" }],
    mapStatCounts: { activeFronts: 5, driftRoutes: 11, trackedBuoys: 32 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const nearestBuoyMetric = metrics.find((m) => m.label === "Nearest buoy");
  assert.equal(nearestBuoyMetric?.value, "ATLAS-19 · 18 km east");
  assert.equal(response.telemetry.metricsSource, "mock");
});

test("regions route keeps mock Nearest buoy value when nearestBuoyLabel is null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], nearestBuoyLabel: null }],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const nearestBuoyMetric = metrics.find((m) => m.label === "Nearest buoy");
  // Nearest buoy falls back to the mock value when the DB column is null
  const mockNearestBuoy = require("../data").apiMockData.oceanMapWorkspaceData.regionMetrics.find(
    (m: { label: string }) => m.label === "Nearest buoy",
  );
  assert.equal(nearestBuoyMetric?.value, mockNearestBuoy?.value);
});

test("regions route keeps mock Nearest buoy value when nearestBuoyLabel is omitted", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const nearestBuoyMetric = metrics.find((m) => m.label === "Nearest buoy");
  assert.ok(nearestBuoyMetric !== undefined, "Nearest buoy metric should be present");
});

test("regions route enriches Thermal anomaly metric when thermalAnomalyLabel is DB-backed", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], thermalAnomalyLabel: "+2.4 °C above seasonal mean" }],
    mapStatCounts: { activeFronts: 5, driftRoutes: 11, trackedBuoys: 32 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const thermalMetric = metrics.find((m) => m.label === "Thermal anomaly");
  assert.equal(thermalMetric?.value, "+2.4 °C above seasonal mean");
  assert.equal(response.telemetry.metricsSource, "mock");
});

test("regions route keeps mock Thermal anomaly value when thermalAnomalyLabel is null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], thermalAnomalyLabel: null }],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const thermalMetric = metrics.find((m) => m.label === "Thermal anomaly");
  const mockThermal = require("../data").apiMockData.oceanMapWorkspaceData.regionMetrics.find(
    (m: { label: string }) => m.label === "Thermal anomaly",
  );
  assert.equal(thermalMetric?.value, mockThermal?.value);
});

test("regions route keeps mock Thermal anomaly value when thermalAnomalyLabel is omitted", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const thermalMetric = metrics.find((m) => m.label === "Thermal anomaly");
  assert.ok(thermalMetric !== undefined, "Thermal anomaly metric should be present");
});

test("regions route enriches Current direction metric when currentDirectionLabel is DB-backed", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], currentDirectionLabel: "ENE at 1.9 kn" }],
    mapStatCounts: { activeFronts: 5, driftRoutes: 11, trackedBuoys: 32 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const directionMetric = metrics.find((m) => m.label === "Current direction");
  assert.equal(directionMetric?.value, "ENE at 1.9 kn");
  assert.equal(response.telemetry.metricsSource, "mock");
});

test("regions route keeps mock Current direction value when currentDirectionLabel is null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [{ ...DB_REGIONS[0], currentDirectionLabel: null }],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const directionMetric = metrics.find((m) => m.label === "Current direction");
  const mockDirection = require("../data").apiMockData.oceanMapWorkspaceData.regionMetrics.find(
    (m: { label: string }) => m.label === "Current direction",
  );
  assert.equal(directionMetric?.value, mockDirection?.value);
});

test("regions route keeps mock Current direction value when currentDirectionLabel is omitted", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const metrics = response.json.regions[0]?.metrics ?? [];
  const directionMetric = metrics.find((m) => m.label === "Current direction");
  assert.ok(directionMetric !== undefined, "Current direction metric should be present");
});

test("regions route enriches map layers active state from DB rows", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
    mapLayers: [
      { label: "Sea Surface Temperature", description: "Thermal overlay", active: 0, accent: "cyan" },
      { label: "Current Vectors", description: "Directional flow", active: 1, accent: "emerald" },
      { label: "Buoy Network", description: "Sensor positions", active: 0, accent: "amber" },
      { label: "Protected Zones", description: "Reef boundaries", active: 1, accent: "cyan" },
    ],
  });

  const sst = response.json.map.layers.find((l) => l.label === "Sea Surface Temperature");
  const cv = response.json.map.layers.find((l) => l.label === "Current Vectors");
  const pz = response.json.map.layers.find((l) => l.label === "Protected Zones");

  assert.equal(sst?.active, false);
  assert.equal(cv?.active, true);
  assert.equal(pz?.active, true);
  assert.equal(response.telemetry.layersSource, "db");
});

test("regions route falls back map layers to mock when mapLayers is null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
    mapLayers: null,
  });

  assert.ok(response.json.map.layers.length > 0, "layers should be present from mock");
  assert.equal(response.telemetry.layersSource, "mock");
});

test("regions route falls back map layers to mock when mapLayers is omitted", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStatCounts: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  assert.ok(response.json.map.layers.length > 0, "layers should be present from mock");
  assert.equal(response.telemetry.layersSource, "mock");
});

test("regions route renders DB-backed overlayEntities from alert rows", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    overlayEntities: [
      {
        id: "ALT-214",
        label: "Thermal spike detected in reef-edge grid",
        region: "North Pacific",
        severity: "high",
        status: "Open",
        detail: "Elevated surface temperature exceeded the seasonal envelope across two adjacent cells.",
        detectedAt: "2026-03-13T11:49:00.000Z",
      },
    ],
  });

  assert.equal(response.json.map.overlayEntities[0]?.label, "Thermal spike detected in reef-edge grid");
  assert.equal(response.json.map.overlayEntities[0]?.region, "North Pacific");
  assert.equal(response.json.map.overlayEntities[0]?.severity, "high");
  assert.equal(response.telemetry.overlayEntitiesSource, "db");
});

test("regions route falls back overlayEntities to mock when the overlay query returns null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    overlayEntities: null,
  });

  assert.ok(response.json.map.overlayEntities.length > 0);
  assert.equal(response.telemetry.overlayEntitiesSource, "mock");
});

test("regions route falls back overlayEntities to mock on mock fallback path", () => {
  const response = buildRegionsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.ok(response.json.map.overlayEntities.length > 0);
  assert.equal(response.telemetry.overlayEntitiesSource, "mock");
});

test("regions route renders DB-backed spatial overlays when provided", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    spatialOverlays: SPATIAL_OVERLAYS,
  });

  assert.deepEqual(response.json.map.spatialOverlays, SPATIAL_OVERLAYS);
  assert.equal(response.telemetry.spatialOverlaysSource, "db");
});

test("regions route falls back spatial overlays to mock when repository returns null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    spatialOverlays: null,
  });

  assert.ok((response.json.map.spatialOverlays?.sightings.length ?? 0) > 0);
  assert.equal(response.telemetry.spatialOverlaysSource, "mock");
});

test("regions route falls back spatial overlays to mock on mock fallback path", () => {
  const response = buildRegionsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.ok((response.json.map.spatialOverlays?.hotspots.length ?? 0) > 0);
  assert.equal(response.telemetry.spatialOverlaysSource, "mock");
});

test("regions route emits statsSource db when mapStats aggregate is provided", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStats: { activeFronts: 3, driftRoutes: 7, trackedBuoys: 14 },
  });

  const trackedBuoys = response.json.map.mapStats.find((s) => s.label === "Tracked buoys");
  const activeFronts = response.json.map.mapStats.find((s) => s.label === "Active fronts");
  const driftRoutes = response.json.map.mapStats.find((s) => s.label === "Drift routes");

  assert.equal(trackedBuoys?.value, "14");
  assert.equal(activeFronts?.value, "3");
  assert.equal(driftRoutes?.value, "7");
  assert.equal(response.telemetry.statsSource, "db");
});

test("regions route emits statsSource mock and uses mock values when mapStats is null", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
    mapStats: null,
  });

  assert.ok(response.json.map.mapStats.length > 0, "mapStats should be present from mock");
  assert.equal(response.telemetry.statsSource, "mock");
});

test("regions route emits statsSource mock and uses mock values when mapStats is omitted", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [DB_REGIONS[0]],
  });

  assert.ok(response.json.map.mapStats.length > 0, "mapStats should be present from mock");
  assert.equal(response.telemetry.statsSource, "mock");
});

test("regions route emits statsSource mock on mock fallback path", () => {
  const response = buildRegionsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.telemetry.statsSource, "mock");
});

test("regions route builds map.regionMetrics from first DB region", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [
      {
        ...DB_REGIONS[0],
        nearestBuoyLabel: "ATLAS-19 · 18 km east",
        thermalAnomalyLabel: "+2.4 °C above seasonal mean",
        currentDirectionLabel: "ENE at 1.9 kn",
      },
    ],
    mapStats: { activeFronts: 0, driftRoutes: 0, trackedBuoys: 0 },
  });

  const rm = response.json.map.regionMetrics;
  assert.equal(rm.find((m) => m.label === "Region")?.value, "North Pacific");
  assert.equal(rm.find((m) => m.label === "Thermal anomaly")?.value, "+2.4 °C above seasonal mean");
  assert.equal(rm.find((m) => m.label === "Current direction")?.value, "ENE at 1.9 kn");
  assert.equal(rm.find((m) => m.label === "Nearest buoy")?.value, "ATLAS-19 · 18 km east");
  assert.equal(rm.find((m) => m.label === "Risk status")?.value, "Elevated reef stress window");
  assert.equal(rm.find((m) => m.label === "Open alerts"), undefined);
  assert.equal(response.telemetry.regionMetricsSource, "db");
});

test("regions route falls back map.regionMetrics to mock when DB regions list is empty", () => {
  const response = buildRegionsRouteResponse({
    source: "db",
    regions: [],
    mapStats: null,
  });

  const mockRm = require("../data").apiMockData.oceanMapWorkspaceData.regionMetrics;
  assert.deepEqual(response.json.map.regionMetrics, mockRm);
  assert.equal(response.telemetry.regionMetricsSource, "mock");
});

test("regions route emits regionMetricsSource mock on mock fallback path", () => {
  const response = buildRegionsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.telemetry.regionMetricsSource, "mock");
});
