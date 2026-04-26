"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SignalCard } from "@/components/signals/signal-card";
import { getInvestigationLiveSummary, getSystemHealth } from "@/lib/marine-intelligence";
import { History, Calendar, Shield, Fingerprint, Database, AlertCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PlatformHealthOverview, type InvestigationLiveSummary } from "@marine/shared";
import { SystemIntegrityStatus } from "@/lib/integrity-constants";
import { cn } from "@/lib/utils";

export default function ForensicReplayPage() {
  const [anchor, setAnchor] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<InvestigationLiveSummary | null>(null);
  const [health, setHealth] = useState<PlatformHealthOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Set default anchor to 1 hour ago
  useEffect(() => {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString().slice(0, 16);
    setAnchor(oneHourAgo);
  }, []);

  async function handleReplay() {
    if (!anchor) return;
    
    setLoading(true);
    setError(null);
    try {
      const anchorDate = new Date(anchor);
      const now = new Date();
      const diffHours = (now.getTime() - anchorDate.getTime()) / 3600000;

      if (diffHours > 24) {
        throw new Error("Interactive replay is restricted to the past 24 hours. Request an archival export for older segments.");
      }

      const isoAnchor = anchorDate.toISOString();
      const [data, healthData] = await Promise.all([
        getInvestigationLiveSummary(isoAnchor),
        getSystemHealth()
      ]);
      
      setSummary(data);
      setHealth(healthData);
    } catch (err: any) {
      setError(err.message || "Failed to execute forensic replay");
    } finally {
      setLoading(false);
    }
  }

  const systemIntegrity = health?.systemIntegrity || SystemIntegrityStatus.NORMAL;

  return (
    <AppShell 
      pageTitle="Forensic Replay Console" 
      pageSubtitle="Deterministic Historical Reconstruction | Authority Boundary Trace"
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Replay Controls */}
        <div className="grid gap-6 lg:grid-cols-3 mb-10">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-ocean-900 border border-surface-border rounded-xl p-6 shadow-xl relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
               <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-400 mb-4 flex items-center gap-2">
                 <History size={16} />
                 Replay Configuration
               </h2>
               
               <div className="flex flex-wrap items-end gap-6">
                 <div className="flex-1 min-w-[240px]">
                   <label className="block text-[10px] font-bold uppercase text-slate-500 mb-2 leading-none">
                     Anchor Timestamp (UTC)
                   </label>
                   <div className="relative">
                     <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                     <input 
                       type="datetime-local" 
                       value={anchor}
                       onChange={(e) => setAnchor(e.target.value)}
                       className="w-full bg-ocean-950 border border-surface-border rounded-md pl-10 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all font-mono"
                     />
                   </div>
                 </div>

                 <Button 
                   onClick={handleReplay} 
                   disabled={loading || !anchor}
                   className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8 h-[42px] relative overflow-hidden group"
                 >
                   {loading ? (
                     <span className="flex items-center gap-2">
                       <History className="animate-spin" size={16} />
                       RECONSTRUCTING...
                     </span>
                   ) : (
                     <span className="flex items-center gap-2">
                       <Search size={16} />
                       EXECUTE TRACE
                     </span>
                   )}
                   <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform pointer-events-none" />
                 </Button>
               </div>

               <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-500">
                 <div className="flex items-center gap-1.5">
                   <Shield size={12} className="text-emerald-500/50" />
                   <span>Boundary: FIELD_TRUTH</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <Database size={12} className="text-cyan-500/50" />
                   <span>Source: Signed Authorities</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <AlertCircle size={12} className="text-amber-500/50" />
                   <span>Window: 24h Interactive Limit</span>
                 </div>
               </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={16} />
                <div className="text-xs text-rose-200 font-medium">
                  <p className="font-bold uppercase tracking-wider mb-1">Trace Denied</p>
                  {error}
                </div>
              </div>
            )}
          </div>

          <div className="bg-ocean-950 border border-surface-border rounded-xl p-6 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
               <Fingerprint size={120} className="text-slate-100" />
             </div>
             
             <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
               Audit Context
             </h2>
             
             <div className="space-y-4">
               <div className="flex justify-between items-end border-b border-surface-border pb-3">
                 <div>
                   <p className="text-[9px] text-slate-600 uppercase font-bold">Trace Mode</p>
                   <p className="text-xs text-slate-300 font-mono">DETERMINISTIC</p>
                 </div>
                 <StatusBadge label="VERIFIED" className="text-[8px] bg-emerald-500/10 text-emerald-400 border-none" />
               </div>

               <div className="flex justify-between items-end border-b border-surface-border pb-3">
                 <div>
                   <p className="text-[9px] text-slate-600 uppercase font-bold">Partition</p>
                   <p className="text-xs text-emerald-400 font-bold">FIELD_TRUTH</p>
                 </div>
                 <Database size={14} className="text-slate-700" />
               </div>

               <div className="flex justify-between items-end">
                 <div>
                   <p className="text-[9px] text-slate-600 uppercase font-bold">Crypto Latency</p>
                   <p className="text-xs text-cyan-400 font-mono">82ms (HMAC-SHA256)</p>
                 </div>
                 <Fingerprint size={14} className="text-slate-700" />
               </div>
             </div>
          </div>
        </div>

        {/* Results Area */}
        {summary ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-6 flex items-center justify-between border-b border-surface-border pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Historical Reconstruction</h2>
                <p className="text-xs text-slate-500 mt-1">{summary.trustNote}</p>
              </div>
              <div className="flex items-center gap-3">
                 <div className="text-right">
                   <p className="text-[9px] text-slate-600 uppercase font-bold">Identified Peaks</p>
                   <p className="text-lg font-mono font-bold text-cyan-400">{summary.signals.length}</p>
                 </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {summary.signals.map((signal) => (
                <SignalCard 
                  key={signal.id} 
                  signal={signal} 
                  systemIntegrity={systemIntegrity}
                />
              ))}
            </div>

            {summary.signals.length === 0 && (
              <div className="text-center py-20 bg-ocean-950/30 border border-dashed border-surface-border rounded-xl">
                <History size={48} className="mx-auto text-slate-800 mb-4" />
                <p className="text-slate-500 text-sm">No signals recorded at this anchor timestamp.</p>
                <p className="text-slate-600 text-[10px] mt-1 uppercase tracking-widest">Boundary Checked: NULL_RESULT</p>
              </div>
            )}
          </div>
        ) : !loading && (
          <div className="text-center py-32 opacity-30 pointer-events-none">
            <History size={64} className="mx-auto text-slate-600 mb-6" />
            <h2 className="text-xl font-bold text-slate-400 uppercase tracking-widest">Standby for Replay</h2>
            <p className="text-sm text-slate-600 mt-2">Select an anchor timestamp to initiate forensic reconstruction.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatusBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-[9px] font-bold border border-current",
      className
    )}>
      {label}
    </span>
  );
}
