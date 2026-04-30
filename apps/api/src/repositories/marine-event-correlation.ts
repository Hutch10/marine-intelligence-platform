import {
  getAsyncAdapter,
  hasDatabasePath,
  resolveDatabasePath,
  type AsyncDbAdapter,
} from "../db/async-client";
import type {
  MarineEventCreateInput,
  MarineEventRecord,
  MarineEventCorrelationResult,
} from "../marine-intelligence-types";
import { createMarineEvent, ensureMarineEventTables } from "./marine-events";

const DEFAULT_CORRELATION_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

export interface MarineEventCorrelationDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  getAdapter?: typeof getAsyncAdapter;
  now?: () => number;
  correlationWindowMs?: number;
}

interface CandidateRow {
  id: string;
  detected_at: string;
}

async function findCandidate(
  adapter: AsyncDbAdapter,
  input: MarineEventCreateInput,
  windowStartIso: string,
): Promise<CandidateRow | null> {
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

  const rows = await adapter.execute(sql, params) as CandidateRow[];
  return rows[0] ?? null;
}

/**
 * Given a candidate event input, checks whether an open event with the same
 * ontologyTermId, region, and stationId already exists within the correlation
 * window (default 60 min). If a duplicate is found returns the existing
 * event's id; otherwise persists the new event and returns it.
 */
export async function correlateOrCreateMarineEvent(
  input: MarineEventCreateInput,
  dependencies: MarineEventCorrelationDependencies = {},
): Promise<MarineEventCorrelationResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;
  const windowMs =
    dependencies.correlationWindowMs ?? DEFAULT_CORRELATION_WINDOW_MS;

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    // Open writable for correlation + potential insert
    adapter = getAdapter(false);
  } catch (err) {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    try {
      await ensureMarineEventTables(adapter);
    } catch (err) {
      return { source: "unavailable", fallbackReason: "db_query_failed" };
    }

    const nowMs = now();
    const windowStartIso = new Date(nowMs - windowMs).toISOString();

    let candidate: CandidateRow | null;

    try {
      candidate = await findCandidate(adapter, input, windowStartIso);
    } catch (err) {
      return { source: "unavailable", fallbackReason: "db_query_failed" };
    }

    if (candidate) {
      return { source: "db", matched: true, existingEventId: candidate.id };
    }

    // No correlation hit — persist as a new event using the same adapter instance.
    const createResult = await createMarineEvent(adapter, input, nowMs);

    if (!createResult.ok) {
      return { 
        source: "unavailable", 
        fallbackReason: "db_query_failed" 
      };
    }

    const newEvent = createResult.event;

    if (!newEvent) {
      return { source: "unavailable", fallbackReason: "db_query_failed" };
    }

    return { source: "db", matched: false, newEvent };
  } finally {
    adapter.close();
  }
}
