/**
 * Fallback corpus — REMOVED.
 *
 * The fabricated investigation corpus that previously lived here has been
 * deleted. Returning demo data as historical similarity results is a trust
 * violation. When no indexed investigations exist in the vector store,
 * findSimilarInvestigations now returns { source: "empty" } explicitly.
 *
 * This file is kept as a tombstone so that any remaining import sites
 * produce a type error rather than silently using an empty export.
 */

export interface FallbackInvestigationCorpusEntry {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  state: "Escalated" | "Correlated" | "Watch";
  stationId: string | null;
  severity: string | null;
  indexedAt: number;
}

/** Always returns an empty array. The fabricated corpus has been removed. */
export function getFallbackInvestigationCorpus(
  _now: number,
): FallbackInvestigationCorpusEntry[] {
  return [];
}
