/**
 * Ingestion scheduler — runs each source feed on its own interval.
 *
 * Intervals (env-configurable):
 *   NDBC:   every 20 min  (SCHEDULER_NDBC_INTERVAL_MS,   default 1 200 000 ms)
 *   CRW:    every 2 hours (SCHEDULER_CRW_INTERVAL_MS,    default 7 200 000 ms)
 *   IOOS:   every 45 min  (SCHEDULER_IOOS_INTERVAL_MS,   default 2 700 000 ms) — requires IOOS_ENABLED=true
 *   ERDDAP: every 45 min  (SCHEDULER_ERDDAP_INTERVAL_MS, default 2 700 000 ms) — requires ERDDAP_ENABLED=true
 *
 * Each source runs once immediately on startup, then repeats on its interval.
 * Per-source boolean locks prevent overlapping runs.
 * Every outcome is logged to stdout/stderr and persisted to live_ingestion_reports,
 * so getFeedHealth() reflects real ingestion state after each run.
 *
 * Run:  npx tsx src/workers/scheduler.ts
 * Dev:  pnpm --filter api ingest:scheduler
 */

import { runNdbcIngestion, type NdbcStationIngestionDiagnostic } from "../services/ingestion/run-ndbc";
import { runCrwIngestion } from "../services/ingestion/run-crw";
import { runIoosIngestion } from "../services/ingestion/run-ioos";
import { runErddapIngestion } from "../services/ingestion/run-erddap";
import { persistLiveIngestionReport } from "../repositories/live-ingestion-reports";
import { CRW_SOURCE } from "../connectors/coral-reef-watch/constants";
import type {
  LiveFeedSource,
  SourceIngestionTelemetry,
  LiveFeedIngestionReport,
  OperationalRunStatus,
} from "./ingest-live-feeds";

// ─── Config ───────────────────────────────────────────────────────────────────

function envMs(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const NDBC_INTERVAL_MS   = envMs("SCHEDULER_NDBC_INTERVAL_MS",   20 * 60 * 1000);
const CRW_INTERVAL_MS    = envMs("SCHEDULER_CRW_INTERVAL_MS",     2 * 60 * 60 * 1000);
const IOOS_INTERVAL_MS   = envMs("SCHEDULER_IOOS_INTERVAL_MS",   45 * 60 * 1000);
const ERDDAP_INTERVAL_MS = envMs("SCHEDULER_ERDDAP_INTERVAL_MS", 45 * 60 * 1000);

const IOOS_ENABLED   = String(process.env.IOOS_ENABLED   ?? "false").trim().toLowerCase() === "true";
const ERDDAP_ENABLED = String(process.env.ERDDAP_ENABLED ?? "false").trim().toLowerCase() === "true";

// ─── Logging ──────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

function log(level: "info" | "warn" | "error", source: string, message: string): void {
  const line = `[scheduler] ${ts()} [${source}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ─── Per-source overlap locks ─────────────────────────────────────────────────

const running: Partial<Record<LiveFeedSource, boolean>> = {};

// ─── Runner wrapper ───────────────────────────────────────────────────────────

type SourceRunnerResult = {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<string, number>;
  error?: string | null;
  stationDiagnostics?: NdbcStationIngestionDiagnostic[];
};

async function runAndPersist(
  source: LiveFeedSource,
  runner: () => Promise<SourceRunnerResult>,
): Promise<void> {
  if (running[source]) {
    log("warn", source, "skipping — previous run still in progress");
    return;
  }

  running[source] = true;
  log("info", source, "starting");
  const startedAtMs = Date.now();
  let telemetry: SourceIngestionTelemetry;

  try {
    const result = await runner();
    const completedAtMs = Date.now();

    const operationalStatus: OperationalRunStatus =
      result.status === "failed"
        ? "failed"
        : result.rejectedRows > 0 || result.status === "completed_with_rejections"
          ? "partial"
          : "success";

    telemetry = {
      source,
      started_at: new Date(startedAtMs).toISOString(),
      completed_at: new Date(completedAtMs).toISOString(),
      duration_ms: completedAtMs - startedAtMs,
      inserted_count: result.insertedRows,
      rejected_count: result.rejectedRows,
      rejection_reasons: { ...result.rejectionReasons },
      status: operationalStatus,
      run_id: result.runId,
      error: result.status === "failed" ? (result.error ?? `${source} ingestion failed`) : null,
      station_diagnostics: result.stationDiagnostics,
    };

    log(
      operationalStatus === "failed" ? "error" : operationalStatus === "partial" ? "warn" : "info",
      source,
      `completed status=${operationalStatus} inserted=${result.insertedRows} rejected=${result.rejectedRows} duration=${completedAtMs - startedAtMs}ms`,
    );
  } catch (error) {
    const completedAtMs = Date.now();
    const message = error instanceof Error ? error.message : String(error);
    log("error", source, `unhandled error: ${message}`);

    telemetry = {
      source,
      started_at: new Date(startedAtMs).toISOString(),
      completed_at: new Date(completedAtMs).toISOString(),
      duration_ms: completedAtMs - startedAtMs,
      inserted_count: 0,
      rejected_count: 0,
      rejection_reasons: {},
      status: "failed",
      run_id: null,
      error: message,
    };
  } finally {
    running[source] = false;
  }

  const report: LiveFeedIngestionReport = {
    started_at: telemetry.started_at,
    completed_at: telemetry.completed_at,
    duration_ms: telemetry.duration_ms,
    status: telemetry.status,
    runs: [telemetry],
    inserted_count: telemetry.inserted_count,
    rejected_count: telemetry.rejected_count,
    rejection_reasons: { ...telemetry.rejection_reasons },
  };

  try {
    await persistLiveIngestionReport(report);
  } catch (persistError) {
    const message = persistError instanceof Error ? persistError.message : String(persistError);
    log("error", source, `report persistence failed: ${message}`);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

function scheduleSource(
  source: LiveFeedSource,
  runner: () => Promise<SourceRunnerResult>,
  intervalMs: number,
): void {
  log("info", source, `scheduled interval=${intervalMs / 60_000}m — running immediately`);
  void runAndPersist(source, runner);
  setInterval(() => void runAndPersist(source, runner), intervalMs);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function start(): void {
  log("info", "scheduler", [
    "starting",
    `NDBC=${NDBC_INTERVAL_MS / 60_000}m`,
    `CRW=${CRW_INTERVAL_MS / 60_000}m`,
    IOOS_ENABLED   ? `IOOS=${IOOS_INTERVAL_MS / 60_000}m`   : "IOOS=disabled",
    ERDDAP_ENABLED ? `ERDDAP=${ERDDAP_INTERVAL_MS / 60_000}m` : "ERDDAP=disabled",
  ].join(" "));

  scheduleSource("noaa_ndbc", runNdbcIngestion, NDBC_INTERVAL_MS);
  scheduleSource(CRW_SOURCE,  runCrwIngestion,  CRW_INTERVAL_MS);

  if (IOOS_ENABLED) {
    scheduleSource("ioos_regional", runIoosIngestion, IOOS_INTERVAL_MS);
  }

  if (ERDDAP_ENABLED) {
    scheduleSource("ioos_erddap", runErddapIngestion, ERDDAP_INTERVAL_MS);
  }
}

start();
