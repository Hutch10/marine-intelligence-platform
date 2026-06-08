import test from "node:test";
import assert from "node:assert/strict";
import { buildCircuitBreakerSnapshot } from "./circuit-breaker";
import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";

test("circuit breaker opens after consecutive failures", () => {
  const snapshot: LiveIngestionHealthSnapshot = {
    generatedAt: "2026-06-03T12:00:00.000Z",
    staleAfterMs: 21600000,
    summary: {
      latestSourceCount: 1,
      healthySourceCount: 0,
      degradedSourceCount: 0,
      failedSourceCount: 1,
      staleSourceCount: 0,
      insertedCount: 0,
      rejectedCount: 0,
      recentHistoryCount: 3,
      lastCompletedAt: "2026-06-03T12:00:00.000Z",
    },
    latestBySource: [
      {
        source: "noaa_ndbc",
        workerRunId: "LWR-1",
        workerStatus: "failed",
        status: "failed",
        startedAt: "2026-06-03T11:00:00.000Z",
        completedAt: "2026-06-03T12:00:00.000Z",
        durationMs: 1000,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        runId: null,
        error: "fetch_failed",
        isStale: true,
        staleByMs: 1000,
        stationDiagnostics: [],
      },
    ],
    recentHistory: [
      {
        reportId: "1",
        workerRunId: "LWR-1",
        source: "noaa_ndbc",
        startedAt: "2026-06-03T11:00:00.000Z",
        completedAt: "2026-06-03T12:00:00.000Z",
        durationMs: 1000,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "failed",
        runId: null,
        error: "fetch_failed",
        workerStatus: "failed",
        stationDiagnostics: [],
      },
      {
        reportId: "2",
        workerRunId: "LWR-2",
        source: "noaa_ndbc",
        startedAt: "2026-06-03T10:00:00.000Z",
        completedAt: "2026-06-03T10:30:00.000Z",
        durationMs: 1000,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "failed",
        runId: null,
        error: "fetch_failed",
        workerStatus: "failed",
        stationDiagnostics: [],
      },
      {
        reportId: "3",
        workerRunId: "LWR-3",
        source: "noaa_ndbc",
        startedAt: "2026-06-03T09:00:00.000Z",
        completedAt: "2026-06-03T09:30:00.000Z",
        durationMs: 1000,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "failed",
        runId: null,
        error: "fetch_failed",
        workerStatus: "failed",
        stationDiagnostics: [],
      },
    ],
  };

  const result = buildCircuitBreakerSnapshot(snapshot);
  assert.equal(result.openCount, 1);
  assert.equal(result.sources[0]?.state, "open");
});
