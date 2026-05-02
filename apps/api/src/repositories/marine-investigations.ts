import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
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
  TruthPartition,
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
  getAdapter?: typeof getAsyncAdapter;
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
  source_type: "signal" | "anomaly" | null;
  station_id: string | null;
  region: string | null;
  detected_at: string | null;
  status: string;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
  truth_partition: string;
}

function normalizeText(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeInvestigationSourceType(value: unknown): "signal" | "anomaly" | null {
  if (value === "signal" || value === "anomaly") {
    return value;
  }

  return null;
}

function normalizeDetectedAt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
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

function mapRow(row: MarineInvestigationRow): MarineInvestigationRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    title: row.title,
    sourceType: normalizeInvestigationSourceType(row.source_type),
    stationId: row.station_id,
    region: row.region,
    detectedAt: row.detected_at,
    status: normalizeStatus(row.status) ?? "open",
    ownerId: row.owner_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
    truthPartition: (row.truth_partition as TruthPartition) || "FIELD_TRUTH",
  };
}

async function nextInvestigationId(adapter: AsyncDbAdapter, nowMs: number): Promise<string> {
  const rows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_investigations") as Array<{ total: number }>;
  const total = Number(rows[0]?.total ?? 0);
  return `MIID-${nowMs}-${total + 1}`;
}

export async function ensureMarineInvestigationTables(adapter: AsyncDbAdapter) {
  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS marine_intelligence_investigations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_type TEXT,
      station_id TEXT,
      region TEXT,
      detected_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      owner_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      acknowledged_at TEXT,
      resolved_at TEXT,
      dismissed_at TEXT,
      truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'
    )
  `);

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_investigations_event
     ON marine_intelligence_investigations (event_id)`,
  );

  // Column Guard: truth_partition
  try {
    await adapter.execute("ALTER TABLE marine_intelligence_investigations ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'");
  } catch {
    // Column already exists
  }

  // Column guards for investigation metadata depth.
  try {
    await adapter.execute("ALTER TABLE marine_intelligence_investigations ADD COLUMN source_type TEXT");
  } catch {
    // Column already exists
  }

  try {
    await adapter.execute("ALTER TABLE marine_intelligence_investigations ADD COLUMN station_id TEXT");
  } catch {
    // Column already exists
  }

  try {
    await adapter.execute("ALTER TABLE marine_intelligence_investigations ADD COLUMN region TEXT");
  } catch {
    // Column already exists
  }

  try {
    await adapter.execute("ALTER TABLE marine_intelligence_investigations ADD COLUMN detected_at TEXT");
  } catch {
    // Column already exists
  }

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_investigations_status
     ON marine_intelligence_investigations (status, created_at DESC)`,
  );

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_investigations_partition_at
     ON marine_intelligence_investigations (truth_partition, created_at DESC)`,
  );
}

export async function createMarineInvestigation(
  input: MarineInvestigationCreateInput,
  dependencies: MarineInvestigationRepositoryDeps = {},
): Promise<MarineInvestigationsRepositoryCreateResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
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
  const isTurso = !!process.env.TURSO_DATABASE_URL;

  if (!isTurso && !hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(false);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureMarineInvestigationTables(adapter);

    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    const id = await nextInvestigationId(adapter, nowMs);
    const ownerId = normalizeText(input.ownerId ?? null);
    const sourceType = normalizeInvestigationSourceType(input.sourceType);
    const stationId = normalizeText(input.stationId ?? null);
    const region = normalizeText(input.region ?? null);
    const detectedAt = normalizeDetectedAt(input.detectedAt ?? null);
    const truthPartition = input.truthPartition || "FIELD_TRUTH";

    await adapter.execute(`
      INSERT INTO marine_intelligence_investigations
        (id, event_id, title, source_type, station_id, region, detected_at, status, owner_id, notes,
         created_at, updated_at, acknowledged_at, resolved_at, dismissed_at, truth_partition)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?, NULL, NULL, NULL, ?)
    `, [
      id,
      eventIdNorm,
      titleNorm,
      sourceType,
      stationId,
      region,
      detectedAt,
      ownerId,
      nowIso,
      nowIso,
      truthPartition,
    ]);

    const rows = await adapter.execute(
      "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      [id]
    ) as MarineInvestigationRow[];

    const investigation = rows[0] ? mapRow(rows[0]) : null;
    return { source: "db", result: { ok: true, investigation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export async function getMarineInvestigation(
  id: string,
  dependencies: MarineInvestigationRepositoryDeps = {},
): Promise<MarineInvestigationsRepositoryGetResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;

  const dbPath = resolvePath();
  const isTurso = !!process.env.TURSO_DATABASE_URL;

  if (!isTurso && !hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(true);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureMarineInvestigationTables(adapter);

    const rows = await adapter.execute(
      "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      [id]
    ) as MarineInvestigationRow[];

    const investigation = rows[0] ? mapRow(rows[0]) : null;
    return { source: "db", result: { ok: true, investigation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export async function listMarineInvestigations(
  filters: MarineInvestigationListFilters & { includeAllPartitions?: boolean; truthPartition?: TruthPartition } = {},
  dependencies: MarineInvestigationRepositoryDeps = {},
): Promise<MarineInvestigationsRepositoryListResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;

  const dbPath = resolvePath();
  const isTurso = !!process.env.TURSO_DATABASE_URL;

  if (!isTurso && !hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(true);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureMarineInvestigationTables(adapter);

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

    if (!filters.includeAllPartitions) {
      clauses.push("truth_partition = ?");
      params.push(filters.truthPartition ?? "FIELD_TRUTH");
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = normalizeLimit(filters.limit);

    params.push(limit);

    const rows = await adapter.execute(
      `SELECT * FROM marine_intelligence_investigations
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    ) as MarineInvestigationRow[];

    return {
      source: "db",
      result: { ok: true, investigations: rows.map(mapRow) },
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export async function transitionMarineInvestigation(
  id: string,
  transition: MarineInvestigationTransition,
  notes: string | null = null,
  dependencies: MarineInvestigationRepositoryDeps = {},
): Promise<MarineInvestigationsRepositoryTransitionResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;

  const dbPath = resolvePath();
  const isTurso = !!process.env.TURSO_DATABASE_URL;

  if (!isTurso && !hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(false);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureMarineInvestigationTables(adapter);

    const rows = await adapter.execute(
      "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      [id]
    ) as MarineInvestigationRow[];

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

    await adapter.execute(`
      UPDATE marine_intelligence_investigations
      SET status = ?, updated_at = ?,
          acknowledged_at = ?, resolved_at = ?, dismissed_at = ?, notes = ?
      WHERE id = ?
    `, [
      targetStatus,
      nowIso,
      acknowledgedAt,
      resolvedAt,
      dismissedAt,
      updatedNotes,
      id,
    ]);

    const updatedRows = await adapter.execute(
      "SELECT * FROM marine_intelligence_investigations WHERE id = ?",
      [id]
    ) as MarineInvestigationRow[];

    const investigation = updatedRows[0] ? mapRow(updatedRows[0]) : null;
    return { source: "db", result: { ok: true, investigation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}
