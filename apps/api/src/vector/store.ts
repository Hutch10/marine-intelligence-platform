/**
 * SQLite-backed vector store.
 *
 * Stores embedding records in a `vector_embeddings` table alongside filterable
 * metadata.  Embeddings are persisted as JSON arrays of floats.
 *
 * No external vector database required — the existing SQLite database is used.
 * This layer can be replaced with pgvector or Chroma by swapping this file.
 */

import type { SqliteDatabaseLike } from "../db/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VectorRecordType = "investigation" | "alert" | "explanation";

/** Structured metadata stored alongside the embedding for display and boosting. */
export interface VectorRecordMetadata {
  title?: string;
  summary?: string;
  explanation?: string;
  alerts?: Array<{
    title: string;
    detail?: string;
  }>;
  matchedOn?: Array<"title" | "summary" | "explanation">;
}

export interface VectorRecord {
  id: string;
  recordType: VectorRecordType;
  recordId: string;
  content: string;
  embedding: number[];
  /** Optional filtering metadata */
  stationId?: string | null;
  speciesIds?: string[] | null;
  severity?: string | null;
  source?: string | null;
  embeddedAt: number;
  /** Structured display/boost metadata — stored as JSON */
  metadata?: VectorRecordMetadata | null;
}

export interface VectorRow {
  id: string;
  record_type: string;
  record_id: string;
  content: string;
  embedding_json: string;
  station_id: string | null;
  species_ids_json: string | null;
  severity: string | null;
  source: string | null;
  embedded_at: number | string;
  metadata_json: string | null;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function runStmt(db: SqliteDatabaseLike, sql: string, ...params: unknown[]): void {
  const stmt = db.prepare(sql);
  if (typeof stmt.run === "function") {
    stmt.run(...params);
  } else {
    stmt.all(...params);
  }
}

export function ensureVectorEmbeddingsTable(db: SqliteDatabaseLike): void {
  runStmt(
    db,
    `CREATE TABLE IF NOT EXISTS vector_embeddings (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      station_id TEXT,
      species_ids_json TEXT,
      severity TEXT,
      source TEXT,
      embedded_at INTEGER NOT NULL,
      metadata_json TEXT,
      UNIQUE(record_type, record_id)
    )`,
  );

  runStmt(
    db,
    "CREATE INDEX IF NOT EXISTS idx_vector_embeddings_record_type ON vector_embeddings (record_type)",
  );

  // Safe migration: add metadata_json if this table was created before this column existed.
  try {
    runStmt(db, "ALTER TABLE vector_embeddings ADD COLUMN metadata_json TEXT");
  } catch {
    // Column already exists — ignore.
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

/** Insert or replace a vector record (upsert on record_type + record_id). */
export function upsertVectorRecord(
  db: SqliteDatabaseLike,
  record: VectorRecord,
): void {
  const embeddingJson = JSON.stringify(record.embedding);
  const speciesJson = record.speciesIds ? JSON.stringify(record.speciesIds) : null;
  const metadataJson = record.metadata ? JSON.stringify(record.metadata) : null;

  runStmt(
    db,
    `INSERT INTO vector_embeddings
       (id, record_type, record_id, content, embedding_json, station_id,
        species_ids_json, severity, source, embedded_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(record_type, record_id) DO UPDATE SET
       content = excluded.content,
       embedding_json = excluded.embedding_json,
       station_id = excluded.station_id,
       species_ids_json = excluded.species_ids_json,
       severity = excluded.severity,
       source = excluded.source,
       embedded_at = excluded.embedded_at,
       metadata_json = excluded.metadata_json`,
    record.id,
    record.recordType,
    record.recordId,
    record.content,
    embeddingJson,
    record.stationId ?? null,
    speciesJson,
    record.severity ?? null,
    record.source ?? null,
    record.embeddedAt,
    metadataJson,
  );
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function toNumber(value: number | string): number {
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rowToRecord(row: VectorRow): VectorRecord {
  const embedding = JSON.parse(row.embedding_json) as number[];
  const speciesIds = row.species_ids_json
    ? (JSON.parse(row.species_ids_json) as string[])
    : null;
  const metadata = row.metadata_json
    ? (JSON.parse(row.metadata_json) as VectorRecordMetadata)
    : null;

  return {
    id: row.id,
    recordType: row.record_type as VectorRecordType,
    recordId: row.record_id,
    content: row.content,
    embedding,
    stationId: row.station_id,
    speciesIds,
    severity: row.severity,
    source: row.source,
    embeddedAt: toNumber(row.embedded_at),
    metadata,
  };
}

/** Load a single vector record by type + record ID. Returns null if not found. */
export function getVectorRecord(
  db: SqliteDatabaseLike,
  recordType: VectorRecordType,
  recordId: string,
): VectorRecord | null {
  const rows = db
    .prepare(
      "SELECT * FROM vector_embeddings WHERE record_type = ? AND record_id = ? LIMIT 1",
    )
    .all(recordType, recordId) as VectorRow[];

  if (rows.length === 0) return null;

  return rowToRecord(rows[0]!);
}

/** Load all vector records of a given type. */
export function listVectorRecords(
  db: SqliteDatabaseLike,
  recordType: VectorRecordType,
): VectorRecord[] {
  const rows = db
    .prepare("SELECT * FROM vector_embeddings WHERE record_type = ?")
    .all(recordType) as VectorRow[];

  return rows.map(rowToRecord);
}
