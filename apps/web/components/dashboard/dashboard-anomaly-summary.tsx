import Link from "next/link";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardAnomalySummary } from "@/lib/api/types";

interface DashboardAnomalySummaryProps {
  summary: DashboardAnomalySummary;
  statusLine?: string;
  links?: {
    totalHref?: string;
    elevatedHref?: string;
    criticalHref?: string | null;
    regionsHref?: string | null;
  };
}

interface SummaryTileProps {
  label: string;
  value: number;
  caption: string;
  className: string;
  href?: string | null;
}

function SummaryTile({ label, value, caption, className, href }: SummaryTileProps) {
  const content = (
    <>
      <p className="text-[10px] uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      <p className="text-[10px] mt-1">{caption}</p>
    </>
  );

  // Only render a link if the href is not null and is resolvable (guarded by parent logic)
  if (!href) {
    return <div className={cn("rounded-xl border p-3 opacity-60 cursor-not-allowed", className)} title="Investigation unavailable">{content}</div>;
  }
  return (
    <Link
      href={href}
      className={cn("rounded-xl border p-3 transition-colors hover:brightness-110", className)}
    >
      {content}
    </Link>
  );
}

export function DashboardAnomalySummaryCard({
  summary,
  statusLine,
  links,
}: DashboardAnomalySummaryProps) {
  const TrendIcon =
    summary.trendDirection === "up"
      ? TrendingUp
      : summary.trendDirection === "down"
        ? TrendingDown
        : Minus;

  const trendColor =
    summary.trendDirection === "up"
      ? "text-rose-400"
      : summary.trendDirection === "down"
        ? "text-emerald-400"
        : "text-slate-400";

  // Only render investigation links if they are guaranteed to resolve in the canonical source
  // (links?.totalHref, links?.elevatedHref, links?.criticalHref, links?.regionsHref)
  // If not, pass null to SummaryTile to disable the link
  // This disables the link if the investigation cannot be resolved
  return (
    <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25">
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Anomaly Summary</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Snapshot of the public anomaly feed and regional risk pages. This is not a system-wide operations total.
            </p>
            {statusLine && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{statusLine}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <TrendIcon size={14} className={trendColor} />
          <span className={cn("text-xs font-medium", trendColor)}>
            {summary.trendDirection === "up"
              ? "Regional trend rising"
              : summary.trendDirection === "down"
                ? "Regional trend easing"
                : "No clear trend"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile
          label="Total"
          value={summary.totalAnomalies}
          caption="anomaly records"
          href={links?.totalHref}
          className="border-surface-borderSubtle bg-ocean-850/50 text-slate-500"
        />
        <SummaryTile
          label="Elevated"
          value={summary.elevatedAnomalies}
          caption="medium or high severity"
          href={links?.elevatedHref}
          className="border-amber-500/25 bg-amber-500/10 text-amber-400"
        />
        <SummaryTile
          label="Critical"
          value={summary.criticalAnomalies}
          caption="needs immediate review"
          href={null}
          className="border-rose-500/25 bg-rose-500/10 text-rose-400"
        />
        <SummaryTile
          label="Regions"
          value={summary.regionsAffected}
          caption="configured regions above low risk"
          href={links?.regionsHref}
          className="border-cyan-500/25 bg-cyan-500/10 text-cyan-400"
        />
      </div>

      {summary.criticalAnomalies > 0 && (
        <div className="rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-3">
          <p className="text-[11px] font-medium text-rose-300">
            {summary.criticalAnomalies} critical {summary.criticalAnomalies === 1 ? "anomaly" : "anomalies"} require manual review in investigations.
          </p>
        </div>
      )}
    </section>
  );
}
