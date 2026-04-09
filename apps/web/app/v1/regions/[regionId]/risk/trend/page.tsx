import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState } from "@/components/platform/error-state";
import {
  formatSurfaceStatusLine,
  getRegionRiskTrend,
} from "@/lib/marine-intelligence";

interface RegionRiskTrendPageProps {
  params: {
    regionId: string;
  };
}

export const metadata: Metadata = {
  title: "Regional Trend",
};

function trendInterpretationText(direction: string): string {
  switch (direction) {
    case "rising":
      return "Risk is increasing — monitor closely.";
    case "falling":
      return "Risk is decreasing — conditions stabilizing.";
    default:
      return "No significant change in regional risk.";
  }
}

function riskLevelRank(level: string): number {
  const ranks: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return ranks[level] ?? 0;
}

function outlookComparisonText(currentLevel: string, forecastLevel: string): string | null {
  const delta = riskLevelRank(forecastLevel) - riskLevelRank(currentLevel);
  if (delta > 0) return "Conditions may worsen in the near term.";
  if (delta < 0) return "Conditions may improve.";
  return null;
}

function trendInterpretationTone(direction: string): string {
  switch (direction) {
    case "rising":
      return "border-amber-500/25 bg-amber-500/10 text-amber-100";
    case "falling":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-slate-500/25 bg-slate-500/10 text-slate-300";
  }
}

function badgeTone(riskLevel: "low" | "medium" | "high" | "critical"): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-200";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
    default:
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  }
}

export default async function RegionRiskTrendPage({ params }: RegionRiskTrendPageProps) {
  const result = await getRegionRiskTrend(params.regionId);

  if (!result.ok || !result.data) {
    return (
      <AppShell
        pageTitle="Regional Trend"
        pageSubtitle="Public regional trend endpoint"
      >
        <div className="mx-auto max-w-5xl p-6">
          <ErrorState
            title="Regional trend unavailable"
            message={result.message ?? "This region does not have a live trend response yet."}
          />
        </div>
      </AppShell>
    );
  }

  const trend = result.data;

  return (
    <AppShell
      pageTitle={`${trend.regionName} Trend`}
      pageSubtitle="Public regional trend endpoint"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        {/* ── Pilot disclaimer ── */}
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-400">Pilot system</p>
          <p className="mt-1.5 text-sm text-amber-100">
            This is an early-stage signal system. Risk levels and projections are derived indicators —
            not predictive or operational guarantees.
          </p>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">Regional Trend</p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-slate-100">{trend.regionName}</h2>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${badgeTone(trend.currentRisk.riskLevel)}`}>
                  {trend.currentRisk.riskLevel}
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{trend.summary}</p>
              <p className="max-w-3xl text-[11px] leading-relaxed text-slate-500">
                {formatSurfaceStatusLine(trend.provenance)}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>Evaluated {trend.evaluatedAt.slice(0, 16).replace("T", " ")} UTC</span>
                <span>Trend {trend.trend.direction}</span>
                <span>{trend.trend.strength} strength</span>
                <span>Persistence {Math.round(trend.trend.persistence * 100)}%</span>
              </div>
            </div>

            <Link
              href={`/v1/regions/${encodeURIComponent(trend.regionId)}/risk`}
              className="inline-flex h-fit rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              Back to regional risk
            </Link>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-300">
              {trend.forecastMethod}
            </div>
            {trend.coverageWarning && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {trend.coverageWarning}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Baseline coverage</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{Math.round(trend.currentRisk.confidenceScore * 100)}%</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Delta score</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{trend.trend.deltaScore.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Direction</p>
            <p className="mt-2 text-2xl font-semibold capitalize text-slate-100">{trend.trend.direction}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Strength</p>
            <p className="mt-2 text-2xl font-semibold capitalize text-slate-100">{trend.trend.strength}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">What this trend suggests</h3>
          <div className="mt-3 space-y-2">
            <div className={`rounded-xl border px-4 py-3 text-sm ${trendInterpretationTone(trend.trend.direction)}`}>
              {trendInterpretationText(trend.trend.direction)}
            </div>
            {(() => {
              const outlook = outlookComparisonText(trend.currentRisk.riskLevel, trend.forecast.next12h.riskLevel);
              return outlook ? (
                <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 px-4 py-3 text-sm text-slate-300">
                  {outlook}
                </div>
              ) : null;
            })()}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-400">Projected outlook · 12h</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">{trend.forecast.next12h.riskLevel}</h3>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${badgeTone(trend.forecast.next12h.riskLevel)}`}>
                {Math.round(trend.forecast.next12h.confidence * 100)}% forecast confidence
              </span>
            </div>
          </article>

          <article className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-400">Projected outlook · 24h</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">{trend.forecast.next24h.riskLevel}</h3>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${badgeTone(trend.forecast.next24h.riskLevel)}`}>
                {Math.round(trend.forecast.next24h.confidence * 100)}% forecast confidence
              </span>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
