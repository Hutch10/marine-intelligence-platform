/**
 * Cosine similarity and top-K nearest-neighbour search.
 *
 * All functions are pure and synchronous — no DB access, no async.
 */

export interface VectorCandidate {
  id: string;
  vec: number[];
  metadata?: Record<string, unknown>;
}

export interface SimilarityHit {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Cosine similarity between two equal-length vectors.
 * Returns a value in [0, 1] for L2-normalised inputs (or [-1, 1] in general).
 * Returns 0 if either vector is the zero vector.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);

  if (denom === 0) {
    return 0;
  }

  // Clamp to [-1, 1] to handle floating-point drift
  return Math.min(1, Math.max(-1, dot / denom));
}

/**
 * Find the top-K candidates most similar to `query`.
 *
 * Candidates with the same `id` as `queryId` are excluded so a record
 * is never returned as its own nearest neighbour.
 *
 * Results are sorted descending by score.
 */
export function findTopK(
  query: number[],
  candidates: VectorCandidate[],
  k: number,
  queryId?: string,
): SimilarityHit[] {
  const scored: SimilarityHit[] = [];

  for (const candidate of candidates) {
    if (queryId !== undefined && candidate.id === queryId) {
      continue;
    }

    scored.push({
      id: candidate.id,
      score: cosineSimilarity(query, candidate.vec),
      metadata: candidate.metadata,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k);
}
