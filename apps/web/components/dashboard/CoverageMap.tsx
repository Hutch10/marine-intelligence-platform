"use client";

import React, { useState } from "react";
import { Shield, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

interface CoverageRegion {
  id: string;
  name: string;
  density: "High" | "Moderate" | "Sparse" | "None";
  stationCount: number;
  liveSignals: number;
  vessels: number;
  lastUpdated: string;
}

const REGIONS: CoverageRegion[] = [
  { id: "se-fl", name: "Southeast Florida", density: "High", stationCount: 12, liveSignals: 42, vessels: 15, lastUpdated: "Live" },
  { id: "fl-keys", name: "Florida Keys", density: "Moderate", stationCount: 8, liveSignals: 15, vessels: 4, lastUpdated: "5m ago" },
  { id: "bahamas-w", name: "Western Bahamas", density: "Sparse", stationCount: 2, liveSignals: 0, vessels: 1, lastUpdated: "2h ago" },
  { id: "gulf-stream-deep", name: "Gulf Stream Abyss", density: "None", stationCount: 0, liveSignals: 0, vessels: 0, lastUpdated: "Unavailable" },
];

export function DataCoverageMap() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Observation Coverage Network
          </h3>
          <p className="text-sm text-slate-400">Live spatial density and sensor presence</p>
        </div>
        <div className="flex gap-2">
          {["High", "Moderate", "Sparse", "None"].map((lv) => (
            <div key={lv} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/50">
              <div className={clsx(
                "w-2 h-2 rounded-full",
                lv === "High" ? "bg-emerald-500" :
                lv === "Moderate" ? "bg-cyan-500" :
                lv === "Sparse" ? "bg-amber-500" : "bg-slate-600"
              )} />
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-medium">{lv}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mock Map Surface */}
        <div className="lg:col-span-2 relative aspect-video bg-slate-950 rounded-lg border border-slate-800 overflow-hidden group">
          {/* Abstract Grid Elements */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" 
               style={{ backgroundImage: "radial-gradient(circle, #334155 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
          
          {/* Simulated Coverage Zones */}
          <div className="absolute inset-0">
             {/* SE Florida Zone */}
             <div className="absolute top-[20%] left-[10%] w-[40%] h-[30%] bg-emerald-500/10 border border-emerald-500/30 rounded-full blur-xl animate-pulse" />
             {/* Keys Zone */}
             <div className="absolute top-[40%] left-[5%] w-[30%] h-[20%] bg-cyan-500/10 border border-cyan-500/30 rounded-full blur-xl" />
          </div>

          {/* Interactive Markers */}
          {REGIONS.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={clsx(
                "absolute flex flex-col items-center group transition-all duration-300 transform hover:scale-110",
                i === 0 ? "top-[25%] left-[25%]" :
                i === 1 ? "top-[45%] left-[15%]" :
                i === 2 ? "top-[30%] left-[60%]" : "top-[60%] left-[75%]"
              )}
            >
              <div className={clsx(
                "p-1.5 rounded-full border-2",
                r.density === "High" ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]" :
                r.density === "Moderate" ? "bg-cyan-500/20 border-cyan-500" :
                r.density === "Sparse" ? "bg-amber-500/20 border-amber-500" : "bg-slate-700/20 border-slate-600"
              )}>
                <MapPin className={clsx(
                  "w-4 h-4",
                  r.density === "High" ? "text-emerald-400" :
                  r.density === "Moderate" ? "text-cyan-400" :
                  r.density === "Sparse" ? "text-amber-400" : "text-slate-400"
                )} />
              </div>
              <span className="mt-1 text-[10px] font-bold text-slate-400 group-hover:text-slate-100 whitespace-nowrap bg-slate-900/80 px-1 rounded">
                {r.name.split(" ")[0]}
              </span>
            </button>
          ))}
        </div>

        {/* Sidebar Details */}
        <div className="space-y-4">
          <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
            {selected ? (
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-100">{REGIONS.find(r => r.id === selected)?.name}</h4>
                  <div className={clsx(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    REGIONS.find(r => r.id === selected)?.density === "High" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" :
                    "bg-slate-700 text-slate-400"
                  )}>
                    {REGIONS.find(r => r.id === selected)?.density} Coverage
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase">Stations</p>
                    <p className="text-xl font-mono text-slate-200">{REGIONS.find(r => r.id === selected)?.stationCount}</p>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase">Vessels</p>
                    <p className="text-xl font-mono text-slate-200 text-cyan-400">{REGIONS.find(r => r.id === selected)?.vessels}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Last data ingestion: {REGIONS.find(r => r.id === selected)?.lastUpdated}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertTriangle className="w-10 h-10 text-slate-700 mb-2" />
                <p className="text-sm text-slate-500">Select a region to view coverage metrics</p>
              </div>
            )}
          </div>
          
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
             <h5 className="text-[10px] font-bold uppercase text-amber-400 mb-1">Blind Zone Alert</h5>
             <p className="text-[11px] text-amber-200/80 leading-relaxed">
               Lower Florida Keys showing sparse evidence; high-confidence modeling inhibited by sensor lag.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
