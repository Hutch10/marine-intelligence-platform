/**
 * Deterministic text embedder using the hashing trick.
 *
 * Produces a 256-dimensional L2-normalised float vector from any text string.
 * No external dependencies, no async, no side effects — fully deterministic.
 *
 * Design:
 *  1. Tokenise: lowercase, split on non-alphanumeric, keep tokens ≥ 3 chars.
 *  2. For each token compute a 32-bit FNV-1a hash → slot in [0, DIM-1].
 *  3. Increment slot counter.
 *  4. L2-normalise the resulting vector.
 *
 * This is intentionally simple.  The architecture supports swapping in a
 * neural embedder (Claude API, OpenAI, local model) by replacing `embedText`
 * while keeping every consumer unchanged.
 */

export const EMBED_DIM = 256;

export type EmbedFn = (text: string) => number[];

// FNV-1a 32-bit hash (deterministic, good distribution for short tokens)
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < str.length; i++) {
    // XOR then multiply by prime
    hash ^= str.charCodeAt(i);
    // Multiply by FNV prime (2166136261 * 16777619 mod 2^32)
    hash = Math.imul(hash, 0x01000193);
  }

  // Ensure unsigned 32-bit result
  return hash >>> 0;
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Embed `text` into a 256-dimensional L2-normalised float vector.
 * Returns a plain `number[]` for JSON serialisation compatibility.
 */
export function embedText(text: string): number[] {
  const counts = new Float64Array(EMBED_DIM);
  const tokens = tokenise(text);

  if (tokens.length === 0) {
    // Return zero vector for empty / whitespace-only input
    return Array.from(counts);
  }

  for (const token of tokens) {
    const slot = fnv1a32(token) % EMBED_DIM;
    counts[slot] += 1;
  }

  // L2 normalisation
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) {
    norm += counts[i] * counts[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) {
    return Array.from(counts);
  }

  const result: number[] = new Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) {
    result[i] = counts[i] / norm;
  }

  return result;
}

/** Build the combined text content used to embed an investigation record. */
export function buildInvestigationContent(fields: {
  title: string;
  summary: string;
  explanation?: string;
  alerts?: Array<{
    title: string;
    detail?: string;
  }>;
}): string {
  const sections: string[] = [
    `Title: ${fields.title.trim()}`,
    `Summary: ${fields.summary.trim()}`,
  ];

  if (fields.explanation?.trim()) {
    sections.push(`Explanation: ${fields.explanation.trim()}`);
  }

  if (fields.alerts?.length) {
    const alertLines = fields.alerts.flatMap((alert) => {
      const lines = [`- ${alert.title.trim()}`];
      if (alert.detail?.trim()) {
        lines.push(`  Detail: ${alert.detail.trim()}`);
      }
      return lines;
    });
    sections.push(`Alerts:\n${alertLines.join("\n")}`);
  }

  return sections.join("\n\n");
}
