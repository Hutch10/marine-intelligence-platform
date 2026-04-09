import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: "About" };

const GLOSSARY_TERMS = [
  {
    term: "Baseline coverage",
    definition:
      "How many historical data points are available for a station or region. Higher coverage means the anomaly scores are derived from more observations. This is not a probability — it reflects data richness, not confidence in a specific outcome.",
  },
  {
    term: "Projected outlook",
    definition:
      "A trend-based extrapolation of the current risk level, shown at 12h and 24h horizons. It is not a forecast — it describes where conditions appear to be heading based on the recent trajectory, not a predictive model.",
  },
  {
    term: "Live / Stale / Failed / Unknown",
    definition:
      "Feed health labels. Live means the source returned data within the expected window. Stale means data arrived but is older than expected. Failed means the last ingestion attempt errored. Unknown means no ingestion has been recorded yet.",
  },
  {
    term: "Insufficient data",
    definition:
      "A region risk level that means not enough healthy stations returned data to produce a reliable regional assessment. It is not a low-risk reading — it is a data gap.",
  },
];

const HOW_TO_STEPS = [
  {
    step: 1,
    heading: "Start at the dashboard",
    detail:
      "The dashboard shows feed health, regional anomaly counts, and a triage summary. If all feeds are live and no anomalies are flagged, no further review is needed.",
  },
  {
    step: 2,
    heading: "Check feed health",
    detail:
      "The banner at the top of every page shows whether NOAA NDBC and NOAA Coral Reef Watch feeds are live. A stale or failed feed means the risk assessments on that page may be based on older data.",
  },
  {
    step: 3,
    heading: "Open an elevated station or region",
    detail:
      "Navigate to the station or regional risk page for any flagged area. Read the Recommended Action section and the per-metric signal breakdown before drawing conclusions.",
  },
  {
    step: 4,
    heading: "Read the actionability note",
    detail:
      "Each station and region page includes a plain-language description of what the current risk level means operationally. This is a starting point for review — not a final determination.",
  },
  {
    step: 5,
    heading: "Use projected outlook as a trend indicator only",
    detail:
      "The 12h and 24h outlooks on regional trend pages describe whether conditions appear to be worsening or stabilizing. Do not treat them as precise predictions.",
  },
];

export default function AboutPage() {
  return (
    <AppShell pageTitle="About" pageSubtitle="System overview and usage guide">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
            What this system is
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">
            Marine Intelligence Pilot
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            This system is an early-stage signal tool built on live NOAA data. It surfaces conditions that may warrant expert review — it does not replace expert judgment.
          </p>
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span className="font-medium">Pilot disclaimer:</span>{" "}
            Risk levels, anomaly scores, and projected outlooks are derived from statistical baselines and live sensor readings. They are signal indicators, not operational assessments. Always verify with authoritative sources before taking action.
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <h3 className="text-sm font-semibold text-slate-100">Data Sources</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            All data surfaces on this platform trace back to one of two live NOAA feeds.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
              <h4 className="text-sm font-medium text-slate-100">NOAA NDBC</h4>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                National Data Buoy Center. Provides real-time ocean station readings: sea surface temperature, wave height, wind speed, and atmospheric pressure. Ingested on a continuous polling schedule.
              </p>
            </article>
            <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
              <h4 className="text-sm font-medium text-slate-100">NOAA Coral Reef Watch</h4>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Satellite-derived thermal stress data for reef ecosystems. Provides sea surface temperature anomaly, HotSpot, Degree Heating Weeks (DHW), and reef stress level classifications.
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <h3 className="text-sm font-semibold text-slate-100">What the system does</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <p>— Ingests live NOAA NDBC and Coral Reef Watch data on a continuous schedule.</p>
            <p>— Computes anomaly scores for each station metric against a historical baseline.</p>
            <p>— Aggregates station-level scores into regional risk levels.</p>
            <p>— Surfaces active hard-threshold alerts alongside the softer anomaly signals.</p>
            <p>— Shows trend direction and a projected outlook at 12h and 24h horizons.</p>
          </div>

          <h3 className="mt-6 text-sm font-semibold text-slate-100">What the system does not do</h3>
          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <p>— It does not make predictions. Projected outlooks are trend extrapolations, not model forecasts.</p>
            <p>— It does not replace expert marine or ecological judgment.</p>
            <p>— It does not account for unreported events, off-grid conditions, or species-specific thresholds.</p>
            <p>— It does not guarantee data completeness — stations may go offline or return partial readings.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <h3 className="text-sm font-semibold text-slate-100">How to use this system</h3>
          <div className="mt-4 space-y-4">
            {HOW_TO_STEPS.map(({ step, heading, detail }) => (
              <div key={step} className="flex gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-[11px] font-semibold text-cyan-300">
                  {step}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-200">{heading}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <h3 className="text-sm font-semibold text-slate-100">Glossary</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Key terms used throughout this platform.
          </p>
          <div className="mt-4 space-y-4">
            {GLOSSARY_TERMS.map(({ term, definition }) => (
              <div key={term}>
                <p className="text-sm font-medium text-slate-200">{term}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{definition}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
