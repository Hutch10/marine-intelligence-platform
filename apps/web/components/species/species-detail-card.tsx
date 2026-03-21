import { StatusBadge } from "@/components/ui/status-badge";
import { Panel } from "@/components/ui/panel";
import type { SpeciesProfile } from "@/lib/api/types";

interface SpeciesDetailCardProps {
  species: SpeciesProfile | null;
}

const STATUS_STYLES = {
  least_concern: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  near_threatened: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  vulnerable: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  endangered: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  critically_endangered: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  data_deficient: "border-slate-500/25 bg-slate-500/10 text-slate-300",
} as const;

function formatConservationStatus(value: SpeciesProfile["conservationStatus"]): string {
  return value.replace(/_/g, " ");
}

function formatTimestamp(value: string): string {
  const ts = Date.parse(value);

  if (!Number.isFinite(ts)) {
    return "Unknown";
  }

  return `${new Date(ts).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function SpeciesDetailCard({ species }: SpeciesDetailCardProps) {
  return (
    <Panel title="Species Profile" subtitle="Selected ecology entity and baseline conservation context.">
      {species ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-100">{species.commonName}</p>
              <p className="mt-1 text-sm italic text-slate-400">{species.scientificName}</p>
            </div>
            <StatusBadge
              label={formatConservationStatus(species.conservationStatus)}
              className={STATUS_STYLES[species.conservationStatus]}
            />
          </div>

          <p className="text-sm leading-relaxed text-slate-300">{species.summary}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Species ID</p>
              <p className="mt-1 font-mono text-xs text-slate-300">{species.id}</p>
            </div>
            <div className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Habitat Region</p>
              <p className="mt-1 text-xs text-slate-300">{species.habitatRegion}</p>
            </div>
            <div className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Updated</p>
              <p className="mt-1 font-mono text-xs text-slate-300">{formatTimestamp(species.updatedAt)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
          Select a species to inspect profile details.
        </div>
      )}
    </Panel>
  );
}
