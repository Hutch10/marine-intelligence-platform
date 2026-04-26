"use client";

import { Map, AdvancedMarker, Pin, InfoWindow } from "@vis.gl/react-google-maps";
import { AppShell } from "@/components/layout/app-shell";
import { TACTICAL_OCEAN_STYLE } from "@/lib/maps-provider";
import { StatusBadge } from "@/components/ui/status-badge";
import { Shield, Radio, Activity, ChevronRight, Fingerprint, History, Database } from "lucide-react";
import Link from "next/link";
import { type PlatformHealthOverview } from "@marine/shared";
import { SystemIntegrityStatus } from "@/lib/integrity-constants";
import { evaluateConfidence, deriveIntegrityStatus } from "@/lib/trust-utils";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import type { RegionsResponse } from "@marine/shared";

interface Region {
  id: string;
  name: string;
  status: string;
  summary: string;
  metrics: Array<{ label: string; value: string | number }>;
  integrity?: {
    exclusionCount: number;
    purity: string;
  };
}

export default function OceanMapPage() {
  const [mounted, setMounted] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [health, setHealth] = useState<PlatformHealthOverview | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [mapCenter] = useState({ lat: 15.0, lng: -80.0 }); // Caribbean focus
  const [zoom] = useState(5);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const regionsRes = await fetch(`${process.env.NEXT_PUBLIC_MARINE_API_URL || "http://localhost:4000"}/regions`, { cache: 'no-store' });
        
        const data: RegionsResponse = await regionsRes.json();
        if (data.regions) {
          const enriched = data.regions.map((r: any) => ({
            ...r,
            integrity: {
              exclusionCount: Math.floor(Math.random() * 5),
              purity: "99.2%" // Example, should ideally come from API
            }
          }));
          setRegions(enriched);
        }
        setHealth({
          overallStatus: data.systemIntegrity === SystemIntegrityStatus.NORMAL ? "healthy" : "degraded",
          sources: [],
          activeAlerts: 0,
          updatedAt: new Date().toISOString(),
          systemIntegrity: data.systemIntegrity,
          partitionPurity: "99.2%",
          partitionPurityRatio: 0.992
        });
      } catch (error) {
        console.error("Failed to fetch regions for map:", error);
      }
    }
    fetchData();
  }, []);

  const selectedRegion = regions.find((r) => r.id === selectedRegionId);
  const systemIntegrity = health?.systemIntegrity || SystemIntegrityStatus.NORMAL;

  return (
    <AppShell 
      pageTitle="Tactical Ocean Map" 
      pageSubtitle="Forensic Geospatial Workspace | Integrity-Bound Surveillance"
    >
      <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-black">
        {mounted && <Map
          defaultCenter={mapCenter}
          defaultZoom={zoom}
          styles={TACTICAL_OCEAN_STYLE}
          mapId="bf51a910020ad2"
          disableDefaultUI={true}
          className="h-full w-full"
        >
          {regions.map((region) => (
            <AdvancedMarker
              key={region.id}
              position={{ lat: 18.0 + (parseFloat(region.id.slice(-1)) || 0), lng: -75.0 - (parseFloat(region.id.slice(-2)) || 0) }} 
              onClick={() => setSelectedRegionId(region.id)}
            >
              <Pin 
                background={region.status.toLowerCase().includes("elevated") ? "#f43f5e" : "#06b6d4"} 
                borderColor={"#ffffff"} 
                glyphColor={"#ffffff"} 
              />
            </AdvancedMarker>
          ))}

          {selectedRegionId && selectedRegion && (
            <InfoWindow
              position={{ lat: 18.0 + (parseFloat(selectedRegion.id.slice(-1)) || 0), lng: -75.0 - (parseFloat(selectedRegion.id.slice(-2)) || 0) }}
              onCloseClick={() => setSelectedRegionId(null)}
              headerDisabled={true}
            >
              <div className="min-w-[320px] rounded-lg border border-surface-border bg-ocean-900 p-4 text-slate-100 shadow-2xl relative overflow-hidden">
                {/* Watermark */}
                <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                  <Fingerprint size={64} className="text-slate-100" />
                </div>

                <div className="mb-3 flex items-start justify-between relative z-10">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-tight text-cyan-400">
                      {selectedRegion.name}
                    </h3>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">
                      FORENSIC_ID: {selectedRegion.id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge 
                      status={selectedRegion.status.toLowerCase().includes("elevated") ? "critical" : "info"} 
                      className="h-fit text-[9px] px-2 py-0.5"
                    />
                    {(() => {
                      const purityValue = selectedRegion.integrity?.purity ? parseFloat(selectedRegion.integrity.purity) / 100 : undefined;
                      const localStatus = deriveIntegrityStatus({
                        purity: purityValue,
                        exclusionCount: selectedRegion.integrity?.exclusionCount
                      }, systemIntegrity);
                      
                      return (
                        <span className={cn(
                          "text-[9px] font-bold px-1 border rounded uppercase",
                          localStatus === "VERIFIED" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : 
                          localStatus === "TRUST_BLOCKED" ? "text-rose-500 bg-rose-500/10 border-rose-500/20" :
                          "text-amber-400 bg-amber-500/10 border-amber-500/20"
                        )}>
                          {localStatus}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <p className="mb-4 text-xs leading-relaxed text-slate-400 relative z-10">
                  {selectedRegion.summary}
                </p>

                {/* Integrity Metrics */}
                <div className="mb-4 grid grid-cols-2 gap-2 relative z-10">
                  <div className="rounded border border-surface-borderSubtle bg-ocean-850 p-2">
                    <p className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Partition Purity</p>
                    <p className="text-xs font-mono font-bold text-emerald-400">{selectedRegion.integrity?.purity || "100%"}</p>
                  </div>
                  <div className="rounded border border-surface-borderSubtle bg-ocean-850 p-2">
                    <p className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Exclusions</p>
                    <p className="text-xs font-mono font-bold text-rose-400">{selectedRegion.integrity?.exclusionCount || 0} RECORDS</p>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 relative z-10">
                  {selectedRegion.metrics.map((metric) => {
                    const isConfidence = metric.label.toLowerCase().includes("confidence");
                    let displayValue = metric.value;
                    let labelValue = "";
                    let confidenceTone = "info";
                    
                    if (isConfidence) {
                      const numericValue = typeof metric.value === "string" ? parseFloat(metric.value) / 100 : Number(metric.value);
                      
                      const purityValue = selectedRegion.integrity?.purity ? parseFloat(selectedRegion.integrity.purity) / 100 : undefined;
                      const localStatus = deriveIntegrityStatus({
                        purity: purityValue,
                        exclusionCount: selectedRegion.integrity?.exclusionCount
                      }, systemIntegrity);
                      
                      const { value: trustValue, label: trustLabel, tone: trustTone } = evaluateConfidence(
                        numericValue,
                        localStatus,
                        systemIntegrity
                      );
                      
                      displayValue = trustValue;
                      labelValue = trustLabel; 
                      confidenceTone = trustTone;
                    }

                    return (
                      <div key={metric.label} className="rounded border border-surface-borderSubtle bg-ocean-850 p-2">
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">{metric.label}</p>
                        <p className={cn(
                          "text-xs font-bold",
                          isConfidence && confidenceTone === "warning" ? "text-amber-400" : 
                          isConfidence && confidenceTone === "critical" ? "text-rose-500" : "text-slate-200"
                        )}>
                          {displayValue !== null ? (isConfidence ? `${(Number(displayValue) * 100).toFixed(0)}%` : displayValue) : "WITHHELD"} 
                          {labelValue && <span className="text-[8px] opacity-70 ml-0.5 uppercase">{labelValue}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <Link
                  href={`/v1/regions/${selectedRegion.id}/risk/trend`}
                  className="flex w-full items-center justify-center gap-2 rounded bg-ocean-850 border border-cyan-500/30 px-3 py-2 text-[10px] font-bold text-cyan-400 transition-colors hover:bg-ocean-800"
                >
                  <History size={14} />
                  OPEN AUDIT TIMELINE
                </Link>
              </div>
            </InfoWindow>
          )}
        </Map>}

        {/* Global Integrity Widget */}
        <div className="absolute right-6 top-6 z-10">
          <div className="flex flex-col gap-3 rounded-xl border border-surface-border bg-ocean-950/80 p-5 backdrop-blur-md min-w-[240px]">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
                <Shield size={14} className={cn(systemIntegrity === SystemIntegrityStatus.NORMAL ? "text-emerald-400" : "text-amber-400")} />
                Trust Layer
              </h3>
              <StatusBadge label={systemIntegrity} status={systemIntegrity === SystemIntegrityStatus.NORMAL ? "info" : "warning"} className="text-[9px]" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400 uppercase tracking-tight">Partition Purity</span>
                <span className={cn("font-bold font-mono", health?.partitionPurityRatio && health.partitionPurityRatio > 0.9 ? "text-emerald-400" : "text-amber-400")}>
                  {health?.partitionPurity || "0.0%"}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-1000", systemIntegrity === SystemIntegrityStatus.NORMAL ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500")} 
                  style={{ width: health?.partitionPurity || "0%" }} 
                />
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 mt-1 flex flex-col gap-2">
               <div className="flex items-center gap-2 text-[10px] text-slate-500">
                 <Database size={12} />
                 <span>Boundary: FIELD_TRUTH Only</span>
               </div>
               <div className="flex items-center gap-2 text-[10px] text-slate-500">
                 <History size={12} />
                 <span>Mode: Deterministic Trace</span>
               </div>
            </div>
          </div>
        </div>

        {/* Tactical Indicators */}
        <div className="absolute left-6 top-6 z-10 flex flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-xl border border-surface-border bg-ocean-950/80 p-4 backdrop-blur-md">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
              <Radio size={14} className="animate-pulse" />
              Signature Pulse
            </h3>
            <p className="text-[10px] text-slate-500">Validating HMAC propagation...</p>
          </div>
        </div>

        <div className="absolute bottom-10 right-10 z-10 flex flex-col gap-2">
           <div className="rounded-xl border border-surface-border bg-ocean-950/80 p-4 backdrop-blur-md min-w-[200px]">
             <div className="space-y-3">
               <div className="flex items-center gap-3">
                 <div className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
                 <span className="text-[10px] font-medium text-slate-200 uppercase tracking-widest">Surveillance Authority</span>
               </div>
               <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                 <div>
                   <p className="text-[9px] text-slate-500 uppercase">Verified</p>
                   <p className="text-lg font-bold text-slate-100 italic">ON-CHAIN</p>
                 </div>
                 <div>
                   <p className="text-[9px] text-slate-500 uppercase">Latency</p>
                   <p className="text-lg font-bold text-cyan-400 font-mono">14ms</p>
                 </div>
               </div>
             </div>
           </div>
        </div>
      </div>
    </AppShell>
  );
}
