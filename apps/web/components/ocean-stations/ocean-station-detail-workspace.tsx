import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  AudioWaveform,
  Beaker,
  Building2,
  CalendarClock,
  ChevronRight,
  Gauge,
  Globe,
  Leaf,
  Orbit,
  Radar,
  Route,
  Sparkles,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OceanStationAnalytics, OceanStationDetail } from "@/lib/api/types";
import { OceanStationShareTools } from "@/components/ocean-stations/ocean-station-share-tools";
import { OceanStationAlertActivity } from "@/components/ocean-stations/ocean-station-alert-activity";

const ALERT_COLORS = {
  high: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  medium: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  low: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
} as const;

const ACCENT_TONES = {
  cyan: "text-cyan-300 border-cyan-500/25 bg-cyan-500/10",
  emerald: "text-emerald-300 border-emerald-500/25 bg-emerald-500/10",
  amber: "text-amber-300 border-amber-500/25 bg-amber-500/10",
  violet: "text-violet-300 border-violet-500/25 bg-violet-500/10",
  rose: "text-rose-300 border-rose-500/25 bg-rose-500/10",
} as const;

interface OceanStationDetailWorkspaceProps {
  station: OceanStationDetail;
  analytics?: OceanStationAnalytics | null;
  actorId?: string;
}

function getEcosystemLabel(region: string): string {
  if (region.toLowerCase().includes("pacific")) {
    return "Reef Edge Coral Corridor";
  }

  if (region.toLowerCase().includes("shelf")) {
    return "Shelf Transition Habitat";
  }

  return "Open Ocean Biome";
}

function sensorCardTone(category: string): string {
  const normalized = category.toLowerCase();

  if (normalized.includes("thermal")) {
    return "border-amber-500/25 bg-amber-500/10";
  }

  if (normalized.includes("hydro")) {
    return "border-cyan-500/25 bg-cyan-500/10";
  }

  if (normalized.includes("chem")) {
    return "border-emerald-500/25 bg-emerald-500/10";
  }

  return "border-violet-500/25 bg-violet-500/10";
}

export function OceanStationDetailWorkspace({ station, analytics, actorId }: OceanStationDetailWorkspaceProps) {
  const ecosystem = getEcosystemLabel(station.region);
  const leadSensors = station.sensors.slice(0, 4);
  const leadSpecies = station.species.slice(0, 3);
  const primaryAlerts = station.alerts.slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-[1550px] flex-col gap-6 p-6">
      <section className="overflow-hidden rounded-2xl border border-surface-border bg-[radial-gradient(circle_at_18%_20%,_rgba(34,211,238,0.22),_rgba(2,6,23,0)_42%),radial-gradient(circle_at_80%_0%,_rgba(16,185,129,0.18),_rgba(2,6,23,0)_32%),linear-gradient(180deg,rgba(2,16,30,0.95),rgba(3,18,33,0.98))] p-6">
        <Link
          href="/ocean-stations"
          className="inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-cyan-300"
        >
          <ArrowLeft size={13} />
          Back to Ocean Stations
        </Link>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">{station.id}</p>
            <p
              className={cn(
                "inline-flex w-fit items-center rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em]",
                ACCENT_TONES[station.branding.accentColor],
              )}
            >
              {station.branding.exhibitTitle}
            </p>
            <h2 className="text-3xl font-semibold text-slate-100 xl:text-4xl">{station.name}</h2>
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-300">{ecosystem}</p>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{station.summary}</p>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{station.branding.publicDescription}</p>

            <div className="inline-flex items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850/80 px-3 py-2 text-xs text-slate-300">
              <Building2 size={13} className="text-cyan-400" />
              Sponsored by {station.branding.sponsorName} · Operated by {station.branding.operatorName}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-cyan-300">
                <Radar size={13} />
                {station.status}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-amber-300">
                <Gauge size={13} />
                {station.heroMetric}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300">
                <Globe size={13} className="text-cyan-400" />
                {station.region}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/ocean-stations/${station.slug}/exhibit`}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"
                >
                  <Sparkles size={14} />
                  Open Exhibit Mode
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href={`/station/${station.slug}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
                >
                  Public QR Page
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-2 text-xs text-slate-300">
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Location</p>
              <p className="mt-1 flex items-center gap-1">
                <Orbit size={12} className="text-emerald-400" />
                {station.locationLabel}
              </p>
            </div>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Depth Profile</p>
              <p className="mt-1 flex items-center gap-1">
                <Waves size={12} className="text-cyan-400" />
                {station.depthM ?? "-"} m below surface
              </p>
            </div>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Last Telemetry</p>
              <p className="mt-1 flex items-center gap-1">
                <CalendarClock size={12} className="text-cyan-400" />
                {station.lastReported}
              </p>
            </div>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Branding</p>
              <p className="mt-1 text-xs text-slate-300">{station.branding.logoLabel}</p>
              <p className="mt-1 text-[11px] text-slate-500">Accent: {station.branding.accentColor}</p>
            </div>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Page Analytics</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <span className="rounded-md border border-surface-borderSubtle bg-ocean-900/70 px-2 py-1">
                  Detail {analytics?.views.detail ?? 0}
                </span>
                <span className="rounded-md border border-surface-borderSubtle bg-ocean-900/70 px-2 py-1">
                  Exhibit {analytics?.views.exhibit ?? 0}
                </span>
                <span className="rounded-md border border-surface-borderSubtle bg-ocean-900/70 px-2 py-1">
                  Public {analytics?.views.public ?? 0}
                </span>
                <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-cyan-300">
                  Total {analytics?.views.total ?? 0}
                </span>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                Last view {analytics?.lastViewedAt ? new Date(analytics.lastViewedAt).toLocaleString() : "Unavailable"}
              </p>
            </div>
            <OceanStationShareTools
              stationName={station.name}
              stationSlug={station.slug}
              accentColor={station.branding.accentColor}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Ecological Signals</p>
          {primaryAlerts.length > 0 ? (
            primaryAlerts.map((alert) => (
              <span
                key={alert.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]",
                  ALERT_COLORS[alert.severity],
                )}
              >
                <AlertTriangle size={11} />
                {alert.status}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">No active ecological signals.</span>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <article className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Beaker size={16} className="text-cyan-400" />
              Live Conditions
            </h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {leadSensors.map((sensor) => (
                <div
                  key={sensor.id}
                  className={cn(
                    "rounded-xl border p-4",
                    sensorCardTone(sensor.category),
                  )}
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{sensor.category}</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">{sensor.name}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-mono text-base text-slate-100">
                      {sensor.value}
                      {sensor.unit ? ` ${sensor.unit}` : ""}
                    </span>
                    <span className="rounded-full border border-surface-borderSubtle bg-ocean-900/80 px-2 py-0.5 text-slate-300">
                      {sensor.status}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">Sampled {sensor.sampledAt}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Leaf size={16} className="text-emerald-400" />
              Species Highlights
            </h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {leadSpecies.map((species) => (
                <div key={species.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{species.name}</p>
                    <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2 py-0.5 text-[11px] text-slate-400">
                      {species.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-cyan-300">{species.populationTrend}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{species.notes}</p>
                  <p className="mt-2 text-[10px] text-slate-500">Observed {species.observedAt}</p>
                </div>
              ))}
            </div>
            {station.species.length > leadSpecies.length ? (
              <p className="mt-3 text-xs text-slate-500">
                +{station.species.length - leadSpecies.length} additional species records in this station profile.
              </p>
            ) : null}
          </article>
        </section>

        <section className="space-y-6">
          <article className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <AlertTriangle size={16} className="text-amber-400" />
              Alert Activity
            </h3>
            <div className="mt-4">
              <OceanStationAlertActivity
                stationId={station.id}
                alerts={station.alerts}
                actorId={actorId ?? "researcher"}
              />
            </div>
          </article>

          <article className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Route size={16} className="text-cyan-400" />
              Timeline
            </h3>
            <div className="mt-4 space-y-3 border-l border-surface-borderSubtle pl-4">
              {station.timeline.map((item) => (
                <div key={item.id} className="relative rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                  <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{item.label}</p>
                    <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                      {item.phase}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">{item.detail}</p>
                  <p className="mt-2 text-[10px] text-slate-500">{item.happenedAt}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <AudioWaveform size={16} className="text-violet-400" />
              Educational Content
            </h3>
            <div className="mt-4 space-y-3">
              {station.content.map((item) => (
                <div key={item.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.contentType}</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">{item.title}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{item.summary}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">{item.publishedAt}</span>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 transition-colors hover:text-cyan-300"
                      >
                        Open
                        <ChevronRight size={12} />
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
              <p className="text-xs text-slate-300">
                Exhibit Mode is optimized for wall displays and public walkthroughs.
              </p>
              <Link
                href={`/ocean-stations/${station.slug}/exhibit`}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-cyan-300 transition-colors hover:text-cyan-200"
              >
                Launch Exhibit Mode
                <ArrowRight size={14} />
              </Link>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
