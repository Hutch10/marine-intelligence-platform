import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InvestigationSpeciesSummary } from "@/lib/api/types";

interface InvestigationSpeciesSummaryProps {
  summary: InvestigationSpeciesSummary | null;
}

const TIER_STYLES = {
  watch: "border-slate-500/25 bg-slate-500/10 text-slate-300",
  elevated: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  priority: "border-rose-500/25 bg-rose-500/10 text-rose-300",
} as const;

const TIER_LABELS = {
  watch: "Low",
  elevated: "Medium",
  priority: "High",
} as const;

const REASON_STYLES = {
  linked_movement_signal: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  verified_sighting: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  pending_verification: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  station_overlap: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  recent_observation: "border-slate-500/25 bg-slate-500/10 text-slate-300",
} as const;

function formatGeneratedAt(value: string): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return "Unknown";
  }

  return `${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function InvestigationSpeciesSummaryCard({ summary }: InvestigationSpeciesSummaryProps) {
  return (
    <Panel
      title="Investigation Species Summary"
      subtitle="Deterministic ecological correlation using linked movement signals, verification-aware sightings, and station overlap."
      action={
        <Link
          href="/species-database"
          className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
        >
          Open species database
        </Link>
      }
    >
      {summary ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Tracked species</p>
              <p className="mt-2 text-xl font-semibold text-slate-100">{summary.speciesCount}</p>
            </div>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Linked signals</p>
              <p className="mt-2 text-xl font-semibold text-slate-100">{summary.linkedMovementSignalCount}</p>
            </div>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Verified sightings</p>
              <p className="mt-2 text-xl font-semibold text-slate-100">{summary.verifiedSightingCount}</p>
            </div>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Pending review</p>
              <p className="mt-2 text-xl font-semibold text-slate-100">{summary.pendingVerificationCount}</p>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">{summary.explainabilityNote}</p>

          <div className="space-y-3">
            {summary.entries.map((entry) => (
              <article
                key={entry.speciesId}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{entry.commonName}</p>
                      <StatusBadge label={TIER_LABELS[entry.responseTier]} className={TIER_STYLES[entry.responseTier]} />
                    </div>
                    <p className="mt-1 text-[11px] italic text-slate-500">{entry.scientificName}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:min-w-72">
                    <span>Score {entry.relevanceScore}</span>
                    <span>Max confidence {entry.maxMovementConfidence}%</span>
                    <span>Movement signals {entry.movementSignalCount}</span>
                    <span>Station overlap {entry.matchedStationCount}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.reasonTrail.map((reason) => (
                    <span
                      key={`${entry.speciesId}-${reason.kind}-${reason.label}`}
                      className={`rounded-full border px-2 py-1 text-[10px] font-medium ${REASON_STYLES[reason.kind]}`}
                    >
                      {reason.label}
                    </span>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 text-[11px] text-slate-400 lg:grid-cols-3">
                  <span>Verified sightings {entry.verifiedSightingCount}</span>
                  <span>Pending verification {entry.pendingVerificationCount}</span>
                  <span>Last observed {entry.lastObservedAt ? formatGeneratedAt(entry.lastObservedAt) : "Unknown"}</span>
                </div>
              </article>
            ))}
          </div>

          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Generated {formatGeneratedAt(summary.generatedAt)}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
          No explainable species correlation summary is available for the active investigation.
        </div>
      )}
    </Panel>
  );
}
