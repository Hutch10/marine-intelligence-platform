import { apiMockData } from "../data";
import type { RegionsResponse, RegionsTelemetry, RouteDefinition } from "../types";
import { SystemIntegrityStatus } from "@marine/shared";
import type {
  MapOverlayEntityRow,
  RegionSummaryMetricValues,
  RegionsMapStatCounts,
  MapStatAggregates,
  MapLayerRow,
} from "../repositories/regions";

type RegionSummary = {
  id: string;
  name: string;
  status: string;
  summary: string;
  summaryMetrics?: RegionSummaryMetricValues | null;
  openAlertCount?: number | null;
  nearestBuoyLabel?: string | null;
  thermalAnomalyLabel?: string | null;
  currentDirectionLabel?: string | null;
  centroid?: { lat: number; lng: number } | null;
};

type RegionsReadResult =
  | {
      source: "db";
      regions: RegionSummary[];
      mapStatCounts?: RegionsMapStatCounts;
      mapStats?: MapStatAggregates | null;
      mapLayers?: MapLayerRow[] | null;
      overlayEntities?: MapOverlayEntityRow[] | null;
      spatialOverlays?: RegionsResponse["map"]["spatialOverlays"] | null;
    }
  | { source: "mock"; fallbackReason: RegionsTelemetry["fallbackReason"] };

const mockRegions: RegionsResponse["regions"] = [
  {
    id: "REG-14C",
    name: "Reef Edge Corridor",
    status: "Elevated reef stress window",
    summary:
      "Spatial anomaly zone currently under active investigation for heat stress and current shear overlap.",
    metrics: apiMockData.oceanMapWorkspaceData.regionMetrics,
  },
];

function readDatabaseRegions(): RegionsReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/regions") as {
      listRegions: () => RegionsReadResult;
    };

    return repository.listRegions();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function getRegionMetricValues(region: RegionSummary): RegionSummaryMetricValues {
  return {
    region: region.summaryMetrics?.region ?? region.name,
    thermalAnomaly:
      region.summaryMetrics?.thermalAnomaly ?? region.thermalAnomalyLabel ?? null,
    currentDirection:
      region.summaryMetrics?.currentDirection ?? region.currentDirectionLabel ?? null,
    nearestBuoy: region.summaryMetrics?.nearestBuoy ?? region.nearestBuoyLabel ?? null,
    riskStatus: region.summaryMetrics?.riskStatus ?? region.status,
    openAlerts: region.summaryMetrics?.openAlerts ?? region.openAlertCount ?? null,
  };
}

function hasDbBackedRegionSummaryMetrics(region: RegionSummary): boolean {
  const metricValues = getRegionMetricValues(region);

  return (
    metricValues.region !== null
    && metricValues.riskStatus !== null
    && metricValues.nearestBuoy !== null
    && metricValues.thermalAnomaly !== null
    && metricValues.currentDirection !== null
  );
}

function buildRegionMetrics(region: RegionSummary): RegionsResponse["regions"][number]["metrics"] {
  const metricValues = getRegionMetricValues(region);

  const base = apiMockData.oceanMapWorkspaceData.regionMetrics.map((metric) => {
    if (metric.label === "Region" && metricValues.region != null) {
      return { ...metric, value: metricValues.region };
    }

    if (metric.label === "Risk status" && metricValues.riskStatus != null) {
      return { ...metric, value: metricValues.riskStatus };
    }

    if (metric.label === "Nearest buoy" && metricValues.nearestBuoy != null) {
      return { ...metric, value: metricValues.nearestBuoy };
    }

    if (metric.label === "Thermal anomaly" && metricValues.thermalAnomaly != null) {
      return { ...metric, value: metricValues.thermalAnomaly };
    }

    if (metric.label === "Current direction" && metricValues.currentDirection != null) {
      return { ...metric, value: metricValues.currentDirection };
    }

    return metric;
  });

  if (metricValues.openAlerts !== undefined && metricValues.openAlerts !== null) {
    return [...base, { label: "Open alerts", value: String(metricValues.openAlerts) }];
  }

  return base;
}

function buildMapRegionMetrics(
  regions: RegionSummary[],
): { regionMetrics: RegionsResponse["map"]["regionMetrics"]; regionMetricsSource: RegionsTelemetry["regionMetricsSource"] } {
  if (regions.length === 0) {
    return { regionMetrics: apiMockData.oceanMapWorkspaceData.regionMetrics, regionMetricsSource: "mock" };
  }
  const regionMetrics = buildRegionMetrics(regions[0]!).filter(
    (m) => m.label !== "Open alerts",
  );
  return { regionMetrics, regionMetricsSource: "db" };
}

function buildMapLayers(
  mapLayers: MapLayerRow[] | null | undefined,
): { layers: RegionsResponse["map"]["layers"]; layersSource: RegionsTelemetry["layersSource"] } {
  if (!mapLayers) {
    return { layers: apiMockData.oceanMapWorkspaceData.layers, layersSource: "mock" };
  }

  const dbMap = new Map(mapLayers.map((row) => [row.label, row.active !== 0]));

  const layers = apiMockData.oceanMapWorkspaceData.layers.map((mockLayer) => {
    const dbActive = dbMap.get(mockLayer.label);
    if (dbActive !== undefined) {
      return { ...mockLayer, active: dbActive };
    }
    return mockLayer;
  });

  return { layers, layersSource: "db" };
}

function buildOverlayEntities(
  overlayEntities: MapOverlayEntityRow[] | null | undefined,
): {
  overlayEntities: RegionsResponse["map"]["overlayEntities"];
  overlayEntitiesSource: RegionsTelemetry["overlayEntitiesSource"];
} {
  if (!overlayEntities) {
    return {
      overlayEntities: apiMockData.oceanMapWorkspaceData.overlayEntities,
      overlayEntitiesSource: "mock",
    };
  }

  return {
    overlayEntities: overlayEntities.map((entity) => ({
      id: entity.id,
      label: entity.label,
      region: entity.region,
      severity: entity.severity,
      status: entity.status,
      detail: entity.detail ?? "No detail available.",
      detectedAt: entity.detectedAt ?? "",
    })),
    overlayEntitiesSource: "db",
  };
}

function buildSpatialOverlays(
  spatialOverlays: RegionsResponse["map"]["spatialOverlays"] | null | undefined,
): {
  spatialOverlays: RegionsResponse["map"]["spatialOverlays"];
  spatialOverlaysSource: RegionsTelemetry["spatialOverlaysSource"];
} {
  if (!spatialOverlays) {
    return {
      spatialOverlays: apiMockData.oceanMapWorkspaceData.spatialOverlays,
      spatialOverlaysSource: "mock",
    };
  }

  return {
    spatialOverlays,
    spatialOverlaysSource: "db",
  };
}

function buildStats(
  mapStats: MapStatAggregates | null | undefined,
): { mapStats: RegionsResponse["map"]["mapStats"]; statsSource: RegionsTelemetry["statsSource"] } {
  if (!mapStats) {
    return { mapStats: apiMockData.oceanMapWorkspaceData.mapStats, statsSource: "mock" };
  }

  const stats = apiMockData.oceanMapWorkspaceData.mapStats.map((stat) => {
    if (stat.label === "Tracked buoys") return { ...stat, value: String(mapStats.trackedBuoys) };
    if (stat.label === "Active fronts") return { ...stat, value: String(mapStats.activeFronts) };
    if (stat.label === "Drift routes") return { ...stat, value: String(mapStats.driftRoutes) };
    return stat;
  });

  return { mapStats: stats, statsSource: "db" };
}

function buildMapStats(
  counts: RegionsMapStatCounts,
): {
  mapStats: RegionsResponse["map"]["mapStats"];
  mapStatsSource: RegionsTelemetry["mapStatsSource"];
} {
  let appliedDbValue = false;

  const mapStats = apiMockData.oceanMapWorkspaceData.mapStats.map((stat) => {
    if (stat.label === "Tracked buoys" && counts.trackedBuoys !== null) {
      appliedDbValue = true;
      return {
        ...stat,
        value: String(counts.trackedBuoys),
      };
    }

    if (stat.label === "Active fronts" && counts.activeFronts !== null) {
      appliedDbValue = true;
      return {
        ...stat,
        value: String(counts.activeFronts),
      };
    }

    if (stat.label === "Drift routes" && counts.driftRoutes !== null) {
      appliedDbValue = true;
      return {
        ...stat,
        value: String(counts.driftRoutes),
      };
    }

    return stat;
  });

  return {
    mapStats,
    mapStatsSource: appliedDbValue ? "db_enriched_mock" : "mock",
  };
}

export function buildRegionsRouteResponse(
  readResult = readDatabaseRegions(),
): { status: number; json: RegionsResponse; telemetry: RegionsTelemetry } {
  if (readResult.source === "db") {
    const { mapStats: builtMapStats, mapStatsSource } = buildMapStats(readResult.mapStatCounts ?? { activeFronts: null, driftRoutes: null, trackedBuoys: null });
    const { mapStats: statsMapStats, statsSource } = buildStats(readResult.mapStats);
    const { layers, layersSource } = buildMapLayers(readResult.mapLayers);
    const { overlayEntities, overlayEntitiesSource } = buildOverlayEntities(readResult.overlayEntities);
    const { spatialOverlays, spatialOverlaysSource } = buildSpatialOverlays(readResult.spatialOverlays);
    const { regionMetrics, regionMetricsSource } = buildMapRegionMetrics(readResult.regions);
    const metricsSource =
      readResult.regions.length > 0 && readResult.regions.every(hasDbBackedRegionSummaryMetrics)
        ? "db"
        : "mock";

    return {
      status: 200,
      json: {
        regions: readResult.regions.map((region) => ({
          id: region.id,
          name: region.name,
          status: region.status,
          summary: region.summary,
          metrics: buildRegionMetrics(region),
          centroid: region.centroid ?? null,
        })),
        map: {
          ...apiMockData.oceanMapWorkspaceData,
          mapStats: statsMapStats,
          layers,
          overlayEntities,
          spatialOverlays,
          regionMetrics,
        },
        systemIntegrity: SystemIntegrityStatus.NORMAL,
      },
      telemetry: {
        route: "GET /regions",
        source: "db",
        regionCount: readResult.regions.length,
        mapSource: "mock",
        mapStatsSource,
        metricsSource,
        regionMetricsSource,
        statsSource,
        layersSource,
        overlayEntitiesSource,
        spatialOverlaysSource,
      },
    };
  }

  return {
    status: 200,
    json: {
      regions: mockRegions,
      map: apiMockData.oceanMapWorkspaceData,
      systemIntegrity: SystemIntegrityStatus.DEGRADED,
    },
    telemetry: {
      route: "GET /regions",
      source: "mock",
      regionCount: mockRegions.length,
      mapSource: "mock",
      mapStatsSource: "mock",
      metricsSource: "mock",
      regionMetricsSource: "mock",
      statsSource: "mock",
      layersSource: "mock",
      overlayEntitiesSource: "mock",
      spatialOverlaysSource: "mock",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getRegionsRoute: RouteDefinition<RegionsResponse> = {
  method: "GET",
  path: "/regions",
  handler() {
    return buildRegionsRouteResponse();
  },
};
