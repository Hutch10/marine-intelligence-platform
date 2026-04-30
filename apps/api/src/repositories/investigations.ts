import type {
  InvestigationAnalysisTrack,
  InvestigationTrackState,
} from "@marine/shared";
import {
  type AsyncDbAdapter,
  createLocalAdapter,
} from "../db/async-client";
import {
  hasDatabasePath,
  resolveDatabasePath,
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
  getAdapter?: () => AsyncDbAdapter;
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  recordEvent?: (input: RecordInvestigationEventInput) => Promise<unknown>;
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

async function getRecordInvestigationEvent(): Promise<((input: RecordInvestigationEventInput) => Promise<unknown>) | null> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("./investigation-events") as {
      recordInvestigationEvent: (input: RecordInvestigationEventInput) => Promise<unknown>;
    };

    return repository.recordInvestigationEvent;
  } catch {
    return null;
  }
}

async function syncInvestigationEvents(
  tracks: InvestigationAnalysisTrack[],
  recordEvent: (input: RecordInvestigationEventInput) => Promise<unknown>,
) {
  for (const track of tracks) {
    await recordEvent({
      investigationId: track.id,
      eventType: "case_opened",
      source: "Investigation workspace",
      actor: "System",
      summary: `Case opened for ${track.title}`,
      detail: track.summary,
      confidence: track.confidence,
    });

    if (track.state === "Escalated") {
      await recordEvent({
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

export async function listInvestigations(
  dependencies: InvestigationRepositoryDependencies = {},
): Promise<InvestigationListResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let adapter: any;
  try {
    adapter = dependencies.getAdapter?.() ?? createLocalAdapter(databasePath, true);
    const recordEvent = dependencies.recordEvent ?? await getRecordInvestigationEvent();

    const rows = (await adapter.execute(
        `SELECT id, title, summary, state, confidence, outcome
         FROM investigations
         ORDER BY updated_at DESC, created_at DESC, id ASC`
    )) as unknown as InvestigationRow[];

    const analysisTracks = rows.map(toAnalysisTrack);

    if (recordEvent) {
      await syncInvestigationEvents(analysisTracks, recordEvent);
    }

    return {
      source: "db",
      analysisTracks,
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    if (adapter && !dependencies.getAdapter) {
      await adapter.close();
    }
  }
}

export async function updateInvestigationOutcome(
  investigationId: string,
  outcome: "confirmed" | "false_positive" | "inconclusive" | null,
  dependencies: InvestigationRepositoryDependencies = {}
): Promise<void> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const databasePath = resolvePath();
  const adapter = dependencies.getAdapter?.() ?? createLocalAdapter(databasePath, false);

  try {
    await adapter.execute(
      `UPDATE investigations SET outcome = ?, updated_at = ? WHERE id = ?`,
      [outcome, Date.now(), investigationId]
    );
  } finally {
    if (!dependencies.getAdapter) {
      await adapter.close();
    }
  }
}


