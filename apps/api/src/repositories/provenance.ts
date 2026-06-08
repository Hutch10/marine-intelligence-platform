import type { AsyncDbAdapter } from "../db/async-client";

export interface ProvenanceRecordInput {
  ingestionRunId: string;
  source: string;
  sourceStationId: string;
  sourceTimestamp: string;
  sourceReference: string;
  recordType: "observation" | "station_metric" | "derived_signal";
  recordId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface ProvenanceRecordRow {
  id: string;
  ingestionRunId: string;
  source: string;
  sourceStationId: string;
  sourceTimestamp: string;
  sourceReference: string;
  recordType: string;
  recordId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export async function ensureProvenanceRecordsTable(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS provenance_records (
      id TEXT PRIMARY KEY,
      ingestion_run_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_station_id TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  );

  await adapter.execute(
    "CREATE INDEX IF NOT EXISTS idx_provenance_record_id ON provenance_records (record_id)",
  );
}

export async function insertProvenanceRecord(adapter: AsyncDbAdapter, input: ProvenanceRecordInput): Promise<string> {
  const provenanceId = `PRV-${input.createdAt}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  await adapter.execute(
    `INSERT INTO provenance_records (
      id,
      ingestion_run_id,
      source,
      source_station_id,
      source_timestamp,
      source_reference,
      record_type,
      record_id,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      provenanceId,
      input.ingestionRunId,
      input.source,
      input.sourceStationId,
      input.sourceTimestamp,
      input.sourceReference,
      input.recordType,
      input.recordId,
      JSON.stringify(input.payload),
      input.createdAt,
    ],
  );

  return provenanceId;
}

export async function getProvenanceById(
  adapter: AsyncDbAdapter,
  provenanceId: string,
): Promise<ProvenanceRecordRow | null> {
  const rows = await adapter.execute(
    `SELECT id, ingestion_run_id, source, source_station_id, source_timestamp,
            source_reference, record_type, record_id, payload_json, created_at
     FROM provenance_records
     WHERE id = ?
     LIMIT 1`,
    [provenanceId],
  ) as Array<{
    id: string;
    ingestion_run_id: string;
    source: string;
    source_station_id: string;
    source_timestamp: string;
    source_reference: string;
    record_type: string;
    record_id: string;
    payload_json: string;
    created_at: number | string;
  }>;

  const row = rows[0];
  if (!row) {
    return null;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  return {
    id: row.id,
    ingestionRunId: row.ingestion_run_id,
    source: row.source,
    sourceStationId: row.source_station_id,
    sourceTimestamp: row.source_timestamp,
    sourceReference: row.source_reference,
    recordType: row.record_type,
    recordId: row.record_id,
    payload,
    createdAt: Number(row.created_at),
  };
}

export async function getProvenanceByRecordId(
  adapter: AsyncDbAdapter,
  recordId: string,
): Promise<ProvenanceRecordRow | null> {
  const rows = await adapter.execute(
    `SELECT id, ingestion_run_id, source, source_station_id, source_timestamp,
            source_reference, record_type, record_id, payload_json, created_at
     FROM provenance_records
     WHERE record_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [recordId],
  ) as Array<{
    id: string;
    ingestion_run_id: string;
    source: string;
    source_station_id: string;
    source_timestamp: string;
    source_reference: string;
    record_type: string;
    record_id: string;
    payload_json: string;
    created_at: number | string;
  }>;

  const row = rows[0];
  if (!row) {
    return null;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  return {
    id: row.id,
    ingestionRunId: row.ingestion_run_id,
    source: row.source,
    sourceStationId: row.source_station_id,
    sourceTimestamp: row.source_timestamp,
    sourceReference: row.source_reference,
    recordType: row.record_type,
    recordId: row.record_id,
    payload,
    createdAt: Number(row.created_at),
  };
}
