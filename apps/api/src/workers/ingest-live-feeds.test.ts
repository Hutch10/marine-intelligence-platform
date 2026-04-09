import test from "node:test";
import assert from "node:assert/strict";
import {
  ingestLiveFeeds,
  runIngestLiveFeedsCli,
  type IngestLiveFeedsDependencies,
} from "./ingest-live-feeds";
import { CRW_SOURCE } from "../connectors/coral-reef-watch/constants";

function createNow(values: number[]): () => number {
  let index = 0;

  return () => {
    if (index >= values.length) {
      return values[values.length - 1] ?? 0;
    }

    const value = values[index]!;
    index += 1;
    return value;
  };
}

function createDependencies(overrides: Partial<IngestLiveFeedsDependencies> = {}): IngestLiveFeedsDependencies {
  return {
    now: createNow([1000, 1100, 1300, 1400, 1600, 1800]),
    ioosEnabled: false,
    runNdbc: async () => ({
      runId: "ING-NDBC-1",
      status: "completed",
      polledStations: 2,
      insertedRows: 2,
      rejectedRows: 0,
      rejectionReasons: {
        timestamp_stale: 0,
        impossible_values: 0,
        duplicate_row: 0,
        transient_failure: 0,
      },
      stationDiagnostics: [],
      finishedAt: "2026-03-18T00:00:00.000Z",
    }),
    runCrw: async () => ({
      runId: "ING-CRW-1",
      status: "completed_with_rejections",
      polledTargets: 2,
      insertedRows: 3,
      rejectedRows: 1,
      rejectionReasons: {
        timestamp_stale: 0,
        impossible_values: 1,
        duplicate_record: 0,
        schema_drift: 0,
      },
      finishedAt: "2026-03-18T00:05:00.000Z",
    }),
    runIoos: async () => ({
      runId: "ING-IOOS-1",
      status: "completed",
      polledSources: 1,
      insertedRows: 4,
      rejectedRows: 0,
      rejectionReasons: {
        timestamp_stale: 0,
        impossible_values: 0,
        duplicate_record: 0,
        schema_drift: 0,
      },
      finishedAt: "2026-03-18T00:08:00.000Z",
    }),
    persistReport: async () => {},
    ...overrides,
  };
}

test("ingestLiveFeeds keeps IOOS disabled by default and skips ioos run", async () => {
  let ioosExecuted = false;

  const report = await ingestLiveFeeds(
    createDependencies({
      ioosEnabled: false,
      runIoos: async () => {
        ioosExecuted = true;
        return {
          runId: "ING-IOOS-SHOULD-NOT-RUN",
          status: "completed",
          polledSources: 1,
          insertedRows: 1,
          rejectedRows: 0,
          rejectionReasons: {
            timestamp_stale: 0,
            impossible_values: 0,
            duplicate_record: 0,
            schema_drift: 0,
          },
          finishedAt: "2026-03-18T00:08:00.000Z",
        };
      },
    }),
  );

  assert.equal(ioosExecuted, false);
  assert.equal(report.runs.length, 2);
  assert.deepEqual(report.runs.map((run) => run.source), ["noaa_ndbc", CRW_SOURCE]);
});

test("ingestLiveFeeds runs IOOS after NDBC and CRW when enabled", async () => {
  const report = await ingestLiveFeeds(
    createDependencies({
      ioosEnabled: true,
      now: createNow([1000, 1100, 1300, 1400, 1600, 1700, 1900, 2100]),
      runCrw: async () => ({
        runId: "ING-CRW-S",
        status: "completed",
        polledTargets: 2,
        insertedRows: 3,
        rejectedRows: 0,
        rejectionReasons: {
          timestamp_stale: 0,
          impossible_values: 0,
          duplicate_record: 0,
          schema_drift: 0,
        },
        finishedAt: "2026-03-18T00:05:00.000Z",
      }),
      runIoos: async () => ({
        runId: "ING-IOOS-S",
        status: "completed",
        polledSources: 1,
        insertedRows: 4,
        rejectedRows: 0,
        rejectionReasons: {
          timestamp_stale: 0,
          impossible_values: 0,
          duplicate_record: 0,
          schema_drift: 0,
        },
        finishedAt: "2026-03-18T00:08:00.000Z",
      }),
    }),
  );

  assert.equal(report.runs.length, 3);
  assert.deepEqual(report.runs.map((run) => run.source), ["noaa_ndbc", CRW_SOURCE, "ioos_regional"]);
  assert.equal(report.runs[2]?.status, "success");
  assert.equal(report.inserted_count, 9);
  assert.equal(report.rejected_count, 0);
  assert.equal(report.status, "success");
});

test("ingestLiveFeeds marks report partial when IOOS fails but earlier sources succeed", async () => {
  const report = await ingestLiveFeeds(
    createDependencies({
      ioosEnabled: true,
      now: createNow([1000, 1100, 1300, 1400, 1600, 1700, 1900, 2100]),
      runCrw: async () => ({
        runId: "ING-CRW-S",
        status: "completed",
        polledTargets: 2,
        insertedRows: 3,
        rejectedRows: 0,
        rejectionReasons: {
          timestamp_stale: 0,
          impossible_values: 0,
          duplicate_record: 0,
          schema_drift: 0,
        },
        finishedAt: "2026-03-18T00:05:00.000Z",
      }),
      runIoos: async () => {
        throw new Error("IOOS upstream unavailable");
      },
    }),
  );

  assert.equal(report.runs.length, 3);
  assert.equal(report.runs[2]?.source, "ioos_regional");
  assert.equal(report.runs[2]?.status, "failed");
  assert.equal(report.runs[2]?.error, "IOOS upstream unavailable");
  assert.equal(report.status, "partial");
});

test("ingestLiveFeeds worker happy path emits per-source telemetry", async () => {
  const report = await ingestLiveFeeds(createDependencies());

  assert.equal(report.runs.length, 2);
  assert.equal(report.runs[0]?.source, "noaa_ndbc");
  assert.equal(report.runs[0]?.status, "success");
  assert.equal(report.runs[1]?.source, CRW_SOURCE);
  assert.equal(report.runs[1]?.status, "partial");
  assert.equal(report.inserted_count, 5);
  assert.equal(report.rejected_count, 1);
  assert.equal(report.status, "partial");
});

test("ingestLiveFeeds continues when one source throws and reports partial", async () => {
  let crwExecuted = false;

  const report = await ingestLiveFeeds(
    createDependencies({
      runNdbc: async () => {
        throw new Error("NDBC timeout");
      },
      runCrw: async () => {
        crwExecuted = true;

        return {
          runId: "ING-CRW-2",
          status: "completed",
          polledTargets: 2,
          insertedRows: 2,
          rejectedRows: 0,
          rejectionReasons: {
            timestamp_stale: 0,
            impossible_values: 0,
            duplicate_record: 0,
            schema_drift: 0,
          },
          finishedAt: "2026-03-18T00:05:00.000Z",
        };
      },
    }),
  );

  assert.equal(crwExecuted, true);
  assert.equal(report.status, "partial");
  assert.equal(report.runs[0]?.status, "failed");
  assert.equal(report.runs[0]?.error, "NDBC timeout");
  assert.equal(report.runs[1]?.status, "success");
});

test("ingestLiveFeeds preserves source-level error when a runner returns failed status directly", async () => {
  const report = await ingestLiveFeeds(
    createDependencies({
      runNdbc: async () => ({
        runId: "ING-NDBC-FAILED",
        status: "failed",
        polledStations: 2,
        insertedRows: 0,
        rejectedRows: 0,
        rejectionReasons: {
          timestamp_stale: 0,
          impossible_values: 0,
          duplicate_row: 0,
          transient_failure: 0,
        },
        stationDiagnostics: [],
        finishedAt: "2026-03-18T00:00:00.000Z",
        error: "NDBC station 46042 fetch returned no usable records from https://www.ndbc.noaa.gov/data/realtime2/46042.txt",
      }),
      runCrw: async () => ({
        runId: "ING-CRW-OK",
        status: "completed",
        polledTargets: 1,
        insertedRows: 1,
        rejectedRows: 0,
        rejectionReasons: {
          timestamp_stale: 0,
          impossible_values: 0,
          duplicate_record: 0,
          schema_drift: 0,
        },
        finishedAt: "2026-03-18T00:05:00.000Z",
        error: null,
      }),
    }),
  );

  assert.equal(report.status, "partial");
  assert.equal(report.runs[0]?.status, "failed");
  assert.equal(
    report.runs[0]?.error,
    "NDBC station 46042 fetch returned no usable records from https://www.ndbc.noaa.gov/data/realtime2/46042.txt",
  );
});

test("ingestLiveFeeds telemetry payload includes required operational fields", async () => {
  const report = await ingestLiveFeeds(createDependencies());

  const ndbc = report.runs[0]!;

  assert.equal(typeof ndbc.source, "string");
  assert.equal(typeof ndbc.started_at, "string");
  assert.equal(typeof ndbc.completed_at, "string");
  assert.equal(typeof ndbc.duration_ms, "number");
  assert.equal(typeof ndbc.inserted_count, "number");
  assert.equal(typeof ndbc.rejected_count, "number");
  assert.equal(typeof ndbc.rejection_reasons, "object");
  assert.equal(typeof ndbc.status, "string");
});

test("ingestLiveFeeds aggregates rejection reasons across sources", async () => {
  const report = await ingestLiveFeeds(
    createDependencies({
      ioosEnabled: true,
      now: createNow([1000, 1100, 1300, 1400, 1600, 1700, 1900, 2100]),
      runNdbc: async () => ({
        runId: "ING-NDBC-3",
        status: "completed_with_rejections",
        polledStations: 2,
        insertedRows: 1,
        rejectedRows: 2,
        rejectionReasons: {
          timestamp_stale: 1,
          impossible_values: 1,
          duplicate_row: 0,
          transient_failure: 0,
        },
        stationDiagnostics: [],
        finishedAt: "2026-03-18T00:00:00.000Z",
      }),
      runCrw: async () => ({
        runId: "ING-CRW-3",
        status: "completed_with_rejections",
        polledTargets: 2,
        insertedRows: 2,
        rejectedRows: 2,
        rejectionReasons: {
          timestamp_stale: 0,
          impossible_values: 1,
          duplicate_record: 0,
          schema_drift: 1,
        },
        finishedAt: "2026-03-18T00:05:00.000Z",
      }),
      runIoos: async () => ({
        runId: "ING-IOOS-3",
        status: "completed_with_rejections",
        polledSources: 1,
        insertedRows: 1,
        rejectedRows: 2,
        rejectionReasons: {
          timestamp_stale: 1,
          impossible_values: 0,
          duplicate_record: 1,
          schema_drift: 0,
        },
        finishedAt: "2026-03-18T00:08:00.000Z",
      }),
    }),
  );

  assert.equal(report.runs.length, 3);
  assert.equal(report.inserted_count, 4);
  assert.equal(report.rejected_count, 6);
  assert.equal(report.rejection_reasons.timestamp_stale, 2);
  assert.equal(report.rejection_reasons.impossible_values, 2);
  assert.equal(report.rejection_reasons.schema_drift, 1);
  assert.equal(report.rejection_reasons.duplicate_record, 1);
});

test("runIngestLiveFeedsCli writes report and sets exit code", async () => {
  const lines: string[] = [];
  let exitCode: number | null = null;

  const report = await runIngestLiveFeedsCli({
    ...createDependencies(),
    writeLine: (line) => {
      lines.push(line);
    },
    setExitCode: (code) => {
      exitCode = code;
    },
  });

  assert.equal(lines.length, 1);
  const printed = JSON.parse(lines[0]!);
  assert.equal(printed.status, report.status);
  assert.equal(exitCode, 0);
});

test("ingestLiveFeeds persists the aggregated report", async () => {
  const persisted: Array<{ status: string; runCount: number }> = [];

  const report = await ingestLiveFeeds(
    createDependencies({
      persistReport: async (value) => {
        persisted.push({ status: value.status, runCount: value.runs.length });
      },
    }),
  );

  assert.equal(report.runs.length, 2);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.status, "partial");
  assert.equal(persisted[0]?.runCount, 2);
});

test("ingestLiveFeeds persistence payload includes IOOS source when enabled", async () => {
  const persisted: Array<{ sources: string[]; inserted: number; rejected: number }> = [];

  const report = await ingestLiveFeeds(
    createDependencies({
      ioosEnabled: true,
      now: createNow([1000, 1100, 1300, 1400, 1600, 1700, 1900, 2100]),
      runCrw: async () => ({
        runId: "ING-CRW-S",
        status: "completed",
        polledTargets: 2,
        insertedRows: 3,
        rejectedRows: 0,
        rejectionReasons: {
          timestamp_stale: 0,
          impossible_values: 0,
          duplicate_record: 0,
          schema_drift: 0,
        },
        finishedAt: "2026-03-18T00:05:00.000Z",
      }),
      persistReport: async (value) => {
        persisted.push({
          sources: value.runs.map((run) => run.source),
          inserted: value.inserted_count,
          rejected: value.rejected_count,
        });
      },
    }),
  );

  assert.equal(report.runs.length, 3);
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0]?.sources, ["noaa_ndbc", CRW_SOURCE, "ioos_regional"]);
  assert.equal(persisted[0]?.inserted, 9);
  assert.equal(persisted[0]?.rejected, 0);
});

test("ingestLiveFeeds surfaces persistence failures via callback without losing report", async () => {
  let callbackInvoked = false;

  const report = await ingestLiveFeeds(
    createDependencies({
      persistReport: async () => {
        throw new Error("write failed");
      },
      onPersistenceFailure: (error) => {
        callbackInvoked = true;
        assert.equal(error.message, "write failed");
      },
    }),
  );

  assert.equal(callbackInvoked, true);
  assert.equal(report.runs.length, 2);
});

test("runIngestLiveFeedsCli emits explicit persistence failure line and exit code 2", async () => {
  const lines: string[] = [];
  let exitCode: number | null = null;

  const report = await runIngestLiveFeedsCli({
    ...createDependencies({
      persistReport: async () => {
        throw new Error("storage down");
      },
    }),
    writeLine: (line) => {
      lines.push(line);
    },
    setExitCode: (code) => {
      exitCode = code;
    },
  });

  assert.equal(report.status, "partial");
  assert.equal(lines.length, 2);
  assert.ok(lines[1]?.includes("report persistence failed"));
  assert.equal(exitCode, 2);
});

test("runIngestLiveFeedsCli sets failure exit code when all sources fail", async () => {
  let exitCode: number | null = null;

  const report = await runIngestLiveFeedsCli({
    now: createNow([1000, 1100, 1200, 1300, 1400, 1500]),
    runNdbc: async () => {
      throw new Error("NDBC down");
    },
    runCrw: async () => {
      throw new Error("CRW down");
    },
    persistReport: async () => {},
    writeLine: () => {},
    setExitCode: (code) => {
      exitCode = code;
    },
  });

  assert.equal(report.status, "failed");
  assert.equal(exitCode, 1);
});
