import { createHash } from "node:crypto";
import type { EnvironmentalSignalProvenance } from "@marine/shared";

export function stableContentHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildSignalProvenance(input: {
  source: string;
  sourceFeed?: string | null;
  productDate?: string | null;
  ingestedAt?: string | null;
  provenanceId?: string | null;
  stationId?: string | null;
  observedAt?: string | null;
}): EnvironmentalSignalProvenance {
  const contentHash = stableContentHash({
    source: input.source,
    sourceFeed: input.sourceFeed ?? null,
    productDate: input.productDate ?? null,
    stationId: input.stationId ?? null,
    observedAt: input.observedAt ?? null,
  });

  return {
    source: input.source,
    sourceFeed: input.sourceFeed ?? null,
    productDate: input.productDate ?? null,
    ingestedAt: input.ingestedAt ?? null,
    provenanceId: input.provenanceId ?? null,
    contentHash,
  };
}

export function buildHarnessEventId(
  eventKind: string,
  subjectType: string,
  subjectId: string,
  contentHash: string,
): string {
  const digest = createHash("sha256")
    .update(`${eventKind}|${subjectType}|${subjectId}|${contentHash}`)
    .digest("hex")
    .slice(0, 16);

  return `EHE-${eventKind}-${digest}`;
}
