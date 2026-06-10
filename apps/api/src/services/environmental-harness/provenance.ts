import type { EnvironmentalSignalProvenance } from "@marine/shared";
import { stableContentHash } from "@marine/shared/server";

export { buildHarnessEventId, stableContentHash } from "@marine/shared/server";

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
