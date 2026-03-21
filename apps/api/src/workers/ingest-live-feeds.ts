import {
  runNdbcIngestion,
  type RunNdbcIngestionResult,
} from "../services/ingestion/run-ndbc";
import {
  runCrwIngestion,
  type RunCrwIngestionResult,
} from "../services/ingestion/run-crw";
import {
  runIoosIngestion,
  type RunIoosIngestionResult,
} from "../services/ingestion/run-ioos";
import { persistLiveIngestionReport } from "../repositories/live-ingestion-reports";

export type LiveFeedSource = "noaa_ndbc" | "noaa_coral_reef_watch" | "ioos_regional";
export type OperationalRunStatus = "success" | "partial" | "failed";

export interface SourceIngestionTelemetry {
  source: LiveFeedSource;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  inserted_count: number;
  rejected_count: number;
  rejection_reasons: Record<string, number>;
  status: OperationalRunStatus;
  run_id: string | null;
  error: string | null;
}

export interface LiveFeedIngestionReport {
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: OperationalRunStatus;
  runs: SourceIngestionTelemetry[];
  inserted_count: number;
  rejected_count: number;
  rejection_reasons: Record<string, number>;
}

interface SourceExecutionResult {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<string, number>;
}

export interface IngestLiveFeedsDependencies {
  now?: () => number;
  runNdbc?: () => Promise<RunNdbcIngestionResult>;
  runCrw?: () => Promise<RunCrwIngestionResult>;
  runIoos?: () => Promise<RunIoosIngestionResult>;
  ioosEnabled?: boolean;
  persistReport?: (report: LiveFeedIngestionReport) => void | Promise<void>;
  onPersistenceFailure?: (error: Error, report: LiveFeedIngestionReport) => void;
  evaluateAlerts?: (snapshot: any) => Promise<void>;
}

export interface IngestLiveFeedsCliDependencies extends IngestLiveFeedsDependencies {
  writeLine?: (line: string) => void;
  setExitCode?: (code: number) => void;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function isIoosEnabled(env = process.env): boolean {
  return String(env.IOOS_ENABLED ?? "false").trim().toLowerCase() === "true";
}

function normalizeStatus(result: SourceExecutionResult): OperationalRunStatus {
  if (result.status === "failed") {
    return "failed";
  }

  if (result.rejectedRows > 0 || result.status === "completed_with_rejections") {
    return "partial";
  }

  return "success";
}

function aggregateRejectionReasons(
  allReasons: Array<Record<string, number>>,
): Record<string, number> {
  const aggregate: Record<string, number> = {};

  for (const reasons of allReasons) {
    for (const [reason, count] of Object.entries(reasons)) {
      if (count <= 0) {
        continue;
      }

      aggregate[reason] = (aggregate[reason] ?? 0) + count;
    }
  }

  return aggregate;
}

function summarizeOverallStatus(runs: SourceIngestionTelemetry[]): OperationalRunStatus {
  const failedCount = runs.filter((run) => run.status === "failed").length;

  if (failedCount === runs.length) {
    return "failed";
  }

  if (failedCount > 0 || runs.some((run) => run.status === "partial")) {
    return "partial";
  }

  return "success";
}

async function executeSource(
  source: LiveFeedSource,
  execute: () => Promise<SourceExecutionResult>,
  now: () => number,
): Promise<SourceIngestionTelemetry> {
  const startedAtMs = now();

  try {
    const result = await execute();
    const completedAtMs = now();

    return {
      source,
      started_at: toIso(startedAtMs),
      completed_at: toIso(completedAtMs),
      duration_ms: Math.max(0, completedAtMs - startedAtMs),
      inserted_count: result.insertedRows,
      rejected_count: result.rejectedRows,
      rejection_reasons: { ...result.rejectionReasons },
      status: normalizeStatus(result),
      run_id: result.runId,
      error: null,
    };
  } catch (error) {
    const completedAtMs = now();

    return {
      source,
      started_at: toIso(startedAtMs),
      completed_at: toIso(completedAtMs),
      duration_ms: Math.max(0, completedAtMs - startedAtMs),
      inserted_count: 0,
      rejected_count: 0,
      rejection_reasons: {},
      status: "failed",
      run_id: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function ingestLiveFeeds(
  dependencies: IngestLiveFeedsDependencies = {},
): Promise<LiveFeedIngestionReport> {
  const now = dependencies.now ?? Date.now;
  const runNdbc = dependencies.runNdbc ?? runNdbcIngestion;
  const runCrw = dependencies.runCrw ?? runCrwIngestion;
  const runIoos = dependencies.runIoos ?? runIoosIngestion;
  const ioosEnabled = dependencies.ioosEnabled ?? isIoosEnabled();
  const persistReport = dependencies.persistReport ?? persistLiveIngestionReport;
  const onPersistenceFailure = dependencies.onPersistenceFailure;

  const startedAtMs = now();

  const runs: SourceIngestionTelemetry[] = [];

  // Preserve deterministic execution order for operational traceability.
  runs.push(await executeSource("noaa_ndbc", runNdbc, now));
  runs.push(await executeSource("noaa_coral_reef_watch", runCrw, now));

  if (ioosEnabled) {
    runs.push(await executeSource("ioos_regional", runIoos, now));
  }

  const completedAtMs = now();

  const insertedCount = runs.reduce((sum, run) => sum + run.inserted_count, 0);
  const rejectedCount = runs.reduce((sum, run) => sum + run.rejected_count, 0);
  const rejectionReasons = aggregateRejectionReasons(runs.map((run) => run.rejection_reasons));

  const report: LiveFeedIngestionReport = {
    started_at: toIso(startedAtMs),
    completed_at: toIso(completedAtMs),
    duration_ms: Math.max(0, completedAtMs - startedAtMs),
    status: summarizeOverallStatus([...runs]),
    runs: [...runs],
    inserted_count: insertedCount,
    rejected_count: rejectedCount,
    rejection_reasons: rejectionReasons,
  };

  try {
    await persistReport(report);

    // Trigger alert evaluation after successful persistence
    if (dependencies.evaluateAlerts) {
      try {
        // Get the latest health snapshot to evaluate for alerts
        const runtimeRequire = eval("require") as NodeRequire;
        const { getLiveIngestionHealthSnapshot } = runtimeRequire("../repositories/live-ingestion-reports") as {
          getLiveIngestionHealthSnapshot: (options: { limit: number; staleAfterMs: number }) => any;
        };
        const snapshotResult = getLiveIngestionHealthSnapshot({ limit: 20, staleAfterMs: 6 * 60 * 60 * 1000 });
        if (snapshotResult.source === "db") {
          await dependencies.evaluateAlerts(snapshotResult.snapshot);
        }
      } catch (alertError) {
        // Log but don't fail the worker if alert evaluation fails
        console.warn("[ingest:live] Alert evaluation failed:", alertError);
      }
    }
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    onPersistenceFailure?.(normalized, report);
  }

  return report;
}

export async function runIngestLiveFeedsCli(
  dependencies: IngestLiveFeedsCliDependencies = {},
): Promise<LiveFeedIngestionReport> {
  const writeLine = dependencies.writeLine ?? ((line: string) => console.log(line));
  const setExitCode = dependencies.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  let persistenceFailureMessage: string | null = null;

  const handlePersistenceFailure = (error: Error, report: LiveFeedIngestionReport) => {
    persistenceFailureMessage = error.message;
    dependencies.onPersistenceFailure?.(error, report);
  };

  const report = await ingestLiveFeeds({
    ...dependencies,
    onPersistenceFailure: handlePersistenceFailure,
  });

  writeLine(JSON.stringify(report, null, 2));

  if (persistenceFailureMessage !== null) {
    writeLine(`[ingest:live] report persistence failed: ${persistenceFailureMessage}`);
  }

  setExitCode(
    persistenceFailureMessage !== null
      ? 2
      : report.status === "failed"
        ? 1
        : 0,
  );

  return report;
}

if (require.main === module) {
  void runIngestLiveFeedsCli();
}
