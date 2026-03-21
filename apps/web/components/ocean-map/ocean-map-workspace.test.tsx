import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OceanMapWorkspace } from "@/components/ocean-map/ocean-map-workspace";
import type { OceanMapWorkspaceData } from "@/lib/api/types";

const BASE_DATA: OceanMapWorkspaceData = {
  layers: [
    {
      label: "Species Sightings",
      description: "Recent confirmed and pending observation markers",
      active: true,
      accent: "cyan",
      overlayCategory: "sightings",
    },
    {
      label: "Movement Signals",
      description: "Species-linked movement detections at station anchors",
      active: true,
      accent: "amber",
      overlayCategory: "movement_signals",
    },
    {
      label: "Ecological Hotspots",
      description: "Grouped recent species activity zones and hotspot summaries",
      active: true,
      accent: "emerald",
      overlayCategory: "hotspots",
    },
    {
      label: "Corridor Foundations",
      description: "Region groupings prepared for future corridor geometry",
      active: false,
      accent: "cyan",
      overlayCategory: "corridors_foundation",
    },
  ],
  mapStats: [
    { label: "Tracked buoys", value: "32", icon: "satellite" },
    { label: "Active fronts", value: "5", icon: "radar" },
    { label: "Drift routes", value: "11", icon: "route" },
  ],
  regionMetrics: [
    { label: "Region", value: "North Pacific / Sector 14-C" },
    { label: "Thermal anomaly", value: "+2.4 °C above seasonal mean" },
  ],
  overlayEntities: [],
  spatialOverlays: {
    categories: ["sightings", "movement_signals", "hotspots", "corridors_foundation"],
    sightings: [
      {
        id: "SIGHT-001",
        speciesId: "SP-BLUE-WHALE",
        commonName: "Blue Whale",
        region: "North Pacific",
        stationId: "STA-NPC-01",
        latitude: 34.71,
        longitude: -143.11,
        count: 2,
        verificationStatus: "verified",
        observedAt: "2026-03-13T11:04:00.000Z",
        detail: "Two tagged whales observed near the corridor edge.",
      },
    ],
    movementSignals: [
      {
        id: "MOV-001",
        speciesId: "SP-BLUE-WHALE",
        commonName: "Blue Whale",
        region: "North Pacific",
        stationId: "STA-NPC-01",
        latitude: 34.68,
        longitude: -143.14,
        locationSource: "station",
        signalId: "SIG-001",
        investigationId: "TRK-201",
        movementType: "route_deviation",
        confidence: 84,
        createdAt: "2026-03-13T11:10:00.000Z",
        detail: "Route deviation aligned with the anomaly corridor.",
      },
    ],
    hotspots: [
      {
        id: "HOTSPOT-STA-NPC-01",
        label: "STA-NPC-01 species activity hotspot",
        region: "North Pacific",
        stationId: "STA-NPC-01",
        latitude: 34.697,
        longitude: -143.13,
        hotspotType: "mixed_activity",
        severity: "high",
        recentSightingCount: 2,
        recentMovementSignalCount: 1,
        observedIndividualCount: 2,
        dominantMovementTypes: ["route_deviation"],
        topSpecies: ["Blue Whale"],
        activityScore: 3,
        detail: "2 recent sightings and 1 movement signal concentrated near the station anchor.",
      },
    ],
    corridorsFoundation: [
      {
        id: "CORRIDOR-NORTH-PACIFIC",
        label: "North Pacific corridor foundation",
        region: "North Pacific",
        priority: "high",
        hotspotIds: ["HOTSPOT-STA-NPC-01"],
        stationIds: ["STA-NPC-01"],
        movementTypes: ["route_deviation"],
        speciesNames: ["Blue Whale"],
        anchorPoints: [
          {
            label: "STA-NPC-01 species activity hotspot",
            latitude: 34.697,
            longitude: -143.13,
          },
        ],
        geometryStatus: "grouped_without_geometry",
        summary: "North Pacific corridor foundation links 1 hotspot across 1 anchor point; geometry pending.",
      },
    ],
    generatedAt: "2026-03-13T12:00:00.000Z",
    windowDays: 14,
  },
  timelineSteps: [
    { label: "00h", active: false },
    { label: "06h", active: false },
    { label: "12h", active: true },
    { label: "18h", active: false },
    { label: "24h", active: false },
    { label: "36h", active: false },
  ],
};

test("ocean map workspace renders spatial overlay summaries and hotspot zones", () => {
  render(<OceanMapWorkspace data={BASE_DATA} />);

  expect(screen.getByTestId("overlay-summary-sightings")).toBeInTheDocument();
  expect(screen.getByTestId("overlay-summary-movement_signals")).toBeInTheDocument();
  expect(screen.getByTestId("overlay-summary-hotspots")).toBeInTheDocument();
  expect(
    within(screen.getByTestId("overlay-summary-hotspots")).getByText(
      "STA-NPC-01 species activity hotspot",
    ),
  ).toBeInTheDocument();
  expect(screen.getAllByTestId("map-marker-sightings")).toHaveLength(1);
  expect(screen.getAllByTestId("map-marker-movement_signals")).toHaveLength(1);
  expect(screen.getAllByTestId("map-marker-hotspots")).toHaveLength(1);
});

test("ocean map workspace toggles overlay layers locally", async () => {
  const user = userEvent.setup();
  render(<OceanMapWorkspace data={BASE_DATA} />);

  await user.click(screen.getByRole("button", { name: /Species Sightings/i }));

  expect(screen.queryByTestId("overlay-summary-sightings")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("map-marker-sightings")).toHaveLength(0);
  expect(screen.getByTestId("overlay-summary-movement_signals")).toBeInTheDocument();
});

test("ocean map workspace renders corridor foundations when that layer is enabled", async () => {
  const user = userEvent.setup();
  render(<OceanMapWorkspace data={BASE_DATA} />);

  await user.click(screen.getByRole("button", { name: /Corridor Foundations/i }));

  expect(screen.getByTestId("overlay-summary-corridors_foundation")).toBeInTheDocument();
  expect(
    within(screen.getByTestId("overlay-summary-corridors_foundation")).getByText(
      "North Pacific corridor foundation",
    ),
  ).toBeInTheDocument();
});

test("ocean map workspace renders empty overlay state safely", () => {
  render(
    <OceanMapWorkspace
      data={{
        ...BASE_DATA,
        spatialOverlays: {
          categories: ["sightings", "movement_signals", "hotspots", "corridors_foundation"],
          sightings: [],
          movementSignals: [],
          hotspots: [],
          corridorsFoundation: [],
          generatedAt: "2026-03-13T12:00:00.000Z",
          windowDays: 14,
        },
      }}
    />,
  );

  expect(screen.getByTestId("overlay-empty-state")).toBeInTheDocument();
});
