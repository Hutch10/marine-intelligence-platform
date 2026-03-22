import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { AiLabSourceReference, AiLabSuggestedPrompt } from "@marine/shared";
import type { AiLabFallbackReason } from "../types";
import type { RecordInvestigationEventInput } from "./investigation-events";

interface CountRow {
  total: number;
}

interface LatestAnalysisRow {
  id: string;
  investigation_id: string | null;
  prompt: string;
  summary: string | null;
  confidence_label: string | null;
  result_payload: unknown;
}

type AiLabSectionKey =
  | "summary"
  | "findings"
  | "evidence"
  | "confidence"
  | "uncertainty"
  | "suggestedNextActions";

const SECTION_KEYS: AiLabSectionKey[] = [
  "summary",
  "findings",
  "evidence",
  "confidence",
  "uncertainty",
  "suggestedNextActions",
];

const VALID_SOURCE_TYPES = new Set<AiLabSourceReference["type"]>([
  "Dataset",
  "Field Report",
  "Model",
  "Literature",
]);

export interface AiLabResultPayload {
  sections: Partial<Record<AiLabSectionKey, string>>;
  sources: AiLabSourceReference[];
  suggestedPrompts: AiLabSuggestedPrompt[];
}

export interface AiLabSnapshot {
  analysisId: string;
  prompt: string;
  summary: string | null;
  confidenceLabel: string | null;
  resultPayload: AiLabResultPayload | null;
}

export type AiLabReadResult =
  | {
      source: "db";
      analysisCount: number;
      latestAnalysis: AiLabSnapshot | null;
    }
  | { source: "mock"; fallbackReason: AiLabFallbackReason };

interface AiLabRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  recordEvent?: (input: RecordInvestigationEventInput) => unknown;
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

function syncAnalysisEvents(
  latestAnalysis: AiLabSnapshot | null,
  investigationId: string | null,
  recordEvent: (input: RecordInvestigationEventInput) => unknown,
) {
  if (!latestAnalysis || !investigationId) {
    return;
  }

  const detail = latestAnalysis.summary ?? undefined;

  recordEvent({
    investigationId,
    eventType: "hypothesis_tested",
    source: "AI Lab",
    actor: "AI assistant",
    summary: `Hypothesis updated from analysis ${latestAnalysis.analysisId}`,
    detail,
  });

  recordEvent({
    investigationId,
    eventType: "evidence_promoted",
    source: "AI Lab",
    actor: "AI assistant",
    summary: `Evidence bundle promoted from analysis ${latestAnalysis.analysisId}`,
    detail,
  });
}

function queryLatestAnalysisInvestigationId(db: SqliteDatabaseLike): string | null {
  const row = db
    .prepare(
      `SELECT investigation_id
       FROM ai_analyses
       ORDER BY updated_at DESC, created_at DESC, id DESC
       LIMIT 1`,
    )
    .all()[0] as { investigation_id: string | null } | undefined;

  return row?.investigation_id ?? null;
}

function queryAnalysisCount(db: SqliteDatabaseLike): number {
  const row = db.prepare("SELECT COUNT(*) AS total FROM ai_analyses").all()[0] as
    | CountRow
    | undefined;
  return row?.total ?? 0;
}

function parseAiLabResultPayload(rawValue: unknown): AiLabResultPayload | null {
  if (rawValue == null) {
    return null;
  }

  let parsedValue = rawValue;

  if (typeof parsedValue === "string") {
    try {
      parsedValue = JSON.parse(parsedValue);
    } catch {
      return null;
    }
  }

  if (typeof parsedValue !== "object" || parsedValue === null) {
    return null;
  }

  const payload = parsedValue as {
    sections?: unknown;
    sources?: unknown;
  };

  const sections: Partial<Record<AiLabSectionKey, string>> = {};

  if (typeof payload.sections === "object" && payload.sections !== null) {
    const rawSections = payload.sections as Record<string, unknown>;

    for (const key of SECTION_KEYS) {
      const value = rawSections[key];

      if (typeof value === "string" && value.trim().length > 0) {
        sections[key] = value.trim();
      }
    }
  }

  const sources: AiLabSourceReference[] = [];

  if (Array.isArray(payload.sources)) {
    for (const candidate of payload.sources) {
      if (typeof candidate !== "object" || candidate === null) {
        continue;
      }

      const source = candidate as Record<string, unknown>;

      if (
        typeof source.id !== "string" ||
        typeof source.title !== "string" ||
        typeof source.type !== "string" ||
        typeof source.note !== "string" ||
        typeof source.freshness !== "string" ||
        !VALID_SOURCE_TYPES.has(source.type as AiLabSourceReference["type"])
      ) {
        continue;
      }

      sources.push({
        id: source.id,
        title: source.title,
        type: source.type as AiLabSourceReference["type"],
        note: source.note,
        freshness: source.freshness,
      });
    }
  }

  const suggestedPrompts: AiLabSuggestedPrompt[] = [];

  if (Array.isArray((payload as { suggestedPrompts?: unknown }).suggestedPrompts)) {
    for (const candidate of (payload as { suggestedPrompts: unknown[] }).suggestedPrompts) {
      if (typeof candidate !== "object" || candidate === null) {
        continue;
      }

      const prompt = candidate as Record<string, unknown>;

      if (typeof prompt.title !== "string" || typeof prompt.detail !== "string") {
        continue;
      }

      const title = prompt.title.trim();
      const detail = prompt.detail.trim();

      if (title.length === 0 || detail.length === 0) {
        continue;
      }

      suggestedPrompts.push({
        title,
        detail,
      });
    }
  }

  if (
    Object.keys(sections).length === 0 &&
    sources.length === 0 &&
    suggestedPrompts.length === 0
  ) {
    return null;
  }

  return {
    sections,
    sources,
    suggestedPrompts,
  };
}

function queryLatestAnalysis(db: SqliteDatabaseLike): AiLabSnapshot | null {
  const row = db
    .prepare(
      `SELECT id, investigation_id, prompt, summary, confidence_label, result_payload
       FROM ai_analyses
       ORDER BY updated_at DESC, created_at DESC, id DESC
       LIMIT 1`,
    )
    .all()[0] as LatestAnalysisRow | undefined;

  if (!row) {
    return null;
  }

  return {
    analysisId: row.id,
    prompt: row.prompt,
    summary: row.summary,
    confidenceLabel: row.confidence_label,
    resultPayload: parseAiLabResultPayload(row.result_payload),
  };
}

export function getAiLabWorkspaceSummary(
  dependencies: AiLabRepositoryDependencies = {},
): AiLabReadResult {
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
    const latestAnalysis = queryLatestAnalysis(db);
    const latestInvestigationId = queryLatestAnalysisInvestigationId(db);

    if (recordEvent) {
      syncAnalysisEvents(latestAnalysis, latestInvestigationId, recordEvent);
    }

    return {
      source: "db",
      analysisCount: queryAnalysisCount(db),
      latestAnalysis,
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
