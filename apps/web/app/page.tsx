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
import { ChevronRight } from "lucide-react";
import { DataCoverageMap } from "@/components/dashboard/CoverageMap";
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

function feedBadgeClass(status: "live" | "stale" | "failed" | "unknown"): string {
  switch (status) {
    case "live":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "stale":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    case "failed":
      return "border-rose-500/25 bg-rose-500/10 text-rose-300";
    default:
      return "border-slate-500/25 bg-slate-500/10 text-slate-400";
  }
}

function compactFeedBadgeLabel(input: {
  label: string;
  status: "live" | "stale" | "failed" | "unknown";
  ageLabel: string | null;
}): string {
  switch (input.status) {
    case "live":
      return `${input.label} live${input.ageLabel ? ` · ${input.ageLabel}` : ""}`;
    case "stale":
      return `${input.label} stale${input.ageLabel ? ` · ${input.ageLabel}` : ""}`;
    case "failed":
      return `${input.label} failed${input.ageLabel ? ` · ${input.ageLabel}` : ""}`;
    default:
      return `${input.label} never ran`;
  }
}

function resolveAuxFeedSource(
  source:
    | {
        source: string;
        label: string;
        status: "live" | "stale" | "failed" | "unknown";
        ageLabel: string | null;
      }
    | undefined,
  fallback: { source: string; label: string },
) {
  return source ?? {
    ...fallback,
    status: "unknown" as const,
    ageLabel: null,
  };
}

function formatFailureTimestamp(value: string | null): string {
  if (!value) {
    return "unknown";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "unknown";
  }

  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function formatReasonCategory(category: "parse_failure" | "validation_failure" | "mixed" | "unknown"): string {
  switch (category) {
    case "parse_failure":
      return "parse failures";
    case "validation_failure":
      return "validation failures";
    case "mixed":
      return "mixed failures";
    default:
      return "uncategorized failures";
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const marineData = await getDashboardMarineSurfaceData();
  const {
    metrics,
    anomalySummary,
    anomalySummaryLinks,
    anomalySummaryStatus,
    anomalyInvestigationPrefill,
    prioritizedSignals,
    signalCenterStatus,
    liveConditions,
    liveConditionsStatus,
    reefAlerts,
    reefAlertsStatus,
    quickLinks,
    notices,
    feedHealth,
    stationIngestionDiagnostics = [],
  } = marineData;

  const liveApiDisconnected =
    liveConditionsStatus.source === "fallback" && reefAlertsStatus.source === "fallback";
  const auxiliaryFeedSources = [
    resolveAuxFeedSource(feedHealth.ioos, { source: "ioos", label: "IOOS" }),
    resolveAuxFeedSource(feedHealth.erddap, { source: "erddap", label: "ERDDAP" }),
  ];

  const warningNotices = notices.filter((n) => n.tone === "warning");
  const triage = triageSummary(anomalySummary);

  return (
    <AppShell
      pageTitle="Marine Intelligence"
      pageSubtitle="Monitor ocean conditions, detect anomalies, and track reef stress across monitored regions."
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        {searchParams.notice === "operator_access_required" && (
          <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
            <h3 className="text-sm font-semibold text-rose-400">Operator access required</h3>
            <p className="mt-1 text-sm text-rose-300/80">
              The requested view is a restricted operational surface. You must be an authorized operator to access this area.
            </p>
          </div>
        )}

        {/* Command center header */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
                Marine Intelligence Command Center
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                Live ocean conditions, signal detection, and reef stress monitoring.
              </h2>
              <p className="max-w-2xl text-sm text-slate-400">
                Real-time data surfaces from monitored stations and NOAA NDBC ingestion.
                All metrics reflect verified telemetry — stale or seed data is labeled inline.
              </p>
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
            </div>

            <div className="flex flex-col gap-2 md:min-w-[320px]">
              {liveApiDisconnected && (
                <article className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm">
                  <p className="font-medium text-amber-200">API connection required for live data</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-300">
                    Station and reef stress APIs are unreachable. Metrics show last known values.
                    Start the API server or run ingestion to restore live feeds.
                  </p>
                </article>
              )}
              {warningNotices.map((notice) => (
                <article
                  key={notice.title}
                  className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm"
                >
                  <p className="font-medium text-amber-200">{notice.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{notice.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Status metrics */}
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
          createInvestigationPrefill={anomalyInvestigationPrefill}
        />

        <SignalCenter
          signals={prioritizedSignals}
          getSignalHref={getSignalDetailHref}
          statusLine={formatSurfaceStatusLine(signalCenterStatus)}
          emptyStateTitle="No active signal detections"
          emptyStateSubtitle="Signals appear here when the ingestion pipeline flags anomalies at monitored stations."
        />

        <DataCoverageMap />

        {/* Live ocean conditions */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Live Ocean Conditions</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatSurfaceStatusLine(liveConditionsStatus)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {auxiliaryFeedSources.map((source) => (
                  <span
                    key={source.source}
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                      feedBadgeClass(source.status),
                    )}
                  >
                    {compactFeedBadgeLabel(source)}
                  </span>
                ))}
              </div>
            </div>
            {liveConditionsStatus.source === "fallback" && (
              <span className="inline-flex w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300">
                Station API offline
              </span>
            )}
            {liveConditionsStatus.source !== "fallback" && feedHealth.ndbc.status !== "live" && feedHealth.ndbc.status !== "unknown" && (
              <span className={cn(
                "inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-medium",
                feedHealth.ndbc.status === "failed"
                  ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-300",
              )}>
                NDBC {feedHealth.ndbc.status === "failed"
                  ? (feedHealth.ndbc.ageLabel ? `no data since ${feedHealth.ndbc.ageLabel}` : "no recent data")
                  : `stale · ${feedHealth.ndbc.ageLabel ?? "old"}`}
              </span>
            )}
          </div>

          {liveConditions.length > 0 && liveConditions.every((c) => c.source === "seed") && (
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-[11px] text-cyan-200">
              <span className="font-semibold uppercase tracking-wider">Seed data</span>
              {" — "}These observations are from the seed dataset, not live ingestion.
              Run <code className="font-mono text-cyan-300">pnpm --filter api ingest:live</code> to replace with real NDBC readings.
            </div>
          )}

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
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/70 p-4 text-sm text-slate-300">
              <p className="font-medium text-slate-200">No station observations loaded yet</p>
              <p className="mt-1 text-[12px] text-slate-400">
                Run <code className="font-mono text-slate-300">pnpm --filter api ingest:live</code> or{" "}
                <code className="font-mono text-slate-300">seed:datasets</code> to populate station conditions.
              </p>
            </div>
          )}

          {stationIngestionDiagnostics.length > 0 && (
            <details className="rounded-xl border border-surface-borderSubtle bg-ocean-850/50 p-3">
              <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                Station ingestion diagnostics ({stationIngestionDiagnostics.length})
              </summary>
              <div className="mt-3 grid gap-2">
                {stationIngestionDiagnostics.map((diagnostic) => (
                  <article
                    key={`${diagnostic.source}-${diagnostic.stationId}`}
                    className="rounded-lg border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-[11px] text-slate-300"
                  >
                    <p className="font-semibold text-slate-100">
                      {diagnostic.stationId} · {diagnostic.sourceLabel}
                    </p>
                    <p className="mt-1 text-slate-400">
                      failures {diagnostic.failureCount} · last failure {formatFailureTimestamp(diagnostic.lastFailureAt)}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      category {formatReasonCategory(diagnostic.reasonCategory)} · parse {diagnostic.parseFailureCount} · validation {diagnostic.validationFailureCount}
                    </p>
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>

        {/* Reef stress */}
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
                CRW feed offline
              </span>
            )}
            {reefAlertsStatus.source !== "fallback" && feedHealth.crw.status !== "live" && feedHealth.crw.status !== "unknown" && (
              <span className={cn(
                "inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-medium",
                feedHealth.crw.status === "failed"
                  ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-300",
              )}>
                CRW {feedHealth.crw.status === "failed"
                  ? (feedHealth.crw.ageLabel ? `no data since ${feedHealth.crw.ageLabel}` : "no recent data")
                  : `stale · ${feedHealth.crw.ageLabel ?? "old"}`}
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
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/70 p-4 text-sm text-slate-300">
              <p className="font-medium text-slate-200">No reef stress data available yet</p>
              <p className="mt-1 text-[12px] text-slate-400">
                Run live ingestion to populate CRW stress records for monitored regions.
              </p>
            </div>
          )}
        </section>

        {/* Quick navigation */}
        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">
            Explore
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
