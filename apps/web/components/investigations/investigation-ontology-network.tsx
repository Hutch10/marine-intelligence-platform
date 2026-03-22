/**
 * InvestigationOntologyNetwork
 *
 * Displays the ontology-resolved related object network for the active
 * investigation: correlated species, linked monitoring stations, recent
 * observations, and linked alerts.
 *
 * All data is pre-resolved server-side via the ontology resolver layer
 * and passed as InvestigationOntologyNetworkContext.
 */

import { Activity, AlertTriangle, Fish, MapPin, Radio } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InvestigationOntologyNetworkContext } from "@/lib/api/types";

interface InvestigationOntologyNetworkProps {
  network: InvestigationOntologyNetworkContext;
}


function RidTag({ rid }: { rid: string }) {
  return (
    <span className="font-mono text-[9px] text-slate-600 truncate block">
      {rid}
    </span>
  );
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-slate-700/50 bg-ocean-900 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-500">
      {label}
    </span>
  );
}

function EmptySlot({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/40 px-3 py-4 text-center text-[11px] text-slate-600">
      {message}
    </div>
  );
}

export function InvestigationOntologyNetwork({
  network,
}: InvestigationOntologyNetworkProps) {
  const { investigation, species, stations, observations, alerts, resolvedAt } = network;

  const resolvedDate = new Date(resolvedAt);
  const resolvedLabel = resolvedDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <Panel
      title="Ontology Network"
      subtitle="Related objects resolved automatically for the active investigation."
      action={
        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
          Resolved {resolvedLabel}
        </span>
      }
    >
      <div className="space-y-4">

        {/* Active Investigation object */}
        {investigation && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <TypeBadge label="Investigation" />
                  <Radio size={12} className="text-cyan-400 shrink-0" />
                </div>
                <RidTag rid={investigation.__rid} />
                <p className="mt-1.5 text-sm font-medium text-slate-100 leading-snug">
                  {investigation.title}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400 line-clamp-2">
                  {investigation.summary}
                </p>
              </div>
              <div className="shrink-0 text-right space-y-1.5">
                <StatusBadge
                  label={investigation.state}
                  className={
                    investigation.state === "Escalated"
                      ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                      : investigation.state === "Correlated"
                        ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
                        : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                  }
                />
                <p className="text-[11px] text-slate-500">
                  {investigation.confidence}% confidence
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 3-column grid: Species | Stations | Observations */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Correlated Species */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <Fish size={11} className="text-emerald-400" />
              <span>Species ({species.length})</span>
            </div>
            {species.length === 0 ? (
              <EmptySlot message="No correlated species" />
            ) : (
              species.map((s) => (
                <div
                  key={s.__rid}
                  className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <TypeBadge label="Species" />
                  </div>
                  <RidTag rid={s.__rid} />
                  <p className="text-xs font-medium text-slate-100">{s.commonName}</p>
                  <p className="text-[11px] italic text-slate-500">{s.scientificName}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{s.summary}</p>
                </div>
              ))
            )}
          </div>

          {/* Monitoring Stations */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <MapPin size={11} className="text-cyan-400" />
              <span>Stations ({stations.length})</span>
            </div>
            {stations.length === 0 ? (
              <EmptySlot message="No linked stations" />
            ) : (
              stations.map((st) => (
                <div
                  key={st.__rid}
                  className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 space-y-1.5"
                >
                  <TypeBadge label="Station" />
                  <RidTag rid={st.__rid} />
                  <p className="text-xs font-medium text-slate-100">{st.name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{st.region}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-700" />
                    <span className="capitalize">{st.status}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">{st.summary}</p>
                </div>
              ))
            )}
          </div>

          {/* Observations */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <Activity size={11} className="text-violet-400" />
              <span>Observations ({observations.length})</span>
            </div>
            {observations.length === 0 ? (
              <EmptySlot message="No observations resolved" />
            ) : (
              observations.map((obs) => (
                <div
                  key={obs.__rid}
                  className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 space-y-1.5"
                >
                  <TypeBadge label="Observation" />
                  <RidTag rid={obs.__rid} />
                  <p className="text-[11px] text-slate-400">
                    Station{" "}
                    <span className="font-mono text-slate-300">{obs.stationId}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">{obs.timestamp}</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                    {obs.sstC !== null && (
                      <span className="text-slate-400">
                        SST <span className="text-slate-200">{obs.sstC}°C</span>
                      </span>
                    )}
                    {obs.waveHeightM !== null && (
                      <span className="text-slate-400">
                        Wave <span className="text-slate-200">{obs.waveHeightM}m</span>
                      </span>
                    )}
                    {obs.windSpeedMps !== null && (
                      <span className="text-slate-400">
                        Wind <span className="text-slate-200">{obs.windSpeedMps}m/s</span>
                      </span>
                    )}
                    {obs.pressureHpa !== null && (
                      <span className="text-slate-400">
                        P <span className="text-slate-200">{obs.pressureHpa}hPa</span>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alerts row */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500">
            <AlertTriangle size={11} className="text-amber-400" />
            <span>Linked Alerts ({alerts.length})</span>
          </div>
          {alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/40 px-4 py-3 text-[11px] text-slate-600">
              No alerts are currently linked to this investigation by{" "}
              <span className="font-mono text-slate-500">linkedInvestigationId</span>. Alerts
              will appear here automatically when promoted signals reference this case.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {alerts.map((alert) => (
                <div
                  key={alert.__rid}
                  className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <TypeBadge label="MarineAlert" />
                    <StatusBadge
                      label={alert.severity}
                      className={
                        alert.severity === "critical" || alert.severity === "high"
                          ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                          : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                      }
                    />
                  </div>
                  <RidTag rid={alert.__rid} />
                  <p className="text-xs font-medium text-slate-100">{alert.title}</p>
                  {alert.detail && (
                    <p className="text-[11px] text-slate-400 leading-relaxed">{alert.detail}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resolver attribution */}
        <div className="rounded-xl border border-surface-borderSubtle bg-ocean-900/60 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-600 mb-2">
            Resolver chain
          </p>
          <div className="space-y-1 font-mono text-[10px] text-slate-600">
            <p>
              <span className="text-slate-500">resolveInvestigationSpecies</span>
              {"  "}→{"  "}
              {species.length} object(s) via correlated species IDs
            </p>
            <p>
              <span className="text-slate-500">resolveInvestigationStations</span>
              {"  "}→{"  "}
              {stations.length} object(s) via active monitoring station IDs
            </p>
            <p>
              <span className="text-slate-500">resolveSpeciesObservations</span>
              {"  "}→{"  "}
              {observations.length} object(s) via sighting station IDs
            </p>
            <p>
              <span className="text-slate-500">resolveInvestigationAlerts</span>
              {"  "}→{"  "}
              {alerts.length} object(s) via linkedInvestigationId
            </p>
          </div>
        </div>

      </div>
    </Panel>
  );
}
