import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import { attachFeedbackToMarineRiskEvaluation } from "./marine-intelligence-validation";

export type MarineIntelligenceDecisionEventType = "view" | "click" | "submit_decision";

export interface MarineIntelligenceDecisionRecord {
  id: string;
  investigationId: string;
  stationId: string;
  decision: string;
  rationale: string;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarineIntelligenceTelemetryRecord {
  id: string;
  eventType: MarineIntelligenceDecisionEventType;
  investigationId: string | null;
  stationId: string | null;
  decisionId: string | null;
  timestamp: string;
  details: string | null;
  createdAt: string;
}

export interface MarineIntelligenceFeedbackRecord {
  id: string;
  useful: boolean;
  note: string | null;
  investigationId: string | null;
  stationId: string | null;
  decisionId: string | null;
  evaluationId: string | null;
  signalSnapshot: string[] | null;
  timestamp: string;
  createdAt: string;
}

export interface MarineIntelligenceDecisionSummary {
  decisionCount: number;
  telemetryEventCount: number;
  viewCount: number;
  clickCount: number;
  submitDecisionCount: number;
  feedbackCount: number;
  usefulFeedbackCount: number;
  notUsefulFeedbackCount: number;
  actionCounts: Array<{
    decision: string;
    count: number;
  }>;
  decisionsPerWeek: Array<{
    weekStart: string;
    count: number;
  }>;
  feedbackPerWeek: Array<{
    weekStart: string;
    count: number;
  }>;
  latestDecision: MarineIntelligenceDecisionRecord | null;
  latestTelemetryEvent: MarineIntelligenceTelemetryRecord | null;
  latestFeedback: MarineIntelligenceFeedbackRecord | null;
}

export interface MarineIntelligenceDecisionInput {
  investigationId: string;
  stationId: string;
  decision: string;
  rationale: string;
  timestamp: string;
}

export interface MarineIntelligenceTelemetryEventInput {
  eventType: MarineIntelligenceDecisionEventType;
  investigationId?: string | null;
  stationId?: string | null;
  decisionId?: string | null;
  timestamp: string;
  details?: string | null;
}

export interface MarineIntelligenceFeedbackInput {
  useful: boolean;
  note?: string | null;
  investigationId?: string | null;
  stationId?: string | null;
  decisionId?: string | null;
  evaluationId?: string | null;
  signalSnapshot?: string[] | null;
  timestamp: string;
}

export type MarineIntelligenceDecisionCreateResult =
  | { source: "db"; result: { ok: true; decision: MarineIntelligenceDecisionRecord; event: MarineIntelligenceTelemetryRecord } }
  | {
      source: "db";
      result: { ok: false; reason: "validation"; error: string; decision: null; event: null };
    }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineIntelligenceTelemetryEventCreateResult =
  | { source: "db"; result: { ok: true; event: MarineIntelligenceTelemetryRecord } }
  | {
      source: "db";
      result: { ok: false; reason: "validation"; error: string; event: null };
    }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineIntelligenceDecisionSummaryResult =
  | { source: "db"; result: { ok: true; summary: MarineIntelligenceDecisionSummary } }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineIntelligenceFeedbackCreateResult =
  | { source: "db"; result: { ok: true; feedback: MarineIntelligenceFeedbackRecord } }
  | {
      source: "db";
      result: { ok: false; reason: "validation"; error: string; feedback: null };
    }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

interface MarineIntelligenceDecisionRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  getAdapter?: typeof getAsyncAdapter;
  now?: () => number;
}

interface MarineIntelligenceDecisionRow {
  id: string;
  investigation_id: string;
  station_id: string;
  decision: string;
  rationale: string;
  timestamp: string;
  created_at: string;
  updated_at: string;
}

interface MarineIntelligenceTelemetryRow {
  id: string;
  event_type: MarineIntelligenceDecisionEventType;
  investigation_id: string | null;
  station_id: string | null;
  decision_id: string | null;
  timestamp: string;
  details: string | null;
  created_at: string;
}

interface MarineIntelligenceFeedbackRow {
  id: string;
  useful: number;
  note: string | null;
  investigation_id: string | null;
  station_id: string | null;
  decision_id: string | null;
  evaluation_id: string | null;
  signal_snapshot_json: string | null;
  timestamp: string;
  created_at: string;
}

const VALID_EVENT_TYPES = new Set<MarineIntelligenceDecisionEventType>([
  "view",
  "click",
  "submit_decision",
]);

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

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function validateDecisionInput(
  input: MarineIntelligenceDecisionInput,
): { ok: true } | { ok: false; error: string } {
  if (!normalizeText(input.investigationId)) {
    return { ok: false, error: "investigationId is required" };
  }

  if (!normalizeText(input.stationId)) {
    return { ok: false, error: "stationId is required" };
  }

  if (!normalizeText(input.decision)) {
    return { ok: false, error: "decision is required" };
  }

  if (!normalizeText(input.rationale)) {
    return { ok: false, error: "rationale is required" };
  }

  if (!normalizeIsoTimestamp(input.timestamp)) {
    return { ok: false, error: "timestamp must be a valid ISO timestamp" };
  }

  return { ok: true };
}

function validateTelemetryInput(
  input: MarineIntelligenceTelemetryEventInput,
): { ok: true } | { ok: false; error: string } {
  if (!VALID_EVENT_TYPES.has(input.eventType)) {
    return { ok: false, error: "eventType is invalid" };
  }

  if (!normalizeIsoTimestamp(input.timestamp)) {
    return { ok: false, error: "timestamp must be a valid ISO timestamp" };
  }

  return { ok: true };
}

function validateFeedbackInput(
  input: MarineIntelligenceFeedbackInput,
): { ok: true } | { ok: false; error: string } {
  if (typeof input.useful !== "boolean") {
    return { ok: false, error: "useful must be a boolean" };
  }

  if (!normalizeIsoTimestamp(input.timestamp)) {
    return { ok: false, error: "timestamp must be a valid ISO timestamp" };
  }

  return { ok: true };
}

function createDecisionId(nowMs: number, total: number): string {
  return `MID-${nowMs}-${total + 1}`;
}

function createTelemetryId(nowMs: number, total: number): string {
  return `MTL-${nowMs}-${total + 1}`;
}

function createFeedbackId(nowMs: number, total: number): string {
  return `MFB-${nowMs}-${total + 1}`;
}

function mapDecisionRow(row: MarineIntelligenceDecisionRow): MarineIntelligenceDecisionRecord {
  return {
    id: row.id,
    investigationId: row.investigation_id,
    stationId: row.station_id,
    decision: row.decision,
    rationale: row.rationale,
    timestamp: row.timestamp,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTelemetryRow(row: MarineIntelligenceTelemetryRow): MarineIntelligenceTelemetryRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    investigationId: row.investigation_id,
    stationId: row.station_id,
    decisionId: row.decision_id,
    timestamp: row.timestamp,
    details: row.details,
    createdAt: row.created_at,
  };
}

function mapFeedbackRow(row: MarineIntelligenceFeedbackRow): MarineIntelligenceFeedbackRecord {
  let signalSnapshot: string[] | null = null;

  if (row.signal_snapshot_json) {
    try {
      const parsed = JSON.parse(row.signal_snapshot_json) as unknown;
      signalSnapshot = Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : null;
    } catch {
      signalSnapshot = null;
    }
  }

  return {
    id: row.id,
    useful: row.useful === 1,
    note: row.note,
    investigationId: row.investigation_id,
    stationId: row.station_id,
    decisionId: row.decision_id,
    evaluationId: row.evaluation_id,
    signalSnapshot,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  };
}

async function ensureColumn(adapter: AsyncDbAdapter, tableName: string, columnName: string, ddl: string) {
  const columns = await adapter.execute(`PRAGMA table_info(${tableName})`) as Array<{ name?: string }>;
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    await adapter.execute(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  }
}

export async function ensureMarineIntelligenceDecisionTables(adapter: AsyncDbAdapter) {
  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS marine_intelligence_decisions (
      id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL,
      station_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      rationale TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_intelligence_decisions_timestamp
    ON marine_intelligence_decisions (timestamp DESC, id ASC)
  `);

  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS marine_intelligence_telemetry_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      investigation_id TEXT,
      station_id TEXT,
      decision_id TEXT,
      timestamp TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_intelligence_telemetry_events_timestamp
    ON marine_intelligence_telemetry_events (timestamp DESC, id ASC)
  `);

  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_intelligence_telemetry_events_type_time
    ON marine_intelligence_telemetry_events (event_type, timestamp DESC, id ASC)
  `);

  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS marine_intelligence_feedback (
      id TEXT PRIMARY KEY,
      useful INTEGER NOT NULL,
      note TEXT,
      investigation_id TEXT,
      station_id TEXT,
      decision_id TEXT,
      evaluation_id TEXT,
      signal_snapshot_json TEXT,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await ensureColumn(adapter, "marine_intelligence_feedback", "decision_id", "decision_id TEXT");
  await ensureColumn(adapter, "marine_intelligence_feedback", "evaluation_id", "evaluation_id TEXT");
  await ensureColumn(adapter, "marine_intelligence_feedback", "signal_snapshot_json", "signal_snapshot_json TEXT");
  await ensureColumn(adapter, "marine_intelligence_feedback", "truth_partition", "truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'");
  await ensureColumn(adapter, "marine_intelligence_decisions", "truth_partition", "truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'");
  await ensureColumn(adapter, "marine_intelligence_telemetry_events", "truth_partition", "truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'");

  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_intelligence_decisions_partition_timestamp
    ON marine_intelligence_decisions (truth_partition, timestamp DESC, id ASC)
  `);

  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_intelligence_feedback_partition_timestamp
    ON marine_intelligence_feedback (truth_partition, timestamp DESC, id ASC)
  `);
}

async function insertTelemetryEvent(
  adapter: AsyncDbAdapter,
  input: MarineIntelligenceTelemetryEventInput,
  nowMs: number,
): Promise<MarineIntelligenceTelemetryRecord> {
  const totalRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_telemetry_events") as Array<{ total: number }>;
  const id = createTelemetryId(nowMs, Number(totalRows[0]?.total ?? 0));
  const timestamp = normalizeIsoTimestamp(input.timestamp) ?? new Date(nowMs).toISOString();
  const createdAt = new Date(nowMs).toISOString();
  const event: MarineIntelligenceTelemetryRecord = {
    id,
    eventType: input.eventType,
    investigationId: normalizeText(input.investigationId ?? null),
    stationId: normalizeText(input.stationId ?? null),
    decisionId: normalizeText(input.decisionId ?? null),
    timestamp,
    details: normalizeText(input.details ?? null),
    createdAt,
  };

  await adapter.execute(`
    INSERT INTO marine_intelligence_telemetry_events
    (id, event_type, investigation_id, station_id, decision_id, timestamp, details, truth_partition, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    event.id,
    event.eventType,
    event.investigationId,
    event.stationId,
    event.decisionId,
    event.timestamp,
    event.details,
    (input as any).truthPartition ?? "FIELD_TRUTH",
    event.createdAt,
  ]);

  return event;
}

async function loadLatestDecision(adapter: AsyncDbAdapter): Promise<MarineIntelligenceDecisionRecord | null> {
  const rows = await adapter.execute(`
    SELECT id, investigation_id, station_id, decision, rationale, timestamp, created_at, updated_at
    FROM marine_intelligence_decisions
    ORDER BY timestamp DESC, id DESC
    LIMIT 1
  `) as MarineIntelligenceDecisionRow[];

  return rows[0] ? mapDecisionRow(rows[0]) : null;
}

async function loadLatestTelemetryEvent(adapter: AsyncDbAdapter): Promise<MarineIntelligenceTelemetryRecord | null> {
  const rows = await adapter.execute(`
    SELECT id, event_type, investigation_id, station_id, decision_id, timestamp, details, created_at
    FROM marine_intelligence_telemetry_events
    ORDER BY timestamp DESC, id DESC
    LIMIT 1
  `) as MarineIntelligenceTelemetryRow[];

  return rows[0] ? mapTelemetryRow(rows[0]) : null;
}

async function loadLatestFeedback(adapter: AsyncDbAdapter): Promise<MarineIntelligenceFeedbackRecord | null> {
  const rows = await adapter.execute(`
    SELECT id, useful, note, investigation_id, station_id, decision_id, evaluation_id, signal_snapshot_json, timestamp, created_at
    FROM marine_intelligence_feedback
    ORDER BY timestamp DESC, id DESC
    LIMIT 1
  `) as MarineIntelligenceFeedbackRow[];

  return rows[0] ? mapFeedbackRow(rows[0]) : null;
}

function startOfIsoWeek(timestamp: string): string {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export async function recordMarineIntelligenceTelemetryEvent(
  input: MarineIntelligenceTelemetryEventInput,
  dependencies: MarineIntelligenceDecisionRepositoryDependencies = {},
): Promise<MarineIntelligenceTelemetryEventCreateResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;

  const validation = validateTelemetryInput(input);

  if (!validation.ok) {
    return {
      source: "db",
      result: {
        ok: false,
        reason: "validation",
        error: validation.error,
        event: null,
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
    await ensureMarineIntelligenceDecisionTables(adapter);
    const event = await insertTelemetryEvent(adapter, input, now());
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
  } finally {
    await adapter.close();
  }
}

export async function recordMarineIntelligenceDecision(
  input: MarineIntelligenceDecisionInput,
  dependencies: MarineIntelligenceDecisionRepositoryDependencies = {},
): Promise<MarineIntelligenceDecisionCreateResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;

  const validation = validateDecisionInput(input);

  if (!validation.ok) {
    return {
      source: "db",
      result: {
        ok: false,
        reason: "validation",
        error: validation.error,
        decision: null,
        event: null,
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
    await ensureMarineIntelligenceDecisionTables(adapter);
    const nowMs = now();
    const createdAt = new Date(nowMs).toISOString();
    const normalizedTimestamp = normalizeIsoTimestamp(input.timestamp) ?? createdAt;
    const totalRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_decisions") as Array<{ total: number }>;
    const decision: MarineIntelligenceDecisionRecord = {
      id: createDecisionId(nowMs, Number(totalRows[0]?.total ?? 0)),
      investigationId: normalizeText(input.investigationId) as string,
      stationId: normalizeText(input.stationId) as string,
      decision: normalizeText(input.decision) as string,
      rationale: normalizeText(input.rationale) as string,
      timestamp: normalizedTimestamp,
      createdAt,
      updatedAt: createdAt,
    };

    await adapter.execute(`
      INSERT INTO marine_intelligence_decisions
      (id, investigation_id, station_id, decision, rationale, timestamp, truth_partition, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      decision.id,
      decision.investigationId,
      decision.stationId,
      decision.decision,
      decision.rationale,
      decision.timestamp,
      (input as any).truthPartition ?? "FIELD_TRUTH",
      decision.createdAt,
      decision.updatedAt,
    ]);

    const event = await insertTelemetryEvent(
      adapter,
      {
        eventType: "submit_decision",
        investigationId: decision.investigationId,
        stationId: decision.stationId,
        decisionId: decision.id,
        timestamp: decision.timestamp,
        details: decision.rationale,
      },
      nowMs,
    );

    return {
      source: "db",
      result: {
        ok: true,
        decision,
        event,
      },
    };
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  } finally {
    await adapter.close();
  }
}

export async function recordMarineIntelligenceFeedback(
  input: MarineIntelligenceFeedbackInput,
  dependencies: MarineIntelligenceDecisionRepositoryDependencies = {},
): Promise<MarineIntelligenceFeedbackCreateResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;

  const validation = validateFeedbackInput(input);

  if (!validation.ok) {
    return {
      source: "db",
      result: {
        ok: false,
        reason: "validation",
        error: validation.error,
        feedback: null,
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
    await ensureMarineIntelligenceDecisionTables(adapter);
    const nowMs = now();
    const totalRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_feedback") as Array<{ total: number }>;
    const feedback: MarineIntelligenceFeedbackRecord = {
      id: createFeedbackId(nowMs, Number(totalRows[0]?.total ?? 0)),
      useful: input.useful,
      note: normalizeText(input.note ?? null),
      investigationId: normalizeText(input.investigationId ?? null),
      stationId: normalizeText(input.stationId ?? null),
      decisionId: normalizeText(input.decisionId ?? null),
      evaluationId: normalizeText(input.evaluationId ?? null),
      signalSnapshot: Array.isArray(input.signalSnapshot)
        ? input.signalSnapshot
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : null,
      timestamp: normalizeIsoTimestamp(input.timestamp) ?? new Date(nowMs).toISOString(),
      createdAt: new Date(nowMs).toISOString(),
    };

    await adapter.execute(`
      INSERT INTO marine_intelligence_feedback
      (id, useful, note, investigation_id, station_id, decision_id, evaluation_id, signal_snapshot_json, timestamp, truth_partition, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      feedback.id,
      feedback.useful ? 1 : 0,
      feedback.note,
      feedback.investigationId,
      feedback.stationId,
      feedback.decisionId,
      feedback.evaluationId,
      feedback.signalSnapshot ? JSON.stringify(feedback.signalSnapshot) : null,
      feedback.timestamp,
      (input as any).truthPartition ?? "FIELD_TRUTH",
      feedback.createdAt,
    ]);

    if (feedback.evaluationId) {
      await attachFeedbackToMarineRiskEvaluation(
        {
          evaluationId: feedback.evaluationId,
          useful: feedback.useful,
          note: feedback.note,
        },
      );
    }

    return {
      source: "db",
      result: {
        ok: true,
        feedback,
      },
    };
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  } finally {
    await adapter.close();
  }
}

export async function getMarineIntelligenceDecisionSummary(
  query: { windowType?: "live" | "trend"; windowDays?: number } = {},
  dependencies: MarineIntelligenceDecisionRepositoryDependencies = {},
): Promise<MarineIntelligenceDecisionSummaryResult> {
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
    await ensureMarineIntelligenceDecisionTables(adapter);

    const decisionCountRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_decisions") as Array<{ total: number }>;
    const telemetryCountRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_telemetry_events") as Array<{ total: number }>;
    const feedbackCountRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_feedback") as Array<{ total: number }>;
    const usefulFeedbackRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_feedback WHERE useful = 1") as Array<{ total: number }>;

    const latestDecision = await loadLatestDecision(adapter);
    const latestTelemetryEvent = await loadLatestTelemetryEvent(adapter);
    const latestFeedback = await loadLatestFeedback(adapter);

    const viewCountRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_telemetry_events WHERE event_type = 'view'") as Array<{ total: number }>;
    const clickCountRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_telemetry_events WHERE event_type = 'click'") as Array<{ total: number }>;
    const submitDecisionCountRows = await adapter.execute("SELECT COUNT(*) AS total FROM marine_intelligence_telemetry_events WHERE event_type = 'submit_decision'") as Array<{ total: number }>;

    const actionCountRows = await adapter.execute(`
      SELECT decision, COUNT(*) AS count
      FROM marine_intelligence_decisions
      GROUP BY decision
      ORDER BY count DESC
    `) as Array<{ decision: string; count: number }>;

    const summary: MarineIntelligenceDecisionSummary = {
      decisionCount: Number(decisionCountRows[0]?.total ?? 0),
      telemetryEventCount: Number(telemetryCountRows[0]?.total ?? 0),
      viewCount: Number(viewCountRows[0]?.total ?? 0),
      clickCount: Number(clickCountRows[0]?.total ?? 0),
      submitDecisionCount: Number(submitDecisionCountRows[0]?.total ?? 0),
      feedbackCount: Number(feedbackCountRows[0]?.total ?? 0),
      usefulFeedbackCount: Number(usefulFeedbackRows[0]?.total ?? 0),
      notUsefulFeedbackCount: Number(feedbackCountRows[0]?.total ?? 0) - Number(usefulFeedbackRows[0]?.total ?? 0),
      actionCounts: actionCountRows.map(row => ({ decision: row.decision, count: Number(row.count) })),
      decisionsPerWeek: [],
      feedbackPerWeek: [],
      latestDecision,
      latestTelemetryEvent,
      latestFeedback,
    };

    const feedbackRows = await adapter.execute("SELECT timestamp FROM marine_intelligence_feedback") as Array<{ timestamp: string }>;
    const feedbackWeeks: Record<string, number> = {};
    for (const row of feedbackRows) {
      const weekStart = startOfIsoWeek(row.timestamp);
      feedbackWeeks[weekStart] = (feedbackWeeks[weekStart] ?? 0) + 1;
    }
    summary.feedbackPerWeek = Object.entries(feedbackWeeks).map(([weekStart, count]) => ({ weekStart, count }));

    return {
      source: "db",
      result: { ok: true, summary },
    };
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  } finally {
    await adapter.close();
  }
}
