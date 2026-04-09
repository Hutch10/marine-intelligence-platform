import type { FeedHealthStatus, FeedSourceHealth, FeedSourceStatus } from "@/lib/feed-health";

// ─── Styling helpers ──────────────────────────────────────────────────────────

function dotClass(status: FeedSourceStatus): string {
  switch (status) {
    case "live":    return "bg-emerald-400";
    case "stale":   return "bg-amber-400";
    case "failed":  return "bg-rose-400";
    default:        return "bg-slate-500";
  }
}

function textClass(status: FeedSourceStatus): string {
  switch (status) {
    case "live":    return "text-emerald-300";
    case "stale":   return "text-amber-300";
    case "failed":  return "text-rose-300";
    default:        return "text-slate-400";
  }
}

function bannerClass(overall: FeedSourceStatus): string {
  switch (overall) {
    case "live":    return "border-emerald-500/20 bg-emerald-500/5";
    case "stale":   return "border-amber-500/20 bg-amber-500/5";
    case "failed":  return "border-rose-500/20 bg-rose-500/5";
    default:        return "border-slate-500/20 bg-slate-500/5";
  }
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

function sourceStatusCopy(src: FeedSourceHealth): string {
  switch (src.status) {
    case "live":
      return `${src.label} updated ${src.ageLabel ?? "recently"}`;
    case "stale":
      return `${src.label} data is ${src.ageLabel ?? "over 8h"} old — conditions may be outdated`;
    case "failed":
      return `No recent ${src.label} ingestion — data may be unreliable`;
    default:
      return `${src.label} status unknown`;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceChip({ src }: { src: FeedSourceHealth }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dotClass(src.status)}`}
      />
      <span className={`text-[11px] ${textClass(src.status)}`}>
        {sourceStatusCopy(src)}
      </span>
    </span>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────

interface FeedHealthBannerProps {
  feedHealth: FeedHealthStatus;
}

export function FeedHealthBanner({ feedHealth }: FeedHealthBannerProps) {
  if (!feedHealth.dbAvailable) {
    return (
      <div
        role="status"
        aria-label="Data feed health"
        className="border-b border-slate-500/20 bg-slate-500/5 px-4 py-2"
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-slate-500" />
          <span className="text-[11px] text-slate-400">
            Data status unknown — ingestion metadata not available
          </span>
        </div>
      </div>
    );
  }

  const allLive =
    feedHealth.ndbc.status === "live" && feedHealth.crw.status === "live";

  return (
    <div
      role="status"
      aria-label="Data feed health"
      className={`border-b px-4 py-2 ${bannerClass(feedHealth.overallStatus)}`}
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1">
        {allLive ? (
          <>
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-emerald-300">
              Data sources healthy — NDBC updated {feedHealth.ndbc.ageLabel ?? "recently"}, CRW updated{" "}
              {feedHealth.crw.ageLabel ?? "recently"}
            </span>
          </>
        ) : (
          <>
            <SourceChip src={feedHealth.ndbc} />
            <span aria-hidden="true" className="hidden text-slate-600 sm:inline">
              |
            </span>
            <SourceChip src={feedHealth.crw} />
          </>
        )}
      </div>
    </div>
  );
}
