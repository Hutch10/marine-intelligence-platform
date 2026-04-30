import type {
  InvestigationTimelineEventType,
  InvestigationTimelineItem,
} from "@marine/shared";
import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import type { InvestigationFallbackReason } from "../types";

interface InvestigationEventRow {
  id: string;
  event_type: string;
  source: string;
  summary: string;
  detail: string | null;
  created_at: number | string;
}

const EVENT_TYPES = new Set<InvestigationTimelineEventType>([
  "case_opened",
  "signal_linked",
  "hypothesis_tested",
  "evidence_promoted",
  "track_escalated",
  "case_closed",
]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface InvestigationTimelineFilters {
  eventType?: InvestigationTimelineEventType;
  limit?: number | string;
}

export interface RecordInvestigationEventInput {
  investigationId: string;
  eventType: InvestigationTimelineEventType;
  source: string;
  actor?: string;
  summary: string;
  detail?: string;
  confidence?: number;
}

export type InvestigationTimelineResult =
  | { source: "db"; timeline: InvestigationTimelineItem[] }
  | { source: "mock"; fallbackReason: InvestigationFallbackReason };

export type RecordInvestigationEventResult =
  | { source: "db"; result: "created"; event: InvestigationTimelineItem }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: InvestigationFallbackReason };

interface InvestigationEventsDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  getAdapter?: typeof getAsyncAdapter;
  now?: () => number;
}

async function ensureInvestigationEventsTable(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS investigation_events (
      id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id),
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      actor TEXT,
      summary TEXT NOT NULL,
      detail TEXT,
      confidence INTEGER,
      created_at INTEGER NOT NULL
    )`,
  );
}

function normalizeEventType(value: string): InvestigationTimelineEventType {
  if (EVENT_TYPES.has(value as InvestigationTimelineEventType)) {
    return value as InvestigationTimelineEventType;
  }

  return "signal_linked";
}

function normalizeCreatedAt(value: number | string, now: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return now;
}

function toTimelineItem(row: InvestigationEventRow, now: number): InvestigationTimelineItem {
  const createdAt = normalizeCreatedAt(row.created_at, now);

  return {
    id: row.id,
    timestamp: new Date(createdAt).toISOString(),
    eventType: normalizeEventType(row.event_type),
    source: row.source,
    summary: row.summary,
    detail: row.detail ?? undefined,
  };
}

function normalizeLimit(rawLimit: number | string | undefined): number {
  if (rawLimit === undefined) {
    return DEFAULT_LIMIT;
  }

  const limit = typeof rawLimit === "string" ? Number(rawLimit) : rawLimit;

  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function createEventId(now: number): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomUUID } = runtimeRequire("node:crypto") as { randomUUID: () => string };
  return `INV-EVT-${now}-${randomUUID()}`;
}

async function investigationExists(adapter: AsyncDbAdapter, investigationId: string): Promise<boolean> {
  const rows = await adapter.execute(
    "SELECT id FROM investigations WHERE id = ? LIMIT 1",
    [investigationId]
  ) as Array<{ id: string }>;
  return rows.length > 0;
}

async function findDuplicateEvent(
  adapter: AsyncDbAdapter,
  input: RecordInvestigationEventInput,
): Promise<InvestigationEventRow | null> {
  const rows = await adapter.execute(
    `SELECT id, event_type, source, summary, detail, created_at
     FROM investigation_events
     WHERE investigation_id = ?
       AND event_type = ?
       AND source = ?
       AND summary = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.investigationId, input.eventType, input.source, input.summary]
  ) as InvestigationEventRow[];
  return rows[0] ?? null;
}

export async function getInvestigationTimeline(
  investigationId: string,
  filters: InvestigationTimelineFilters = {},
  dependencies: InvestigationEventsDependencies = {},
): Promise<InvestigationTimelineResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  const isTurso = !!process.env.TURSO_DATABASE_URL;
  if (!isTurso && !hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(true);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureInvestigationEventsTable(adapter);

    const limit = normalizeLimit(filters.limit);

    const sql = filters.eventType
      ? `SELECT id, event_type, source, summary, detail, created_at
         FROM investigation_events
         WHERE investigation_id = ? AND event_type = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      : `SELECT id, event_type, source, summary, detail, created_at
         FROM investigation_events
         WHERE investigation_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`;

    const params = filters.eventType
      ? [investigationId, filters.eventType, limit]
      : [investigationId, limit];

    const rows = await adapter.execute(sql, params) as InvestigationEventRow[];

    return {
      source: "db",
      timeline: rows.map((row) => toTimelineItem(row, now())),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export async function recordInvestigationEvent(
  input: RecordInvestigationEventInput,
  dependencies: InvestigationEventsDependencies = {},
): Promise<RecordInvestigationEventResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  const isTurso = !!process.env.TURSO_DATABASE_URL;
  if (!isTurso && !hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(false);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureInvestigationEventsTable(adapter);

    if (!(await investigationExists(adapter, input.investigationId))) {
      return { source: "db", result: "not_found" };
    }

    const duplicate = await findDuplicateEvent(adapter, input);
    if (duplicate) {
      return {
        source: "db",
        result: "created",
        event: toTimelineItem(duplicate, now()),
      };
    }

    const createdAt = now();
    const id = createEventId(createdAt);

    await adapter.execute(
      `INSERT INTO investigation_events
        (id, investigation_id, event_type, source, actor, summary, detail, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.investigationId,
        input.eventType,
        input.source,
        input.actor ?? null,
        input.summary,
        input.detail ?? null,
        input.confidence ?? null,
        createdAt,
      ]
    );

    return {
      source: "db",
      result: "created",
      event: {
        id,
        timestamp: new Date(createdAt).toISOString(),
        eventType: input.eventType,
        source: input.source,
        summary: input.summary,
        detail: input.detail,
      },
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}
