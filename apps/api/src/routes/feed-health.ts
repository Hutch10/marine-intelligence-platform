import type {
  RouteDefinition,
} from "../types";
import type { LiveIngestionHealthSnapshotReadResult } from "../repositories/live-ingestion-reports";
import type { NdbcStationIngestionDiagnostic } from "../services/ingestion/run-ndbc";

type FeedHealthFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

interface FeedHealthSummaryResponse {
  latest_source_count: number;
  healthy_source_count: number;
  degraded_source_count: number;
  failed_source_count: number;
  stale_source_count: number;
  inserted_count: number;
  rejected_count: number;
  recent_history_count: number;
  last_completed_at: string | null;
}

interface FeedHealthLatestStatusResponseItem {
  source: string;
  worker_run_id: string;
  worker_status: string;
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  inserted_count: number;
  rejected_count: number;
  rejection_reasons: Record<string, number>;
  run_id: string | null;
  error: string | null;
  is_stale: boolean;
  stale_by_ms: number | null;
  station_diagnostics: FeedHealthStationDiagnosticResponseItem[];
}

interface FeedHealthHistoryResponseItem {
  source: string;
  worker_run_id: string;
  worker_status: string;
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  inserted_count: number;
  rejected_count: number;
  rejection_reasons: Record<string, number>;
  run_id: string | null;
  error: string | null;
  station_diagnostics: FeedHealthStationDiagnosticResponseItem[];
}

interface FeedHealthStationDiagnosticResponseItem {
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

interface FeedHealthResponse {
  source: "db" | "unavailable";
  fallback_reason: FeedHealthFallbackReason | null;
  generated_at: string;
  stale_after_ms: number;
  summary: FeedHealthSummaryResponse;
  latest_status_by_source: FeedHealthLatestStatusResponseItem[];
  recent_history: FeedHealthHistoryResponseItem[];
}

interface FeedHealthQuery {
  limit?: number | string;
  staleAfterMs?: number | string;
}

interface FeedHealthTelemetry {
  route: "GET /feed-health";
  source: "db" | "unavailable";
  latestSourceCount: number;
  historyCount: number;
  staleSourceCount: number;
  fallbackReason?: FeedHealthFallbackReason;
}

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

function normalizeInteger(
  value: number | string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(numeric), min), max);
}

function parseFeedHealthQuery(query: FeedHealthQuery | undefined): { limit: number; staleAfterMs: number } {
  return {
    limit: normalizeInteger(query?.limit, DEFAULT_HISTORY_LIMIT, 1, 500),
    staleAfterMs: normalizeInteger(query?.staleAfterMs, DEFAULT_STALE_AFTER_MS, 0, 7 * 24 * 60 * 60 * 1000),
  };
}

async function readDatabaseFeedHealth(
  query: FeedHealthQuery | undefined,
): Promise<LiveIngestionHealthSnapshotReadResult> {
  const parsedQuery = parseFeedHealthQuery(query);

  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/live-ingestion-reports") as {
      getLiveIngestionHealthSnapshotAsync: (options: {
        limit: number;
        staleAfterMs: number;
      }) => Promise<LiveIngestionHealthSnapshotReadResult>;
      getLiveIngestionHealthSnapshot: (options: {
        limit: number;
        staleAfterMs: number;
      }) => LiveIngestionHealthSnapshotReadResult;
    };

    if (typeof repository.getLiveIngestionHealthSnapshotAsync === "function") {
      return await repository.getLiveIngestionHealthSnapshotAsync(parsedQuery);
    }

    return repository.getLiveIngestionHealthSnapshot(parsedQuery);
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}

function buildEmptySummary(): FeedHealthSummaryResponse {
  return {
    latest_source_count: 0,
    healthy_source_count: 0,
    degraded_source_count: 0,
    failed_source_count: 0,
    stale_source_count: 0,
    inserted_count: 0,
    rejected_count: 0,
    recent_history_count: 0,
    last_completed_at: null,
  };
}

function toLatestStatusItem(item: {
  source: string;
  workerRunId: string;
  workerStatus: string;
  status: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  insertedCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  runId: string | null;
  error: string | null;
  isStale: boolean;
  staleByMs: number | null;
  stationDiagnostics: NdbcStationIngestionDiagnostic[];
}): FeedHealthLatestStatusResponseItem {
  return {
    source: item.source,
    worker_run_id: item.workerRunId,
    worker_status: item.workerStatus,
    status: item.status,
    started_at: item.startedAt,
    completed_at: item.completedAt,
    duration_ms: item.durationMs,
    inserted_count: item.insertedCount,
    rejected_count: item.rejectedCount,
    rejection_reasons: item.rejectionReasons,
    run_id: item.runId,
    error: item.error,
    is_stale: item.isStale,
    stale_by_ms: item.staleByMs,
    station_diagnostics: item.stationDiagnostics.map(toStationDiagnosticItem),
  };
}

function toHistoryItem(item: {
  source: string;
  workerRunId: string;
  workerStatus: string;
  status: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  insertedCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  runId: string | null;
  error: string | null;
  stationDiagnostics: NdbcStationIngestionDiagnostic[];
}): FeedHealthHistoryResponseItem {
  return {
    source: item.source,
    worker_run_id: item.workerRunId,
    worker_status: item.workerStatus,
    status: item.status,
    started_at: item.startedAt,
    completed_at: item.completedAt,
    duration_ms: item.durationMs,
    inserted_count: item.insertedCount,
    rejected_count: item.rejectedCount,
    rejection_reasons: item.rejectionReasons,
    run_id: item.runId,
    error: item.error,
    station_diagnostics: item.stationDiagnostics.map(toStationDiagnosticItem),
  };
}

function toStationDiagnosticItem(item: NdbcStationIngestionDiagnostic): FeedHealthStationDiagnosticResponseItem {
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

export function buildFeedHealthRouteResponse(
  readResult: LiveIngestionHealthSnapshotReadResult,
  query?: FeedHealthQuery,
): { status: number; json: FeedHealthResponse; telemetry: FeedHealthTelemetry } {
  const parsedQuery = parseFeedHealthQuery(query);

  if (readResult.source === "db") {
    const latestStatusBySource = readResult.snapshot.latestBySource.map(toLatestStatusItem);
    const recentHistory = readResult.snapshot.recentHistory.map(toHistoryItem);

    return {
      status: 200,
      json: {
        source: "db",
        fallback_reason: null,
        generated_at: readResult.snapshot.generatedAt,
        stale_after_ms: readResult.snapshot.staleAfterMs,
        summary: {
          latest_source_count: readResult.snapshot.summary.latestSourceCount,
          healthy_source_count: readResult.snapshot.summary.healthySourceCount,
          degraded_source_count: readResult.snapshot.summary.degradedSourceCount,
          failed_source_count: readResult.snapshot.summary.failedSourceCount,
          stale_source_count: readResult.snapshot.summary.staleSourceCount,
          inserted_count: readResult.snapshot.summary.insertedCount,
          rejected_count: readResult.snapshot.summary.rejectedCount,
          recent_history_count: readResult.snapshot.summary.recentHistoryCount,
          last_completed_at: readResult.snapshot.summary.lastCompletedAt,
        },
        latest_status_by_source: latestStatusBySource,
        recent_history: recentHistory,
      },
      telemetry: {
        route: "GET /feed-health",
        source: "db",
        latestSourceCount: latestStatusBySource.length,
        historyCount: recentHistory.length,
        staleSourceCount: readResult.snapshot.summary.staleSourceCount,
      },
    };
  }

  return {
    status: 200,
    json: {
      source: "unavailable",
      fallback_reason: readResult.fallbackReason,
      generated_at: new Date().toISOString(),
      stale_after_ms: parsedQuery.staleAfterMs,
      summary: buildEmptySummary(),
      latest_status_by_source: [],
      recent_history: [],
    },
    telemetry: {
      route: "GET /feed-health",
      source: "unavailable",
      latestSourceCount: 0,
      historyCount: 0,
      staleSourceCount: 0,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getFeedHealthRoute: RouteDefinition<FeedHealthResponse, undefined, FeedHealthQuery> = {
  method: "GET",
  path: "/feed-health",
  async handler(request) {
    const readResult = await readDatabaseFeedHealth(request.query);
    return buildFeedHealthRouteResponse(readResult, request.query);
  },
};
