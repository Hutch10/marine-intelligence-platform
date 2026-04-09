import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/platform/empty-state";
import { ErrorState } from "@/components/platform/error-state";
import {
  formatSurfaceStatusLine,
  getRegionRecentAnomalyEvidence,
  getRegionRiskAssessment,
} from "@/lib/marine-intelligence";

interface RegionRiskPageProps {
  params: {
    regionId: string;
  };
}

export const metadata: Metadata = {
  title: "Regional Risk",
};

function regionalDecisionText(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
    case "high":
      return "Multiple stations indicate elevated risk. Regional conditions may require operational caution.";
    case "medium":
      return "Some stations show deviations. Monitor regional trend.";
    case "low":
      return "Region is within baseline conditions.";
    case "insufficient_data":
      return "Not enough data to assess regional risk.";
    default:
      return "Regional risk status is unclear.";
  }
}

function regionalDecisionTone(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-100";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-100";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
    case "low":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-slate-500/25 bg-slate-500/10 text-slate-300";
  }
}

function badgeTone(riskLevel: "low" | "medium" | "high" | "critical" | "insufficient_data"): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-200";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
    case "insufficient_data":
      return "border-slate-500/25 bg-slate-500/10 text-slate-300";
    default:
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  }
}

function interpretAnomalySignal(signalType: string, severity: string): string {
  const type = signalType.toLowerCase();
  if (signalType === "salinityPsu") return "Salinity anomaly detected";
  if (signalType === "dissolvedOxygenMgL") return "Dissolved oxygen anomaly detected";
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

function buildRegionalAnomalyInterpretation(anomalies: Array<{ signalType: string }>): string | null {
  if (anomalies.length === 0) return null;

  let thermal = 0;
  let wave = 0;
  let wind = 0;
  let pressure = 0;

  for (const anomaly of anomalies) {
    const type = anomaly.signalType.toLowerCase();
    if (type.includes("thermal") || type.includes("sst") || type.includes("sea_surface_temp")) {
      thermal += 1;
    } else if (type.includes("wave")) {
      wave += 1;
    } else if (type.includes("wind")) {
      wind += 1;
    } else if (type.includes("pressure")) {
      pressure += 1;
    }
  }

  const parts: string[] = [];
  if (thermal > 1) parts.push("Multiple temperature anomalies detected across region");
  else if (thermal === 1) parts.push("Temperature anomaly detected");
  if (wave > 1) parts.push("Widespread wave activity observed");
  else if (wave === 1) parts.push("Wave anomaly observed");
  if (wind > 1) parts.push("Elevated wind activity across stations");
  else if (wind === 1) parts.push("Wind anomaly present");
  if (pressure > 1) parts.push("Pressure anomalies across stations");
  else if (pressure === 1) parts.push("Pressure anomaly present");

  if (parts.length === 0) return null;
  return parts.slice(0, 2).join(". ");
}

export default async function RegionRiskPage({ params }: RegionRiskPageProps) {
  const [result, recentAnomalies] = await Promise.all([
    getRegionRiskAssessment(params.regionId),
    getRegionRecentAnomalyEvidence(params.regionId),
  ]);

  if (!result.ok || !result.data) {
    return (
      <AppShell
        pageTitle="Regional Risk"
        pageSubtitle="Public regional marine risk endpoint"
      >
        <div className="mx-auto max-w-5xl p-6">
          <ErrorState
            title="Regional risk unavailable"
            message={result.message ?? "This region does not have a live risk response yet."}
          />
        </div>
      </AppShell>
    );
  }

  const region = result.data;
  const regionalAnomalyInterpretation = buildRegionalAnomalyInterpretation(recentAnomalies.anomalies);

  return (
    <AppShell
      pageTitle={region.regionName}
      pageSubtitle="Public regional marine risk endpoint"
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
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">Regional Risk</p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-slate-100">{region.regionName}</h2>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${badgeTone(region.riskLevel)}`}>
                  {region.riskLevel}
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{region.summary}</p>
              <p className="max-w-3xl text-[11px] leading-relaxed text-slate-500">
                {formatSurfaceStatusLine(region.provenance)}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>Evaluated {region.evaluatedAt.slice(0, 16).replace("T", " ")} UTC</span>
                <span
                  title="Reflects how much historical data is available. Not a probability."
                >
                  Baseline coverage {Math.round(region.confidence.score * 100)}%
                </span>
                <span>{region.confidence.quality} baseline quality</span>
              </div>
            </div>

            <Link
              href={`/v1/regions/${encodeURIComponent(region.regionId)}/risk/trend`}
              className="inline-flex h-fit rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              View trend and projected outlook
            </Link>
          </div>

          {region.riskLevel === "insufficient_data" && (
            <div className="mt-4 rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-200">
              This region does not have enough healthy stations to produce a reliable risk assessment. The risk level shown above is not an operational classification — it indicates a data gap, not a low-risk condition.
            </div>
          )}
          {region.coverageWarning && region.riskLevel !== "insufficient_data" && (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {region.coverageWarning}
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Configured stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.configuredStations}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Analyzed stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.analyzedStations}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Healthy stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.healthyStations}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Minimum healthy stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.minimumHealthyStations}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">What this means</h3>
          <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${regionalDecisionTone(region.riskLevel)}`}>
            {regionalDecisionText(region.riskLevel)}
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">Dominant Drivers</h3>
          <p className="mt-1 text-[11px] text-slate-500">These labels explain what is driving the regional score right now.</p>
          {region.dominantDrivers.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {region.dominantDrivers.map((driver) => (
                <span key={driver} className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300">
                  {driver}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No dominant drivers reported"
                subtitle="The response did not include explainability for this regional score."
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Recent anomalies</h3>
              <p className="mt-1 text-[11px] text-slate-500">Aggregated recent anomaly records from the configured stations in this region.</p>
              <p className="mt-2 text-sm text-slate-300">{recentAnomalies.summaryLine}</p>
              {regionalAnomalyInterpretation ? (
                <p className="mt-1 text-[11px] text-cyan-200/80">{regionalAnomalyInterpretation}</p>
              ) : null}
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
                      {anomaly.stationId ? (
                        <Link
                          href={`/v1/risk/${encodeURIComponent(anomaly.stationId)}`}
                          className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300 hover:border-cyan-500/30 hover:text-cyan-300"
                        >
                          Station {anomaly.stationId}
                        </Link>
                      ) : null}
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
          <h3 className="text-sm font-semibold text-slate-100">Top Contributing Stations</h3>
          <p className="mt-1 text-[11px] text-slate-500">These station pages are the best next step for manual verification.</p>
          {region.topStations.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {region.topStations.map((station) => (
                <Link
                  key={station.stationId}
                  href={`/v1/risk/${encodeURIComponent(station.stationId)}`}
                  className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4 transition-colors hover:bg-ocean-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-100">{station.stationId}</h4>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeTone(station.riskLevel)}`}>
                      {station.riskLevel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No contributing stations available"
                subtitle="The regional response did not return station contributors. Treat this regional score as weakly explained."
              />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
