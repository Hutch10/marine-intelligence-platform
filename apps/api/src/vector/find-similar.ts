/**
 * findSimilarInvestigations
 *
 * Ranks investigations by a composite score:
 *   0.6 * embedding similarity
 * + 0.2 * same station boost
 * + 0.1 * recency decay
 * + 0.1 * severity weight
 *
 * When the vector store is empty or unavailable, the function returns
 * { source: "empty" } — no fabricated corpus data is used as a fallback.
 */

import type { SimilarInvestigation } from "@marine/shared";
import type { SqliteDatabaseLike } from "../db/client";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
} from "../db/client";
import { getVectorRecord, listVectorRecords, type VectorRecord, type VectorRecordMetadata } from "./store";
import { cosineSimilarity } from "./similarity";

const DEFAULT_K = 5;
const DEFAULT_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type FindSimilarFallback =
  | "db_path_missing"
  | "db_open_failed"
  | "query_failed"
  | "not_indexed";

export type FindSimilarRankingMode = "vector" | "keyword";

export interface FindSimilarSearchResult {
  investigations: SimilarInvestigation[];
  rankingMode: FindSimilarRankingMode;
}

export type FindSimilarResult =
  | { source: "db"; investigations: SimilarInvestigation[]; rankingMode: FindSimilarRankingMode }
  | { source: "empty"; fallbackReason: FindSimilarFallback };

export interface FindSimilarDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  k?: number;
  stationId?: string | null;
  windowDays?: number;
  now?: number;
}

interface SearchCandidate {
  id: string;
  title: string;
  summary: string;
  explanation?: string | null;
  content: string;
  embedding?: number[] | null;
  stationId?: string | null;
  severity?: string | null;
  embeddedAt: number;
  matchedOn: Array<"title" | "summary" | "explanation">;
}

interface ScoredCandidate extends SearchCandidate {
  embeddingSimilarity: number;
  sameStationBoost: number;
  recencyDecay: number;
  severityWeight: number;
  similarity: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function uniqueTokens(text: string): string[] {
  return Array.from(new Set(tokenize(text)));
}

function tokenOverlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidateTokens);
  let shared = 0;

  for (const token of new Set(queryTokens)) {
    if (candidateSet.has(token)) {
      shared += 1;
    }
  }

  if (shared === 0) {
    return 0;
  }

  return (2 * shared) / (queryTokens.length + candidateTokens.length);
}

function recencyDecay(embeddedAt: number, now: number, windowDays: number): number {
  const windowMs = Math.max(1, windowDays) * DAY_MS;
  const ageMs = Math.max(0, now - embeddedAt);

  if (ageMs >= windowMs) {
    return 0;
  }

  return Math.max(0, 1 - ageMs / windowMs);
}

function severityWeight(
  severity: string | null | undefined,
  text: string,
): number {
  const raw = `${severity ?? ""} ${text}`.toLowerCase();

  if (/\b(critical|escalated|urgent|catastrophic|severe)\b/.test(raw)) {
    return 1;
  }

  if (/\b(high|alert|elevated|warning)\b/.test(raw)) {
    return 0.85;
  }

  if (/\b(medium|moderate|correlated|notice)\b/.test(raw)) {
    return 0.6;
  }

  if (/\b(low|watch|minor|minimal)\b/.test(raw)) {
    return 0.35;
  }

  return 0.5;
}

function formatTimeframeLabel(embeddedAt: number, now: number): string {
  const ageDays = Math.max(0, Math.floor((now - embeddedAt) / DAY_MS));

  if (ageDays <= 0) {
    return "today";
  }

  if (ageDays === 1) {
    return "1 day ago";
  }

  if (ageDays < 7) {
    return `${ageDays} days ago`;
  }

  if (ageDays < 30) {
    const weeks = Math.max(1, Math.round(ageDays / 7));
    return weeks === 1 ? "this week" : `${weeks} weeks ago`;
  }

  if (ageDays < 90) {
    const months = Math.max(1, Math.round(ageDays / 30));
    return months === 1 ? "this month" : `${months} months ago`;
  }

  return `${ageDays} days ago`;
}

function normalizeSeverityLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const raw = value.trim().toLowerCase();

  if (!raw) {
    return null;
  }

  if (raw.includes("critical") || raw.includes("escalated")) {
    return "critical";
  }

  if (raw.includes("high") || raw.includes("alert") || raw.includes("warning")) {
    return "high";
  }

  if (raw.includes("medium") || raw.includes("moderate") || raw.includes("correlated")) {
    return "medium";
  }

  if (raw.includes("low") || raw.includes("watch")) {
    return "low";
  }

  return raw;
}

function toMetadata(value: VectorRecordMetadata | null | undefined): VectorRecordMetadata {
  return value ?? {};
}

function fromVectorRecord(record: VectorRecord): SearchCandidate {
  const metadata = toMetadata(record.metadata);
  const title = metadata.title ?? record.recordId;
  const summary = metadata.summary ?? record.content.slice(0, 300);
  const explanation = metadata.explanation ?? null;

  return {
    id: record.recordId,
    title,
    summary,
    explanation,
    content: record.content,
    embedding: record.embedding,
    stationId: record.stationId ?? null,
    severity: normalizeSeverityLabel(record.severity),
    embeddedAt: record.embeddedAt,
    matchedOn: metadata.matchedOn ?? ["title", "summary"],
  };
}

function dedupeCandidates(candidates: SearchCandidate[]): SearchCandidate[] {
  const seen = new Set<string>();
  const deduped: SearchCandidate[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    deduped.push(candidate);
  }

  return deduped;
}

function buildQueryCandidate(
  investigationId: string,
  dbQueryRecord: VectorRecord | null,
): SearchCandidate {
  if (dbQueryRecord) {
    return fromVectorRecord(dbQueryRecord);
  }

  return {
    id: investigationId,
    title: investigationId,
    summary: investigationId,
    explanation: null,
    content: investigationId,
    embedding: null,
    stationId: null,
    severity: null,
    embeddedAt: Date.now(),
    matchedOn: ["title", "summary"],
  };
}

function scoreCandidate(
  query: SearchCandidate,
  candidate: SearchCandidate,
  mode: FindSimilarRankingMode,
  now: number,
  windowDays: number,
): ScoredCandidate {
  const queryTokens = uniqueTokens(`${query.title} ${query.summary} ${query.explanation ?? ""} ${query.content}`);
  const candidateTokens = uniqueTokens(
    `${candidate.title} ${candidate.summary} ${candidate.explanation ?? ""} ${candidate.content}`,
  );

  const embeddingSimilarity =
    mode === "vector" && query.embedding && candidate.embedding
      ? Math.max(0, cosineSimilarity(query.embedding, candidate.embedding))
      : tokenOverlapScore(queryTokens, candidateTokens);

  const sameStationBoost =
    query.stationId && candidate.stationId && query.stationId === candidate.stationId ? 1 : 0;
  const recency = recencyDecay(candidate.embeddedAt, now, windowDays);
  const severity = severityWeight(candidate.severity, `${candidate.title} ${candidate.summary} ${candidate.content}`);

  return {
    ...candidate,
    embeddingSimilarity,
    sameStationBoost,
    recencyDecay: recency,
    severityWeight: severity,
    similarity:
      0.6 * embeddingSimilarity +
      0.2 * sameStationBoost +
      0.1 * recency +
      0.1 * severity,
  };
}

function sortScoredCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.similarity !== a.similarity) {
    return b.similarity - a.similarity;
  }

  if (b.embeddedAt !== a.embeddedAt) {
    return b.embeddedAt - a.embeddedAt;
  }

  return a.id.localeCompare(b.id);
}

function toSimilarInvestigation(
  candidate: ScoredCandidate,
  now: number,
): SimilarInvestigation {
  return {
    investigationId: candidate.id,
    title: candidate.title,
    summary: candidate.summary,
    similarity: Math.round(candidate.similarity * 1000) / 1000,
    embeddingSimilarity: Math.round(candidate.embeddingSimilarity * 1000) / 1000,
    matchedOn: candidate.matchedOn,
    matchedStation: candidate.stationId ?? null,
    severity: candidate.severity ?? null,
    timeframeLabel: formatTimeframeLabel(candidate.embeddedAt, now),
    indexedAt: new Date(candidate.embeddedAt).toISOString(),
  };
}

function applyFilters(
  candidates: SearchCandidate[],
  query: SearchCandidate,
  stationId: string | null | undefined,
  windowDays: number,
  now: number,
): SearchCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.id === query.id) {
      return false;
    }

    if (stationId && candidate.stationId !== stationId) {
      return false;
    }

    return recencyDecay(candidate.embeddedAt, now, windowDays) > 0;
  });
}

function searchCandidates(
  query: SearchCandidate,
  candidates: SearchCandidate[],
  mode: FindSimilarRankingMode,
  now: number,
  windowDays: number,
  k: number,
): FindSimilarSearchResult {
  const scored = candidates
    .map((candidate) => scoreCandidate(query, candidate, mode, now, windowDays))
    .sort(sortScoredCandidates)
    .slice(0, k)
    .map((candidate) => toSimilarInvestigation(candidate, now));

  return {
    investigations: scored,
    rankingMode: mode,
  };
}

/**
 * Core search — assumes the table already exists and the db is open.
 * Only indexes real DB records. Returns empty results when the store has
 * no indexed investigations — no fabricated corpus data is used.
 */
export function findSimilarInvestigationsFromDb(
  db: SqliteDatabaseLike,
  investigationId: string,
  options: number | { k?: number; stationId?: string | null; windowDays?: number; now?: number } = DEFAULT_K,
): FindSimilarSearchResult {
  const resolvedOptions = typeof options === "number" ? { k: options } : options;
  const k = resolvedOptions.k ?? DEFAULT_K;
  const stationId = resolvedOptions.stationId ?? null;
  const windowDays = resolvedOptions.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = resolvedOptions.now ?? Date.now();

  const queryRecord = getVectorRecord(db, "investigation", investigationId);
  const allRecords = listVectorRecords(db, "investigation");
  const query = buildQueryCandidate(investigationId, queryRecord);
  const dbCandidates = dedupeCandidates(allRecords.map((record) => fromVectorRecord(record)));
  const candidates = applyFilters(dbCandidates, query, stationId, windowDays, now);

  if (queryRecord && candidates.length > 0) {
    return searchCandidates(query, candidates, "vector", now, windowDays, k);
  }

  // Keyword fallback over real indexed records only — no corpus.
  return searchCandidates(query, candidates, "keyword", now, windowDays, k);
}

/**
 * Public entry-point with DB fallback.
 * Returns { source: "empty" } when the DB is unavailable or unindexed.
 * Never returns fabricated or demo investigation data.
 */
export function findSimilarInvestigations(
  investigationId: string,
  dependencies: FindSimilarDependencies = {},
): FindSimilarResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const k = dependencies.k ?? DEFAULT_K;
  const stationId = dependencies.stationId ?? null;
  const windowDays = dependencies.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = dependencies.now ?? Date.now();

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "empty", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(dbPath);
  } catch {
    return { source: "empty", fallbackReason: "db_open_failed" };
  }

  try {
    const result = findSimilarInvestigationsFromDb(db, investigationId, {
      k,
      stationId,
      windowDays,
      now,
    });

    if (result.rankingMode === "vector" || result.investigations.length > 0) {
      return {
        source: "db",
        investigations: result.investigations,
        rankingMode: result.rankingMode,
      };
    }

    return { source: "empty", fallbackReason: "not_indexed" };
  } catch {
    return { source: "empty", fallbackReason: "query_failed" };
  } finally {
    db.close();
  }
}
