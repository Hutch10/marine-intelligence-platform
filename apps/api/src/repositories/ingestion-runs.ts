import type { SqliteDatabaseLike, SqliteStatementLike } from "../db/client";

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

function toStatement(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
  return db.prepare(sql);
}

function runStatement(statement: SqliteStatementLike, ...params: unknown[]) {
  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

export function ensureIngestionRunsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
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
      )`,
    ),
  );
}

export function createIngestionRun(db: SqliteDatabaseLike, input: IngestionRunCreateInput): string {
  const runId = `ING-${input.startedAt}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  runStatement(
    toStatement(
      db,
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
      ) VALUES (?, ?, ?, ?, 0, 0, ?, NULL, ?, ?)` ,
    ),
    runId,
    input.source,
    input.status ?? "running",
    input.stationCount ?? 0,
    input.startedAt,
    input.startedAt,
    input.startedAt,
  );

  return runId;
}

export function finalizeIngestionRun(db: SqliteDatabaseLike, input: IngestionRunFinalizeInput) {
  runStatement(
    toStatement(
      db,
      `UPDATE ingestion_runs
       SET status = ?,
           inserted_rows = ?,
           rejected_rows = ?,
           finished_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ),
    input.status,
    input.insertedRows,
    input.rejectedRows,
    input.finishedAt,
    input.finishedAt,
    input.runId,
  );
}
