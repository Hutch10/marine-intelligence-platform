"use client";

import React from "react";
import { Activity, Zap, Clock, ShieldAlert, CheckCircle, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

interface SourceHealth {
  sourceId: string;
  status: "healthy" | "degraded" | "failing";
  lastSuccessfulIngest: string;
  failureCount24h: number;
  avgLatencyMs: number;
  freshness: string;
}

const MOCK_SOURCES: SourceHealth[] = [
  { sourceId: "noaa-ndbc", status: "healthy", lastSuccessfulIngest: "10s ago", failureCount24h: 0, avgLatencyMs: 245, freshness: "Live" },
  { sourceId: "ais-sim-heavy", status: "healthy", lastSuccessfulIngest: "2s ago", failureCount24h: 0, avgLatencyMs: 12, freshness: "Live" },
  { sourceId: "ioos-erddap", status: "degraded", lastSuccessfulIngest: "14m ago", failureCount24h: 3, avgLatencyMs: 1200, freshness: "Delayed" },
  { sourceId: "satellite-modis", status: "failing", lastSuccessfulIngest: "6h ago", failureCount24h: 12, avgLatencyMs: 0, freshness: "Stale" },
];

export function SystemHealthPanel() {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Ingestion Pipeline Health
          </h3>
          <p className="text-sm text-slate-400">Real-time status of all marine signal sources</p>
        </div>
        <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-bold text-emerald-400 uppercase tracking-tight flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 fill-current" />
          Overall Healthy
        </div>
      </div>

      <div className="space-y-3">
        {MOCK_SOURCES.map((s) => (
          <div key={s.sourceId} className="group relative p-4 bg-slate-800/20 rounded-lg border border-slate-700/50 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "p-2 rounded-lg",
                  s.status === "healthy" ? "bg-emerald-500/10 text-emerald-500" :
                  s.status === "degraded" ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-rose-500"
                )}>
                  {s.status === "healthy" ? <CheckCircle className="w-5 h-5" /> : 
                   s.status === "degraded" ? <AlertCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-mono text-sm text-slate-200 group-hover:text-indigo-300 transition-colors">{s.sourceId}</h4>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 uppercase font-medium">
                      <Clock className="w-3 h-3" />
                      {s.lastSuccessfulIngest}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-500 uppercase font-medium">
                      Latency: <span className="text-slate-300">{s.avgLatencyMs}ms</span>
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-1">
                <div className={clsx(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight",
                  s.status === "healthy" ? "text-emerald-400" :
                  s.status === "degraded" ? "text-amber-400" : "text-rose-400"
                )}>
                  {s.status}
                </div>
                <div className="text-[10px] text-slate-600 font-mono">
                  Failures(24h): {s.failureCount24h}
                </div>
              </div>
            </div>
            
            {/* Health Mini-Graph Simulation */}
            <div className="mt-3 h-1 w-full bg-slate-700/50 rounded-full overflow-hidden flex gap-0.5">
               {[...Array(20)].map((_, i) => (
                 <div key={i} className={clsx(
                   "h-full flex-1",
                   s.status === "failing" && i > 15 ? "bg-rose-500/50" :
                   s.status === "degraded" && i % 4 === 0 ? "bg-amber-500/50" : "bg-emerald-500/30"
                 )} />
               ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
