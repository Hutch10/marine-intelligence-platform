import type { RouteDefinition } from "../types";
import { buildFeedHealthRouteResponse } from "./feed-health";
import { buildOperationalAlertsRouteResponse } from "./operational-alerts";
import { buildCircuitBreakerSnapshot } from "../services/circuit-breaker";
import { buildFreshnessGovernanceSnapshot } from "../services/freshness-governance";
import type { LiveIngestionHealthSnapshotReadResult } from "../repositories/live-ingestion-reports";
import type { OperatorConsoleHarnessSection } from "@marine/shared";
import { buildOperatorConsoleHarnessSection } from "../services/environmental-harness/operator-console";

interface OperatorSchedulerSource {
  source: string;
  label: string;
  intervalMs: number;
  enabled: boolean;
}

interface OperatorSchedulerStatus {
  ndbcIntervalMs: number;
  crwIntervalMs: number;
  ioosIntervalMs: number;
  erddapIntervalMs: number;
  ioosEnabled: boolean;
  erddapEnabled: boolean;
  sources: OperatorSchedulerSource[];
}

interface OperatorFailureItem {
  id: string;
  source: string;
  ruleType: string;
  severity: string;
  title: string;
  detail: string | null;
  detectedAt: number;
}

interface OperatorRecoveryItem {
  id: string;
  source: string;
  ruleType: string;
  resolvedAt: number;
  title: string;
}

export interface OperatorStatusResponse {
  generated_at: string;
  access: "operator";
  feed_health: ReturnType<typeof buildFeedHealthRouteResponse>["json"];
  scheduler: OperatorSchedulerStatus;
  circuit_breaker: ReturnType<typeof buildCircuitBreakerSnapshot>;
  freshness_governance: ReturnType<typeof buildFreshnessGovernanceSnapshot>;
  recent_failures: OperatorFailureItem[];
  recent_recoveries: OperatorRecoveryItem[];
  harness: OperatorConsoleHarnessSection;
}

function envMs(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildSchedulerStatus(): OperatorSchedulerStatus {
  const ioosEnabled = String(process.env.IOOS_ENABLED ?? "false").trim().toLowerCase() === "true";
  const erddapEnabled = String(process.env.ERDDAP_ENABLED ?? "false").trim().toLowerCase() === "true";
  const ndbcIntervalMs = envMs("SCHEDULER_NDBC_INTERVAL_MS", 20 * 60 * 1000);
  const crwIntervalMs = envMs("SCHEDULER_CRW_INTERVAL_MS", 2 * 60 * 60 * 1000);
  const ioosIntervalMs = envMs("SCHEDULER_IOOS_INTERVAL_MS", 45 * 60 * 1000);
  const erddapIntervalMs = envMs("SCHEDULER_ERDDAP_INTERVAL_MS", 45 * 60 * 1000);

  const sources: OperatorSchedulerSource[] = [
    { source: "noaa_ndbc", label: "NDBC", intervalMs: ndbcIntervalMs, enabled: true },
    { source: "noaa_coral_reef_watch", label: "CRW", intervalMs: crwIntervalMs, enabled: true },
    { source: "ioos_regional", label: "IOOS", intervalMs: ioosIntervalMs, enabled: ioosEnabled },
    { source: "ioos_erddap", label: "ERDDAP", intervalMs: erddapIntervalMs, enabled: erddapEnabled },
  ];

  return {
    ndbcIntervalMs,
    crwIntervalMs,
    ioosIntervalMs,
    erddapIntervalMs,
    ioosEnabled,
    erddapEnabled,
    sources,
  };
}

function readFeedHealthSnapshot(): LiveIngestionHealthSnapshotReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/live-ingestion-reports") as {
      getLiveIngestionHealthSnapshot: (options: {
        limit: number;
        staleAfterMs: number;
      }) => LiveIngestionHealthSnapshotReadResult;
    };

    return repository.getLiveIngestionHealthSnapshot({
      limit: 40,
      staleAfterMs: 6 * 60 * 60 * 1000,
    });
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}

export async function buildOperatorStatusRouteResponse(): Promise<{
  status: number;
  json: OperatorStatusResponse;
}> {
  const generatedAt = new Date().toISOString();
  const feedHealth = buildFeedHealthRouteResponse(readFeedHealthSnapshot(), { limit: 40 });
  const alerts = await buildOperationalAlertsRouteResponse(undefined, { limit: 80 });

  const circuitBreaker = feedHealth.json.source === "db"
    ? buildCircuitBreakerSnapshot({
      generatedAt: feedHealth.json.generated_at,
      staleAfterMs: feedHealth.json.stale_after_ms,
      summary: {
        latestSourceCount: feedHealth.json.summary.latest_source_count,
        healthySourceCount: feedHealth.json.summary.healthy_source_count,
        degradedSourceCount: feedHealth.json.summary.degraded_source_count,
        failedSourceCount: feedHealth.json.summary.failed_source_count,
        staleSourceCount: feedHealth.json.summary.stale_source_count,
        insertedCount: feedHealth.json.summary.inserted_count,
        rejectedCount: feedHealth.json.summary.rejected_count,
        recentHistoryCount: feedHealth.json.summary.recent_history_count,
        lastCompletedAt: feedHealth.json.summary.last_completed_at,
      },
      latestBySource: feedHealth.json.latest_status_by_source.map((item) => ({
        source: item.source,
        workerRunId: item.worker_run_id,
        workerStatus: item.worker_status,
        status: item.status,
        startedAt: item.started_at,
        completedAt: item.completed_at,
        durationMs: item.duration_ms,
        insertedCount: item.inserted_count,
        rejectedCount: item.rejected_count,
        rejectionReasons: item.rejection_reasons,
        runId: item.run_id,
        error: item.error,
        isStale: item.is_stale,
        staleByMs: item.stale_by_ms,
        stationDiagnostics: [],
      })),
      recentHistory: feedHealth.json.recent_history.map((item) => ({
        reportId: item.worker_run_id,
        workerRunId: item.worker_run_id,
        source: item.source,
        startedAt: item.started_at,
        completedAt: item.completed_at,
        durationMs: item.duration_ms,
        insertedCount: item.inserted_count,
        rejectedCount: item.rejected_count,
        rejectionReasons: item.rejection_reasons,
        status: item.status,
        runId: item.run_id,
        error: item.error,
        workerStatus: item.worker_status,
        stationDiagnostics: [],
      })),
    })
    : {
      generatedAt,
      sources: [],
      openCount: 0,
      halfOpenCount: 0,
    };

  const freshnessGovernance = feedHealth.json.source === "db"
    ? buildFreshnessGovernanceSnapshot({
      generatedAt: feedHealth.json.generated_at,
      staleAfterMs: feedHealth.json.stale_after_ms,
      summary: {
        latestSourceCount: feedHealth.json.summary.latest_source_count,
        healthySourceCount: feedHealth.json.summary.healthy_source_count,
        degradedSourceCount: feedHealth.json.summary.degraded_source_count,
        failedSourceCount: feedHealth.json.summary.failed_source_count,
        staleSourceCount: feedHealth.json.summary.stale_source_count,
        insertedCount: feedHealth.json.summary.inserted_count,
        rejectedCount: feedHealth.json.summary.rejected_count,
        recentHistoryCount: feedHealth.json.summary.recent_history_count,
        lastCompletedAt: feedHealth.json.summary.last_completed_at,
      },
      latestBySource: feedHealth.json.latest_status_by_source.map((item) => ({
        source: item.source,
        workerRunId: item.worker_run_id,
        workerStatus: item.worker_status,
        status: item.status,
        startedAt: item.started_at,
        completedAt: item.completed_at,
        durationMs: item.duration_ms,
        insertedCount: item.inserted_count,
        rejectedCount: item.rejected_count,
        rejectionReasons: item.rejection_reasons,
        runId: item.run_id,
        error: item.error,
        isStale: item.is_stale,
        staleByMs: item.stale_by_ms,
        stationDiagnostics: [],
      })),
      recentHistory: [],
    })
    : {
      generatedAt,
      staleAfterMs: feedHealth.json.stale_after_ms,
      sources: [],
      withheldCount: 0,
    };

  const activeAlerts = alerts.json.active_alerts ?? [];
  const recentHistory = alerts.json.recent_history ?? [];

  const recentFailures = activeAlerts
    .filter((alert) => alert.rule_type === "source_failed" || alert.rule_type === "persistence_failure")
    .slice(0, 20)
    .map((alert) => ({
      id: alert.id,
      source: alert.source,
      ruleType: alert.rule_type,
      severity: alert.severity,
      title: alert.title,
      detail: alert.detail,
      detectedAt: alert.detected_at,
    }));

  const recentRecoveries = recentHistory
    .filter((alert) => alert.status === "resolved")
    .slice(0, 20)
    .map((alert) => ({
      id: alert.id,
      source: alert.source,
      ruleType: alert.rule_type,
      resolvedAt: alert.resolved_at ?? 0,
      title: alert.title,
    }));

  const harness = await buildOperatorConsoleHarnessSection({ replaySampleLimit: 6 });

  return {
    status: 200,
    json: {
      generated_at: generatedAt,
      access: "operator",
      feed_health: feedHealth.json,
      scheduler: buildSchedulerStatus(),
      circuit_breaker: circuitBreaker,
      freshness_governance: freshnessGovernance,
      recent_failures: recentFailures,
      recent_recoveries: recentRecoveries,
      harness,
    },
  };
}

export const getOperatorStatusRoute: RouteDefinition<OperatorStatusResponse> = {
  method: "GET",
  path: "/internal/operator/status",
  async handler() {
    return await buildOperatorStatusRouteResponse();
  },
};
