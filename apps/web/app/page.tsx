import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardAnomalySummaryCard } from "@/components/dashboard/dashboard-anomaly-summary";
import { SignalCenter } from "@/components/signals/signal-center";
import {
  formatSurfaceStatusLine,
  getDashboardMarineSurfaceData,
  getMarineRegionByName,
  getSignalDetailHref,
} from "@/lib/marine-intelligence";
import {
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const METRIC_TONE = {
  neutral: "border-surface-borderSubtle bg-ocean-850/60 text-slate-400",
  info: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-300",
} as const;

function triageSummary(anomalySummary: {
  criticalAnomalies: number;
  elevatedAnomalies: number;
  trendDirection: "up" | "down" | "flat";
}): { text: string; tone: "neutral" | "warning" | "critical" } {
  if (anomalySummary.criticalAnomalies > 0 && anomalySummary.trendDirection === "up") {
    return { text: "Regional risk increasing — investigate trend", tone: "critical" };
  }

  if (anomalySummary.criticalAnomalies > 0 || anomalySummary.elevatedAnomalies > 0) {
    return { text: "Elevated signals detected — review affected stations", tone: "warning" };
  }

  return { text: "No active anomalies detected across monitored regions", tone: "neutral" };
}

function formatConditionMetric(value: number | null, digits = 1): string {
  if (value === null || value === undefined) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatStressLevel(level: string | null): string {
  if (!level) {
    return "--";
  }

  return level
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

export default async function DashboardPage() {
  const marineData = await getDashboardMarineSurfaceData();
  const {
    metrics,
    anomalySummary,
    anomalySummaryLinks,
    anomalySummaryStatus,
    prioritizedSignals,
    signalCenterStatus,
    liveConditions,
    liveConditionsStatus,
    reefAlerts,
    reefAlertsStatus,
    quickLinks,
    notices,
  } = marineData;

  return (
    <AppShell
      pageTitle="Marine Intelligence"
      pageSubtitle="Live-backed marine risk surfaces only"
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
                Dashboard Scope
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                This dashboard now shows only live-backed marine risk surfaces.
              </h2>
              <p className="max-w-3xl text-sm text-slate-400">
                Station conditions, reef stress, anomalies, regional risk, and signal detections on this page are sourced from the marine intelligence stack.
                The dashboard excludes demo workflows and unsourced summary widgets.
              </p>
              {(() => {
                const triage = triageSummary(anomalySummary);
                return (
                  <p className={cn(
                    "inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-medium",
                    triage.tone === "critical"
                      ? "border-rose-500/25 bg-rose-500/10 text-rose-200"
                      : triage.tone === "warning"
                        ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
                        : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
                  )}>
                    {triage.text}
                  </p>
                );
              })()}
            </div>

            <div className="grid gap-2 md:min-w-[360px]">
              {notices.map((notice) => (
                <article
                  key={notice.title}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm",
                    notice.tone === "warning"
                      ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
                      : "border-cyan-500/25 bg-cyan-500/10 text-cyan-100",
                  )}
                >
                  <p className="font-medium">{notice.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{notice.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const content = (
                <div className={cn("rounded-xl border p-4", METRIC_TONE[metric.tone])}>
                  <p className="text-[10px] uppercase tracking-[0.18em]">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-100">{metric.value}</p>
                  <p className="mt-1 text-[11px]">{metric.caption}</p>
                </div>
              );

              return metric.href ? (
                <Link key={metric.label} href={metric.href} className="transition-transform hover:-translate-y-0.5">
                  {content}
                </Link>
              ) : (
                <div key={metric.label}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>

        <DashboardAnomalySummaryCard
          summary={anomalySummary}
          links={anomalySummaryLinks}
          statusLine={formatSurfaceStatusLine(anomalySummaryStatus)}
        />

        <SignalCenter
          signals={prioritizedSignals}
          getSignalHref={getSignalDetailHref}
          statusLine={formatSurfaceStatusLine(signalCenterStatus)}
          emptyStateTitle="No live signal detections are open"
          emptyStateSubtitle="The persisted signal store returned no active detections. Use regional and station pages for direct risk output."
        />

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Live Marine Conditions</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatSurfaceStatusLine(liveConditionsStatus)}
              </p>
            </div>
            {liveConditionsStatus.source === "fallback" && (
              <span className="inline-flex w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300">
                Fallback mode
              </span>
            )}
          </div>

          {liveConditions.length > 0 ? (
            <div className="grid gap-2">
              {liveConditions.slice(0, 6).map((condition) => (
                <article
                  key={`${condition.stationId}-${condition.timestamp}`}
                  className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[120px_repeat(4,minmax(0,1fr))_170px]"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Station</p>
                    <p className="mt-1 font-semibold text-slate-100">
                      <Link
                        href={`/v1/risk/${encodeURIComponent(condition.stationId)}`}
                        className="hover:text-cyan-300"
                      >
                        {condition.stationId}
                      </Link>
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {condition.source === "noaa_ndbc" ? "NOAA NDBC" : condition.source ?? "source unavailable"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Sea temp</p>
                    <p className="mt-1">{formatConditionMetric(condition.sstC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wave height</p>
                    <p className="mt-1">{formatConditionMetric(condition.waveHeightM, 2)} m</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wind</p>
                    <p className="mt-1">{formatConditionMetric(condition.windSpeedMps)} m/s</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Pressure</p>
                    <p className="mt-1">{formatConditionMetric(condition.pressureHpa)} hPa</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Observed</p>
                    <p className="mt-1 font-mono text-slate-400">{condition.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                    {condition.ingestedAt && (
                      <p className="mt-0.5 font-mono text-[9px] text-slate-600">
                        ingested {condition.ingestedAt.slice(0, 16).replace("T", " ")} UTC
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No station conditions are available from the current source.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Reef Stress Watch</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatSurfaceStatusLine(reefAlertsStatus)}
              </p>
            </div>
            {reefAlertsStatus.source === "fallback" && (
              <span className="inline-flex w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300">
                Fallback mode
              </span>
            )}
          </div>

          {reefAlerts.length > 0 ? (
            <div className="grid gap-2">
              {reefAlerts.slice(0, 6).map((alert) => {
                const region = getMarineRegionByName(alert.region);

                return (
                  <article
                    key={`${alert.region}-${alert.stationId ?? "region"}-${alert.timestamp}`}
                    className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[180px_repeat(4,minmax(0,1fr))_160px]"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Region</p>
                      <p className="mt-1 font-semibold text-slate-100">
                        {region ? (
                          <Link
                            href={`/v1/regions/${encodeURIComponent(region.id)}/risk/trend`}
                            className="hover:text-cyan-300"
                          >
                            {alert.region}
                          </Link>
                        ) : (
                          alert.region
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">SST anomaly</p>
                      <p className="mt-1">{formatConditionMetric(alert.sstAnomalyC)} °C</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">HotSpot</p>
                      <p className="mt-1">{formatConditionMetric(alert.hotSpotC)} °C</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">DHW</p>
                      <p className="mt-1">{formatConditionMetric(alert.dhw)} week</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Stress level</p>
                      <p className="mt-1">{formatStressLevel(alert.stressLevel)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Observed</p>
                      <p className="mt-1 font-mono text-slate-400">{alert.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No reef stress records are available from the current source.
            </div>
          )}
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">
            Live Views
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 transition-colors hover:bg-cyan-500/10"
              >
                <p className="text-sm font-semibold text-cyan-300">{link.label}</p>
                <p className="mt-1 text-[11px] text-slate-400">{link.description}</p>
                <ChevronRight size={12} className="mt-3 text-cyan-400 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
