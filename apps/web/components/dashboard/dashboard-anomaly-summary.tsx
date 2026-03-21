import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardAnomalySummary } from "@/lib/api/types";

interface DashboardAnomalySummaryProps {
  summary: DashboardAnomalySummary;
}

export function DashboardAnomalySummaryCard({ summary }: DashboardAnomalySummaryProps) {
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

  return (
    <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25">
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Anomaly Summary</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Current threat level across all regions</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <TrendIcon size={14} className={trendColor} />
          <span className={cn("text-xs font-medium", trendColor)}>
            {summary.trendDirection === "up"
              ? "Increasing"
              : summary.trendDirection === "down"
                ? "Decreasing"
                : "Stable"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Anomalies */}
        <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/50 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Total</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">{summary.totalAnomalies}</p>
          <p className="text-[10px] text-slate-600 mt-1">detected events</p>
        </div>

        {/* Elevated Anomalies */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-amber-400">Elevated</p>
          <p className="mt-2 text-2xl font-semibold text-amber-200">{summary.elevatedAnomalies}</p>
          <p className="text-[10px] text-amber-700 mt-1">intermediate risk</p>
        </div>

        {/* Critical Anomalies */}
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-rose-400">Critical</p>
          <p className="mt-2 text-2xl font-semibold text-rose-200">{summary.criticalAnomalies}</p>
          <p className="text-[10px] text-rose-700 mt-1">high priority</p>
        </div>

        {/* Regions Affected */}
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-400">Regions</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-200">{summary.regionsAffected}</p>
          <p className="text-[10px] text-cyan-700 mt-1">areas impacted</p>
        </div>
      </div>

      {summary.criticalAnomalies > 0 && (
        <div className="rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-3">
          <p className="text-[11px] font-medium text-rose-300">
            ⚠️ {summary.criticalAnomalies} critical {summary.criticalAnomalies === 1 ? "anomaly" : "anomalies"} require immediate review
          </p>
        </div>
      )}
    </section>
  );
}
