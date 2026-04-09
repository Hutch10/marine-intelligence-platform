import type { RouteDefinition } from "../types";
import type {
  LiveIngestionLatestSourceStatus,
  LiveIngestionLatestStatusReadResult,
} from "../repositories/live-ingestion-reports";

interface InternalStationsHealthResponseItem {
  station_id: string;
  status: "healthy" | "degraded" | "failed";
  last_successful_ingestion_at: string | null;
  latest_observation_timestamp: string | null;
  latest_observation_age_ms: number | null;
  usable_metric_coverage: {
    present_count: number;
    total_count: number;
    metrics_present: string[];
  };
  missing_field_rates: {
    sea_surface_temp_c: number;
    wave_height_m: number;
    wind_speed_mps: number;
    pressure_hpa: number;
  };
  rejection_breakdown: Record<string, number>;
  last_fetch_url: string | null;
}

interface InternalStationsHealthResponse {
  source: "db" | "unavailable";
  fallback_reason: "db_path_missing" | "db_open_failed" | "db_query_failed" | null;
  generated_at: string;
  stations: InternalStationsHealthResponseItem[];
}

function readLatestStationHealth(): LiveIngestionLatestStatusReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/live-ingestion-reports") as {
      listLatestLiveIngestionStatusBySource: () => LiveIngestionLatestStatusReadResult;
    };

    return repository.listLatestLiveIngestionStatusBySource();
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}

function toStationHealthItem(item: LiveIngestionLatestSourceStatus["stationDiagnostics"][number]): InternalStationsHealthResponseItem {
  return {
    station_id: item.stationId,
    status: item.status,
    last_successful_ingestion_at: item.lastSuccessfulIngestionAt,
    latest_observation_timestamp: item.latestObservationTimestamp,
    latest_observation_age_ms: item.latestObservationAgeMs,
    usable_metric_coverage: {
      present_count: item.usableMetricCoverage.presentCount,
      total_count: item.usableMetricCoverage.totalCount,
      metrics_present: item.usableMetricCoverage.metricsPresent,
    },
    missing_field_rates: {
      sea_surface_temp_c: item.missingFieldRates.seaSurfaceTempC,
      wave_height_m: item.missingFieldRates.waveHeightM,
      wind_speed_mps: item.missingFieldRates.windSpeedMps,
      pressure_hpa: item.missingFieldRates.pressureHpa,
    },
    rejection_breakdown: item.rejectionBreakdown,
    last_fetch_url: item.lastFetchUrl,
  };
}

export function buildInternalStationsHealthRouteResponse(
  readResult = readLatestStationHealth(),
): { status: 200; json: InternalStationsHealthResponse } {
  if (readResult.source !== "db") {
    return {
      status: 200,
      json: {
        source: "unavailable",
        fallback_reason: readResult.fallbackReason,
        generated_at: new Date().toISOString(),
        stations: [],
      },
    };
  }

  const latestNdbc = readResult.latest.find((item) => item.source === "noaa_ndbc");
  const stations = (latestNdbc?.stationDiagnostics ?? [])
    .map(toStationHealthItem)
    .sort((left, right) => {
      const statusWeight = { healthy: 0, degraded: 1, failed: 2 };
      const weightDelta = statusWeight[right.status] - statusWeight[left.status];
      if (weightDelta !== 0) {
        return weightDelta;
      }

      return (right.latest_observation_age_ms ?? -1) - (left.latest_observation_age_ms ?? -1);
    });

  return {
    status: 200,
    json: {
      source: "db",
      fallback_reason: null,
      generated_at: new Date().toISOString(),
      stations,
    },
  };
}

export const getInternalStationsHealthRoute: RouteDefinition<InternalStationsHealthResponse> = {
  method: "GET",
  path: "/internal/stations/health",
  handler() {
    return buildInternalStationsHealthRouteResponse();
  },
};
