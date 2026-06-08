// Phase 7: ingestion resilience under hostile upstream failures
import test from "node:test";
import assert from "node:assert/strict";
import { ingestLiveFeeds } from "./ingest-live-feeds";

test("ingestLiveFeeds records failed NDBC run without inserting rows", async () => {
  const report = await ingestLiveFeeds({
    runNdbc: async () => {
      throw new Error("NDBC_HOSTILE_FAILURE");
    },
    runCrw: async () => ({
      runId: "CRW-1",
      status: "completed",
      insertedRows: 1,
      rejectedRows: 0,
      rejectionReasons: {},
    }),
    ioosEnabled: false,
    erddapEnabled: false,
    persistReport: async () => {},
  });

  const ndbc = report.runs.find((run) => run.source === "noaa_ndbc");
  assert.ok(ndbc);
  assert.equal(ndbc.status, "failed");
  assert.equal(ndbc.inserted_count, 0);
  assert.match(ndbc.error ?? "", /NDBC_HOSTILE_FAILURE/);
});

test("ingestLiveFeeds is race-safe when parallel runs use isolated dependencies", async () => {
  let counter = 0;

  const report = await Promise.all([
    ingestLiveFeeds({
      runNdbc: async () => {
        counter += 1;
        return {
          runId: `NDBC-${counter}`,
          status: "completed",
          insertedRows: 1,
          rejectedRows: 0,
          rejectionReasons: {},
          stationDiagnostics: [],
        };
      },
      runCrw: async () => ({
        runId: "CRW-1",
        status: "completed",
        insertedRows: 1,
        rejectedRows: 0,
        rejectionReasons: {},
      }),
      ioosEnabled: false,
      erddapEnabled: false,
      persistReport: async () => {},
    }),
    ingestLiveFeeds({
      runNdbc: async () => {
        counter += 1;
        return {
          runId: `NDBC-${counter}`,
          status: "completed",
          insertedRows: 1,
          rejectedRows: 0,
          rejectionReasons: {},
          stationDiagnostics: [],
        };
      },
      runCrw: async () => ({
        runId: "CRW-2",
        status: "completed",
        insertedRows: 1,
        rejectedRows: 0,
        rejectionReasons: {},
      }),
      ioosEnabled: false,
      erddapEnabled: false,
      persistReport: async () => {},
    }),
  ]);

  assert.equal(report.length, 2);
  assert.ok(report.every((item) => item.runs.length >= 2));
});
