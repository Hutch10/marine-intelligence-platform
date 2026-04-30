import type { AsyncDbAdapter } from "../db/async-client";

export interface IngestionRunCreateInput {
  source: string;
  startedAt: number;
  status?: "running" | "completed" | "failed";
  stationCount?: number;
}

export interface IngestionRunFinalizeInput {
  runId: string;
  status: "completed" | "failed";
  finishedAt: number;
  insertedRows: number;
  rejectedRows: number;
}

export async function ensureIngestionRunsTable(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS ingestion_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      station_count INTEGER NOT NULL,
      inserted_rows INTEGER NOT NULL DEFAULT 0,
      rejected_rows INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`
  );
}

export async function createIngestionRun(adapter: AsyncDbAdapter, input: IngestionRunCreateInput): Promise<string> {
  const runId = `ING-${input.startedAt}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await adapter.execute(
    `INSERT INTO ingestion_runs (
      id,
      source,
      status,
      station_count,
      inserted_rows,
      rejected_rows,
      started_at,
      finished_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, ?, NULL, ?, ?)`,
    [
      runId,
      input.source,
      input.status ?? "running",
      input.stationCount ?? 0,
      input.startedAt,
      input.startedAt,
      input.startedAt,
    ]
  );

  return runId;
}

export async function finalizeIngestionRun(adapter: AsyncDbAdapter, input: IngestionRunFinalizeInput) {
  await adapter.execute(
    `UPDATE ingestion_runs
     SET status = ?,
         inserted_rows = ?,
         rejected_rows = ?,
         finished_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      input.status,
      input.insertedRows,
      input.rejectedRows,
      input.finishedAt,
      input.finishedAt,
      input.runId,
    ]
  );
}
