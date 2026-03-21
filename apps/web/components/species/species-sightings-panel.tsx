import { Panel } from "@/components/ui/panel";
import type { SpeciesSighting } from "@/lib/api/types";

const VERIFICATION_STYLES = {
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  verified: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  rejected: "border-rose-500/25 bg-rose-500/10 text-rose-300",
} as const;

interface SpeciesSightingsPanelProps {
  sightings: SpeciesSighting[];
  loading?: boolean;
}

function formatObservedAt(value: string): string {
  const ts = Date.parse(value);

  if (!Number.isFinite(ts)) {
    return "Unknown";
  }

  return `${new Date(ts).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function SpeciesSightingsPanel({ sightings, loading = false }: SpeciesSightingsPanelProps) {
  return (
    <Panel title="Recent Sightings" subtitle="Newest observations ordered by observation timestamp.">
      {loading ? (
        <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
          Loading sightings...
        </div>
      ) : sightings.length > 0 ? (
        <div className="space-y-2">
          {sightings.map((sighting) => (
            <article key={sighting.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-200">{sighting.summary}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{sighting.source}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                    count {sighting.count}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${VERIFICATION_STYLES[sighting.verificationStatus]}`}
                  >
                    {sighting.verificationStatus}
                  </span>
                </div>
              </div>
              <div className="mt-2 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3">
                <span>Region: {sighting.region}</span>
                <span>Station: {sighting.stationId ?? "Unassigned"}</span>
                <span className="font-mono">{formatObservedAt(sighting.observedAt)}</span>
              </div>
              {sighting.verificationStatus === "verified" && sighting.verifiedAt ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Verified by {sighting.verifiedBy ?? "reviewer"} at {formatObservedAt(sighting.verifiedAt)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
          No sightings available for this species.
        </div>
      )}
    </Panel>
  );
}
