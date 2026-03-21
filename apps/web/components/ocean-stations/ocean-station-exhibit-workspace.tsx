"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Building2,
  Fish,
  Gauge,
  Globe,
  Radio,
  Sparkles,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OceanStationDetail } from "@/lib/api/types";
import { OceanStationShareTools } from "@/components/ocean-stations/ocean-station-share-tools";

const ALERT_COLORS = {
  high: "border-rose-500/25 bg-rose-500/12 text-rose-300",
  medium: "border-amber-500/25 bg-amber-500/12 text-amber-300",
  low: "border-cyan-500/25 bg-cyan-500/12 text-cyan-300",
} as const;

const ACCENT_TONES = {
  cyan: "text-cyan-300 border-cyan-500/25 bg-cyan-500/10",
  emerald: "text-emerald-300 border-emerald-500/25 bg-emerald-500/10",
  amber: "text-amber-300 border-amber-500/25 bg-amber-500/10",
  violet: "text-violet-300 border-violet-500/25 bg-violet-500/10",
  rose: "text-rose-300 border-rose-500/25 bg-rose-500/10",
} as const;

interface OceanStationExhibitWorkspaceProps {
  station: OceanStationDetail;
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

export function OceanStationExhibitWorkspace({ station }: OceanStationExhibitWorkspaceProps) {
  const ecosystem = getEcosystemLabel(station.region);
  const [contentIndex, setContentIndex] = useState(0);
  const leadContent = station.content;

  useEffect(() => {
    if (leadContent.length <= 1) {
      return;
    }

    const intervalId = setInterval(() => {
      setContentIndex((previous) => (previous + 1) % leadContent.length);
    }, 7000);

    return () => clearInterval(intervalId);
  }, [leadContent.length]);

  const featuredContent = useMemo(() => {
    if (leadContent.length === 0) {
      return null;
    }

    return leadContent[contentIndex % leadContent.length];
  }, [contentIndex, leadContent]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_rgba(1,9,18,0)_42%),linear-gradient(180deg,#020b16_0%,#031427_70%,#04192e_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-6 p-8 xl:p-10">
        <header className="flex items-center justify-between rounded-2xl border border-surface-border bg-ocean-900/75 px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-400">Ocean Stations Exhibit</p>
            <p
              className={cn(
                "mt-2 inline-flex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em]",
                ACCENT_TONES[station.branding.accentColor],
              )}
            >
              {station.branding.exhibitTitle}
            </p>
            <h1 className="mt-2 text-3xl font-semibold xl:text-4xl">{station.name}</h1>
            <p className="mt-1 text-sm uppercase tracking-[0.22em] text-emerald-300">{ecosystem}</p>
            <p className="mt-1 text-xs text-slate-400">{station.branding.publicDescription}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/station/${station.slug}`}
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/15"
            >
              Public QR Page
            </Link>
            <Link
              href={`/ocean-stations/${station.slug}`}
              className="inline-flex items-center gap-1 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-cyan-300"
            >
              <ArrowLeft size={13} />
              Station Detail
            </Link>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-3 text-sm text-slate-300">
            <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <Building2 size={12} className="text-cyan-400" />
              Sponsor and Operator
            </p>
            <p className="mt-1">{station.branding.sponsorName} · {station.branding.operatorName}</p>
          </div>
          <OceanStationShareTools
            stationName={station.name}
            stationSlug={station.slug}
            accentColor={station.branding.accentColor}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {station.sensors.slice(0, 4).map((sensor) => (
            <article key={sensor.id} className="rounded-2xl border border-cyan-500/18 bg-cyan-500/8 p-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{sensor.category}</p>
              <p className="mt-2 text-sm text-slate-200">{sensor.name}</p>
              <p className="mt-4 font-mono text-3xl text-cyan-200 xl:text-4xl">
                {sensor.value}{sensor.unit ? ` ${sensor.unit}` : ""}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1 rounded-full border border-surface-borderSubtle bg-ocean-900/80 px-2 py-0.5">
                  <Radio size={11} className="text-emerald-400" />
                  {sensor.status}
                </span>
                <span>{sensor.sampledAt}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-2xl border border-surface-border bg-ocean-900/75 p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Fish size={18} className="text-emerald-400" />
              Species Highlights
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {station.species.slice(0, 3).map((species) => (
                <div key={species.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <p className="text-sm font-medium text-slate-100">{species.name}</p>
                  <p className="mt-1 text-xs text-cyan-300">{species.populationTrend}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{species.notes}</p>
                  <p className="mt-2 text-[10px] text-slate-500">Observed {species.observedAt}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-surface-border bg-ocean-900/75 p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Sparkles size={18} className="text-cyan-400" />
              Station Snapshot
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <p className="inline-flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-200">
                <Gauge size={14} />
                {station.heroMetric}
              </p>
              <p className="inline-flex w-full items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2">
                <Building2 size={14} className="text-cyan-400" />
                {station.branding.logoLabel}
              </p>
              <p className="inline-flex w-full items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2">
                <Globe size={14} className="text-cyan-400" />
                {station.locationLabel}
              </p>
              <p className="inline-flex w-full items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2">
                <Waves size={14} className="text-cyan-400" />
                Depth {station.depthM ?? "-"} m
              </p>
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900/75 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <AlertTriangle size={18} className="text-amber-400" />
            Ecological Signal Strip
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {station.alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  ALERT_COLORS[alert.severity],
                )}
              >
                {alert.title} · {alert.status}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <article className="rounded-2xl border border-surface-border bg-ocean-900/75 p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <BookOpenText size={18} className="text-violet-400" />
              Rotating Learning Panel
            </h2>
            {featuredContent ? (
              <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300">{featuredContent.contentType}</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">{featuredContent.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{featuredContent.summary}</p>
                <p className="mt-3 text-xs text-slate-500">{featuredContent.publishedAt}</p>
                {featuredContent.href ? (
                  <Link
                    href={featuredContent.href}
                    className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-300 transition-colors hover:text-cyan-200"
                  >
                    Open Related Resource
                  </Link>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No educational panels available yet.</p>
            )}
          </article>

          <article className="rounded-2xl border border-surface-border bg-ocean-900/75 p-5">
            <h2 className="text-lg font-semibold text-slate-100">Educational Content Groups</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {station.content.map((item) => (
                <div key={item.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{item.contentType}</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">{item.title}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{item.summary}</p>
                  <p className="mt-2 text-[10px] text-slate-500">{item.publishedAt}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
