import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/platform/empty-state";
import { ErrorState } from "@/components/platform/error-state";
import {
  formatSurfaceStatusLine,
  getMarineRegionForStation,
  getStationRecentAnomalyEvidence,
  getStationRiskAssessment,
} from "@/lib/marine-intelligence";
import { StatusBadge } from "@/components/ui/status-badge";


interface StationRiskPageProps {
  params: {
    stationId: string;
  };
}

export const metadata: Metadata = {
  title: "Station Risk",
};

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

function formatValue(value: number | null, unit: string): string {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(unit === "hPa" ? 0 : 1)} ${unit}`;
}

function actionGuidanceText(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
      return "Recommended action: Verify conditions immediately. Cross-check with nearest station before proceeding.";
    case "high":
      return "Elevated conditions detected. Review active signals and monitor closely.";
    case "medium":
      return "Conditions deviating from baseline. Monitor for escalation.";
    default:
      return "No significant deviations detected. Normal conditions.";
  }
}

function actionGuidanceTone(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-100";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-100";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
    default:
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  }
}

function formatSignalLabel(metric: string): string {
  // Explicit labels for new signal types
  if (metric === "salinityPsu") return "Salinity anomaly";
  if (metric === "dissolvedOxygenMgL") return "Dissolved oxygen anomaly";
  return metric
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

function interpretAnomalySignal(signalType: string, severity: string): string {
  const type = signalType.toLowerCase();
  if (type.includes("thermal") || type.includes("sst") || type.includes("sea_surface_temp")) {
    if (severity === "critical") return "Significant temperature deviation \u2014 thermal stress conditions possible";
    return "Elevated temperature \u2014 potential thermal stress";
  }
  if (type.includes("wave")) {
    if (severity === "critical") return "Extreme wave conditions \u2014 significant surface disturbance";
    return "High wave conditions \u2014 possible disturbance";
  }
  if (type.includes("wind")) {
    if (severity === "critical") return "Severe wind anomaly \u2014 surface conditions significantly impacted";
    return "Elevated winds \u2014 surface conditions may be impacted";
  }
  if (type.includes("pressure")) {
    if (severity === "critical") return "Significant pressure drop \u2014 potential storm system nearby";
    return "Low pressure \u2014 potential storm system nearby";
  }
  if (type.includes("crw") || type.includes("dhw") || type.includes("hotspot")) {
    return "Reef thermal stress indicator \u2014 conditions warrant monitoring";
  }
  return "Anomaly signal detected \u2014 review for operational context";
}

export default async function StationRiskPage({ params }: StationRiskPageProps) {
  const stationId = params.stationId;
  const [result, recentAnomalies] = await Promise.all([
    getStationRiskAssessment(stationId),
    getStationRecentAnomalyEvidence(stationId),
  ]);
  const region = getMarineRegionForStation(stationId);

  if (!result.ok || !result.data) {
    return (
      <AppShell
        pageTitle={`Station ${stationId}`}
        pageSubtitle="Public station risk endpoint"
      >
        <div className="mx-auto max-w-5xl p-6">
          <ErrorState
            title="Station risk unavailable"
            message={result.message ?? "This station does not have a current risk assessment."}
            action={
              region ? (
                <Link
                  href={`/v1/regions/${encodeURIComponent(region.id)}/risk`}
                  className="inline-flex rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  Open {region.name} regional view
                </Link>
              ) : undefined
            }
          />
        </div>
      </AppShell>
    );
  }

  const assessment = result.data;

  return (
    <AppShell
      pageTitle={`Station ${assessment.stationId}`}
      pageSubtitle="Public station risk endpoint"
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
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
                Station Risk
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-slate-100">{assessment.stationId}</h2>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${badgeTone(assessment.riskLevel)}`}>
                  {assessment.riskLevel}
                </span>
                {assessment.sovereignVerification && (
                  <StatusBadge 
                    label={assessment.sovereignVerification.status} 
                  />
                )}
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{assessment.summary}</p>
              <p className="max-w-3xl text-[11px] leading-relaxed text-slate-500">
                {formatSurfaceStatusLine(assessment.provenance)}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>Evaluated {assessment.evaluatedAt.slice(0, 16).replace("T", " ")} UTC</span>
                <span
                  title="Reflects how much historical data is available. Not a probability."
                >
                  Baseline coverage {Math.round(assessment.baselineCoverage.score * 100)}%
                </span>
                <span>{assessment.baselineCoverage.quality} baseline quality</span>
                <span>{assessment.baselineCoverage.historicalDataPoints} historical points</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Freshness</p>
                <p className="mt-1 text-sm text-slate-200">{assessment.freshness.label}</p>
              </div>
              {region ? (
                <Link
                  href={`/v1/regions/${encodeURIComponent(region.id)}/risk`}
                  className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 transition-colors hover:bg-cyan-500/20"
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Region</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">{region.name}</p>
                </Link>
              ) : (
                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Region</p>
                  <p className="mt-1 text-sm text-slate-400">Not mapped to a configured region</p>
                </div>
              )}
            </div>
          </div>

          {(assessment.freshness.stale || assessment.dataQuality.warning) && (
            <div className="mt-4 grid gap-2">
              {assessment.freshness.stale && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Latest observation is stale. Use regional context and neighboring stations before treating this as current operating truth.
                </div>
              )}
              {assessment.dataQuality.warning && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {assessment.dataQuality.warning}
                </div>
              )}
            </div>
          )}
        </section>

        {assessment.sovereignVerification?.status === "SOVEREIGN_CONTRADICTED" && (
          <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-rose-500/20 p-2 text-rose-400 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold uppercase tracking-widest text-rose-200">Sovereign Oracle Contradiction</h3>
                <p className="mt-2 text-sm text-rose-100/90 leading-relaxed">
                  The Forge Reality Engine has detected a fundamental contradiction in the signals associated with this assessment. 
                  The primary risk assessment has been downgraded to &quot;unknown&quot; as a security precaution.
                </p>
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300/70">Identified Anomalies</p>
                  <ul className="list-inside list-disc space-y-1">
                    {assessment.sovereignVerification.contradictions.map((c, i) => (
                      <li key={i} className="text-[11px] text-rose-200/80 font-mono">{c}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 pt-4 border-t border-rose-500/20 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-rose-400">Claim ID: {assessment.sovereignVerification.claimId}</span>
                  <span className="text-[10px] font-mono text-rose-400">Verified at {assessment.sovereignVerification.verifiedAt}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sea surface temperature</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.seaSurfaceTemperatureC, "°C")}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Wave height</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.waveHeightM, "m")}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Wind speed</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.windSpeedMps, "m/s")}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pressure</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.pressureHpa, "hPa")}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">Recommended Action</h3>
          <div className="mt-4 space-y-2">
            <div className={`rounded-xl border px-4 py-3 text-sm ${actionGuidanceTone(assessment.riskLevel)}`}>
              {actionGuidanceText(assessment.riskLevel)}
            </div>
            {assessment.baselineCoverage.quality === "low" && (
              <div className="rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-300">
                Limited historical data — interpret with caution.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Alerts</h3>
              <p className="text-[11px] text-slate-500">Hard-threshold alerts only. A blank section here does not mean the station is risk-free.</p>
            </div>
          </div>

          {assessment.alerts.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {assessment.alerts.map((alert) => (
                <article key={`${alert.title}-${alert.detail}`} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-100">{alert.title}</h4>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeTone(alert.severity === "warning" ? "medium" : "critical")}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{alert.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No active threshold alerts"
                subtitle="The fusion score can still be elevated from baseline anomalies, neighbor corroboration, or CRW context even when no hard threshold is active."
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Recent anomalies</h3>
              <p className="mt-1 text-[11px] text-slate-500">Recent anomaly records from the live anomaly pipeline for this station.</p>
              <p className="mt-2 text-sm text-slate-300">{recentAnomalies.summaryLine}</p>
            </div>
            {recentAnomalies.exportHref && recentAnomalies.exportFileName ? (
              <a
                href={recentAnomalies.exportHref}
                download={recentAnomalies.exportFileName}
                className="inline-flex h-fit rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                Download CSV
              </a>
            ) : null}
          </div>

          {recentAnomalies.state === "unavailable" ? (
            <div className="mt-4 rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-300">
              Recent anomaly history unavailable
            </div>
          ) : recentAnomalies.anomalies.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {recentAnomalies.anomalies.map((anomaly) => (
                <article key={anomaly.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{anomaly.deviation}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{anomaly.detectedAtLabel ?? "Timestamp unavailable"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                        {anomaly.signalTypeLabel}
                      </span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeTone(anomaly.severity)}`}>
                        {anomaly.severity}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] font-medium text-cyan-200/80">{interpretAnomalySignal(anomaly.signalType, anomaly.severity)}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Deviation</p>
                      <p className="mt-1 text-sm text-slate-200">{anomaly.deviation}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Description</p>
                      <p className="mt-1 text-sm text-slate-200">{anomaly.description}</p>
                    </div>
                  </div>
                  {anomaly.evidenceSummary ? (
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{anomaly.evidenceSummary}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3 text-sm text-slate-300">
              No recent anomalies detected
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Signal Breakdown</h3>
            <p className="text-[11px] text-slate-500">These anomaly scores come from the live station risk endpoint. They explain why the final risk level moved.</p>
          </div>

          {assessment.signals.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {assessment.signals.map((signal) => (
                <article key={signal.metric} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-100">{formatSignalLabel(signal.metric)}</h4>
                    <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                      {signal.direction.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Current value</p>
                      <p className="mt-1 text-sm text-slate-200">{signal.currentValue ?? "--"} {signal.unit}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Anomaly score</p>
                      <p className="mt-1 font-mono text-sm text-slate-200">
                        {signal.anomalyScore === null ? "--" : signal.anomalyScore.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No signal metrics returned"
                subtitle="The endpoint returned a station-level risk without metric-level explainability. Treat the overall score as incomplete."
              />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
