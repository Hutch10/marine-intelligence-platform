import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Building2,
  ExternalLink,
  Fish,
  Gauge,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OceanStationDetail } from "@/lib/api/types";
import { OceanStationShareTools } from "@/components/ocean-stations/ocean-station-share-tools";

const ALERT_COLORS = {
  high: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  medium: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  low: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
} as const;

interface OceanStationPublicWorkspaceProps {
  station: OceanStationDetail;
}

function ecosystemLabel(region: string): string {
  const normalized = region.toLowerCase();

  if (normalized.includes("pacific")) {
    return "Coral Reef Edge Ecosystem";
  }

  if (normalized.includes("shelf")) {
    return "Shelf Transition Ecosystem";
  }

  return "Open Ocean Ecosystem";
}

export function OceanStationPublicWorkspace({ station }: OceanStationPublicWorkspaceProps) {
  const topSensors = station.sensors.slice(0, 3);
  const featuredSpecies = station.species.slice(0, 2);
  const featuredAlerts = station.alerts.slice(0, 3);
  const featuredContent = station.content.slice(0, 3);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_rgba(2,12,24,0)_38%),linear-gradient(180deg,#020b16_0%,#041427_70%,#051a31_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-md px-4 pb-10 pt-5 sm:max-w-lg sm:px-5">
        <section className="rounded-2xl border border-surface-border bg-ocean-900/85 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-400">Marine Bio</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">{station.branding.exhibitTitle}</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight">{station.name}</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-emerald-300">
            {ecosystemLabel(station.region)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{station.summary}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{station.branding.publicDescription}</p>

          <div className="mt-4 grid gap-2 text-xs">
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/80 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Live Status</p>
              <p className="mt-1 inline-flex items-center gap-1 text-slate-200">
                <Radio size={12} className="text-emerald-400" />
                {station.status} · {station.lastReported}
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-200">
              <p className="inline-flex items-center gap-1 text-xs">
                <Gauge size={12} />
                {station.heroMetric}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Link
              href={`/ocean-stations/${station.slug}`}
              className="inline-flex items-center gap-1 rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300 transition-colors hover:text-cyan-300"
            >
              <ArrowLeft size={12} />
              Full Station View
            </Link>
            <Link
              href={`/ocean-stations/${station.slug}/exhibit`}
              className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-cyan-300 transition-colors hover:bg-cyan-500/15"
            >
              Exhibit Mode
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-surface-border bg-ocean-900/85 p-4">
          <h2 className="text-sm font-semibold">Live Conditions</h2>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {topSensors.map((sensor) => (
              <article key={sensor.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{sensor.category}</p>
                <div className="mt-1 flex items-end justify-between">
                  <p className="text-sm text-slate-200">{sensor.name}</p>
                  <p className="font-mono text-lg text-cyan-200">
                    {sensor.value}
                    {sensor.unit ? ` ${sensor.unit}` : ""}
                  </p>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{sensor.status} · {sensor.sampledAt}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-surface-border bg-ocean-900/85 p-4">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Fish size={14} className="text-emerald-400" />
            Featured Species
          </h2>
          <div className="mt-3 space-y-2">
            {featuredSpecies.map((species) => (
              <article key={species.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{species.name}</p>
                  <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2 py-0.5 text-[10px] text-slate-400">
                    {species.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-cyan-300">{species.populationTrend}</p>
                <p className="mt-1 text-[11px] text-slate-400">{species.notes}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-surface-border bg-ocean-900/85 p-4">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={14} className="text-amber-400" />
            Ecological Alerts
          </h2>
          <div className="mt-3 space-y-2">
            {featuredAlerts.map((alert) => (
              <article key={alert.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-200">{alert.title}</p>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                      ALERT_COLORS[alert.severity],
                    )}
                  >
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{alert.detail}</p>
                <p className="mt-1 text-[10px] text-slate-500">{alert.status} · {alert.detectedAt}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-surface-border bg-ocean-900/85 p-4">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <BookOpenText size={14} className="text-violet-400" />
            Learn More
          </h2>
          <div className="mt-3 space-y-2">
            {featuredContent.map((item) => (
              <article key={item.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.contentType}</p>
                <p className="mt-1 text-sm font-medium text-slate-100">{item.title}</p>
                <p className="mt-1 text-[11px] text-slate-400">{item.summary}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-slate-500">{item.publishedAt}</p>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1 text-xs text-cyan-300 transition-colors hover:text-cyan-200"
                    >
                      Open
                      <ExternalLink size={12} />
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">
            <Building2 size={14} />
            Operator and Sponsor
          </h2>
          <p className="mt-2 text-sm text-slate-300">{station.branding.logoLabel}</p>
          <p className="mt-1 text-xs text-slate-400">Operated by {station.branding.operatorName} · Sponsored by {station.branding.sponsorName}</p>
          <p className="mt-3 text-[11px] text-slate-500">Live habitat telemetry for research, outreach, and conservation learning.</p>
        </section>

        <OceanStationShareTools
          stationName={station.name}
          stationSlug={station.slug}
          accentColor={station.branding.accentColor}
          className="mt-4"
        />
      </div>
    </main>
  );
}
