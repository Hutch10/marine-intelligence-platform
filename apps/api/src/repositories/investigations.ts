import type {
  InvestigationAnalysisTrack,
  InvestigationTrackState,
} from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { InvestigationFallbackReason } from "../types";
import type { RecordInvestigationEventInput } from "./investigation-events";


interface InvestigationRow {
  id: string;
  title: string;
  summary: string;
  state: string;
  confidence: number | null;
  outcome: "confirmed" | "false_positive" | "inconclusive" | null;
}

export type InvestigationListResult =
  | { source: "db"; analysisTracks: InvestigationAnalysisTrack[] }
  | { source: "mock"; fallbackReason: InvestigationFallbackReason };

interface InvestigationRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  recordEvent?: (input: RecordInvestigationEventInput) => unknown;
}

const DEFAULT_CONFIDENCE = 50;
const VALID_TRACK_STATES = new Set<string>(["Correlated", "Watch", "Escalated"]);

function normalizeTrackState(value: string): InvestigationTrackState {
  if (VALID_TRACK_STATES.has(value)) {
    return value as InvestigationTrackState;
  }
  return "Watch";
}

function toAnalysisTrack(row: InvestigationRow): InvestigationAnalysisTrack {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    confidence: row.confidence ?? DEFAULT_CONFIDENCE,
    state: normalizeTrackState(row.state),
    outcome: row.outcome ?? null,
  };
}

function getRecordInvestigationEvent(): ((input: RecordInvestigationEventInput) => unknown) | null {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("./investigation-events") as {
      recordInvestigationEvent: (input: RecordInvestigationEventInput) => unknown;
    };

    return repository.recordInvestigationEvent;
  } catch {
    return null;
  }
}

function syncInvestigationEvents(
  tracks: InvestigationAnalysisTrack[],
  recordEvent: (input: RecordInvestigationEventInput) => unknown,
) {
  for (const track of tracks) {
    recordEvent({
      investigationId: track.id,
      eventType: "case_opened",
      source: "Investigation workspace",
      actor: "System",
      summary: `Case opened for ${track.title}`,
      detail: track.summary,
      confidence: track.confidence,
    });

    if (track.state === "Escalated") {
      recordEvent({
        investigationId: track.id,
        eventType: "track_escalated",
        source: "Analysis workspace",
        actor: "System",
        summary: `Track escalated: ${track.title}`,
        detail: track.summary,
        confidence: track.confidence,
      });
    }
  }
}

export function listInvestigations(
  dependencies: InvestigationRepositoryDependencies = {},
): InvestigationListResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const recordEvent = dependencies.recordEvent ?? getRecordInvestigationEvent();
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
    const rows = db
      .prepare(
        `SELECT id, title, summary, state, confidence, outcome
         FROM investigations
         ORDER BY updated_at DESC, created_at DESC, id ASC`,
      )
      .all() as InvestigationRow[];
// Update the outcome for an investigation


// Update the outcome for an investigation
function updateInvestigationOutcome(
  db: SqliteDatabaseLike,
  investigationId: string,
  outcome: "confirmed" | "false_positive" | "inconclusive" | null
): void {
  const stmt = db.prepare(
    `UPDATE investigations SET outcome = ? WHERE id = ?`
  );
  if (!stmt || typeof stmt.run !== "function") throw new Error("Failed to prepare investigation outcome update statement or .run is not a function");
  stmt.run(outcome, investigationId);
}

module.exports = { updateInvestigationOutcome };

    const analysisTracks = rows.map(toAnalysisTrack);

    if (recordEvent) {
      syncInvestigationEvents(analysisTracks, recordEvent);
    }

    return {
      source: "db",
      analysisTracks,
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}


