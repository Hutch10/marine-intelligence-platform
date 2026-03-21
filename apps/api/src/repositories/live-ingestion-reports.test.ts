import test from "node:test";
import assert from "node:assert/strict";
import {
  getLiveIngestionHealthSnapshot,
  listLatestLiveIngestionStatusBySource,
  listRecentLiveIngestionHistory,
  persistLiveIngestionReport,
  readLiveIngestionHealthSnapshotFromDb,
  readLatestLiveIngestionStatusBySourceFromDb,
  readRecentLiveIngestionHistoryFromDb,
} from "./live-ingestion-reports";
import type { SqliteDatabaseLike } from "../db/client";
import type { LiveFeedIngestionReport } from "../workers/ingest-live-feeds";

const SAMPLE_REPORT: LiveFeedIngestionReport = {
  started_at: "2026-03-18T10:00:00.000Z",
  completed_at: "2026-03-18T10:03:00.000Z",
  duration_ms: 180000,
  status: "partial",
  runs: [
    {
      source: "noaa_ndbc",
      started_at: "2026-03-18T10:00:05.000Z",
      completed_at: "2026-03-18T10:00:30.000Z",
      duration_ms: 25000,
      inserted_count: 2,
      rejected_count: 1,
      rejection_reasons: {
        timestamp_stale: 1,
        impossible_values: 0,
        duplicate_row: 0,
      },
      status: "partial",
      run_id: "ING-NDBC-100",
      error: null,
    },
    {
      source: "noaa_coral_reef_watch",
      started_at: "2026-03-18T10:00:31.000Z",
      completed_at: "2026-03-18T10:01:50.000Z",
      duration_ms: 79000,
      inserted_count: 3,
      rejected_count: 0,
      rejection_reasons: {
        timestamp_stale: 0,
        impossible_values: 0,
        duplicate_record: 0,
        schema_drift: 0,
      },
      status: "success",
      run_id: "ING-CRW-100",
      error: null,
    },
    {
      source: "ioos_regional",
      started_at: "2026-03-18T10:01:51.000Z",
      completed_at: "2026-03-18T10:02:40.000Z",
      duration_ms: 49000,
      inserted_count: 4,
      rejected_count: 0,
      rejection_reasons: {
        timestamp_stale: 0,
        impossible_values: 0,
        duplicate_record: 0,
        schema_drift: 0,
      },
      status: "success",
      run_id: "ING-IOOS-100",
      error: null,
    },
  ],
  inserted_count: 9,
  rejected_count: 1,
  rejection_reasons: {
    timestamp_stale: 1,
    impossible_values: 0,
  },
};

function createWritableCaptureDatabase(captured: Array<{ sql: string; params: unknown[] }>): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        run(...params: unknown[]) {
          captured.push({ sql, params });
        },
        all() {
          return [];
        },
      };
    },
    close() {},
  };
}

function createReadDatabase(
  reportRows: unknown[] = [],
  latestRows: unknown[] = [],
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          void params;

          if (sql.includes("ORDER BY r.started_at DESC")) {
            return reportRows;
          }

          if (sql.includes("FROM live_ingestion_reports r") && sql.includes("GROUP BY source")) {
            return latestRows;
          }

          return [];
        },
      };
    },
    close() {},
  };
}

test("persistLiveIngestionReport writes worker and source report rows", () => {
  const captured: Array<{ sql: string; params: unknown[] }> = [];

  const result = persistLiveIngestionReport(SAMPLE_REPORT, {
    resolvePath: () => "marine.sqlite",
    openWritable: () => createWritableCaptureDatabase(captured),
    now: () => Date.parse("2026-03-18T10:02:01.000Z"),
  });

  assert.ok(result.workerRunId.startsWith("LWR-"));
  assert.equal(result.sourceReportIds.length, 3);

  const insertWorkerStatements = captured.filter((entry) =>
    entry.sql.includes("INSERT INTO live_ingestion_worker_runs"),
  );
  const insertSourceStatements = captured.filter((entry) =>
    entry.sql.includes("INSERT INTO live_ingestion_reports"),
  );

  assert.equal(insertWorkerStatements.length, 1);
  assert.equal(insertSourceStatements.length, 3);
});

test("readRecentLiveIngestionHistoryFromDb maps persisted history rows", () => {
  const history = readRecentLiveIngestionHistoryFromDb(
    createReadDatabase([
      {
        id: "LRP-noaa_ndbc-1",
        worker_run_id: "LWR-1",
        source: "noaa_ndbc",
        started_at: Date.parse("2026-03-18T10:00:05.000Z"),
        completed_at: Date.parse("2026-03-18T10:00:30.000Z"),
        duration_ms: 25000,
        inserted_count: 2,
        rejected_count: 1,
        rejection_reasons_json: "{\"timestamp_stale\":1}",
        status: "partial",
        run_id: "ING-NDBC-100",
        error: null,
        worker_status: "partial",
      },
    ]),
  );

  assert.equal(history.length, 1);
  assert.equal(history[0]?.source, "noaa_ndbc");
  assert.equal(history[0]?.rejectionReasons.timestamp_stale, 1);
  assert.equal(history[0]?.workerStatus, "partial");
});

test("readLatestLiveIngestionStatusBySourceFromDb maps latest source rows", () => {
  const latest = readLatestLiveIngestionStatusBySourceFromDb(
    createReadDatabase([], [
      {
        source: "noaa_coral_reef_watch",
        worker_run_id: "LWR-2",
        worker_status: "success",
        status: "success",
        started_at: Date.parse("2026-03-18T10:00:31.000Z"),
        completed_at: Date.parse("2026-03-18T10:01:50.000Z"),
        duration_ms: 79000,
        inserted_count: 3,
        rejected_count: 0,
        rejection_reasons_json: "{}",
        run_id: "ING-CRW-100",
        error: null,
      },
      {
        source: "ioos_regional",
        worker_run_id: "LWR-3",
        worker_status: "success",
        status: "success",
        started_at: Date.parse("2026-03-18T10:01:51.000Z"),
        completed_at: Date.parse("2026-03-18T10:02:40.000Z"),
        duration_ms: 49000,
        inserted_count: 4,
        rejected_count: 0,
        rejection_reasons_json: "{}",
        run_id: "ING-IOOS-100",
        error: null,
      },
    ]),
  );

  assert.equal(latest.length, 2);
  assert.equal(latest[0]?.source, "noaa_coral_reef_watch");
  assert.equal(latest[0]?.status, "success");
  assert.equal(latest[0]?.workerStatus, "success");
  assert.equal(latest[0]?.insertedCount, 3);
  assert.equal(latest[1]?.source, "ioos_regional");
  assert.equal(latest[1]?.status, "success");
  assert.equal(latest[1]?.insertedCount, 4);
});

test("listRecentLiveIngestionHistory returns unavailable when db path is missing", () => {
  const result = listRecentLiveIngestionHistory(50, {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, {
    source: "unavailable",
    fallbackReason: "db_path_missing",
  });
});

test("listLatestLiveIngestionStatusBySource returns db rows when query succeeds", () => {
  const result = listLatestLiveIngestionStatusBySource({
    resolvePath: () => "marine.sqlite",
    hasPath: () => true,
    openReadOnly: () =>
      createReadDatabase([], [
        {
          source: "noaa_ndbc",
          worker_run_id: "LWR-3",
          worker_status: "partial",
          status: "partial",
          started_at: Date.parse("2026-03-18T10:04:00.000Z"),
          completed_at: Date.parse("2026-03-18T10:04:20.000Z"),
          duration_ms: 20000,
          inserted_count: 1,
          rejected_count: 1,
          rejection_reasons_json: "{\"timestamp_stale\":1}",
          run_id: "ING-NDBC-101",
          error: null,
        },
      ]),
  });

  assert.equal(result.source, "db");

  if (result.source === "db") {
    assert.equal(result.latest.length, 1);
    assert.equal(result.latest[0]?.source, "noaa_ndbc");
    assert.equal(result.latest[0]?.workerStatus, "partial");
    assert.equal(result.latest[0]?.rejectionReasons.timestamp_stale, 1);
  }
});

test("readLiveIngestionHealthSnapshotFromDb returns summary and stale-source indicators", () => {
  const snapshot = readLiveIngestionHealthSnapshotFromDb(
    createReadDatabase(
      [
        {
          id: "LRP-noaa_ndbc-1",
          worker_run_id: "LWR-1",
          source: "noaa_ndbc",
          started_at: Date.parse("2026-03-18T08:00:05.000Z"),
          completed_at: Date.parse("2026-03-18T08:00:30.000Z"),
          duration_ms: 25000,
          inserted_count: 2,
          rejected_count: 1,
          rejection_reasons_json: "{\"timestamp_stale\":1}",
          status: "partial",
          run_id: "ING-NDBC-100",
          error: null,
          worker_status: "partial",
        },
      ],
      [
        {
          source: "noaa_ndbc",
          worker_run_id: "LWR-1",
          worker_status: "partial",
          status: "partial",
          started_at: Date.parse("2026-03-18T08:00:05.000Z"),
          completed_at: Date.parse("2026-03-18T08:00:30.000Z"),
          duration_ms: 25000,
          inserted_count: 2,
          rejected_count: 1,
          rejection_reasons_json: "{\"timestamp_stale\":1}",
          run_id: "ING-NDBC-100",
          error: null,
        },
        {
          source: "noaa_coral_reef_watch",
          worker_run_id: "LWR-2",
          worker_status: "success",
          status: "success",
          started_at: Date.parse("2026-03-18T10:00:31.000Z"),
          completed_at: Date.parse("2026-03-18T10:01:50.000Z"),
          duration_ms: 79000,
          inserted_count: 3,
          rejected_count: 0,
          rejection_reasons_json: "{}",
          run_id: "ING-CRW-100",
          error: null,
        },
      ],
    ),
    {
      limit: 10,
      staleAfterMs: 2 * 60 * 60 * 1000,
      now: () => Date.parse("2026-03-18T12:01:00.000Z"),
    },
  );

  assert.equal(snapshot.latestBySource.length, 2);
  assert.equal(snapshot.summary.latestSourceCount, 2);
  assert.equal(snapshot.summary.healthySourceCount, 1);
  assert.equal(snapshot.summary.degradedSourceCount, 1);
  assert.equal(snapshot.summary.staleSourceCount, 1);
  assert.equal(snapshot.summary.insertedCount, 5);
  assert.equal(snapshot.summary.rejectedCount, 1);
  assert.equal(snapshot.summary.recentHistoryCount, 1);

  const staleSource = snapshot.latestBySource.find((item) => item.source === "noaa_ndbc");
  assert.equal(staleSource?.isStale, true);
  assert.ok((staleSource?.staleByMs ?? 0) > 0);
});

test("getLiveIngestionHealthSnapshot returns unavailable when db open fails", () => {
  const result = getLiveIngestionHealthSnapshot(
    {},
    {
      resolvePath: () => "marine.sqlite",
      hasPath: () => true,
      openReadOnly: () => {
        throw new Error("cannot open");
      },
    },
  );

  assert.deepEqual(result, {
    source: "unavailable",
    fallbackReason: "db_open_failed",
  });
});
