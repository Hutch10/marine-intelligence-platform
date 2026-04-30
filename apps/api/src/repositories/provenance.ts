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
