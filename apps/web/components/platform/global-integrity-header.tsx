"use client";

import React, { useEffect, useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { SystemIntegrityStatus, type PlatformHealthOverview } from "@marine/shared";
import { getSystemHealth } from "@/lib/marine-intelligence";

export function GlobalIntegrityHeader() {
  const [health, setHealth] = useState<PlatformHealthOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const data = await getSystemHealth();
        setHealth(data);
      } catch (err) {
        console.error("Failed to fetch system health", err);
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading || !health) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-ocean-800/50 border border-surface-border rounded animate-pulse">
        <div className="w-4 h-4 rounded-full bg-slate-700" />
        <div className="w-20 h-3 rounded bg-slate-700" />
      </div>
    );
  }

  const status = health.systemIntegrity;
  const purity = health.partitionPurity;
  const purityRatio = health.partitionPurityRatio;

  const config = {
    [SystemIntegrityStatus.NORMAL]: {
      icon: ShieldCheck,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      label: "INTEGRITY: NORMAL",
    },
    [SystemIntegrityStatus.DEGRADED]: {
      icon: ShieldAlert,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      label: "INTEGRITY: DEGRADED",
    },
    [SystemIntegrityStatus.TRUST_BLOCKED]: {
      icon: Shield,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
      label: "TRUST_BLOCKED",
    },
  }[status] || {
    icon: Shield,
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
    label: "INTEGRITY: UNKNOWN",
  };

  const Icon = config.icon;

  return (
    <div className={cn(
      "flex items-center divide-x divide-surface-border overflow-hidden rounded border text-[10px] font-medium leading-none",
      config.bg,
      config.border
    )}>
      {/* Status Badge */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 shrink-0">
        <Icon className={cn("w-3.5 h-3.5", config.color)} />
        <span className={cn("tracking-tight uppercase", config.color)}>
          {config.label}
        </span>
      </div>

      {/* Purity Metric */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20">
        <Activity className="w-3.5 h-3.5 text-slate-400" />
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 uppercase">Purity:</span>
          <span className={cn(
            purityRatio >= 0.9 ? "text-emerald-400" :
            purityRatio >= 0.7 ? "text-amber-400" : "text-rose-400"
          )}>
            {purity}
          </span>
        </div>
      </div>

      {/* Partition Context */}
      <div className="hidden sm:flex items-center px-3 py-1.5 text-slate-500 italic">
        <span>FIELD_TRUTH Only</span>
      </div>
    </div>
  );
}
