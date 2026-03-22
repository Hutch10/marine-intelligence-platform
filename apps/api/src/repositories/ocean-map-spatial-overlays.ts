import type {
  OceanMapCorridorFoundation,
  OceanMapHotspotOverlay,
  OceanMapMovementSignalOverlay,
  OceanMapSpatialOverlays,
  OceanMapSightingOverlay,
  SpeciesMovementType,
} from "@marine/shared";

export interface SpatialOverlaySightingInput {
  id: string;
  speciesId: string;
  commonName: string;
  region: string;
  stationId: string | null;
  latitude: number;
  longitude: number;
  count: number;
  verificationStatus: OceanMapSightingOverlay["verificationStatus"];
  observedAt: string;
  detail: string;
}

export interface SpatialOverlayMovementSignalInput {
  id: string;
  speciesId: string;
  commonName: string;
  region: string;
  stationId: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: OceanMapMovementSignalOverlay["locationSource"];
  signalId: string | null;
  investigationId: string | null;
  movementType: SpeciesMovementType;
  confidence: number;
  createdAt: string;
  detail: string;
}

export interface BuildOceanMapSpatialOverlaysInput {
  sightings: SpatialOverlaySightingInput[];
  movementSignals: SpatialOverlayMovementSignalInput[];
  windowDays: number;
  generatedAt: string;
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface HotspotAccumulator {
  region: string;
  stationId: string | null;
  sightingCount: number;
  observedIndividualCount: number;
  movementSignalCount: number;
  coordinates: Coordinate[];
  movementTypeCounts: Map<SpeciesMovementType, number>;
  speciesCounts: Map<string, number>;
  speciesNames: Set<string>;
}

const HOTSPOT_MIN_SIGHTINGS = 2;
const HOTSPOT_MIN_MOVEMENT_SIGNALS = 2;

function groupKey(region: string, stationId: string | null): string {
  if (stationId) {
    return `station:${stationId}`;
  }

  return `region:${region.trim().toLowerCase()}`;
}

function getOrCreateAccumulator(
  groups: Map<string, HotspotAccumulator>,
  region: string,
  stationId: string | null,
): HotspotAccumulator {
  const key = groupKey(region, stationId);
  const existing = groups.get(key);

  if (existing) {
    return existing;
  }

  const created: HotspotAccumulator = {
    region,
    stationId,
    sightingCount: 0,
    observedIndividualCount: 0,
    movementSignalCount: 0,
    coordinates: [],
    movementTypeCounts: new Map<SpeciesMovementType, number>(),
    speciesCounts: new Map<string, number>(),
    speciesNames: new Set<string>(),
  };

  groups.set(key, created);
  return created;
}

function incrementSpeciesCount(accumulator: HotspotAccumulator, commonName: string, delta: number) {
  accumulator.speciesNames.add(commonName);
  accumulator.speciesCounts.set(commonName, (accumulator.speciesCounts.get(commonName) ?? 0) + delta);
}

function appendCoordinate(
  accumulator: HotspotAccumulator,
  latitude: number | null,
  longitude: number | null,
) {
  if (latitude === null || longitude === null) {
    return;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  accumulator.coordinates.push({ latitude, longitude });
}

function averageCoordinate(coordinates: Coordinate[]): Coordinate | null {
  if (coordinates.length === 0) {
    return null;
  }

  const total = coordinates.reduce(
    (accumulator, coordinate) => ({
      latitude: accumulator.latitude + coordinate.latitude,
      longitude: accumulator.longitude + coordinate.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: Number((total.latitude / coordinates.length).toFixed(6)),
    longitude: Number((total.longitude / coordinates.length).toFixed(6)),
  };
}

function sortMovementTypesByFrequency(
  movementTypeCounts: Map<SpeciesMovementType, number>,
): SpeciesMovementType[] {
  return [...movementTypeCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([movementType]) => movementType)
    .slice(0, 3);
}

function sortSpeciesByFrequency(speciesCounts: Map<string, number>): string[] {
  return [...speciesCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([speciesName]) => speciesName)
    .slice(0, 3);
}

function qualifiesAsHotspot(accumulator: HotspotAccumulator): boolean {
  if (accumulator.sightingCount >= HOTSPOT_MIN_SIGHTINGS) {
    return true;
  }

  if (accumulator.movementSignalCount >= HOTSPOT_MIN_MOVEMENT_SIGNALS) {
    return true;
  }

  return accumulator.sightingCount > 0 && accumulator.movementSignalCount > 0;
}

function getHotspotSeverity(accumulator: HotspotAccumulator): OceanMapHotspotOverlay["severity"] {
  if (
    accumulator.sightingCount >= 3
    || accumulator.movementSignalCount >= 3
    || (accumulator.sightingCount >= 2 && accumulator.movementSignalCount >= 2)
    || (accumulator.sightingCount > 0 && accumulator.movementSignalCount > 0 && accumulator.sightingCount + accumulator.movementSignalCount >= 3)
  ) {
    return "high";
  }

  if (qualifiesAsHotspot(accumulator)) {
    return "medium";
  }

  return "low";
}

function getHotspotType(accumulator: HotspotAccumulator): OceanMapHotspotOverlay["hotspotType"] {
  if (accumulator.sightingCount > 0 && accumulator.movementSignalCount > 0) {
    return "mixed_activity";
  }

  if (accumulator.movementSignalCount > 0) {
    return "movement_cluster";
  }

  return "sighting_cluster";
}

function hotspotId(region: string, stationId: string | null): string {
  if (stationId) {
    return `HOTSPOT-${stationId}`;
  }

  return `HOTSPOT-${region.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

export function buildOceanMapHotspots(
  input: Pick<BuildOceanMapSpatialOverlaysInput, "sightings" | "movementSignals">,
): OceanMapHotspotOverlay[] {
  const groups = new Map<string, HotspotAccumulator>();

  for (const sighting of input.sightings) {
    const accumulator = getOrCreateAccumulator(groups, sighting.region, sighting.stationId);
    accumulator.sightingCount += 1;
    accumulator.observedIndividualCount += Math.max(0, sighting.count);
    incrementSpeciesCount(accumulator, sighting.commonName, 1);
    appendCoordinate(accumulator, sighting.latitude, sighting.longitude);
  }

  for (const movementSignal of input.movementSignals) {
    const accumulator = getOrCreateAccumulator(groups, movementSignal.region, movementSignal.stationId);
    accumulator.movementSignalCount += 1;
    incrementSpeciesCount(accumulator, movementSignal.commonName, 1);
    accumulator.movementTypeCounts.set(
      movementSignal.movementType,
      (accumulator.movementTypeCounts.get(movementSignal.movementType) ?? 0) + 1,
    );
    appendCoordinate(accumulator, movementSignal.latitude, movementSignal.longitude);
  }

  return [...groups.values()]
    .filter(qualifiesAsHotspot)
    .map((accumulator) => {
      const coordinate = averageCoordinate(accumulator.coordinates);
      const dominantMovementTypes = sortMovementTypesByFrequency(accumulator.movementTypeCounts);
      const topSpecies = sortSpeciesByFrequency(accumulator.speciesCounts);
      const activityScore = accumulator.sightingCount + accumulator.movementSignalCount;
      const anchorLabel = accumulator.stationId ?? accumulator.region;
      const movementLabel = dominantMovementTypes[0]?.replace(/_/g, " ") ?? "none";

      return {
        id: hotspotId(accumulator.region, accumulator.stationId),
        label: `${anchorLabel} species activity hotspot`,
        region: accumulator.region,
        stationId: accumulator.stationId,
        latitude: coordinate?.latitude ?? null,
        longitude: coordinate?.longitude ?? null,
        hotspotType: getHotspotType(accumulator),
        severity: getHotspotSeverity(accumulator),
        recentSightingCount: accumulator.sightingCount,
        recentMovementSignalCount: accumulator.movementSignalCount,
        observedIndividualCount: accumulator.observedIndividualCount,
        dominantMovementTypes,
        topSpecies,
        activityScore,
        detail:
          `${accumulator.sightingCount} recent sighting${accumulator.sightingCount === 1 ? "" : "s"}`
          + ` and ${accumulator.movementSignalCount} movement signal${accumulator.movementSignalCount === 1 ? "" : "s"}`
          + ` concentrated near ${anchorLabel}; dominant movement ${movementLabel}.`,
      } satisfies OceanMapHotspotOverlay;
    })
    .sort((left, right) => {
      const severityRank = { high: 3, medium: 2, low: 1 } as const;
      if (severityRank[right.severity] !== severityRank[left.severity]) {
        return severityRank[right.severity] - severityRank[left.severity];
      }
      if (right.activityScore !== left.activityScore) {
        return right.activityScore - left.activityScore;
      }
      return left.label.localeCompare(right.label);
    });
}

export function buildOceanMapCorridorsFoundation(
  hotspots: OceanMapHotspotOverlay[],
): OceanMapCorridorFoundation[] {
  const grouped = new Map<string, OceanMapHotspotOverlay[]>();

  for (const hotspot of hotspots) {
    const current = grouped.get(hotspot.region) ?? [];
    current.push(hotspot);
    grouped.set(hotspot.region, current);
  }

  return [...grouped.entries()]
    .map(([region, regionHotspots]) => {
      const stationIds = [...new Set(regionHotspots.map((hotspot) => hotspot.stationId).filter((value): value is string => Boolean(value)))].sort();
      const movementTypes = [...new Set(regionHotspots.flatMap((hotspot) => hotspot.dominantMovementTypes))].sort();
      const speciesNames = [...new Set(regionHotspots.flatMap((hotspot) => hotspot.topSpecies))].sort();
      const anchorPoints = regionHotspots
        .filter((hotspot) => hotspot.latitude !== null && hotspot.longitude !== null)
        .map((hotspot) => ({
          label: hotspot.label,
          latitude: hotspot.latitude as number,
          longitude: hotspot.longitude as number,
        }))
        .slice(0, 5);
      const priority: OceanMapCorridorFoundation["priority"] =
        regionHotspots.some((hotspot) => hotspot.severity === "high") || stationIds.length >= 2
          ? "high"
          : regionHotspots.length >= 2
            ? "medium"
            : "low";

      return {
        id: `CORRIDOR-${region.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
        label: `${region} corridor foundation`,
        region,
        priority,
        hotspotIds: regionHotspots.map((hotspot) => hotspot.id),
        stationIds,
        movementTypes,
        speciesNames,
        anchorPoints,
        geometryStatus: "grouped_without_geometry",
        summary:
          `${region} corridor foundation links ${regionHotspots.length} hotspot${regionHotspots.length === 1 ? "" : "s"}`
          + ` across ${anchorPoints.length} anchor point${anchorPoints.length === 1 ? "" : "s"}; geometry pending.`,
      } satisfies OceanMapCorridorFoundation;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildOceanMapSpatialOverlays(
  input: BuildOceanMapSpatialOverlaysInput,
): OceanMapSpatialOverlays {
  const hotspots = buildOceanMapHotspots(input);
  const corridorsFoundation = buildOceanMapCorridorsFoundation(hotspots);

  return {
    categories: ["sightings", "movement_signals", "hotspots", "corridors_foundation"],
    sightings: [...input.sightings].sort((left, right) => right.observedAt.localeCompare(left.observedAt)),
    movementSignals: [...input.movementSignals].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    hotspots,
    corridorsFoundation,
    generatedAt: input.generatedAt,
    windowDays: input.windowDays,
  };
}
