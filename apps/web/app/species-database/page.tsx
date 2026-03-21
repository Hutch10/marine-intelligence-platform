import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SpeciesList } from "@/components/species/species-list";
import { apiClient } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "Species Database",
};

export default async function SpeciesDatabasePage() {
  const fetchedSpecies = await apiClient.species.list({ limit: 100 });
  const species = fetchedSpecies.length > 0 ? fetchedSpecies : apiClient.species.getFallbackSpecies();
  const selectedSpeciesId = species[0]?.id;

  const [initialSightings, initialMovementSignals] = selectedSpeciesId
    ? await Promise.all([
      apiClient.species.getSightingsBySpecies(selectedSpeciesId, { limit: 8 }),
      apiClient.species.listMovementSignals(selectedSpeciesId),
    ])
    : [[], []];

  return (
    <AppShell
      pageTitle="Species Database"
      pageSubtitle="Ocean Intelligence Platform - ecology entities, sightings, and movement-linked intelligence"
    >
      <SpeciesList
        species={species}
        initialSightings={initialSightings ?? []}
        initialMovementSignals={initialMovementSignals ?? []}
      />
    </AppShell>
  );
}
