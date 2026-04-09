/**
 * Index an investigation into the vector store.
 *
 * Builds the combined text content from title + summary + optional explanation,
 * embeds it, and upserts the record.  Injectable embedder for testability.
 */

import type { SqliteDatabaseLike } from "../db/client";
import { embedText, buildInvestigationContent, type EmbedFn } from "./embed";
import { upsertVectorRecord, type VectorRecordMetadata } from "./store";

export interface IndexInvestigationInput {
  investigationId: string;
  title: string;
  summary: string;
  explanation?: string;
  alerts?: Array<{
    title: string;
    detail?: string;
  }>;
  stationId?: string | null;
  speciesIds?: string[] | null;
  severity?: string | null;
  source?: string | null;
}

/**
 * Embed and store an investigation record in the vector index.
 *
 * @param db       Writable SQLite database (table is created if absent).
 * @param input    Investigation fields to embed.
 * @param embedFn  Embedding function (defaults to the built-in bag-of-words embedder).
 */
export function indexInvestigation(
  db: SqliteDatabaseLike,
  input: IndexInvestigationInput,
  embedFn: EmbedFn = embedText,
): void {
  const content = buildInvestigationContent({
    title: input.title,
    summary: input.summary,
    explanation: input.explanation,
    alerts: input.alerts,
  });

  const matchedOn: VectorRecordMetadata["matchedOn"] = ["title", "summary"];
  if (input.explanation) matchedOn.push("explanation");

  const metadata: VectorRecordMetadata = {
    title: input.title,
    summary: input.summary,
    explanation: input.explanation,
    alerts: input.alerts,
    matchedOn,
  };

  const embedding = embedFn(content);
  const now = Date.now();

  upsertVectorRecord(db, {
    id: `inv:${input.investigationId}`,
    recordType: "investigation",
    recordId: input.investigationId,
    content,
    embedding,
    stationId: input.stationId ?? null,
    speciesIds: input.speciesIds ?? null,
    severity: input.severity ?? null,
    source: input.source ?? null,
    embeddedAt: now,
    metadata,
  });
}
