import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import SpeciesDatabasePage from "@/app/species-database/page";
import type { SpeciesMovementSignal, SpeciesProfile, SpeciesSighting } from "@/lib/api/types";

const SPECIES: SpeciesProfile[] = [
  {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    scientificName: "Balaenoptera musculus",
    conservationStatus: "endangered",
    habitatRegion: "North Pacific",
    summary: "Migratory baleen whale monitored for route shifts.",
    createdAt: "2026-03-11T08:00:00.000Z",
    updatedAt: "2026-03-13T11:20:00.000Z",
  },
];

const SIGHTINGS: SpeciesSighting[] = [
  {
    id: "SIGHT-001",
    speciesId: "SP-BLUE-WHALE",
    stationId: "STA-NPC-01",
    region: "North Pacific",
    observedAt: "2026-03-13T11:04:00.000Z",
    latitude: 34.712,
    longitude: -143.118,
    count: 2,
    source: "Acoustic buoy mesh",
    summary: "Two tagged whales observed near corridor edge.",
    verificationStatus: "verified",
    verifiedAt: "2026-03-13T11:07:00.000Z",
    verifiedBy: "ops.admin",
    createdAt: "2026-03-13T11:06:00.000Z",
  },
];

const MOVEMENT_SIGNALS: SpeciesMovementSignal[] = [
  {
    id: "MOV-001",
    speciesId: "SP-BLUE-WHALE",
    signalId: "SIG-THERMAL-001",
    investigationId: "TRK-201",
    movementType: "route_deviation",
    confidence: 84,
    summary: "Route deviation aligned with thermal anomaly corridor.",
    createdAt: "2026-03-13T11:10:00.000Z",
  },
];

const { mockApiClient, capturedProps } = vi.hoisted(() => ({
  mockApiClient: {
    species: {
      list: vi.fn(),
      getFallbackSpecies: vi.fn(),
      getSightingsBySpecies: vi.fn(),
      listMovementSignals: vi.fn(),
    },
  },
  capturedProps: {
    species: [] as SpeciesProfile[],
    initialSightings: [] as SpeciesSighting[],
    initialMovementSignals: [] as SpeciesMovementSignal[],
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/components/species/species-list", () => ({
  SpeciesList: (props: {
    species: SpeciesProfile[];
    initialSightings: SpeciesSighting[];
    initialMovementSignals: SpeciesMovementSignal[];
  }) => {
    capturedProps.species = props.species;
    capturedProps.initialSightings = props.initialSightings;
    capturedProps.initialMovementSignals = props.initialMovementSignals;
    return <div data-testid="species-list">{props.species[0]?.commonName ?? "none"}</div>;
  },
}));

beforeEach(() => {
  mockApiClient.species.list.mockReset();
  mockApiClient.species.getFallbackSpecies.mockReset();
  mockApiClient.species.getSightingsBySpecies.mockReset();
  mockApiClient.species.listMovementSignals.mockReset();

  capturedProps.species = [];
  capturedProps.initialSightings = [];
  capturedProps.initialMovementSignals = [];

  mockApiClient.species.list.mockResolvedValue(SPECIES);
  mockApiClient.species.getFallbackSpecies.mockReturnValue(SPECIES);
  mockApiClient.species.getSightingsBySpecies.mockResolvedValue(SIGHTINGS);
  mockApiClient.species.listMovementSignals.mockResolvedValue(MOVEMENT_SIGNALS);
});

test("species database page loads species list with initial context", async () => {
  const page = await SpeciesDatabasePage();
  render(page);

  expect(mockApiClient.species.list).toHaveBeenCalledWith({ limit: 100 });
  expect(mockApiClient.species.getSightingsBySpecies).toHaveBeenCalledWith("SP-BLUE-WHALE", { limit: 8 });
  expect(mockApiClient.species.listMovementSignals).toHaveBeenCalledWith("SP-BLUE-WHALE");
  expect(screen.getByTestId("species-list")).toHaveTextContent("Blue Whale");
  expect(capturedProps.initialSightings).toEqual(SIGHTINGS);
  expect(capturedProps.initialMovementSignals).toEqual(MOVEMENT_SIGNALS);
});

test("species database page uses fallback species when list is empty", async () => {
  mockApiClient.species.list.mockResolvedValueOnce([]);

  const page = await SpeciesDatabasePage();
  render(page);

  expect(mockApiClient.species.getFallbackSpecies).toHaveBeenCalled();
  expect(capturedProps.species).toEqual(SPECIES);
});
