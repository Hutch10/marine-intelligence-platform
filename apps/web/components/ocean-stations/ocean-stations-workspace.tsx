"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Gauge,
  MapPin,
  Search,
  SlidersHorizontal,
  Radio,
  RotateCcw,
  Waves,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { OceanStationSummary } from "@/lib/api/types";
import { MiniLineChart } from "@/components/platform/mini-line-chart";

interface OceanStationsWorkspaceProps {
  stations: OceanStationSummary[];
}

type StationSort = "updated-desc" | "updated-asc" | "name-asc" | "name-desc" | "depth-desc" | "depth-asc";

const DEFAULT_SORT: StationSort = "updated-desc";

function rankUpdated(value: string): number {
  const normalized = value.toLowerCase();

  if (normalized.includes("just now")) {
    return 0;
  }

  if (normalized.includes("min")) {
    return Number.parseInt(normalized, 10) || 0;
  }

  if (normalized.includes("hr")) {
    return (Number.parseInt(normalized, 10) || 0) * 60;
  }

  if (normalized.includes("day")) {
    return (Number.parseInt(normalized, 10) || 0) * 1440;
  }

  return Number.MAX_SAFE_INTEGER;
}

function generateMockTelemetry(stationId: string) {
  // Deterministic mock data based on station ID for consistency
  const seed = stationId.charCodeAt(0);
  const baseTemp = 15 + (seed % 5);
  const baseO2 = 8 + (seed % 3);
  const baseSalinity = 34 + (seed % 2);
  
  return {
    temperature: [
      { label: "12h", value: baseTemp - 0.2 },
      { label: "10h", value: baseTemp - 0.1 },
      { label: "8h", value: baseTemp },
      { label: "6h", value: baseTemp + 0.15 },
      { label: "4h", value: baseTemp + 0.3 },
      { label: "2h", value: baseTemp + 0.25 },
      { label: "now", value: baseTemp + 0.2 },
    ],
    oxygen: [
      { label: "12h", value: baseO2 + 0.1 },
      { label: "10h", value: baseO2 },
      { label: "8h", value: baseO2 - 0.2 },
      { label: "6h", value: baseO2 - 0.3 },
      { label: "4h", value: baseO2 - 0.1 },
      { label: "2h", value: baseO2 },
      { label: "now", value: baseO2 + 0.15 },
    ],
    salinity: [
      { label: "12h", value: baseSalinity },
      { label: "10h", value: baseSalinity + 0.05 },
      { label: "8h", value: baseSalinity + 0.08 },
      { label: "6h", value: baseSalinity + 0.06 },
      { label: "4h", value: baseSalinity + 0.02 },
      { label: "2h", value: baseSalinity },
      { label: "now", value: baseSalinity - 0.03 },
    ],
    acousticActivity: [
      { label: "12h", value: 45 },
      { label: "10h", value: 52 },
      { label: "8h", value: 48 },
      { label: "6h", value: 61 },
      { label: "4h", value: 58 },
      { label: "2h", value: 54 },
      { label: "now", value: 63 },
    ],
  };
}

export function OceanStationsWorkspace({ stations }: OceanStationsWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<StationSort>(DEFAULT_SORT);

  const regionOptions = useMemo(
    () => [...new Set(stations.map((station) => station.region))].sort((a, b) => a.localeCompare(b)),
    [stations],
  );

  const statusOptions = useMemo(
    () => [...new Set(stations.map((station) => station.status))].sort((a, b) => a.localeCompare(b)),
    [stations],
  );

  const visibleStations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = stations.filter((station) => {
      const matchesQuery =
        normalizedQuery.length === 0
        || station.name.toLowerCase().includes(normalizedQuery)
        || station.summary.toLowerCase().includes(normalizedQuery)
        || station.heroMetric.toLowerCase().includes(normalizedQuery)
        || station.locationLabel.toLowerCase().includes(normalizedQuery);
      const matchesRegion = region === "all" || station.region === region;
      const matchesStatus = status === "all" || station.status === status;

      return matchesQuery && matchesRegion && matchesStatus;
    });

    return [...filtered].sort((left, right) => {
      if (sortBy === "name-asc") {
        return left.name.localeCompare(right.name);
      }

      if (sortBy === "name-desc") {
        return right.name.localeCompare(left.name);
      }

      if (sortBy === "depth-asc") {
        return (left.depthM ?? Number.MAX_SAFE_INTEGER) - (right.depthM ?? Number.MAX_SAFE_INTEGER);
      }

      if (sortBy === "depth-desc") {
        return (right.depthM ?? Number.MIN_SAFE_INTEGER) - (left.depthM ?? Number.MIN_SAFE_INTEGER);
      }

      if (sortBy === "updated-asc") {
        return rankUpdated(left.lastReported) - rankUpdated(right.lastReported);
      }

      return rankUpdated(left.lastReported) - rankUpdated(right.lastReported);
    });
  }, [query, region, status, sortBy, stations]);

  function resetFilters() {
    setQuery("");
    setRegion("all");
    setStatus("all");
    setSortBy(DEFAULT_SORT);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-6">
      <section className="rounded-2xl border border-surface-border bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.18),_rgba(2,6,23,0)_45%),linear-gradient(180deg,rgba(3,15,29,0.95),rgba(4,20,37,0.98))] p-6">
        <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-400">Ocean Stations</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-100">Station Operations Deck</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Flagship station network spanning reef, kelp, and deep-ocean habitats. Each station entry
          combines live sensor snapshots, ecological context, and operator-ready alert trails.
        </p>
      </section>

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(3,minmax(0,1fr))_auto]">
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search stations, conditions, or location"
              className="w-full rounded-xl border border-surface-borderSubtle bg-ocean-850 py-2.5 pl-9 pr-3 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-500/35"
            />
          </label>

          <label className="relative block">
            <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              aria-label="Filter stations by region"
              title="Filter by region"
              className="w-full appearance-none rounded-xl border border-surface-borderSubtle bg-ocean-850 py-2.5 pl-9 pr-3 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/35"
            >
              <option value="all">All regions</option>
              {regionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter stations by status"
            title="Filter by status"
            className="w-full appearance-none rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/35"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as StationSort)}
            aria-label="Sort stations"
            title="Sort stations"
            className="w-full appearance-none rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/35"
          >
            <option value="updated-desc">Latest update (newest)</option>
            <option value="updated-asc">Latest update (oldest)</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="depth-desc">Depth (deepest first)</option>
            <option value="depth-asc">Depth (shallowest first)</option>
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/25 hover:text-cyan-300"
          >
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Showing {visibleStations.length} of {stations.length} station{stations.length === 1 ? "" : "s"}
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {visibleStations.map((station) => (
          <Link
            key={station.id}
            href={`/ocean-stations/${station.slug}`}
            className="group rounded-2xl border border-surface-border bg-ocean-900 p-5 transition-all hover:border-cyan-500/35 hover:bg-ocean-850"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{station.id}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">{station.name}</h3>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
                <Activity size={12} />
                {station.status}
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-400">{station.summary}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Location</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-300">
                  <MapPin size={12} className="text-cyan-400" />
                  {station.locationLabel}
                </p>
              </div>
              <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Last Report</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-300">
                  <Radio size={12} className="text-emerald-400" />
                  {station.lastReported}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-amber-300">
                <Gauge size={12} />
                {station.heroMetric}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-surface-borderSubtle bg-ocean-850 px-2.5 py-1">
                <Waves size={12} className="text-cyan-400" />
                Depth {station.depthM ?? "-"} m
              </span>
            </div>

            {(() => {
              const telemetry = generateMockTelemetry(station.id);
              return (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniLineChart
                    data={telemetry.temperature}
                    title="Temp"
                    unit="°C"
                    height={60}
                    color="amber"
                  />
                  <MiniLineChart
                    data={telemetry.oxygen}
                    title="O₂"
                    unit="mg/L"
                    height={60}
                    color="cyan"
                  />
                </div>
              );
            })()}

            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-cyan-400 transition-colors group-hover:text-cyan-300">
              Open station brief
              <ArrowUpRight size={14} />
            </div>
          </Link>
        ))}
        {visibleStations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-borderSubtle bg-ocean-900/60 p-8 text-center text-sm text-slate-500 lg:col-span-2">
            No stations match the current filters. Try broadening the query, region, or status.
          </div>
        ) : null}
      </section>
    </div>
  );
}
