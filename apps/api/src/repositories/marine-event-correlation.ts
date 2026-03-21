import {
  hasDatabasePath,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type {
  MarineEventCreateInput,
  MarineEventRecord,
} from "../marine-intelligence-types";
import { createMarineEvent, ensureMarineEventTables } from "./marine-events";

const DEFAULT_CORRELATION_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

export interface MarineEventCorrelationDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
  correlationWindowMs?: number;
}

export type MarineEventCorrelationResult =
  | { source: "db"; matched: true; existingEventId: string }
  | { source: "db"; matched: false; newEvent: MarineEventRecord }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

interface CandidateRow {
  id: string;
  detected_at: string;
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

function findCandidate(
  db: SqliteDatabaseLike,
  input: MarineEventCreateInput,
  windowStartIso: string,
): CandidateRow | null {
  const hasStation =
    typeof input.stationId === "string" && input.stationId.trim().length > 0;

  const stationClause = hasStation
    ? "AND station_id = ?"
    : "AND station_id IS NULL";

  const sql = `
    SELECT id, detected_at
    FROM marine_intelligence_events
    WHERE ontology_term_id = ?
      AND LOWER(region) = LOWER(?)
      AND status IN ('detected', 'monitoring')
      AND detected_at >= ?
      ${stationClause}
    ORDER BY detected_at DESC
    LIMIT 1
  `;

  const params: unknown[] = [
    input.ontologyTermId,
    input.region.trim(),
    windowStartIso,
  ];

  if (hasStation) {
    params.push((input.stationId as string).trim());
  }

  const rows = db.prepare(sql).all(...params) as CandidateRow[];
  return rows[0] ?? null;
}

/**
 * Given a candidate event input, checks whether an open event with the same
 * ontologyTermId, region, and stationId already exists within the correlation
 * window (default 60 min).  If a duplicate is found returns the existing
 * event's id; otherwise persists the new event and returns it.
 */
export function correlateOrCreateMarineEvent(
  input: MarineEventCreateInput,
  dependencies: MarineEventCorrelationDependencies = {},
): MarineEventCorrelationResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const windowMs =
    dependencies.correlationWindowMs ?? DEFAULT_CORRELATION_WINDOW_MS;

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
    ensureMarineEventTables(db);
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }

  const nowMs = now();
  const windowStartIso = new Date(nowMs - windowMs).toISOString();

  let candidate: CandidateRow | null;

  try {
    candidate = findCandidate(db, input, windowStartIso);
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }

  if (candidate) {
    return { source: "db", matched: true, existingEventId: candidate.id };
  }

  // No correlation hit — persist as a new event using the already-open connection.
  const createResult = createMarineEvent(input, {
    resolvePath: () => dbPath,
    hasPath: () => true,
    openWritable: () => db,
    now: () => nowMs,
  });

  if (createResult.source !== "db") {
    return { source: "unavailable", fallbackReason: createResult.fallbackReason };
  }

  const newEvent = createResult.result.event;

  if (!newEvent) {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }

  return { source: "db", matched: false, newEvent };
}
