import type {
  StationAdminAuthEvent,
  StationAdminAuthEventFilters,
  StationAdminAuthEventExportPayload,
  StationAdminAuthEventType,
  StationAdminRequestMetadata,
} from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { OceanStationsFallbackReason } from "../types";

interface StationAdminAuthEventRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  session_id: string | null;
  occurred_at: string;
  metadata: string | null;
}

interface StationAdminAuthEventRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
}

export type StationAdminAuthEventsReadResult =
  | {
      source: "db";
      events: StationAdminAuthEvent[];
      filters: NormalizedStationAdminAuthEventFilters;
      nextCursor: string | null;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
      filters: NormalizedStationAdminAuthEventFilters;
      nextCursor: string | null;
    };

export type StationAdminAuthEventsExportResult =
  | {
      source: "db";
      export: StationAdminAuthEventExportPayload;
      filters: NormalizedStationAdminAuthEventFilters;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
      export: StationAdminAuthEventExportPayload;
      filters: NormalizedStationAdminAuthEventFilters;
    };

export interface NormalizedStationAdminAuthEventFilters {
  eventType?: StationAdminAuthEventType;
  actor?: string;
  ip?: string;
  since?: string;
  until?: string;
  limit: number;
  cursor?: string;
}

const STATION_ADMIN_AUTH_EVENT_TYPES = new Set<StationAdminAuthEventType>([
  "login_success",
  "login_failure",
  "login_locked",
  "mfa_enrollment",
  "mfa_challenge_success",
  "mfa_challenge_failure",
  "mfa_challenge_locked",
  "mfa_challenge_expired",
  "mfa_verify_rate_limited",
  "mfa_abuse_detected",
  "recovery_code_used",
  "logout",
  "refresh",
  "revoke",
]);

function normalizeEventType(value: string | undefined): StationAdminAuthEventType | undefined {
  if (!value) {
    return undefined;
  }

  return STATION_ADMIN_AUTH_EVENT_TYPES.has(value as StationAdminAuthEventType)
    ? (value as StationAdminAuthEventType)
    : undefined;
}

function normalizeIsoTimestamp(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  const timestamp = new Date(normalized).getTime();

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) {
    return 25;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function clampExportLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) {
    return 500;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 1000);
}

function normalizeTextFilter(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function escapeForSqlLike(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

interface ParsedEventCursor {
  occurredAt: string;
  id: string;
}

function parseEventCursor(cursor: string | undefined): ParsedEventCursor | undefined {
  const normalized = cursor?.trim();

  if (!normalized) {
    return undefined;
  }

  const separatorIndex = normalized.indexOf("|");

  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return undefined;
  }

  const occurredAt = normalizeIsoTimestamp(normalized.slice(0, separatorIndex));
  const id = normalized.slice(separatorIndex + 1).trim();

  if (!occurredAt || !id) {
    return undefined;
  }

  return { occurredAt, id };
}

function toEventCursor(occurredAt: string, id: string): string {
  return `${occurredAt}|${id}`;
}

export function normalizeStationAdminRequestMetadata(
  metadata: StationAdminRequestMetadata | undefined,
): StationAdminRequestMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const ip = typeof metadata.ip === "string" && metadata.ip.trim() ? metadata.ip.trim() : null;
  const userAgent = typeof metadata.userAgent === "string" && metadata.userAgent.trim()
    ? metadata.userAgent.trim()
    : null;
  const source = typeof metadata.source === "string" && metadata.source.trim()
    ? metadata.source.trim()
    : null;

  if (!ip && !userAgent && !source) {
    return undefined;
  }

  return {
    ip,
    userAgent,
    source,
  };
}

export function parseStationAdminEventMetadata(value: string | null): {
  ip: string | null;
  userAgent: string | null;
  source: string | null;
} {
  if (!value) {
    return {
      ip: null,
      userAgent: null,
      source: null,
    };
  }

  try {
    const parsed = normalizeStationAdminRequestMetadata(JSON.parse(value) as StationAdminRequestMetadata);

    return {
      ip: parsed?.ip ?? null,
      userAgent: parsed?.userAgent ?? null,
      source: parsed?.source ?? null,
    };
  } catch {
    return {
      ip: null,
      userAgent: null,
      source: null,
    };
  }
}

export function normalizeStationAdminAuthEventFilters(
  filters: StationAdminAuthEventFilters = {},
): NormalizedStationAdminAuthEventFilters {
  const cursor = parseEventCursor(filters.cursor);

  return {
    eventType: normalizeEventType(filters.eventType),
    actor: normalizeTextFilter(filters.actor),
    ip: normalizeTextFilter(filters.ip),
    since: normalizeIsoTimestamp(filters.since),
    until: normalizeIsoTimestamp(filters.until),
    limit: clampLimit(filters.limit),
    cursor: cursor ? toEventCursor(cursor.occurredAt, cursor.id) : undefined,
  };
}

function normalizeStationAdminAuthEventExportFilters(
  filters: StationAdminAuthEventFilters = {},
): NormalizedStationAdminAuthEventFilters {
  const normalized = normalizeStationAdminAuthEventFilters(filters);

  return {
    ...normalized,
    limit: clampExportLimit(filters.limit),
    cursor: undefined,
  };
}

function mapRowsToEvents(rows: StationAdminAuthEventRow[]): StationAdminAuthEvent[] {
  return rows.map((row) => {
    const metadata = parseStationAdminEventMetadata(row.metadata);
    return {
      id: row.id,
      eventType: normalizeEventType(row.event_type) ?? "login_failure",
      actorId: row.actor_id,
      sessionId: row.session_id,
      occurredAt: row.occurred_at,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      source: metadata.source,
    } satisfies StationAdminAuthEvent;
  });
}

export function listStationAdminAuthEvents(
  filters: StationAdminAuthEventFilters = {},
  dependencies: StationAdminAuthEventRepositoryDependencies = {},
): StationAdminAuthEventsReadResult {
  const normalizedFilters = normalizeStationAdminAuthEventFilters(filters);
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
    const clauses: string[] = [];
    const params: unknown[] = [];
    const cursor = parseEventCursor(normalizedFilters.cursor);

    if (normalizedFilters.eventType) {
      clauses.push("event_type = ?");
      params.push(normalizedFilters.eventType);
    }

    if (normalizedFilters.actor) {
      clauses.push("actor_id = ?");
      params.push(normalizedFilters.actor);
    }

    if (normalizedFilters.ip) {
      const escapedIp = escapeForSqlLike(normalizedFilters.ip.replace(/"/g, "\\\""));
      clauses.push("(metadata LIKE ? ESCAPE '\\\\' OR metadata LIKE ? ESCAPE '\\\\')");
      params.push(`%\"ip\":\"${escapedIp}\"%`);
      params.push(`%\"ip\": \"${escapedIp}\"%`);
    }

    if (normalizedFilters.since) {
      clauses.push("occurred_at >= ?");
      params.push(normalizedFilters.since);
    }

    if (normalizedFilters.until) {
      clauses.push("occurred_at <= ?");
      params.push(normalizedFilters.until);
    }

    if (cursor) {
      clauses.push("(occurred_at < ? OR (occurred_at = ? AND id < ?))");
      params.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db.prepare(
      `SELECT id, event_type, actor_id, session_id, occurred_at, metadata
       FROM station_admin_auth_events
       ${whereClause}
       ORDER BY occurred_at DESC, id DESC
       LIMIT ?`,
    ).all(...params, normalizedFilters.limit) as StationAdminAuthEventRow[];

    const events = mapRowsToEvents(rows);
    const lastRow = rows[rows.length - 1];
    const nextCursor = rows.length === normalizedFilters.limit && lastRow
      ? toEventCursor(lastRow.occurred_at, lastRow.id)
      : null;

    return {
      source: "db",
      filters: normalizedFilters,
      events,
      nextCursor,
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

export function exportStationAdminAuthEvents(
  filters: StationAdminAuthEventFilters = {},
  dependencies: StationAdminAuthEventRepositoryDependencies = {},
): StationAdminAuthEventsExportResult {
  const normalizedFilters = normalizeStationAdminAuthEventExportFilters(filters);
  const exportedAt = new Date().toISOString();
  const fileName = `station-admin-events-${exportedAt.replace(/[:.]/g, "-")}.json`;
  const events: StationAdminAuthEvent[] = [];
  let cursor: string | undefined;

  while (events.length < normalizedFilters.limit) {
    const pageResult = listStationAdminAuthEvents(
      {
        ...normalizedFilters,
        cursor,
        limit: Math.min(100, normalizedFilters.limit - events.length),
      },
      dependencies,
    );

    if (pageResult.source !== "db") {
      return {
        source: "mock",
        fallbackReason: pageResult.fallbackReason,
        filters: normalizedFilters,
        export: {
          format: "json",
          fileName,
          exportedAt,
          filters: normalizedFilters,
          events: [],
        },
      };
    }

    events.push(...pageResult.events);

    if (!pageResult.nextCursor || pageResult.events.length === 0) {
      break;
    }

    cursor = pageResult.nextCursor;
  }

  return {
    source: "db",
    filters: normalizedFilters,
    export: {
      format: "json",
      fileName,
      exportedAt,
      filters: normalizedFilters,
      events,
    },
  };
}
