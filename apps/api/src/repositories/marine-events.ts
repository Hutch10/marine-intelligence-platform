import type { AsyncDbAdapter } from "../db/async-client";
import { IntegrityService } from "../services/integrity-service";
import type {
  MarineEventCreateInput,
  MarineEventCreateResult,
  MarineEventListFilters,
  MarineEventListResult,
  MarineEventRecord,
  MarineEventSeverity,
  MarineEventStatus,
  MarineEventClass,
  TruthPartition,
} from "../marine-intelligence-types";

const VALID_EVENT_CLASSES = new Set<MarineEventClass>([
  "threshold_alert",
  "trend_signal",
  "contextual_signal",
]);

const VALID_SEVERITIES = new Set<MarineEventSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);

const VALID_STATUSES = new Set<MarineEventStatus>([
  "detected",
  "monitoring",
  "confirmed",
  "resolved",
  "dismissed",
]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const writeLockByResource = new Map<string, Promise<void>>();
// NOTE: This mutex is process-local. For multi-node (distributed) environments using Turso,
// a distributed lock (e.g. Redis) or server-side transaction serializability must be enforced.
// It provides protection against concurrent writes from separate adapter instances within the same process.

interface MarineEventRow {
  id: string;
  ontology_term_id: string;
  event_class: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  region: string;
  station_id: string | null;
  confidence: number | string;
  source: string;
  source_record_id: string;
  ingestion_run_id: string;
  observed_at: string;
  ingested_at: string;
  detected_at: string;
  resolved_at: string | null;
  truth_partition: string;
  integrity_hash: string | null;
  integrity_chain_hash: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeText(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeId(value: string | undefined | null): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  // Case-insensitive and Unicode-normalized IDs prevent bypass via variation.
  return normalized.normalize("NFC").toLowerCase();
}

function normalizeIsoTimestamp(value: string | undefined | null): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeStatus(value: string | undefined): MarineEventStatus | null {
  if (!value) return null;
  return VALID_STATUSES.has(value as MarineEventStatus) ? (value as MarineEventStatus) : null;
}

function normalizeSeverity(value: string): MarineEventSeverity | null {
  return VALID_SEVERITIES.has(value as MarineEventSeverity) ? (value as MarineEventSeverity) : null;
}

function normalizeEventClass(value: string): MarineEventClass | null {
  return VALID_EVENT_CLASSES.has(value as MarineEventClass) ? (value as MarineEventClass) : null;
}

export async function ensureMarineEventTables(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS marine_intelligence_events (
      id TEXT PRIMARY KEY,
      ontology_term_id TEXT NOT NULL,
      event_class TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      region TEXT NOT NULL,
      station_id TEXT,
      confidence INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      ingestion_run_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      resolved_at TEXT,
      truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH',
      integrity_hash TEXT,
      integrity_chain_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );

  const columns = [
    { name: "truth_partition", type: "TEXT NOT NULL DEFAULT 'FIELD_TRUTH'" },
    { name: "integrity_hash", type: "TEXT" },
    { name: "integrity_chain_hash", type: "TEXT" },
  ];

  for (const col of columns) {
    try {
      await adapter.execute(`ALTER TABLE marine_intelligence_events ADD COLUMN ${col.name} ${col.type}`);
    } catch {
      // Column already exists.
    }
  }

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_marine_events_partition_at
     ON marine_intelligence_events (truth_partition, detected_at DESC, id ASC)`,
  );

  // Partition-scoped idempotency key for stale replay/race hardening.
  await adapter.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_marine_events_partition_source_record
     ON marine_intelligence_events (truth_partition, source, source_record_id)`,
  );

  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS marine_intelligence_event_quarantine (
      id TEXT PRIMARY KEY,
      truth_partition TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      observed_at TEXT,
      source TEXT,
      source_record_id TEXT,
      detected_at TEXT,
      created_at TEXT NOT NULL
    )`,
  );

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_marine_event_quarantine_partition_created
     ON marine_intelligence_event_quarantine (truth_partition, created_at DESC, id ASC)`,
  );
}

function mapMarineEventRow(row: MarineEventRow): MarineEventRecord {
  return {
    id: row.id,
    ontologyTermId: row.ontology_term_id,
    eventClass: (normalizeEventClass(row.event_class) ?? "threshold_alert") as MarineEventClass,
    severity: (normalizeSeverity(row.severity) ?? "low") as MarineEventSeverity,
    status: (normalizeStatus(row.status) ?? "detected") as MarineEventStatus,
    title: row.title,
    summary: row.summary,
    region: row.region,
    stationId: row.station_id,
    confidence: normalizeConfidence(Number(row.confidence)),
    lineage: {
      source: row.source,
      sourceRecordId: row.source_record_id,
      ingestionRunId: row.ingestion_run_id,
      observedAt: row.observed_at,
      ingestedAt: row.ingested_at,
    },
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    truthPartition: (row.truth_partition as TruthPartition) || "FIELD_TRUTH",
    integrityHash: row.integrity_hash,
    integrityChainHash: row.integrity_chain_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRowLikeRecord(row: MarineEventRow): Record<string, unknown> {
  const mapped = mapMarineEventRow(row);
  return {
    ...mapped,
    integrity_chain_hash: row.integrity_chain_hash,
  };
}

function stationPredicateSql(stationId: string | null): { clause: string; params: unknown[] } {
  if (stationId) {
    return { clause: "station_id = ?", params: [stationId] };
  }
  return { clause: "station_id IS NULL", params: [] };
}

function contradictoryShapeDetected(existing: MarineEventRecord, incoming: MarineEventRecord): boolean {
  return (
    existing.eventClass !== incoming.eventClass
    || existing.status !== incoming.status
    || existing.severity !== incoming.severity
    || existing.summary !== incoming.summary
    || existing.confidence !== incoming.confidence
  );
}

async function appendQuarantineRecord(
  adapter: AsyncDbAdapter,
  {
    truthPartition,
    reason,
    payload,
    event,
    nowIso,
  }: {
    truthPartition: string;
    reason: string;
    payload: Record<string, unknown>;
    event: MarineEventRecord;
    nowIso: string;
  },
): Promise<void> {
  const quarantineId = `MEQ-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  await adapter.execute(
    `INSERT INTO marine_intelligence_event_quarantine (
      id, truth_partition, reason, payload_json, observed_at, source, source_record_id, detected_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      quarantineId,
      truthPartition,
      reason,
      JSON.stringify(payload),
      event.lineage.observedAt,
      event.lineage.source,
      event.lineage.sourceRecordId,
      event.detectedAt,
      nowIso,
    ],
  );

  // Bounded Retention Strategy: Purge quarantine records older than 7 days.
  // Ensures the table does not grow indefinitely under attack.
  await adapter.execute(
    `DELETE FROM marine_intelligence_event_quarantine 
     WHERE created_at < datetime(?, '-7 days')`,
    [nowIso]
  );
}

async function rejectWithQuarantine(
  adapter: AsyncDbAdapter,
  params: {
    truthPartition: string;
    reason: string;
    payload: Record<string, unknown>;
    event: MarineEventRecord;
    nowIso: string;
    error: string;
  },
): Promise<MarineEventCreateResult> {
  const { truthPartition, reason, payload, event, nowIso, error } = params;
  
  // Quarantine Abuse Control: Deduplicate by semantic content (integrityHash) and source key.
  const integrityHash = IntegrityService.calculateCanonicalHash(event);
  const existingQuarantine = await adapter.execute(
    `SELECT id FROM marine_intelligence_event_quarantine 
     WHERE truth_partition = ? AND reason = ? AND source = ? AND source_record_id = ?
     AND created_at > datetime(?, '-10 minutes')
     LIMIT 1`,
    [truthPartition, reason, event.lineage.source, event.lineage.sourceRecordId, nowIso]
  );

  await adapter.execute("ROLLBACK");

  if (existingQuarantine.length === 0) {
    await appendQuarantineRecord(adapter, {
      truthPartition,
      reason,
      payload,
      event,
      nowIso,
    });
  }

  return {
    ok: false,
    reason: "validation",
    error,
    event: null,
  };
}

export async function createMarineEvent(
  adapter: AsyncDbAdapter,
  input: MarineEventCreateInput,
  nowMs: number = Date.now(),
): Promise<MarineEventCreateResult> {
  const resourceId = adapter.resourceId;
  const previousLock = writeLockByResource.get(resourceId) ?? Promise.resolve();
  let releaseLock: () => void = () => {
    // no-op initializer for type safety
  };
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  writeLockByResource.set(resourceId, previousLock.then(() => currentLock));
  await previousLock;

  try {
  const nowIso = new Date(nowMs).toISOString();
  const detectedAt = normalizeIsoTimestamp(input.detectedAt) ?? nowIso;
  const truthPartition = input.truthPartition || "FIELD_TRUTH";
  const resolvedAt = input.status === "resolved" ? detectedAt : null;

  await ensureMarineEventTables(adapter);
  await adapter.execute("BEGIN IMMEDIATE");

  try {
    const stationId = normalizeText(input.stationId ?? null);
    const eventClass = normalizeEventClass(input.eventClass);
    const severity = normalizeSeverity(input.severity);
    const status = normalizeStatus(input.status ?? "detected");
    const ontologyTermId = normalizeText(input.ontologyTermId);
    const title = normalizeText(input.title);
    const summary = normalizeText(input.summary);
    const region = normalizeText(input.region);
    const source = normalizeId(input.lineage.source);
    const sourceRecordId = normalizeId(input.lineage.sourceRecordId);
    const ingestionRunId = normalizeText(input.lineage.ingestionRunId);
    const observedAt = normalizeIsoTimestamp(input.lineage.observedAt);
    const ingestedAt = normalizeIsoTimestamp(input.lineage.ingestedAt);

    if (
      !ontologyTermId
      || !eventClass
      || !severity
      || !status
      || !title
      || !summary
      || !region
      || !source
      || !sourceRecordId
      || !ingestionRunId
      || !observedAt
      || !ingestedAt
    ) {
      await adapter.execute("ROLLBACK");
      return {
        ok: false,
        reason: "validation",
        error: "Event payload failed strict integrity validation.",
        event: null,
      };
    }

    const id = `MEV-${nowMs}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const event: MarineEventRecord = {
      id,
      ontologyTermId,
      eventClass,
      severity,
      status,
      title,
      summary,
      region,
      stationId,
      confidence: normalizeConfidence(input.confidence),
      lineage: {
        source,
        sourceRecordId,
        ingestionRunId,
        observedAt,
        ingestedAt,
      },
      detectedAt,
      resolvedAt,
      truthPartition,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Integrity-chain fork/tamper detection gate.
    const existingChainRows = (await adapter.execute(
      `SELECT *
       FROM marine_intelligence_events
       WHERE truth_partition = ?
       ORDER BY detected_at ASC, id ASC`,
      [truthPartition],
    )) as MarineEventRow[];

    if (existingChainRows.length > 0) {
      const chainVerification = IntegrityService.verifyChainDetailed(existingChainRows.map(toRowLikeRecord));
      if (!chainVerification.valid) {
        return rejectWithQuarantine(adapter, {
          truthPartition,
          reason: "chain_fork_detected",
          payload: { input, verification: chainVerification },
          event,
          nowIso,
          error: "INTEGRITY_CHAIN_FORK_DETECTED: partition chain audit failed and write was blocked.",
        });
      }
    }

    const integrityHash = IntegrityService.calculateCanonicalHash(event);

    // Cross-partition idempotency gate for source record key.
    // Prevents replaying FIELD_TRUTH records into SYNTHETIC_BENCH and vice versa.
    const sourceKeyRows = (await adapter.execute(
      `SELECT *
       FROM marine_intelligence_events
       WHERE source = ?
         AND source_record_id = ?
       ORDER BY detected_at DESC, id DESC
       LIMIT 1`,
      [event.lineage.source, event.lineage.sourceRecordId],
    )) as MarineEventRow[];

    if (sourceKeyRows.length > 0) {
      const existing = sourceKeyRows[0];
      const existingRecord = mapMarineEventRow(existing);
      const existingHash = existing.integrity_hash ?? IntegrityService.calculateCanonicalHash(existingRecord);

      if (existingHash === integrityHash) {
        await adapter.execute("ROLLBACK");
        return { ok: true, event: existingRecord };
      }

      return rejectWithQuarantine(adapter, {
        truthPartition,
        reason: "source_record_conflict",
        payload: {
          input,
          existingEventId: existing.id,
          existingHash,
          incomingHash: integrityHash,
        },
        event,
        nowIso,
        error: "CONTRADICTION_DETECTED: conflicting payload for existing source_record_id was quarantined.",
      });
    }

    const stationPredicate = stationPredicateSql(event.stationId);

    // Stale-valid replay hardening.
    const staleRows = (await adapter.execute(
      `SELECT observed_at
       FROM marine_intelligence_events
       WHERE truth_partition = ?
         AND source = ?
         AND ontology_term_id = ?
         AND LOWER(region) = LOWER(?)
         AND ${stationPredicate.clause}
       ORDER BY observed_at DESC
       LIMIT 1`,
      [
        truthPartition,
        event.lineage.source,
        event.ontologyTermId,
        event.region,
        ...stationPredicate.params,
      ],
    )) as Array<{ observed_at: string | null }>;

    const latestObservedAt = staleRows[0]?.observed_at ? Date.parse(staleRows[0].observed_at) : Number.NaN;
    const incomingObservedAt = Date.parse(event.lineage.observedAt);
    if (Number.isFinite(latestObservedAt) && Number.isFinite(incomingObservedAt) && incomingObservedAt < latestObservedAt) {
      return rejectWithQuarantine(adapter, {
        truthPartition,
        reason: "stale_replay",
        payload: {
          input,
          latestObservedAt: staleRows[0]?.observed_at,
          incomingObservedAt: event.lineage.observedAt,
        },
        event,
        nowIso,
        error: "STALE_REPLAY_BLOCKED: incoming record predates accepted truth and was quarantined.",
      });
    }

    // Byzantine contradiction guard for same observed point within a partition.
    const contradictionRows = (await adapter.execute(
      `SELECT *
       FROM marine_intelligence_events
       WHERE truth_partition = ?
         AND source = ?
         AND ontology_term_id = ?
         AND LOWER(region) = LOWER(?)
         AND ${stationPredicate.clause}
         AND observed_at = ?
       ORDER BY id ASC`,
      [
        truthPartition,
        event.lineage.source,
        event.ontologyTermId,
        event.region,
        ...stationPredicate.params,
        event.lineage.observedAt,
      ],
    )) as MarineEventRow[];

    const contradictory = contradictionRows
      .map(mapMarineEventRow)
      .find((existing) => contradictoryShapeDetected(existing, event));

    if (contradictory) {
      return rejectWithQuarantine(adapter, {
        truthPartition,
        reason: "contradictory_truth",
        payload: {
          input,
          existingEventId: contradictory.id,
          existing: {
            eventClass: contradictory.eventClass,
            severity: contradictory.severity,
            status: contradictory.status,
            confidence: contradictory.confidence,
            summary: contradictory.summary,
          },
          incoming: {
            eventClass: event.eventClass,
            severity: event.severity,
            status: event.status,
            confidence: event.confidence,
            summary: event.summary,
          },
        },
        event,
        nowIso,
        error: "CONTRADICTION_DETECTED: same-observation conflicting truth was quarantined.",
      });
    }

    const tipRows = (await adapter.execute(
      `SELECT integrity_chain_hash
       FROM marine_intelligence_events
       WHERE truth_partition = ?
       ORDER BY detected_at DESC, id DESC
       LIMIT 1`,
      [truthPartition],
    )) as Array<{ integrity_chain_hash: string | null }>;

    const prevHash = tipRows[0]?.integrity_chain_hash ?? "GENESIS";
    const integrityChainHash = IntegrityService.calculateChainHash(prevHash, event);

    event.integrityHash = integrityHash;
    event.integrityChainHash = integrityChainHash;

    await adapter.execute(
      `INSERT INTO marine_intelligence_events (
        id, ontology_term_id, event_class, severity, status, title, summary, region, station_id,
        confidence, source, source_record_id, ingestion_run_id, observed_at, ingested_at,
        detected_at, resolved_at, truth_partition, integrity_hash, integrity_chain_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.ontologyTermId,
        event.eventClass,
        event.severity,
        event.status,
        event.title,
        event.summary,
        event.region,
        event.stationId,
        event.confidence,
        event.lineage.source,
        event.lineage.sourceRecordId,
        event.lineage.ingestionRunId,
        event.lineage.observedAt,
        event.lineage.ingestedAt,
        event.detectedAt,
        event.resolvedAt,
        event.truthPartition,
        integrityHash,
        integrityChainHash,
        event.createdAt,
        event.updatedAt,
      ],
    );

    await adapter.execute("COMMIT");
    return { ok: true, event };
  } catch (error) {
    try {
      await adapter.execute("ROLLBACK");
    } catch {
      // Best-effort rollback for fail-closed behavior.
    }

    return {
      ok: false,
      reason: "validation",
      error: `Event write failed closed: ${error instanceof Error ? error.message : "unknown_error"}`,
      event: null,
    };
  }
  } finally {
    releaseLock();
  }
}

export async function listMarineEvents(
  adapter: AsyncDbAdapter,
  filters: MarineEventListFilters & { includeAllPartitions?: boolean; truthPartition?: TruthPartition } = {},
): Promise<MarineEventListResult> {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (normalizeText(filters.id)) {
    whereClauses.push("id = ?");
    params.push(normalizeText(filters.id));
  }

  if (normalizeText(filters.ontologyTermId)) {
    whereClauses.push("ontology_term_id = ?");
    params.push(normalizeText(filters.ontologyTermId));
  }

  if (filters.eventClass && normalizeEventClass(filters.eventClass)) {
    whereClauses.push("event_class = ?");
    params.push(filters.eventClass);
  }

  if (filters.severity && normalizeSeverity(filters.severity)) {
    whereClauses.push("severity = ?");
    params.push(filters.severity);
  }

  if (!filters.includeAllPartitions) {
    whereClauses.push("truth_partition = ?");
    params.push(filters.truthPartition ?? "FIELD_TRUTH");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const rows = (await adapter.execute(
    `SELECT * FROM marine_intelligence_events
     ${whereSql}
     ORDER BY detected_at DESC, id ASC
     LIMIT ?`,
    [...params, limit],
  )) as MarineEventRow[];

  return {
    ok: true,
    events: rows.map(mapMarineEventRow),
  };
}
