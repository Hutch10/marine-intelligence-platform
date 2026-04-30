import { randomUUID } from "node:crypto";
import type {
  RiskEvaluationOutcomeRequest,
  RiskEvaluationPredictionRequest,
  RiskEvaluationRecord,
  RiskRecommendationSignal,
  RiskTriggeredRule,
} from "@marine/shared";
import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";

interface MarineValidationRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  getAdapter?: typeof getAsyncAdapter;
  now?: () => number;
}

interface MarineRiskEvaluationRow {
  id: string;
  station_id: string;
  route: string;
  api_key_id: string | null;
  predicted_at: string;
  predicted_risk_level: "low" | "medium" | "high" | "critical";
  recommendation_action: string | null;
  recommendation_urgency: "low" | "medium" | "high" | null;
  confidence_score: number;
  calibration_adjusted_confidence_score: number | null;
  operator_summary: string;
  warning_messages_json: string;
  contributing_signals_json: string;
  triggered_rules_json: string;
  feedback_useful: number | null;
  feedback_note: string | null;
  feedback_count: number;
  actual_outcome_observed_at: string | null;
  actual_outcome_risk_level: "low" | "medium" | "high" | "critical" | null;
  actual_outcome_classification: "correct" | "partial" | "incorrect" | null;
  actual_outcome_summary: string | null;
  actual_outcome_source: "manual" | "simulated" | null;
  actual_outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type MarineRiskEvaluationPredictionCreateResult =
  | { source: "db"; result: { ok: true; evaluation: RiskEvaluationRecord } }
  | { source: "db"; result: { ok: false; reason: "validation"; error: string; evaluation: null } }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export type MarineRiskEvaluationOutcomeAttachResult =
  | { source: "db"; result: { ok: true; evaluation: RiskEvaluationRecord } }
  | {
      source: "db";
      result: { ok: false; reason: "validation" | "not_found"; error: string; evaluation: null };
    }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export type MarineRiskEvaluationListResult =
  | { source: "db"; result: { ok: true; evaluations: RiskEvaluationRecord[] } }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoTimestamp(value: string | null | undefined): string | null {
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

function normalizeConfidence(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}

function parseJsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function mapRow(row: MarineRiskEvaluationRow): RiskEvaluationRecord {
  return {
    id: row.id,
    stationId: row.station_id,
    route: row.route,
    apiKeyId: row.api_key_id,
    predictedAt: row.predicted_at,
    predictedRiskLevel: row.predicted_risk_level,
    recommendationAction: row.recommendation_action,
    recommendationUrgency: row.recommendation_urgency,
    confidenceScore: row.confidence_score,
    calibrationAdjustedConfidenceScore: row.calibration_adjusted_confidence_score,
    operatorSummary: row.operator_summary,
    warningMessages: parseJsonArray<string>(row.warning_messages_json, []),
    contributingSignals: parseJsonArray<RiskRecommendationSignal>(row.contributing_signals_json, []),
    triggeredRules: parseJsonArray<RiskTriggeredRule>(row.triggered_rules_json, []),
    feedbackUseful: row.feedback_useful === null ? null : row.feedback_useful === 1,
    feedbackNote: row.feedback_note,
    feedbackCount: Number(row.feedback_count ?? 0),
    actualOutcome: row.actual_outcome_observed_at && row.actual_outcome_risk_level && row.actual_outcome_classification
      ? {
          observedAt: row.actual_outcome_observed_at,
          actualRiskLevel: row.actual_outcome_risk_level,
          classification: row.actual_outcome_classification,
          summary: row.actual_outcome_summary ?? "",
          source: row.actual_outcome_source ?? "manual",
          notes: row.actual_outcome_notes,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


function validatePredictionInput(
  input: RiskEvaluationPredictionRequest,
): { ok: true } | { ok: false; error: string } {
  if (!normalizeText(input.stationId)) {
    return { ok: false, error: "stationId is required" };
  }

  if (!normalizeText(input.route)) {
    return { ok: false, error: "route is required" };
  }

  if (!normalizeIsoTimestamp(input.predictedAt)) {
    return { ok: false, error: "predictedAt must be a valid ISO timestamp" };
  }

  if (typeof input.confidenceScore !== "number" || !Number.isFinite(input.confidenceScore)) {
    return { ok: false, error: "confidenceScore must be a number" };
  }

  if (!normalizeText(input.operatorSummary)) {
    return { ok: false, error: "operatorSummary is required" };
  }

  if (!Array.isArray(input.contributingSignals)) {
    return { ok: false, error: "contributingSignals must be an array" };
  }

  if (!Array.isArray(input.triggeredRules)) {
    return { ok: false, error: "triggeredRules must be an array" };
  }

  return { ok: true };
}

function validateOutcomeInput(
  input: RiskEvaluationOutcomeRequest,
): { ok: true } | { ok: false; error: string } {
  if (!normalizeText(input.evaluationId)) {
    return { ok: false, error: "evaluationId is required" };
  }

  if (!normalizeIsoTimestamp(input.observedAt)) {
    return { ok: false, error: "observedAt must be a valid ISO timestamp" };
  }

  if (!normalizeText(input.summary)) {
    return { ok: false, error: "summary is required" };
  }

  return { ok: true };
}

async function ensureColumn(adapter: AsyncDbAdapter, tableName: string, columnName: string, ddl: string) {
  const columns = await adapter.execute(`PRAGMA table_info(${tableName})`) as Array<{ name?: string }>;
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    await adapter.execute(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  }
}

export async function ensureMarineValidationTables(adapter: AsyncDbAdapter) {
  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS marine_intelligence_risk_evaluations (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      route TEXT NOT NULL,
      api_key_id TEXT,
      predicted_at TEXT NOT NULL,
      predicted_risk_level TEXT NOT NULL,
      recommendation_action TEXT,
      recommendation_urgency TEXT,
      confidence_score REAL NOT NULL,
      calibration_adjusted_confidence_score REAL,
      operator_summary TEXT NOT NULL,
      warning_messages_json TEXT NOT NULL,
      contributing_signals_json TEXT NOT NULL,
      triggered_rules_json TEXT NOT NULL,
      feedback_useful INTEGER,
      feedback_note TEXT,
      feedback_count INTEGER NOT NULL DEFAULT 0,
      actual_outcome_observed_at TEXT,
      actual_outcome_risk_level TEXT,
      actual_outcome_classification TEXT,
      actual_outcome_summary TEXT,
      actual_outcome_source TEXT,
      actual_outcome_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "api_key_id", "api_key_id TEXT");
  await ensureColumn(
    adapter,
    "marine_intelligence_risk_evaluations",
    "calibration_adjusted_confidence_score",
    "calibration_adjusted_confidence_score REAL",
  );
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "warning_messages_json", "warning_messages_json TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "feedback_useful", "feedback_useful INTEGER");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "feedback_note", "feedback_note TEXT");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "feedback_count", "feedback_count INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "actual_outcome_observed_at", "actual_outcome_observed_at TEXT");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "actual_outcome_risk_level", "actual_outcome_risk_level TEXT");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "actual_outcome_classification", "actual_outcome_classification TEXT");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "actual_outcome_summary", "actual_outcome_summary TEXT");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "actual_outcome_source", "actual_outcome_source TEXT");
  await ensureColumn(adapter, "marine_intelligence_risk_evaluations", "actual_outcome_notes", "actual_outcome_notes TEXT");

  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_validation_predicted_at
    ON marine_intelligence_risk_evaluations (predicted_at DESC, id DESC)
  `);
  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_validation_station_predicted_at
    ON marine_intelligence_risk_evaluations (station_id, predicted_at DESC, id DESC)
  `);
  await adapter.execute(`
    CREATE INDEX IF NOT EXISTS idx_marine_validation_outcome_classification
    ON marine_intelligence_risk_evaluations (actual_outcome_classification, predicted_at DESC, id DESC)
  `);
}

async function getEvaluationById(adapter: AsyncDbAdapter, evaluationId: string): Promise<RiskEvaluationRecord | null> {
  const rows = await adapter.execute(
    `SELECT * FROM marine_intelligence_risk_evaluations WHERE id = ? LIMIT 1`,
    [evaluationId]
  ) as MarineRiskEvaluationRow[];

  return rows[0] ? mapRow(rows[0]) : null;
}

export async function recordMarineRiskEvaluationPrediction(
  input: RiskEvaluationPredictionRequest,
  dependencies: MarineValidationRepositoryDependencies = {},
): Promise<MarineRiskEvaluationPredictionCreateResult> {
  const validation = validatePredictionInput(input);

  if (!validation.ok) {
    return {
      source: "db",
      result: { ok: false, reason: "validation", error: validation.error, evaluation: null },
    };
  }

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
    await ensureMarineValidationTables(adapter);
    const nowMs = now();
    const createdAt = new Date(nowMs).toISOString();
    const evaluation: RiskEvaluationRecord = {
      id: randomUUID(),
      stationId: normalizeText(input.stationId) as string,
      route: normalizeText(input.route) as string,
      apiKeyId: normalizeText(input.apiKeyId ?? null),
      predictedAt: normalizeIsoTimestamp(input.predictedAt) as string,
      predictedRiskLevel: input.predictedRiskLevel,
      recommendationAction: normalizeText(input.recommendationAction ?? null),
      recommendationUrgency: input.recommendationUrgency ?? null,
      confidenceScore: normalizeConfidence(input.confidenceScore) as number,
      calibrationAdjustedConfidenceScore:
        input.calibrationAdjustedConfidenceScore === undefined || input.calibrationAdjustedConfidenceScore === null
          ? null
          : normalizeConfidence(input.calibrationAdjustedConfidenceScore),
      operatorSummary: normalizeText(input.operatorSummary) as string,
      warningMessages: Array.isArray(input.warningMessages) ? input.warningMessages : [],
      contributingSignals: input.contributingSignals,
      triggeredRules: input.triggeredRules,
      feedbackUseful: null,
      feedbackNote: null,
      feedbackCount: 0,
      actualOutcome: null,
      createdAt,
      updatedAt: createdAt,
    };

    await adapter.execute(`
      INSERT INTO marine_intelligence_risk_evaluations (
        id, station_id, route, api_key_id, predicted_at, predicted_risk_level, recommendation_action,
        recommendation_urgency, confidence_score, calibration_adjusted_confidence_score, operator_summary,
        warning_messages_json, contributing_signals_json, triggered_rules_json, feedback_useful, feedback_note,
        feedback_count, actual_outcome_observed_at, actual_outcome_risk_level, actual_outcome_classification,
        actual_outcome_summary, actual_outcome_source, actual_outcome_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      evaluation.id,
      evaluation.stationId,
      evaluation.route,
      evaluation.apiKeyId,
      evaluation.predictedAt,
      evaluation.predictedRiskLevel,
      evaluation.recommendationAction,
      evaluation.recommendationUrgency,
      evaluation.confidenceScore,
      evaluation.calibrationAdjustedConfidenceScore,
      evaluation.operatorSummary,
      JSON.stringify(evaluation.warningMessages),
      JSON.stringify(evaluation.contributingSignals),
      JSON.stringify(evaluation.triggeredRules),
      null,
      null,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      evaluation.createdAt,
      evaluation.updatedAt,
    ]);

    return { source: "db", result: { ok: true, evaluation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export async function attachMarineRiskEvaluationOutcome(
  input: RiskEvaluationOutcomeRequest & { apiKeyId?: string | null },
  dependencies: MarineValidationRepositoryDependencies = {},
): Promise<MarineRiskEvaluationOutcomeAttachResult> {
  const validation = validateOutcomeInput(input);

  if (!validation.ok) {
    return {
      source: "db",
      result: { ok: false, reason: "validation", error: validation.error, evaluation: null },
    };
  }

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
    await ensureMarineValidationTables(adapter);
    const existing = await getEvaluationById(adapter, input.evaluationId);

    if (!existing) {
      return {
        source: "db",
        result: { ok: false, reason: "not_found", error: "evaluationId was not found", evaluation: null },
      };
    }

    if (input.apiKeyId && existing.apiKeyId && existing.apiKeyId !== input.apiKeyId) {
      return {
        source: "db",
        result: { ok: false, reason: "not_found", error: "evaluationId was not found", evaluation: null },
      };
    }

    const updatedAt = new Date(now()).toISOString();

    await adapter.execute(`
      UPDATE marine_intelligence_risk_evaluations
      SET actual_outcome_observed_at = ?,
          actual_outcome_risk_level = ?,
          actual_outcome_classification = ?,
          actual_outcome_summary = ?,
          actual_outcome_source = ?,
          actual_outcome_notes = ?,
          updated_at = ?
      WHERE id = ?
    `, [
      normalizeIsoTimestamp(input.observedAt),
      input.actualRiskLevel,
      input.classification,
      normalizeText(input.summary),
      input.source,
      normalizeText(input.notes ?? null),
      updatedAt,
      input.evaluationId,
    ]);

    const evaluation = await getEvaluationById(adapter, input.evaluationId);

    if (!evaluation) {
      return {
        source: "db",
        result: { ok: false, reason: "not_found", error: "evaluationId was not found", evaluation: null },
      };
    }

    return { source: "db", result: { ok: true, evaluation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export async function attachFeedbackToMarineRiskEvaluation(
  input: {
    evaluationId: string;
    useful: boolean;
    note?: string | null;
    apiKeyId?: string | null;
  },
  dependencies: MarineValidationRepositoryDependencies = {},
): Promise<MarineRiskEvaluationOutcomeAttachResult> {
  const evaluationId = normalizeText(input.evaluationId);

  if (!evaluationId) {
    return {
      source: "db",
      result: { ok: false, reason: "validation", error: "evaluationId is required", evaluation: null },
    };
  }

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
    await ensureMarineValidationTables(adapter);
    const existing = await getEvaluationById(adapter, evaluationId);

    if (!existing) {
      return {
        source: "db",
        result: { ok: false, reason: "not_found", error: "evaluationId was not found", evaluation: null },
      };
    }

    if (input.apiKeyId && existing.apiKeyId && existing.apiKeyId !== input.apiKeyId) {
      return {
        source: "db",
        result: { ok: false, reason: "not_found", error: "evaluationId was not found", evaluation: null },
      };
    }

    await adapter.execute(`
      UPDATE marine_intelligence_risk_evaluations
      SET feedback_useful = ?,
          feedback_note = ?,
          feedback_count = COALESCE(feedback_count, 0) + 1,
          updated_at = ?
      WHERE id = ?
    `, [
      input.useful ? 1 : 0,
      normalizeText(input.note ?? null),
      new Date(now()).toISOString(),
      evaluationId,
    ]);

    const evaluation = await getEvaluationById(adapter, evaluationId);

    if (!evaluation) {
      return {
        source: "db",
        result: { ok: false, reason: "not_found", error: "evaluationId was not found", evaluation: null },
      };
    }

    return { source: "db", result: { ok: true, evaluation } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export async function listMarineRiskEvaluations(
  filters: {
    stationId?: string | null;
    since?: string | null;
    sinceDays?: number | null;
    limit?: number | null;
  } = {},
  dependencies: MarineValidationRepositoryDependencies = {},
): Promise<MarineRiskEvaluationListResult> {
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
    adapter = getAdapter(true);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureMarineValidationTables(adapter);
    const clauses: string[] = [];
    const params: unknown[] = [];
    const stationId = normalizeText(filters.stationId ?? null);
    const since = filters.since
      ? normalizeIsoTimestamp(filters.since)
      : filters.sinceDays && filters.sinceDays > 0
        ? new Date(now() - filters.sinceDays * 86400000).toISOString()
        : null;

    if (stationId) {
      clauses.push("station_id = ?");
      params.push(stationId);
    }

    if (since) {
      clauses.push("predicted_at >= ?");
      params.push(since);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = filters.limit && filters.limit > 0 ? `LIMIT ${Math.floor(filters.limit)}` : "";
    const rows = await adapter.execute(`
      SELECT * FROM marine_intelligence_risk_evaluations
      ${whereClause}
      ORDER BY predicted_at DESC, id DESC
      ${limitClause}
    `, params) as MarineRiskEvaluationRow[];

    return {
      source: "db",
      result: {
        ok: true,
        evaluations: rows.map(mapRow),
      },
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}
