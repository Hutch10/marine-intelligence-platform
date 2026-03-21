import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type {
  MarineInvestigationCreateInput,
  MarineInvestigationCreateResult,
  MarineInvestigationGetResult,
  MarineInvestigationListFilters,
  MarineInvestigationListResult,
  MarineInvestigationRecord,
  MarineInvestigationStatus,
  MarineInvestigationTransition,
  MarineInvestigationTransitionResult,
} from "../marine-intelligence-types";

const VALID_STATUSES = new Set<MarineInvestigationStatus>([
  "open",
  "acknowledged",
  "in_review",
  "resolved",
  "dismissed",
]);

const ALLOWED_TRANSITIONS: Record<
  MarineInvestigationStatus,
  MarineInvestigationTransition[]
> = {
  open: ["acknowledge"],
  acknowledged: ["start_review"],
  in_review: ["resolve", "dismiss"],
  resolved: [],
  dismissed: [],
};

const TRANSITION_TARGET: Record<
  MarineInvestigationTransition,
  MarineInvestigationStatus
> = {
  acknowledge: "acknowledged",
  start_review: "in_review",
  resolve: "resolved",
  dismiss: "dismissed",
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface MarineInvestigationRepositoryDeps {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

export type MarineInvestigationsRepositoryCreateResult =
  | { source: "db"; result: MarineInvestigationCreateResult }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineInvestigationsRepositoryGetResult =
  | { source: "db"; result: MarineInvestigationGetResult }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineInvestigationsRepositoryListResult =
  | { source: "db"; result: MarineInvestigationListResult }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineInvestigationsRepositoryTransitionResult =
  | { source: "db"; result: MarineInvestigationTransitionResult }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

interface MarineInvestigationRow {
  id: string;
  event_id: string;
  title: string;
  status: string;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
}

function normalizeText(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatus(value: string): MarineInvestigationStatus | null {
  return VALID_STATUSES.has(value as MarineInvestigationStatus)
    ? (value as MarineInvestigationStatus)
    : null;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit as number), 1), MAX_LIMIT);
}

function runStatement(
  stmt: { all(...p: unknown[]): unknown[]; run?(...p: unknown[]): unknown },
  ...params: unknown[]
) {
  if (typeof stmt.run === "function") {
    stmt.run(...params);
    return;
  }
  stmt.all(...params);
}

function mapRow(row: MarineInvestigationRow): MarineInvestigationRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    title: row.title,
    status: normalizeStatus(row.status) ?? "open",
    ownerId: row.owner_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
  };
}

function nextInvestigationId(db: SqliteDatabaseLike, nowMs: number): string {
  const rows = db
    .prepare("SELECT COUNT(*) AS total FROM marine_intelligence_investigations")
    .all() as Array<{ total: number }>;
  const total = Number(rows[0]?.total ?? 0);
  return `MIID-${nowMs}-${total + 1}`;
}

export function ensureMarineInvestigationTables(db: SqliteDatabaseLike) {
  runStatement(
    db.prepare(`
      CREATE TABLE IF NOT EXISTS marine_intelligence_investigations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        owner_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        acknowledged_at TEXT,
        resolved_at TEXT,
        dismissed_at TEXT
      )
    `),
  );

  runStatement(
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_investigations_event
       ON marine_intelligence_investigations (event_id)`,
    ),
  );

  runStatement(
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_investigations_status
       ON marine_intelligence_investigations (status, created_at DESC)`,
    ),
  );
}

export function createMarineInvestigation(
  input: MarineInvestigationCreateInput,
  dependencies: MarineInvestigationRepositoryDeps = {},
): MarineInvestigationsRepositoryCreateResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;

  const eventIdNorm = normalizeText(input.eventId);
  if (!eventIdNorm) {
    return {
      source: "db",
      result: {
        ok: false,
        reason: "validation",
        error: "eventId is required",
        investigation: null,
      },
    };
  }

  const titleNorm = normalizeText(input.title);
  if (!titleNorm) {
    return {
      source: "db",
      result: {
        ok: false,
        reason: "validation",
        error: "title is required",
        investigation: null,
      },
    };
  }

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureMarineInvestigationTables(db);

    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    const id = nextInvestigationId(db, nowMs);
    const ownerId = normalizeText(input.ownerId ?? null);

    runStatement(
      db.prepare(`
        INSERT INTO marine_intelligence_investigations
          (id, event_id, title, status, owner_id, notes,
           created_at, updated_at, acknowledged_at, resolved_at, dismissed_at)
        VALUES (?, ?, ?, 'open', ?, NULL, ?, ?, NULL, NULL, NULL)
      `),
      id,
      eventIdNorm,
      titleNorm,
      ownerId,
      nowIso,
      nowIso,
    );

    const rows = db
      .prepare(
        "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      )
      .all(id) as MarineInvestigationRow[];

    const investigation = rows[0] ? mapRow(rows[0]) : null;
    return { source: "db", result: { ok: true, investigation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }
}

export function getMarineInvestigation(
  id: string,
  dependencies: MarineInvestigationRepositoryDeps = {},
): MarineInvestigationsRepositoryGetResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    const rows = db
      .prepare(
        "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      )
      .all(id) as MarineInvestigationRow[];

    const investigation = rows[0] ? mapRow(rows[0]) : null;
    return { source: "db", result: { ok: true, investigation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }
}

export function listMarineInvestigations(
  filters: MarineInvestigationListFilters = {},
  dependencies: MarineInvestigationRepositoryDeps = {},
): MarineInvestigationsRepositoryListResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.eventId) {
      clauses.push("event_id = ?");
      params.push(filters.eventId.trim());
    }

    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }

    if (filters.ownerId) {
      clauses.push("owner_id = ?");
      params.push(filters.ownerId.trim());
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = normalizeLimit(filters.limit);

    params.push(limit);

    const rows = db
      .prepare(
        `SELECT * FROM marine_intelligence_investigations
         ${where}
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(...params) as MarineInvestigationRow[];

    return {
      source: "db",
      result: { ok: true, investigations: rows.map(mapRow) },
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }
}

export function transitionMarineInvestigation(
  id: string,
  transition: MarineInvestigationTransition,
  notes: string | null = null,
  dependencies: MarineInvestigationRepositoryDeps = {},
): MarineInvestigationsRepositoryTransitionResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureMarineInvestigationTables(db);

    const rows = db
      .prepare(
        "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      )
      .all(id) as MarineInvestigationRow[];

    if (!rows[0]) {
      return {
        source: "db",
        result: {
          ok: false,
          reason: "not_found",
          error: `Investigation ${id} not found`,
          investigation: null,
        },
      };
    }

    const current = mapRow(rows[0]);
    const allowed = ALLOWED_TRANSITIONS[current.status];

    if (!allowed.includes(transition)) {
      return {
        source: "db",
        result: {
          ok: false,
          reason: "invalid_transition",
          error: `Cannot apply '${transition}' to an investigation in '${current.status}' status`,
          investigation: null,
        },
      };
    }

    const targetStatus = TRANSITION_TARGET[transition];
    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();

    let acknowledgedAt = current.acknowledgedAt;
    let resolvedAt = current.resolvedAt;
    let dismissedAt = current.dismissedAt;
    let updatedNotes = current.notes;

    if (transition === "acknowledge") acknowledgedAt = nowIso;
    if (transition === "resolve") resolvedAt = nowIso;
    if (transition === "dismiss") dismissedAt = nowIso;
    if (notes !== null) updatedNotes = notes.trim() || null;

    runStatement(
      db.prepare(`
        UPDATE marine_intelligence_investigations
        SET status = ?, updated_at = ?,
            acknowledged_at = ?, resolved_at = ?, dismissed_at = ?, notes = ?
        WHERE id = ?
      `),
      targetStatus,
      nowIso,
      acknowledgedAt,
      resolvedAt,
      dismissedAt,
      updatedNotes,
      id,
    );

    const updatedRows = db
      .prepare(
        "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      )
      .all(id) as MarineInvestigationRow[];

    const investigation = updatedRows[0] ? mapRow(updatedRows[0]) : null;
    return { source: "db", result: { ok: true, investigation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }
}
