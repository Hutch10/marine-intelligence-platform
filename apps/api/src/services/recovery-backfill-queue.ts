import type { AsyncDbAdapter } from "../db/async-client";
import { getAsyncAdapter } from "../db/async-client";
import type { CircuitBreakerSnapshot, SourceCircuitBreakerStatus } from "./circuit-breaker";
import { buildCircuitBreakerSnapshot } from "./circuit-breaker";
import { getLiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";

export interface RecoveryBackfillJob {
  id: string;
  source: string;
  windowStartMs: number;
  windowEndMs: number;
  status: "pending" | "running" | "completed" | "failed";
  reason: string;
  createdAt: number;
  completedAt: number | null;
}

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

export async function ensureRecoveryBackfillQueueTable(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS recovery_backfill_queue (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      window_start_ms INTEGER NOT NULL,
      window_end_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    )`,
  );

  await adapter.execute(
    "CREATE INDEX IF NOT EXISTS idx_recovery_backfill_status ON recovery_backfill_queue (status, created_at)",
  );
}

export async function ensureCircuitBreakerStateTable(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS circuit_breaker_state (
      source TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  );
}

export async function readCircuitBreakerStates(adapter: AsyncDbAdapter): Promise<Record<string, SourceCircuitBreakerStatus["state"]>> {
  const rows = await adapter.execute(
    "SELECT source, state FROM circuit_breaker_state",
  ) as Array<{ source: string; state: string }>;

  return Object.fromEntries(rows.map((row) => [row.source, row.state as SourceCircuitBreakerStatus["state"]]));
}

export async function writeCircuitBreakerStates(
  adapter: AsyncDbAdapter,
  snapshot: CircuitBreakerSnapshot,
): Promise<Array<{ source: string; previous: string | null; current: string }>> {
  await ensureCircuitBreakerStateTable(adapter);

  const previousStates = await readCircuitBreakerStates(adapter);
  const transitions: Array<{ source: string; previous: string | null; current: string }> = [];

  for (const source of snapshot.sources) {
    const previous = previousStates[source.source] ?? null;
    transitions.push({ source: source.source, previous, current: source.state });

    await adapter.execute(
      `INSERT INTO circuit_breaker_state (source, state, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      [source.source, source.state, Date.now()],
    );
  }

  return transitions;
}

export async function enqueueRecoveryWindows(
  adapter: AsyncDbAdapter,
  source: string,
  outageStartedAtMs: number,
  recoveredAtMs: number,
  reason: string,
): Promise<string[]> {
  await ensureRecoveryBackfillQueueTable(adapter);

  const createdIds: string[] = [];
  let cursor = outageStartedAtMs;

  while (cursor < recoveredAtMs) {
    const windowEnd = Math.min(cursor + DEFAULT_WINDOW_MS, recoveredAtMs);
    const id = `RBF-${source}-${cursor}-${windowEnd}`;
    await adapter.execute(
      `INSERT OR IGNORE INTO recovery_backfill_queue
        (id, source, window_start_ms, window_end_ms, status, reason, created_at, completed_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL)`,
      [id, source, cursor, windowEnd, reason, Date.now()],
    );
    createdIds.push(id);
    cursor = windowEnd;
  }

  return createdIds;
}

export async function detectAndEnqueueRecoveryFromCircuitTransitions(
  adapter: AsyncDbAdapter,
  now = Date.now(),
  dependencies: {
    getHealthSnapshot?: typeof getLiveIngestionHealthSnapshot;
  } = {},
): Promise<string[]> {
  const getHealthSnapshot = dependencies.getHealthSnapshot ?? getLiveIngestionHealthSnapshot;
  const snapshotResult = getHealthSnapshot({ limit: 40, staleAfterMs: 6 * 60 * 60 * 1000 });
  if (snapshotResult.source !== "db") {
    return [];
  }

  const snapshot = buildCircuitBreakerSnapshot(snapshotResult.snapshot);
  const transitions = await writeCircuitBreakerStates(adapter, snapshot);
  const enqueued: string[] = [];

  for (const transition of transitions) {
    if (transition.previous === "open" && transition.current === "closed") {
      const sourceHistory = snapshotResult.snapshot.recentHistory
        .filter((item) => item.source === transition.source && item.status === "failed");
      const oldestFailure = sourceHistory[sourceHistory.length - 1];
      const outageStartedAtMs = oldestFailure
        ? Date.parse(oldestFailure.startedAt)
        : now - (3 * DEFAULT_WINDOW_MS);
      const ids = await enqueueRecoveryWindows(
        adapter,
        transition.source,
        outageStartedAtMs,
        now,
        "circuit_breaker_closed",
      );
      enqueued.push(...ids);
    }
  }

  return enqueued;
}

export async function listPendingRecoveryJobs(adapter: AsyncDbAdapter, limit = 20): Promise<RecoveryBackfillJob[]> {
  await ensureRecoveryBackfillQueueTable(adapter);
  const rows = await adapter.execute(
    `SELECT id, source, window_start_ms, window_end_ms, status, reason, created_at, completed_at
     FROM recovery_backfill_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    source: String(row.source),
    windowStartMs: Number(row.window_start_ms),
    windowEndMs: Number(row.window_end_ms),
    status: String(row.status) as RecoveryBackfillJob["status"],
    reason: String(row.reason),
    createdAt: Number(row.created_at),
    completedAt: row.completed_at === null || row.completed_at === undefined ? null : Number(row.completed_at),
  }));
}

export async function markRecoveryJob(
  adapter: AsyncDbAdapter,
  jobId: string,
  status: RecoveryBackfillJob["status"],
): Promise<void> {
  await adapter.execute(
    `UPDATE recovery_backfill_queue
     SET status = ?, completed_at = ?
     WHERE id = ?`,
    [status, status === "pending" || status === "running" ? null : Date.now(), jobId],
  );
}

export interface RecoveryBackfillRunner {
  runSourceIngestion: (source: string) => Promise<void>;
}

export async function processRecoveryBackfillQueue(
  runner: RecoveryBackfillRunner,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<{ processed: number; failed: number }> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(false);

  try {
    const jobs = await listPendingRecoveryJobs(adapter);
    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      await markRecoveryJob(adapter, job.id, "running");
      try {
        await runner.runSourceIngestion(job.source);
        await markRecoveryJob(adapter, job.id, "completed");
        processed += 1;
      } catch {
        await markRecoveryJob(adapter, job.id, "failed");
        failed += 1;
      }
    }

    return { processed, failed };
  } finally {
    adapter.close();
  }
}
