import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";

export type CircuitBreakerState = "closed" | "open" | "half_open";

export interface SourceCircuitBreakerStatus {
  source: string;
  label: string;
  state: CircuitBreakerState;
  consecutiveFailures: number;
  failureThreshold: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  reason: string | null;
}

export interface CircuitBreakerSnapshot {
  generatedAt: string;
  sources: SourceCircuitBreakerStatus[];
  openCount: number;
  halfOpenCount: number;
}

const FAILURE_THRESHOLD = 3;

const SOURCE_LABELS: Record<string, string> = {
  noaa_ndbc: "NDBC",
  noaa_coral_reef_watch: "CRW",
  crw: "CRW",
  ioos_regional: "IOOS",
  ioos_erddap: "ERDDAP",
};

function labelFor(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function countConsecutiveFailures(
  source: string,
  history: LiveIngestionHealthSnapshot["recentHistory"],
): number {
  let count = 0;

  for (const item of history) {
    if (item.source !== source) {
      continue;
    }

    if (item.status === "failed" || item.workerStatus === "failed") {
      count += 1;
      continue;
    }

    break;
  }

  return count;
}

function deriveState(consecutiveFailures: number, latestFailed: boolean): CircuitBreakerState {
  if (consecutiveFailures >= FAILURE_THRESHOLD || latestFailed) {
    return "open";
  }

  if (consecutiveFailures > 0) {
    return "half_open";
  }

  return "closed";
}

export function buildCircuitBreakerSnapshot(
  snapshot: LiveIngestionHealthSnapshot,
  generatedAt = new Date().toISOString(),
): CircuitBreakerSnapshot {
  const sources = snapshot.latestBySource.map((item) => {
    const consecutiveFailures = countConsecutiveFailures(item.source, snapshot.recentHistory);
    const latestFailed = item.status === "failed" || item.workerStatus === "failed";
    const state = deriveState(consecutiveFailures, latestFailed);

    return {
      source: item.source,
      label: labelFor(item.source),
      state,
      consecutiveFailures,
      failureThreshold: FAILURE_THRESHOLD,
      lastFailureAt: latestFailed ? item.completedAt : null,
      lastSuccessAt: latestFailed ? null : item.completedAt,
      reason: latestFailed ? (item.error ?? "source_failed") : null,
    };
  });

  return {
    generatedAt,
    sources,
    openCount: sources.filter((item) => item.state === "open").length,
    halfOpenCount: sources.filter((item) => item.state === "half_open").length,
  };
}
