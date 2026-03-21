import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";
import type {
  MarineEventCreateInput,
  MarineEventCreateResult,
  MarineEventListFilters,
  MarineEventListResult,
  MarineEventRecord,
  MarineEventSeverity,
  MarineEventStatus,
  MarineEventClass,
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
  created_at: string;
  updated_at: string;
}

interface MarineEventsRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

export type MarineEventsRepositoryReadResult =
  | { source: "db"; result: MarineEventListResult }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export type MarineEventsRepositoryCreateResult =
  | { source: "db"; result: MarineEventCreateResult }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

function normalizeText(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoTimestamp(value: string | undefined | null): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.floor(limit as number), 1), MAX_LIMIT);
}

function normalizeStatus(value: string | undefined): MarineEventStatus | null {
  if (!value) {
    return null;
  }

  return VALID_STATUSES.has(value as MarineEventStatus)
    ? (value as MarineEventStatus)
    : null;
}

function normalizeSeverity(value: string): MarineEventSeverity | null {
  return VALID_SEVERITIES.has(value as MarineEventSeverity)
    ? (value as MarineEventSeverity)
    : null;
}

function normalizeEventClass(value: string): MarineEventClass | null {
  return VALID_EVENT_CLASSES.has(value as MarineEventClass)
    ? (value as MarineEventClass)
    : null;
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

function allStatement<T>(statement: SqliteStatementLike, ...params: unknown[]): T[] {
  return statement.all(...params) as T[];
}

function validateCreateInput(input: MarineEventCreateInput): { ok: true } | { ok: false; error: string } {
  if (!normalizeText(input.ontologyTermId)) {
    return { ok: false, error: "ontologyTermId is required" };
  }

  if (!normalizeEventClass(input.eventClass)) {
    return { ok: false, error: "eventClass is invalid" };
  }

  if (!normalizeSeverity(input.severity)) {
    return { ok: false, error: "severity is invalid" };
  }

  if (input.status && !normalizeStatus(input.status)) {
    return { ok: false, error: "status is invalid" };
  }

  if (!normalizeText(input.title)) {
    return { ok: false, error: "title is required" };
  }

  if (!normalizeText(input.summary)) {
    return { ok: false, error: "summary is required" };
  }

  if (!normalizeText(input.region)) {
    return { ok: false, error: "region is required" };
  }

  if (!Number.isFinite(input.confidence)) {
    return { ok: false, error: "confidence must be a finite number" };
  }

  if (!normalizeText(input.lineage.source)) {
    return { ok: false, error: "lineage.source is required" };
  }

  if (!normalizeText(input.lineage.sourceRecordId)) {
    return { ok: false, error: "lineage.sourceRecordId is required" };
  }

  if (!normalizeText(input.lineage.ingestionRunId)) {
    return { ok: false, error: "lineage.ingestionRunId is required" };
  }

  if (!normalizeIsoTimestamp(input.lineage.observedAt)) {
    return { ok: false, error: "lineage.observedAt must be a valid ISO timestamp" };
  }

  if (!normalizeIsoTimestamp(input.lineage.ingestedAt)) {
    return { ok: false, error: "lineage.ingestedAt must be a valid ISO timestamp" };
  }

  if (input.detectedAt && !normalizeIsoTimestamp(input.detectedAt)) {
    return { ok: false, error: "detectedAt must be a valid ISO timestamp" };
  }

  return { ok: true };
}

export function ensureMarineEventTables(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_marine_events_detected
       ON marine_intelligence_events (detected_at DESC, id ASC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_marine_events_lookup
       ON marine_intelligence_events (ontology_term_id, event_class, severity, status, source, region)`,
    ),
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nextEventId(db: SqliteDatabaseLike, now: number): string {
  const rows = allStatement<Array<{ total: number }>[number]>(
    toStatement(db, "SELECT COUNT(*) AS total FROM marine_intelligence_events"),
  );
  const total = Number(rows[0]?.total ?? 0);
  return `MEV-${now}-${total + 1}`;
}

export function createMarineEvent(
  input: MarineEventCreateInput,
  dependencies: MarineEventsRepositoryDependencies = {},
): MarineEventsRepositoryCreateResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;

  const validation = validateCreateInput(input);
  if (!validation.ok) {
    return {
      source: "db",
      result: {
        ok: false,
        event: null,
        reason: "validation",
        error: validation.error,
      },
    };
  }

  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "unavailable",
      fallbackReason: "db_path_missing",
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_open_failed",
    };
  }

  try {
    ensureMarineEventTables(db);

    const nowIso = new Date(now()).toISOString();
    const eventId = nextEventId(db, now());

    const detectedAt = normalizeIsoTimestamp(input.detectedAt) ?? nowIso;
    const resolvedAt = input.status === "resolved" ? detectedAt : null;

    const event: MarineEventRecord = {
      id: eventId,
      ontologyTermId: normalizeText(input.ontologyTermId) as string,
      eventClass: normalizeEventClass(input.eventClass) as MarineEventClass,
      severity: normalizeSeverity(input.severity) as MarineEventSeverity,
      status: normalizeStatus(input.status ?? "detected") as MarineEventStatus,
      title: normalizeText(input.title) as string,
      summary: normalizeText(input.summary) as string,
      region: normalizeText(input.region) as string,
      stationId: normalizeText(input.stationId ?? null),
      confidence: normalizeConfidence(input.confidence),
      lineage: {
        source: normalizeText(input.lineage.source) as string,
        sourceRecordId: normalizeText(input.lineage.sourceRecordId) as string,
        ingestionRunId: normalizeText(input.lineage.ingestionRunId) as string,
        observedAt: normalizeIsoTimestamp(input.lineage.observedAt) as string,
        ingestedAt: normalizeIsoTimestamp(input.lineage.ingestedAt) as string,
      },
      detectedAt,
      resolvedAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    runStatement(
      toStatement(
        db,
        `INSERT INTO marine_intelligence_events (
          id, ontology_term_id, event_class, severity, status, title, summary, region, station_id,
          confidence, source, source_record_id, ingestion_run_id, observed_at, ingested_at,
          detected_at, resolved_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
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
      event.createdAt,
      event.updatedAt,
    );

    return {
      source: "db",
      result: {
        ok: true,
        event,
      },
    };
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}

export function listMarineEvents(
  filters: MarineEventListFilters = {},
  dependencies: MarineEventsRepositoryDependencies = {},
): MarineEventsRepositoryReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;

  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "unavailable",
      fallbackReason: "db_path_missing",
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(databasePath);
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_open_failed",
    };
  }

  try {
    ensureMarineEventTables(db);

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

    if (filters.status && normalizeStatus(filters.status)) {
      whereClauses.push("status = ?");
      params.push(filters.status);
    }

    if (normalizeText(filters.region)) {
      whereClauses.push("LOWER(region) = ?");
      params.push((normalizeText(filters.region) as string).toLowerCase());
    }

    if (normalizeText(filters.stationId)) {
      whereClauses.push("station_id = ?");
      params.push(normalizeText(filters.stationId));
    }

    if (normalizeText(filters.source)) {
      whereClauses.push("source = ?");
      params.push(normalizeText(filters.source));
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const limit = normalizeLimit(filters.limit);

    const rows = allStatement<MarineEventRow>(
      toStatement(
        db,
        `SELECT id, ontology_term_id, event_class, severity, status, title, summary, region, station_id,
                confidence, source, source_record_id, ingestion_run_id, observed_at, ingested_at,
                detected_at, resolved_at, created_at, updated_at
         FROM marine_intelligence_events
         ${whereSql}
         ORDER BY detected_at DESC, id ASC
         LIMIT ?`,
      ),
      ...params,
      limit,
    );

    return {
      source: "db",
      result: {
        ok: true,
        events: rows.map(mapMarineEventRow),
      },
    };
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}
