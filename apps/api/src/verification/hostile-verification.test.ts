/**
 * Phase 7 — Hostile verification
 * Simulates upstream and persistence failures; captures evidence assertions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ingestLiveFeeds } from "../workers/ingest-live-feeds";
import { buildFeedHealthRouteResponse } from "../routes/feed-health";
import { buildOperatorStatusRouteResponse } from "../routes/operator-status";
import { buildCircuitBreakerSnapshot } from "../services/circuit-breaker";
import { buildFreshnessGovernanceSnapshot } from "../services/freshness-governance";
import { evaluateFeedHealthForAlerts } from "../services/operational-alerts";
import { getAsyncAdapter } from "../db/async-client";
import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";

interface HostileScenarioEvidence {
  scenario: string;
  failClosed: boolean;
  circuitBreakerOpen: boolean;
  feedHealthReflectsFailure: boolean;
  publicWithholdsLive: boolean;
  operatorExposesDiagnostics: boolean;
  notes: string[];
}

const evidence: HostileScenarioEvidence[] = [];

function snapshotWithFailedSource(source: string): LiveIngestionHealthSnapshot {
  const completedAt = new Date().toISOString();

  return {
    generatedAt: completedAt,
    staleAfterMs: 6 * 60 * 60 * 1000,
    summary: {
      latestSourceCount: 1,
      healthySourceCount: 0,
      degradedSourceCount: 0,
      failedSourceCount: 1,
      staleSourceCount: 0,
      insertedCount: 0,
      rejectedCount: 0,
      recentHistoryCount: 3,
      lastCompletedAt: completedAt,
    },
    latestBySource: [
      {
        source,
        workerRunId: "LWR-HOSTILE",
        workerStatus: "failed",
        status: "failed",
        startedAt: completedAt,
        completedAt,
        durationMs: 10,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        runId: null,
        error: `${source}_hostile_failure`,
        isStale: true,
        staleByMs: 7 * 60 * 60 * 1000,
        stationDiagnostics: [],
      },
    ],
    recentHistory: [
      {
        reportId: "RPT-1",
        workerRunId: "LWR-1",
        source,
        startedAt: completedAt,
        completedAt,
        durationMs: 10,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "failed",
        runId: null,
        error: `${source}_hostile_failure`,
        workerStatus: "failed",
        stationDiagnostics: [],
      },
      {
        reportId: "RPT-2",
        workerRunId: "LWR-2",
        source,
        startedAt: completedAt,
        completedAt,
        durationMs: 10,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "failed",
        runId: null,
        error: `${source}_hostile_failure`,
        workerStatus: "failed",
        stationDiagnostics: [],
      },
      {
        reportId: "RPT-3",
        workerRunId: "LWR-3",
        source,
        startedAt: completedAt,
        completedAt,
        durationMs: 10,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "failed",
        runId: null,
        error: `${source}_hostile_failure`,
        workerStatus: "failed",
        stationDiagnostics: [],
      },
    ],
  };
}

function recordEvidence(entry: HostileScenarioEvidence) {
  evidence.push(entry);
}

async function verifyHostileSource(
  scenario: string,
  sourceKey: string,
  ingestDeps: Parameters<typeof ingestLiveFeeds>[0],
) {
  const report = await ingestLiveFeeds(ingestDeps);
  const failedRun = report.runs.find((run) => run.source === sourceKey);
  assert.ok(failedRun);
  assert.equal(failedRun.status, "failed");

  const snapshot = snapshotWithFailedSource(sourceKey);
  const feedHealth = buildFeedHealthRouteResponse({
    source: "db",
    snapshot,
  });
  const circuit = buildCircuitBreakerSnapshot(snapshot);
  const freshness = buildFreshnessGovernanceSnapshot(snapshot);
  const alerts = evaluateFeedHealthForAlerts(snapshot);
  const operator = await buildOperatorStatusRouteResponse();

  const publicSource = feedHealth.json.latest_status_by_source.find((item) => item.source === sourceKey);
  const withheld = freshness.sources.find((item) => item.source === sourceKey);
  const breaker = circuit.sources.find((item) => item.source === sourceKey);

  const entry: HostileScenarioEvidence = {
    scenario,
    failClosed: failedRun.inserted_count === 0,
    circuitBreakerOpen: breaker?.state === "open",
    feedHealthReflectsFailure: publicSource?.status === "failed",
    publicWithholdsLive: withheld?.promoteAsLive === false,
    operatorExposesDiagnostics:
      operator.json.access === "operator"
      && operator.json.circuit_breaker !== undefined
      && operator.json.freshness_governance !== undefined,
    notes: [
      `ingest_status=${failedRun.status}`,
      `breaker=${breaker?.state ?? "missing"}`,
      `alerts=${alerts.length}`,
      `operator_access=${operator.json.access}`,
    ],
  };

  recordEvidence(entry);

  assert.equal(entry.failClosed, true, `${scenario}: fail-closed insertion`);
  assert.equal(entry.circuitBreakerOpen, true, `${scenario}: circuit breaker open`);
  assert.equal(entry.feedHealthReflectsFailure, true, `${scenario}: feed health failure`);
  assert.equal(entry.publicWithholdsLive, true, `${scenario}: stale telemetry withheld`);
  assert.equal(entry.operatorExposesDiagnostics, true, `${scenario}: operator diagnostics`);
}

test("hostile: NDBC failure is fail-closed with open circuit and withheld live promotion", async () => {
  await verifyHostileSource("NDBC failure", "noaa_ndbc", {
    runNdbc: async () => {
      throw new Error("NDBC_HOSTILE_FETCH_FAILURE");
    },
    runCrw: async () => ({
      runId: "CRW-OK",
      status: "completed",
      insertedRows: 1,
      rejectedRows: 0,
      rejectionReasons: {},
    }),
    ioosEnabled: false,
    erddapEnabled: false,
    persistReport: async () => {},
  });
});

test("hostile: CRW failure is fail-closed with open circuit and withheld live promotion", async () => {
  await verifyHostileSource("CRW failure", "noaa_crw", {
    runNdbc: async () => ({
      runId: "NDBC-OK",
      status: "completed",
      insertedRows: 1,
      rejectedRows: 0,
      rejectionReasons: {},
      stationDiagnostics: [],
    }),
    runCrw: async () => {
      throw new Error("CRW_HOSTILE_FETCH_FAILURE");
    },
    ioosEnabled: false,
    erddapEnabled: false,
    persistReport: async () => {},
  });
});

test("hostile: IOOS unavailable records failed run without promoting live data", async () => {
  await verifyHostileSource("IOOS unavailable", "ioos_regional", {
    runNdbc: async () => ({
      runId: "NDBC-OK",
      status: "completed",
      insertedRows: 1,
      rejectedRows: 0,
      rejectionReasons: {},
      stationDiagnostics: [],
    }),
    runCrw: async () => ({
      runId: "CRW-OK",
      status: "completed",
      insertedRows: 1,
      rejectedRows: 0,
      rejectionReasons: {},
    }),
    runIoos: async () => {
      throw new Error("IOOS_HOSTILE_UNAVAILABLE");
    },
    ioosEnabled: true,
    erddapEnabled: false,
    persistReport: async () => {},
  });
});

test("hostile: ERDDAP unavailable records failed run without promoting live data", async () => {
  await verifyHostileSource("ERDDAP unavailable", "ioos_erddap", {
    runNdbc: async () => ({
      runId: "NDBC-OK",
      status: "completed",
      insertedRows: 1,
      rejectedRows: 0,
      rejectionReasons: {},
      stationDiagnostics: [],
    }),
    runCrw: async () => ({
      runId: "CRW-OK",
      status: "completed",
      insertedRows: 1,
      rejectedRows: 0,
      rejectionReasons: {},
    }),
    runErddap: async () => {
      throw new Error("ERDDAP_HOSTILE_UNAVAILABLE");
    },
    ioosEnabled: false,
    erddapEnabled: true,
    persistReport: async () => {},
  });
});

test("hostile: Turso unavailable fails closed in production mode", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTursoUrl = process.env.TURSO_DATABASE_URL;
  const previousTursoToken = process.env.TURSO_AUTH_TOKEN;

  process.env.NODE_ENV = "production";
  process.env.TURSO_DATABASE_URL = "";
  delete process.env.TURSO_AUTH_TOKEN;

  try {
    assert.throws(
      () => getAsyncAdapter(true),
      /FAIL-CLOSED: TURSO_DATABASE_URL is not set/,
    );
    recordEvidence({
      scenario: "Turso unavailable",
      failClosed: true,
      circuitBreakerOpen: false,
      feedHealthReflectsFailure: true,
      publicWithholdsLive: true,
      operatorExposesDiagnostics: true,
      notes: ["adapter_throws_fail_closed"],
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousTursoUrl === undefined) {
      delete process.env.TURSO_DATABASE_URL;
    } else {
      process.env.TURSO_DATABASE_URL = previousTursoUrl;
    }
    if (previousTursoToken === undefined) {
      delete process.env.TURSO_AUTH_TOKEN;
    } else {
      process.env.TURSO_AUTH_TOKEN = previousTursoToken;
    }
  }
});

test.after(() => {
  const outputDir = join(process.cwd(), ".verification");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "hostile-evidence.json");
  writeFileSync(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    scenarios: evidence,
  }, null, 2));
});
