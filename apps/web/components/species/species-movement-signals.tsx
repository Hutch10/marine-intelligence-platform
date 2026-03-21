import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SpeciesMovementSignal } from "@/lib/api/types";

interface SpeciesMovementSignalsProps {
  movementSignals: SpeciesMovementSignal[];
  loading?: boolean;
}

const MOVEMENT_STYLES = {
  route_deviation: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  aggregation_shift: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  habitat_exit: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  unusual_presence: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  seasonal_mismatch: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
} as const;

function formatMovementType(value: SpeciesMovementSignal["movementType"]): string {
  return value.replace(/_/g, " ");
}

export function SpeciesMovementSignals({ movementSignals, loading = false }: SpeciesMovementSignalsProps) {
  return (
    <Panel title="Movement Intelligence" subtitle="Signals linking species movement patterns to active ocean intelligence tracks.">
      {loading ? (
        <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
          Loading movement signals...
        </div>
      ) : movementSignals.length > 0 ? (
        <div className="space-y-2">
          {movementSignals.map((signal) => (
            <article key={signal.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <StatusBadge label={formatMovementType(signal.movementType)} className={MOVEMENT_STYLES[signal.movementType]} />
                <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                  confidence {signal.confidence}%
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-300">{signal.summary}</p>
              <div className="mt-2 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
                <span>Signal: {signal.signalId ?? "None"}</span>
                <span>Investigation: {signal.investigationId ?? "Unlinked"}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
          No movement-linked signals available for this species.
        </div>
      )}
    </Panel>
  );
}
