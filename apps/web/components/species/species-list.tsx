"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { SpeciesDetailCard } from "@/components/species/species-detail-card";
import { SpeciesMovementSignals } from "@/components/species/species-movement-signals";
import { SpeciesSightingsPanel } from "@/components/species/species-sightings-panel";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { SpeciesMovementSignal, SpeciesMovementSignalFilters, SpeciesMovementType, SpeciesProfile, SpeciesSighting } from "@/lib/api/types";

const MOVEMENT_TYPE_OPTIONS: Array<{ label: string; value: SpeciesMovementType | "" }> = [
  { label: "All types", value: "" },
  { label: "Route deviation", value: "route_deviation" },
  { label: "Aggregation shift", value: "aggregation_shift" },
  { label: "Habitat exit", value: "habitat_exit" },
  { label: "Unusual presence", value: "unusual_presence" },
  { label: "Seasonal mismatch", value: "seasonal_mismatch" },
];

interface SpeciesListProps {
  species: SpeciesProfile[];
  initialSightings: SpeciesSighting[];
  initialMovementSignals: SpeciesMovementSignal[];
}

export function SpeciesList({ species, initialSightings, initialMovementSignals }: SpeciesListProps) {
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(species[0]?.id ?? null);
  const [sightings, setSightings] = useState<SpeciesSighting[]>(initialSightings);
  const [movementSignals, setMovementSignals] = useState<SpeciesMovementSignal[]>(initialMovementSignals);
  const [loadingSightings, setLoadingSightings] = useState(false);
  const [loadingMovementSignals, setLoadingMovementSignals] = useState(false);
  const [signalTypeFilter, setSignalTypeFilter] = useState<SpeciesMovementType | "">("");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("");

  const selectedSpecies = useMemo(
    () => species.find((item) => item.id === selectedSpeciesId) ?? null,
    [species, selectedSpeciesId],
  );

  useEffect(() => {
    if (!selectedSpeciesId) {
      setSightings([]);
      setMovementSignals([]);
      return;
    }

    let cancelled = false;

    const movementFilters: SpeciesMovementSignalFilters = {};
    if (signalTypeFilter) {
      movementFilters.movementType = signalTypeFilter;
    }
    const parsedConfidence = Number(confidenceFilter);
    if (confidenceFilter && Number.isFinite(parsedConfidence) && parsedConfidence > 0) {
      movementFilters.minConfidence = parsedConfidence;
    }

    const loadSpeciesContext = async () => {
      setLoadingSightings(true);
      setLoadingMovementSignals(true);

      try {
        const [nextSightings, nextMovementSignals] = await Promise.all([
          apiClient.species.getSightingsBySpecies(selectedSpeciesId, { limit: 8 }),
          apiClient.species.listMovementSignals(selectedSpeciesId, movementFilters),
        ]);

        if (cancelled) {
          return;
        }

        setSightings(nextSightings ?? []);
        setMovementSignals(nextMovementSignals ?? []);
      } finally {
        if (!cancelled) {
          setLoadingSightings(false);
          setLoadingMovementSignals(false);
        }
      }
    };

    loadSpeciesContext();

    return () => {
      cancelled = true;
    };
  }, [selectedSpeciesId, signalTypeFilter, confidenceFilter]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">Species Intelligence</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">Species Database</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Ecology-facing intelligence workspace for tracked species entities, sightings, and movement-linked signals.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Tracked Species" subtitle="Select an entity to inspect details, sightings, and movement context." className="h-fit">
          <div className="space-y-2">
            {species.length > 0 ? (
              species.map((entry) => {
                const active = entry.id === selectedSpeciesId;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-cyan-500/30 bg-cyan-500/12"
                        : "border-surface-borderSubtle bg-ocean-850/70 hover:border-cyan-500/25 hover:bg-ocean-850",
                    )}
                    onClick={() => setSelectedSpeciesId(entry.id)}
                  >
                    <p className="text-sm font-medium text-slate-100">{entry.commonName}</p>
                    <p className="mt-0.5 text-[11px] italic text-slate-400">{entry.scientificName}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{entry.habitatRegion}</p>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
                No species records available.
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <SpeciesDetailCard species={selectedSpecies} />

          <div className="grid gap-6 lg:grid-cols-2">
            <SpeciesSightingsPanel sightings={sightings} loading={loadingSightings} />
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  aria-label="Filter by signal type"
                  value={signalTypeFilter}
                  onChange={(e) => setSignalTypeFilter(e.target.value as SpeciesMovementType | "")}
                  className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                >
                  {MOVEMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="confidence-filter" className="text-[11px] text-slate-500">
                    Min confidence
                  </label>
                  <input
                    id="confidence-filter"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0–100"
                    value={confidenceFilter}
                    onChange={(e) => setConfidenceFilter(e.target.value)}
                    className="w-20 rounded-lg border border-surface-borderSubtle bg-ocean-850 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
              <SpeciesMovementSignals movementSignals={movementSignals} loading={loadingMovementSignals} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
