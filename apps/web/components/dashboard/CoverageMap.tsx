"use client";

import React, { useEffect, useState } from "react";
import { Shield, MapPin, AlertTriangle, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import type { RegionsResponse } from "@marine/shared";

interface CoverageRegion {
  id: string;
  name: string;
  status: string;
  summary: string;
  openAlerts: number | null;
  nearestBuoy: string | null;
  thermalAnomaly: string | null;
  centroid: { lat: number; lng: number } | null;
}

type Density = "High" | "Moderate" | "Sparse" | "None";

function toDensity(status: string): Density {
  const s = status.toLowerCase();
  if (s.includes("active") || s.includes("normal") || s.includes("good")) return "High";
  if (s.includes("elevated") || s.includes("warning")) return "Moderate";
  if (s.includes("critical") || s.includes("alert")) return "Sparse";
  return "None";
}

function getMetric(metrics: { label: string; value: string }[], label: string): string | null {
  return metrics.find((m) => m.label === label)?.value ?? null;
}

const DENSITY_STYLES: Record<Density, { dot: string; border: string; pin: string }> = {
  High:     { dot: "bg-emerald-500", border: "border-emerald-500 bg-emerald-500/20 shadow-[0_0_14px_rgba(16,185,129,0.35)]", pin: "text-emerald-400" },
  Moderate: { dot: "bg-cyan-500",    border: "border-cyan-500    bg-cyan-500/20",    pin: "text-cyan-400"    },
  Sparse:   { dot: "bg-amber-500",   border: "border-amber-500   bg-amber-500/20",   pin: "text-amber-400"   },
  None:     { dot: "bg-slate-600",   border: "border-slate-600   bg-slate-700/20",   pin: "text-slate-400"   },
};

export function hasFiniteCentroid(
  centroid: CoverageRegion["centroid"],
): centroid is { lat: number; lng: number } {
  return !!centroid
    && Number.isFinite(centroid.lat)
    && Number.isFinite(centroid.lng)
    && centroid.lat >= -90
    && centroid.lat <= 90
    && centroid.lng >= -180
    && centroid.lng <= 180
    && !(centroid.lat === 0 && centroid.lng === 0);
}

export function toMarkerPercent(centroid: { lat: number; lng: number }): { left: string; top: string } {
  // Equirectangular projection into map container percentages.
  // Clamping removed to prevent visual masking of invalid coordinates.
  const left = ((centroid.lng + 180) / 360) * 100;
  const top = ((90 - centroid.lat) / 180) * 100;

  return {
    left: `${left.toFixed(3)}%`,
    top: `${top.toFixed(3)}%`,
  };
}

export function DataCoverageMap() {
  const [regions, setRegions] = useState<CoverageRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_MARINE_API_URL ?? "http://localhost:4000";
    fetch(`${base}/regions`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: RegionsResponse) => {
        setRegions(
          (data.regions ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            summary: r.summary,
            openAlerts: (() => {
              const v = getMetric(r.metrics, "Open alerts");
              return v !== null ? Number(v) : null;
            })(),
            nearestBuoy: getMetric(r.metrics, "Nearest buoy"),
            thermalAnomaly: getMetric(r.metrics, "Thermal anomaly"),
            centroid: hasFiniteCentroid(r.centroid) ? r.centroid : null,
          })),
        );
      })
      .catch(() => {
        // API unreachable — leave empty so empty state renders
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedRegion = regions.find((r) => r.id === selected);
  const regionsWithCentroid = regions.filter((region) => hasFiniteCentroid(region.centroid));
  const regionsMissingCentroid = regions.filter((region) => !hasFiniteCentroid(region.centroid));

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Observation Coverage Network
          </h3>
          <p className="text-sm text-slate-400">Regional monitoring status from the live database</p>
        </div>
        <div className="flex gap-2">
          {(["High", "Moderate", "Sparse", "None"] as Density[]).map((lv) => (
            <div key={lv} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/50">
              <div className={clsx("w-2 h-2 rounded-full", DENSITY_STYLES[lv].dot)} />
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-medium">{lv}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map surface */}
        <div className="lg:col-span-2 relative aspect-video bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle, #334155 1px, transparent 1px)", backgroundSize: "32px 32px" }}
          />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
            </div>
          )}

          {!loading && regions.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
              <AlertTriangle className="w-8 h-8 text-slate-600" />
              <p className="text-sm text-slate-500">No regions in database</p>
              <p className="text-[11px] text-slate-600">Run <code className="font-mono">pnpm --filter api seed:datasets</code> to populate sample data.</p>
            </div>
          )}

          {!loading && regionsWithCentroid.map((r) => {
            const density = toDensity(r.status);
            const styles = DENSITY_STYLES[density];
            const marker = toMarkerPercent(r.centroid);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id === selected ? null : r.id)}
                className={clsx(
                  "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-all duration-200 hover:scale-110",
                )}
                style={{ left: marker.left, top: marker.top }}
              >
                <div className={clsx("p-1.5 rounded-full border-2", styles.border)}>
                  <MapPin className={clsx("w-4 h-4", styles.pin)} />
                </div>
                <span className="mt-1 text-[10px] font-bold text-slate-400 hover:text-slate-100 whitespace-nowrap bg-slate-900/80 px-1 rounded">
                  {r.name.split(" ")[0]}
                </span>
              </button>
            );
          })}

          {!loading && regions.length > 0 && regionsWithCentroid.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-amber-200">Missing centroid data for all regions</p>
              <p className="text-[11px] text-slate-500">No map markers are rendered until centroid coordinates are available.</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50 min-h-[140px]">
            {selectedRegion ? (
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-bold text-slate-100 text-sm leading-tight">{selectedRegion.name}</h4>
                  <span className={clsx(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0",
                    toDensity(selectedRegion.status) === "High"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                      : "bg-slate-700 text-slate-400",
                  )}>
                    {toDensity(selectedRegion.status)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{selectedRegion.summary}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase">Open Alerts</p>
                    <p className="text-xl font-mono text-slate-200">
                      {selectedRegion.openAlerts !== null ? selectedRegion.openAlerts : "--"}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase">SST Anomaly</p>
                    <p className="text-xl font-mono text-cyan-400">
                      {selectedRegion.thermalAnomaly ?? "--"}
                    </p>
                  </div>
                </div>
                {selectedRegion.nearestBuoy && (
                  <p className="text-[11px] text-slate-500">
                    Nearest buoy: <span className="text-slate-300 font-mono">{selectedRegion.nearestBuoy}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-6 text-center">
                <AlertTriangle className="w-8 h-8 text-slate-700 mb-2" />
                <p className="text-sm text-slate-500">Select a region marker to view its status</p>
              </div>
            )}
          </div>

          <div className="p-3 bg-slate-800/20 border border-slate-700/30 rounded-lg">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Data source</p>
            <p className="text-[11px] text-slate-400">
              Regions and metrics are fetched live from the marine API.
              {regions.length > 0 && ` ${regions.length} region${regions.length !== 1 ? "s" : ""} active.`}
            </p>
          </div>

          {regionsMissingCentroid.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Missing centroid data</p>
              <p className="text-[11px] text-amber-100">
                Markers are withheld for {regionsMissingCentroid.length} region{regionsMissingCentroid.length !== 1 ? "s" : ""} with missing centroid coordinates.
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-amber-50">
                {regionsMissingCentroid.map((region) => (
                  <li key={region.id}>{region.id} - {region.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
