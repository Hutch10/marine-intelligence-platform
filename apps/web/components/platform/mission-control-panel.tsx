"use client";

import React, { useState } from "react";
import { 
  Rocket, 
  Target, 
  Timer, 
  MapPin, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  Link as LinkIcon,
  ChevronRight,
  Activity
} from "lucide-react";
import { Mission } from "@marine/shared";
import { updateMissionStatus, linkSignalToMission } from "@/lib/marine-intelligence";
import { PanelHeader } from "./panel-header";
import { StatusChip } from "./status-chip";
import { TelemetryChip } from "./telemetry-chip";

interface MissionControlPanelProps {
  initialMissions: Mission[];
}

export function MissionControlPanel({ initialMissions }: MissionControlPanelProps) {
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleActivate = async (id: string) => {
    setIsUpdating(id);
    try {
      const result = await updateMissionStatus(id, "In Progress");
      if (result.ok) {
        setMissions(prev => prev.map(m => m.id === id ? result.data.mission : m));
      }
    } finally {
      setIsUpdating(null);
    }
  };

  const handleLinkSignal = async (missionId: string, signalId: string) => {
    const result = await linkSignalToMission(missionId, signalId);
    if (result.ok) {
      setMissions(prev => prev.map(m => {
        if (m.id === missionId) {
          const linkedSignalIds = m.linkedSignalIds || [];
          if (!linkedSignalIds.includes(signalId)) {
            return { ...m, linkedSignalIds: [...linkedSignalIds, signalId] };
          }
        }
        return m;
      }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelHeader 
        title="Mission Control" 
        icon={<Rocket className="w-4 h-4 text-violet-400" />}
        action={<TelemetryChip source="live" detail="Sovereign Mission Authority" />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {missions.map((mission) => (
          <div 
            key={mission.id}
            className="group relative bg-[#0a0a0b]/80 border border-white/5 rounded-xl p-5 hover:border-violet-500/30 transition-all duration-300"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{mission.id}</span>
                  <StatusChip status={mission.status} />
                </div>
                <h3 className="text-lg font-medium text-white/90 group-hover:text-violet-300 transition-colors uppercase tracking-tight">
                  {mission.name}
                </h3>
              </div>
              <div className="bg-violet-500/10 p-2 rounded-lg border border-violet-500/20">
                <Target className="w-5 h-5 text-violet-400" />
              </div>
            </div>

            <p className="text-sm text-white/50 mb-6 line-clamp-2 min-h-[40px]">
              {mission.description || "Active tracking mission for high-priority marine signals and environmental patterns."}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs text-white/60 truncate">{mission.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Timer className="w-3.5 h-3.5 text-white/30" />
                <span className="text-xs text-white/60">{mission.eta}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Deployment Progress</span>
                <span className="text-xs font-mono text-violet-400">{mission.progress}%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-1000"
                  style={{ width: `${mission.progress}%` }}
                />
              </div>
            </div>

            {/* Linked Signals */}
            {(mission.linkedSignalIds?.length || 0) > 0 && (
              <div className="mb-6 pt-4 border-t border-white/5">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-3 block">Wrapped Signals</span>
                <div className="flex flex-wrap gap-2">
                  {mission.linkedSignalIds?.map(sid => (
                    <div key={sid} className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded text-[10px] text-cyan-400 font-mono">
                      <Activity className="w-3 h-3" />
                      {sid}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              {mission.status === "Pending" ? (
                <button
                  onClick={() => handleActivate(mission.id)}
                  disabled={isUpdating === mission.id}
                  className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg transition-all active:scale-95 shadow-lg shadow-violet-900/20"
                >
                  {isUpdating === mission.id ? (
                    <Zap className="w-3.5 h-3.5 animate-pulse" />
                  ) : (
                    <Rocket className="w-3.5 h-3.5" />
                  )}
                  MANUAL OVERRIDE: ACTIVATE
                </button>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-white/5 text-white/40 text-[10px] font-mono py-2.5 rounded-lg border border-white/5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  TACTICAL TRACKING ACTIVE
                </div>
              )}
              
              <button 
                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 text-white/60 hover:text-white transition-all"
                title="Mission Details"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Specific linkage for MSN-044 / BW-0042 demo */}
            {mission.id === "MSN-044" && mission.status === "In Progress" && !(mission.linkedSignalIds?.includes("BW-0042")) && (
              <div className="mt-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between gap-3 bg-amber-500/5 border border-amber-500/20 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-500/80">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-[10px] font-medium leading-tight">ORPHAN SIGNAL DETECTED: BW-0042</span>
                  </div>
                  <button 
                    onClick={() => handleLinkSignal(mission.id, "BW-0042")}
                    className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-[10px] font-bold px-2 py-1 rounded transition-all"
                  >
                    <LinkIcon className="w-3 h-3" />
                    LINK
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
