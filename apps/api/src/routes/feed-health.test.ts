import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedHealthRouteResponse } from "./feed-health";
import type { LiveIngestionHealthSnapshotReadResult } from "../repositories/live-ingestion-reports";

const DB_READ_RESULT: LiveIngestionHealthSnapshotReadResult = {
  source: "db",
  snapshot: {
    generatedAt: "2026-03-18T12:10:00.000Z",
    staleAfterMs: 21600000,
    summary: {
      latestSourceCount: 2,
      healthySourceCount: 1,
      degradedSourceCount: 1,
      failedSourceCount: 0,
      staleSourceCount: 1,
      insertedCount: 8,
      rejectedCount: 1,
      recentHistoryCount: 2,
      lastCompletedAt: "2026-03-18T12:00:00.000Z",
    },
    latestBySource: [
      {
        source: "noaa_coral_reef_watch",
        workerRunId: "LWR-200",
        workerStatus: "success",
        status: "success",
        startedAt: "2026-03-18T11:58:10.000Z",
        completedAt: "2026-03-18T12:00:00.000Z",
        durationMs: 110000,
        insertedCount: 6,
        rejectedCount: 0,
        rejectionReasons: {},
        runId: "ING-CRW-200",
        error: null,
        isStale: false,
        staleByMs: null,
      },
      {
        source: "noaa_ndbc",
        workerRunId: "LWR-199",
        workerStatus: "partial",
        status: "partial",
        startedAt: "2026-03-18T08:00:10.000Z",
        completedAt: "2026-03-18T08:01:00.000Z",
        durationMs: 50000,
        insertedCount: 2,
        rejectedCount: 1,
        rejectionReasons: {
          timestamp_stale: 1,
        },
        runId: "ING-NDBC-199",
        error: null,
        isStale: true,
        staleByMs: 14340000,
      },
    ],
    recentHistory: [
      {
        reportId: "LRP-NDBC-1",
        workerRunId: "LWR-199",
        source: "noaa_ndbc",
        startedAt: "2026-03-18T08:00:10.000Z",
        completedAt: "2026-03-18T08:01:00.000Z",
        durationMs: 50000,
        insertedCount: 2,
        rejectedCount: 1,
        rejectionReasons: {
          timestamp_stale: 1,
        },
        status: "partial",
        runId: "ING-NDBC-199",
        error: null,
        workerStatus: "partial",
      },
      {
        reportId: "LRP-CRW-1",
        workerRunId: "LWR-200",
        source: "noaa_coral_reef_watch",
        startedAt: "2026-03-18T11:58:10.000Z",
        completedAt: "2026-03-18T12:00:00.000Z",
        durationMs: 110000,
        insertedCount: 6,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "success",
        runId: "ING-CRW-200",
        error: null,
        workerStatus: "success",
      },
    ],
  },
};

test("feed-health route exposes latest status per source", () => {
  const response = buildFeedHealthRouteResponse(DB_READ_RESULT);

  assert.equal(response.status, 200);
  assert.equal(response.json.source, "db");
  assert.equal(response.json.latest_status_by_source.length, 2);
  assert.equal(response.json.latest_status_by_source[0]?.source, "noaa_coral_reef_watch");
  assert.equal(response.json.latest_status_by_source[1]?.worker_status, "partial");
  assert.equal(response.json.latest_status_by_source[1]?.inserted_count, 2);
  assert.equal(response.json.latest_status_by_source[1]?.rejected_count, 1);
  assert.equal(response.json.latest_status_by_source[1]?.run_id, "ING-NDBC-199");
  assert.equal(response.json.latest_status_by_source[1]?.worker_run_id, "LWR-199");
  assert.equal(response.json.latest_status_by_source[1]?.is_stale, true);
});

test("feed-health route exposes recent history list", () => {
  const response = buildFeedHealthRouteResponse(DB_READ_RESULT);

  assert.equal(response.json.recent_history.length, 2);
  assert.equal(response.json.recent_history[0]?.source, "noaa_ndbc");
  assert.equal(response.json.recent_history[0]?.worker_status, "partial");
  assert.equal(response.json.recent_history[0]?.duration_ms, 50000);
  assert.equal(response.json.recent_history[0]?.error, null);
  assert.equal(response.telemetry.historyCount, 2);
});

test("feed-health route returns safe empty state for db source with no rows", () => {
  const response = buildFeedHealthRouteResponse({
    source: "db",
    snapshot: {
      generatedAt: "2026-03-18T12:10:00.000Z",
      staleAfterMs: 21600000,
      summary: {
        latestSourceCount: 0,
        healthySourceCount: 0,
        degradedSourceCount: 0,
        failedSourceCount: 0,
        staleSourceCount: 0,
        insertedCount: 0,
        rejectedCount: 0,
        recentHistoryCount: 0,
        lastCompletedAt: null,
      },
      latestBySource: [],
      recentHistory: [],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.source, "db");
  assert.equal(response.json.latest_status_by_source.length, 0);
  assert.equal(response.json.recent_history.length, 0);
  assert.equal(response.json.summary.latest_source_count, 0);
  assert.equal(response.json.summary.last_completed_at, null);
});

test("feed-health route returns unavailable fallback metadata with empty payload", () => {
  const response = buildFeedHealthRouteResponse({
    source: "unavailable",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.source, "unavailable");
  assert.equal(response.json.fallback_reason, "db_path_missing");
  assert.equal(response.json.latest_status_by_source.length, 0);
  assert.equal(response.json.recent_history.length, 0);
  assert.equal(response.telemetry.source, "unavailable");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
});

test("feed-health route contract shape remains stable across db and unavailable states", () => {
  const dbResponse = buildFeedHealthRouteResponse(DB_READ_RESULT);
  const unavailableResponse = buildFeedHealthRouteResponse({
    source: "unavailable",
    fallbackReason: "db_query_failed",
  });

  assert.deepEqual(Object.keys(dbResponse.json).sort(), [
    "fallback_reason",
    "generated_at",
    "latest_status_by_source",
    "recent_history",
    "source",
    "stale_after_ms",
    "summary",
  ]);

  assert.deepEqual(Object.keys(unavailableResponse.json).sort(), [
    "fallback_reason",
    "generated_at",
    "latest_status_by_source",
    "recent_history",
    "source",
    "stale_after_ms",
    "summary",
  ]);

  assert.deepEqual(Object.keys(dbResponse.json.summary).sort(), [
    "degraded_source_count",
    "failed_source_count",
    "healthy_source_count",
    "inserted_count",
    "last_completed_at",
    "latest_source_count",
    "recent_history_count",
    "rejected_count",
    "stale_source_count",
  ]);
});
