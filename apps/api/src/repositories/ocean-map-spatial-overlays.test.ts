import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOceanMapCorridorsFoundation,
  buildOceanMapHotspots,
  buildOceanMapSpatialOverlays,
} from "./ocean-map-spatial-overlays";

const SIGHTINGS = [
  {
    id: "SIGHT-001",
    speciesId: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    region: "North Pacific",
    stationId: "STA-NPC-01",
    latitude: 34.71,
    longitude: -143.11,
    count: 2,
    verificationStatus: "verified" as const,
    observedAt: "2026-03-13T11:04:00.000Z",
    detail: "Two tagged whales observed near the corridor edge.",
  },
  {
    id: "SIGHT-002",
    speciesId: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    region: "North Pacific",
    stationId: "STA-NPC-01",
    latitude: 34.69,
    longitude: -143.15,
    count: 1,
    verificationStatus: "verified" as const,
    observedAt: "2026-03-13T10:54:00.000Z",
    detail: "Single whale surfaced on the outer edge.",
  },
  {
    id: "SIGHT-003",
    speciesId: "SP-REEF-MANTA",
    commonName: "Reef Manta",
    region: "Eastern Shelf",
    stationId: null,
    latitude: -18.413,
    longitude: 147.709,
    count: 4,
    verificationStatus: "pending" as const,
    observedAt: "2026-03-13T09:20:00.000Z",
    detail: "Repeated feeding arcs observed along the front.",
  },
];

const MOVEMENT_SIGNALS = [
  {
    id: "MOV-001",
    speciesId: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    region: "North Pacific",
    stationId: "STA-NPC-01",
    latitude: 34.68,
    longitude: -143.14,
    locationSource: "station" as const,
    signalId: "SIG-001",
    investigationId: "TRK-201",
    movementType: "route_deviation" as const,
    confidence: 84,
    createdAt: "2026-03-13T11:10:00.000Z",
    detail: "Route deviation aligned with the anomaly corridor.",
  },
  {
    id: "MOV-002",
    speciesId: "SP-REEF-MANTA",
    commonName: "Reef Manta",
    region: "Eastern Shelf",
    stationId: null,
    latitude: null,
    longitude: null,
    locationSource: "unavailable" as const,
    signalId: "SIG-002",
    investigationId: "TRK-204",
    movementType: "aggregation_shift" as const,
    confidence: 77,
    createdAt: "2026-03-13T10:22:00.000Z",
    detail: "Aggregation shift detected with region-only anchor.",
  },
];

test("buildOceanMapHotspots groups mixed activity by station and region deterministically", () => {
  const hotspots = buildOceanMapHotspots({
    sightings: SIGHTINGS,
    movementSignals: MOVEMENT_SIGNALS,
  });

  assert.equal(hotspots.length, 2);
  assert.equal(hotspots[0]?.id, "HOTSPOT-STA-NPC-01");
  assert.equal(hotspots[0]?.hotspotType, "mixed_activity");
  assert.equal(hotspots[0]?.severity, "high");
  assert.deepEqual(hotspots[0]?.dominantMovementTypes, ["route_deviation"]);
  assert.deepEqual(hotspots[0]?.topSpecies, ["Blue Whale"]);

  assert.equal(hotspots[1]?.id, "HOTSPOT-EASTERN-SHELF");
  assert.equal(hotspots[1]?.severity, "medium");
  assert.deepEqual(hotspots[1]?.dominantMovementTypes, ["aggregation_shift"]);
});

test("buildOceanMapHotspots excludes areas below deterministic thresholds", () => {
  const hotspots = buildOceanMapHotspots({
    sightings: [SIGHTINGS[2]!],
    movementSignals: [],
  });

  assert.deepEqual(hotspots, []);
});

test("buildOceanMapCorridorsFoundation groups hotspots by region", () => {
  const hotspots = buildOceanMapHotspots({
    sightings: SIGHTINGS,
    movementSignals: MOVEMENT_SIGNALS,
  });

  const corridors = buildOceanMapCorridorsFoundation(hotspots);

  assert.equal(corridors.length, 2);
  assert.equal(corridors[0]?.id, "CORRIDOR-EASTERN-SHELF");
  assert.equal(corridors[1]?.id, "CORRIDOR-NORTH-PACIFIC");
  assert.equal(corridors[1]?.priority, "high");
  assert.deepEqual(corridors[1]?.stationIds, ["STA-NPC-01"]);
  assert.deepEqual(corridors[1]?.movementTypes, ["route_deviation"]);
});

test("buildOceanMapSpatialOverlays preserves raw overlays and appends grouped structures", () => {
  const overlays = buildOceanMapSpatialOverlays({
    sightings: SIGHTINGS,
    movementSignals: MOVEMENT_SIGNALS,
    windowDays: 14,
    generatedAt: "2026-03-13T12:00:00.000Z",
  });

  assert.deepEqual(overlays.categories, [
    "sightings",
    "movement_signals",
    "hotspots",
    "corridors_foundation",
  ]);
  assert.equal(overlays.sightings.length, 3);
  assert.equal(overlays.movementSignals.length, 2);
  assert.equal(overlays.hotspots.length, 2);
  assert.equal(overlays.corridorsFoundation.length, 2);
  assert.equal(overlays.generatedAt, "2026-03-13T12:00:00.000Z");
  assert.equal(overlays.windowDays, 14);
});

test("buildOceanMapSpatialOverlays returns empty grouped structures safely", () => {
  const overlays = buildOceanMapSpatialOverlays({
    sightings: [],
    movementSignals: [],
    windowDays: 14,
    generatedAt: "2026-03-13T12:00:00.000Z",
  });

  assert.deepEqual(overlays.hotspots, []);
  assert.deepEqual(overlays.corridorsFoundation, []);
});
