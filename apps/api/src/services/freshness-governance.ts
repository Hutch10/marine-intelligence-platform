import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";

export type FreshnessGovernanceMode = "enforce" | "withhold";

export interface SourceFreshnessGovernance {
  source: string;
  label: string;
  mode: FreshnessGovernanceMode;
  isStale: boolean;
  staleByMs: number | null;
  staleAfterMs: number;
  promoteAsLive: boolean;
  withholdReason: string | null;
}

export interface FreshnessGovernanceSnapshot {
  generatedAt: string;
  staleAfterMs: number;
  sources: SourceFreshnessGovernance[];
  withheldCount: number;
}

const SOURCE_LABELS: Record<string, string> = {
  noaa_ndbc: "NDBC",
  noaa_coral_reef_watch: "CRW",
  crw: "CRW",
  ioos_regional: "IOOS",
  ioos_erddap: "ERDDAP",
};

function labelFor(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function buildFreshnessGovernanceSnapshot(
  snapshot: LiveIngestionHealthSnapshot,
  generatedAt = new Date().toISOString(),
): FreshnessGovernanceSnapshot {
  const sources = snapshot.latestBySource.map((item) => {
    const failed = item.status === "failed" || item.workerStatus === "failed";
    const withhold = failed || item.isStale;
    const mode: FreshnessGovernanceMode = withhold ? "withhold" : "enforce";

    return {
      source: item.source,
      label: labelFor(item.source),
      mode,
      isStale: item.isStale,
      staleByMs: item.staleByMs,
      staleAfterMs: snapshot.staleAfterMs,
      promoteAsLive: !withhold,
      withholdReason: failed
        ? (item.error ?? "source_failed")
        : item.isStale
          ? `stale_by_${item.staleByMs ?? 0}ms`
          : null,
    };
  });

  return {
    generatedAt,
    staleAfterMs: snapshot.staleAfterMs,
    sources,
    withheldCount: sources.filter((item) => !item.promoteAsLive).length,
  };
}
