import type {
  StationEventFilters,
  StationEventListItem,
  StationEventDetail,
  StationEventSeverity,
  StationEventStatus,
  StationEventType,
  StationInvestigationFilters,
  StationInvestigationSummary,
  StationInvestigationDetail,
  StationInvestigationStatus,
  EventEvidenceItem,
  EventNoteItem,
  EventActionItem,
  EventHistoryItem,
} from "../../../web/lib/api/types";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { OceanStationsFallbackReason } from "../types";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface StationRow {
  id: string;
}

interface StationEventRow {
  id: string;
  station_id: string;
  event_type: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  detected_at: string;
  resolved_at: string | null;
  investigation_id: string | null;
}

interface EvidenceRow {
  id: string;
  event_id: string;
  source: string;
  kind: string;
  captured_at: string;
  detail: string;
}

interface NoteRow {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

interface ActionRow {
  id: string;
  event_id: string;
  label: string;
  actor_id: string;
  performed_at: string;
  detail: string | null;
}

interface HistoryRow {
  id: string;
  event_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  changed_at: string;
  reason: string | null;
}

interface InvestigationRow {
  id: string;
  station_id: string;
  title: string;
  description: string | null;
  status: string;
  owner: string | null;
  opened_at: string;
  closed_at: string | null;
}

// ---------------------------------------------------------------------------
// Dependencies injection
// ---------------------------------------------------------------------------

interface StationEventsRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type StationEventsListResult =
  | {
      source: "db";
      stationId: string;
      events: StationEventListItem[];
      nextCursor: string | null;
      filters: NormalizedStationEventFilters;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
      filters: NormalizedStationEventFilters;
      nextCursor: null;
    }
  | {
      source: "not_found";
    };

export type StationEventDetailResult =
  | {
      source: "db";
      event: StationEventDetail;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
    }
  | {
      source: "not_found";
    };

export type StationInvestigationsListResult =
  | {
      source: "db";
      stationId: string;
      investigations: StationInvestigationSummary[];
      nextCursor: string | null;
      filters: NormalizedStationInvestigationFilters;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
      filters: NormalizedStationInvestigationFilters;
      nextCursor: null;
    }
  | {
      source: "not_found";
    };

export type StationInvestigationDetailResult =
  | {
      source: "db";
      investigation: StationInvestigationDetail;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
    }
  | {
      source: "not_found";
    };

export type StationEventAcknowledgeResult =
  | { source: "db"; result: "acknowledged"; event: StationEventListItem }
  | { source: "db"; result: "already_acknowledged"; event: StationEventListItem }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

// ---------------------------------------------------------------------------
// Normalized filter types
// ---------------------------------------------------------------------------

export interface NormalizedStationEventFilters {
  status?: StationEventStatus;
  severity?: StationEventSeverity;
  eventType?: StationEventType;
  since?: string;
  until?: string;
  limit: number;
  cursor?: string;
}

export interface NormalizedStationInvestigationFilters {
  status?: StationInvestigationStatus;
  owner?: string;
  limit: number;
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Enum sets
// ---------------------------------------------------------------------------

const STATION_EVENT_STATUSES = new Set<StationEventStatus>([
  "new",
  "acknowledged",
  "investigating",
  "resolved",
  "archived",
]);

const STATION_EVENT_SEVERITIES = new Set<StationEventSeverity>([
  "low",
  "medium",
  "high",
]);

const STATION_EVENT_TYPES = new Set<StationEventType>([
  "thermal_spike",
  "dissolved_oxygen_drop",
  "salinity_shift",
  "ph_drop",
  "turbidity_spike",
  "sensor_health_degraded",
]);

const STATION_INVESTIGATION_STATUSES = new Set<StationInvestigationStatus>([
  "open",
  "monitoring",
  "closed",
  "archived",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) {
    return 25;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function normalizeIsoTimestamp(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  const ts = new Date(normalized).getTime();

  if (!Number.isFinite(ts)) {
    return undefined;
  }

  return new Date(ts).toISOString();
}

function normalizeTextFilter(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

interface ParsedCursor {
  timestamp: string;
  id: string;
}

function parseCursor(cursor: string | undefined): ParsedCursor | undefined {
  const normalized = cursor?.trim();

  if (!normalized) {
    return undefined;
  }

  const separatorIndex = normalized.indexOf("|");

  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return undefined;
  }

  const timestamp = normalizeIsoTimestamp(normalized.slice(0, separatorIndex));
  const id = normalized.slice(separatorIndex + 1).trim();

  if (!timestamp || !id) {
    return undefined;
  }

  return { timestamp, id };
}

function toCursor(timestamp: string, id: string): string {
  return `${timestamp}|${id}`;
}

function normalizeEventStatus(value: string | undefined): StationEventStatus | undefined {
  if (!value) return undefined;
  return STATION_EVENT_STATUSES.has(value as StationEventStatus)
    ? (value as StationEventStatus)
    : undefined;
}

function normalizeEventSeverity(value: string | undefined): StationEventSeverity | undefined {
  if (!value) return undefined;
  return STATION_EVENT_SEVERITIES.has(value as StationEventSeverity)
    ? (value as StationEventSeverity)
    : undefined;
}

function normalizeEventType(value: string | undefined): StationEventType | undefined {
  if (!value) return undefined;
  return STATION_EVENT_TYPES.has(value as StationEventType)
    ? (value as StationEventType)
    : undefined;
}

function normalizeInvestigationStatus(value: string | undefined): StationInvestigationStatus | undefined {
  if (!value) return undefined;
  return STATION_INVESTIGATION_STATUSES.has(value as StationInvestigationStatus)
    ? (value as StationInvestigationStatus)
    : undefined;
}

export function normalizeEventFilters(filters: StationEventFilters = {}): NormalizedStationEventFilters {
  const cursor = parseCursor(filters.cursor);

  return {
    status: normalizeEventStatus(filters.status),
    severity: normalizeEventSeverity(filters.severity),
    eventType: normalizeEventType(filters.eventType),
    since: normalizeIsoTimestamp(filters.since),
    until: normalizeIsoTimestamp(filters.until),
    limit: clampLimit(filters.limit),
    cursor: cursor ? toCursor(cursor.timestamp, cursor.id) : undefined,
  };
}

export function normalizeInvestigationFilters(filters: StationInvestigationFilters = {}): NormalizedStationInvestigationFilters {
  const cursor = parseCursor(filters.cursor);

  return {
    status: normalizeInvestigationStatus(filters.status),
    owner: normalizeTextFilter(filters.owner),
    limit: clampLimit(filters.limit),
    cursor: cursor ? toCursor(cursor.timestamp, cursor.id) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapEventRow(row: StationEventRow): StationEventListItem {
  return {
    id: row.id,
    eventType: normalizeEventType(row.event_type) ?? "thermal_spike",
    severity: normalizeEventSeverity(row.severity) ?? "low",
    status: normalizeEventStatus(row.status) ?? "new",
    title: row.title,
    summary: row.summary,
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    investigationId: row.investigation_id,
  };
}

function mapEvidenceRow(row: EvidenceRow): EventEvidenceItem {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind,
    capturedAt: row.captured_at,
    detail: row.detail,
  };
}

function mapNoteRow(row: NoteRow): EventNoteItem {
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapActionRow(row: ActionRow): EventActionItem {
  return {
    id: row.id,
    label: row.label,
    actorId: row.actor_id,
    performedAt: row.performed_at,
    detail: row.detail,
  };
}

function mapHistoryRow(row: HistoryRow): EventHistoryItem {
  return {
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    reason: row.reason,
  };
}

function mapInvestigationRow(row: InvestigationRow, linkedEventCount = 0): StationInvestigationSummary {
  return {
    id: row.id,
    title: row.title,
    status: normalizeInvestigationStatus(row.status) ?? "open",
    owner: row.owner,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    linkedEventCount,
  };
}

// ---------------------------------------------------------------------------
// Station lookup helper
// ---------------------------------------------------------------------------

function resolveStationRow(db: SqliteDatabaseLike, stationId: string): StationRow | undefined {
  const rows = db.prepare(
    "SELECT id FROM stations WHERE id = ? OR slug = ? LIMIT 1",
  ).all(stationId, stationId) as StationRow[];

  return rows[0];
}

// ---------------------------------------------------------------------------
// Exported repository functions
// ---------------------------------------------------------------------------

export function listStationEvents(
  stationId: string,
  filters: StationEventFilters = {},
  dependencies: StationEventsRepositoryDependencies = {},
): StationEventsListResult {
  const normalizedFilters = normalizeEventFilters(filters);
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "mock",
      fallbackReason: "db_path_missing",
      filters: normalizedFilters,
      nextCursor: null,
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_open_failed",
      filters: normalizedFilters,
      nextCursor: null,
    };
  }

  try {
    const station = resolveStationRow(db, stationId);

    if (!station) {
      return { source: "not_found" };
    }

    const clauses: string[] = ["station_id = ?"];
    const params: unknown[] = [station.id];
    const cursor = parseCursor(normalizedFilters.cursor);

    if (normalizedFilters.status) {
      clauses.push("status = ?");
      params.push(normalizedFilters.status);
    }

    if (normalizedFilters.severity) {
      clauses.push("severity = ?");
      params.push(normalizedFilters.severity);
    }

    if (normalizedFilters.eventType) {
      clauses.push("event_type = ?");
      params.push(normalizedFilters.eventType);
    }

    if (normalizedFilters.since) {
      clauses.push("detected_at >= ?");
      params.push(normalizedFilters.since);
    }

    if (normalizedFilters.until) {
      clauses.push("detected_at <= ?");
      params.push(normalizedFilters.until);
    }

    if (cursor) {
      clauses.push("(detected_at < ? OR (detected_at = ? AND id < ?))");
      params.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }

    const whereClause = `WHERE ${clauses.join(" AND ")}`;
    const rows = db.prepare(
      `SELECT id, station_id, event_type, severity, status, title, summary, detected_at, resolved_at, investigation_id
       FROM station_events
       ${whereClause}
       ORDER BY detected_at DESC, id DESC
       LIMIT ?`,
    ).all(...params, normalizedFilters.limit) as StationEventRow[];

    const events = rows.map(mapEventRow);
    const lastRow = rows[rows.length - 1];
    const nextCursor = rows.length === normalizedFilters.limit && lastRow
      ? toCursor(lastRow.detected_at, lastRow.id)
      : null;

    return {
      source: "db",
      stationId: station.id,
      events,
      nextCursor,
      filters: normalizedFilters,
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: normalizedFilters,
      nextCursor: null,
    };
  } finally {
    db.close();
  }
}

export function getStationEventDetail(
  stationId: string,
  eventId: string,
  dependencies: StationEventsRepositoryDependencies = {},
): StationEventDetailResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const station = resolveStationRow(db, stationId);

    if (!station) {
      return { source: "not_found" };
    }

    const eventRows = db.prepare(
      `SELECT id, station_id, event_type, severity, status, title, summary, detected_at, resolved_at, investigation_id
       FROM station_events
       WHERE station_id = ? AND id = ?
       LIMIT 1`,
    ).all(station.id, eventId) as StationEventRow[];

    const eventRow = eventRows[0];

    if (!eventRow) {
      return { source: "not_found" };
    }

    const evidence = (db.prepare(
      "SELECT id, event_id, source, kind, captured_at, detail FROM station_event_evidence WHERE event_id = ? ORDER BY captured_at ASC",
    ).all(eventId) as EvidenceRow[]).map(mapEvidenceRow);

    const notes = (db.prepare(
      "SELECT id, event_id, author_id, body, created_at FROM station_event_notes WHERE event_id = ? ORDER BY created_at ASC",
    ).all(eventId) as NoteRow[]).map(mapNoteRow);

    const actions = (db.prepare(
      "SELECT id, event_id, label, actor_id, performed_at, detail FROM station_event_actions WHERE event_id = ? ORDER BY performed_at ASC",
    ).all(eventId) as ActionRow[]).map(mapActionRow);

    const history = (db.prepare(
      "SELECT id, event_id, from_status, to_status, changed_by, changed_at, reason FROM station_event_history WHERE event_id = ? ORDER BY changed_at ASC",
    ).all(eventId) as HistoryRow[]).map(mapHistoryRow);

    const event: StationEventDetail = {
      ...mapEventRow(eventRow),
      stationId: station.id,
      evidence,
      notes,
      actions,
      history,
    };

    return { source: "db", event };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function listStationInvestigations(
  stationId: string,
  filters: StationInvestigationFilters = {},
  dependencies: StationEventsRepositoryDependencies = {},
): StationInvestigationsListResult {
  const normalizedFilters = normalizeInvestigationFilters(filters);
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "mock",
      fallbackReason: "db_path_missing",
      filters: normalizedFilters,
      nextCursor: null,
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_open_failed",
      filters: normalizedFilters,
      nextCursor: null,
    };
  }

  try {
    const station = resolveStationRow(db, stationId);

    if (!station) {
      return { source: "not_found" };
    }

    const clauses: string[] = ["i.station_id = ?"];
    const params: unknown[] = [station.id];
    const cursor = parseCursor(normalizedFilters.cursor);

    if (normalizedFilters.status) {
      clauses.push("i.status = ?");
      params.push(normalizedFilters.status);
    }

    if (normalizedFilters.owner) {
      clauses.push("i.owner = ?");
      params.push(normalizedFilters.owner);
    }

    if (cursor) {
      clauses.push("(i.opened_at < ? OR (i.opened_at = ? AND i.id < ?))");
      params.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }

    const whereClause = `WHERE ${clauses.join(" AND ")}`;
    const rows = db.prepare(
      `SELECT i.id, i.station_id, i.title, i.description, i.status, i.owner, i.opened_at, i.closed_at,
              COUNT(e.id) AS linked_event_count
       FROM station_investigations i
       LEFT JOIN station_events e ON e.investigation_id = i.id
       ${whereClause}
       GROUP BY i.id
       ORDER BY i.opened_at DESC, i.id DESC
       LIMIT ?`,
    ).all(...params, normalizedFilters.limit) as Array<InvestigationRow & { linked_event_count: number }>;

    const investigations = rows.map((row) => mapInvestigationRow(row, row.linked_event_count));
    const lastRow = rows[rows.length - 1];
    const nextCursor = rows.length === normalizedFilters.limit && lastRow
      ? toCursor(lastRow.opened_at, lastRow.id)
      : null;

    return {
      source: "db",
      stationId: station.id,
      investigations,
      nextCursor,
      filters: normalizedFilters,
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: normalizedFilters,
      nextCursor: null,
    };
  } finally {
    db.close();
  }
}

export function getStationInvestigationDetail(
  stationId: string,
  investigationId: string,
  dependencies: StationEventsRepositoryDependencies = {},
): StationInvestigationDetailResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const station = resolveStationRow(db, stationId);

    if (!station) {
      return { source: "not_found" };
    }

    const invRows = db.prepare(
      `SELECT id, station_id, title, description, status, owner, opened_at, closed_at
       FROM station_investigations
       WHERE station_id = ? AND id = ?
       LIMIT 1`,
    ).all(station.id, investigationId) as InvestigationRow[];

    const invRow = invRows[0];

    if (!invRow) {
      return { source: "not_found" };
    }

    const linkedEvents = (db.prepare(
      `SELECT id, station_id, event_type, severity, status, title, summary, detected_at, resolved_at, investigation_id
       FROM station_events
       WHERE investigation_id = ?
       ORDER BY detected_at ASC`,
    ).all(investigationId) as StationEventRow[]).map(mapEventRow);

    const investigation: StationInvestigationDetail = {
      ...mapInvestigationRow(invRow, linkedEvents.length),
      stationId: station.id,
      description: invRow.description,
      events: linkedEvents,
    };

    return { source: "db", investigation };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Acknowledge station event (new → acknowledged)
// ---------------------------------------------------------------------------

export function acknowledgeStationEvent(
  stationId: string,
  eventId: string,
  actorId: string,
  dependencies: StationEventsRepositoryDependencies = {},
): StationEventAcknowledgeResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const nowFn = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const station = resolveStationRow(db, stationId);

    if (!station) {
      return { source: "db", result: "not_found" };
    }

    const eventRows = db.prepare(
      `SELECT id, station_id, event_type, severity, status, title, summary, detected_at, resolved_at, investigation_id
       FROM station_events
       WHERE station_id = ? AND id = ?
       LIMIT 1`,
    ).all(station.id, eventId) as StationEventRow[];

    const eventRow = eventRows[0];

    if (!eventRow) {
      return { source: "db", result: "not_found" };
    }

    const current = mapEventRow(eventRow);

    if (current.status !== "new") {
      return { source: "db", result: "already_acknowledged", event: current };
    }

    const nowMs = nowFn();
    const nowIso = new Date(nowMs).toISOString();

    const updateStatement = db.prepare(
      `UPDATE station_events
       SET status = 'acknowledged', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND station_id = ?`,
    );

    if (!updateStatement.run) {
      throw new Error("Writable event update statement is unavailable");
    }

    updateStatement.run(eventId, station.id);

    const historyId = `EVT-HIST-ACK-${eventId}-${nowMs}`;
    const insertHistoryStatement = db.prepare(
      `INSERT INTO station_event_history (id, event_id, from_status, to_status, changed_by, changed_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    if (!insertHistoryStatement.run) {
      throw new Error("Writable event history insert statement is unavailable");
    }

    insertHistoryStatement.run(historyId, eventId, "new", "acknowledged", actorId, nowIso, null);

    const updatedRows = db.prepare(
      `SELECT id, station_id, event_type, severity, status, title, summary, detected_at, resolved_at, investigation_id
       FROM station_events
       WHERE id = ? AND station_id = ?
       LIMIT 1`,
    ).all(eventId, station.id) as StationEventRow[];

    const updatedRow = updatedRows[0];

    if (!updatedRow) {
      return { source: "db", result: "not_found" };
    }

    return { source: "db", result: "acknowledged", event: mapEventRow(updatedRow) };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
