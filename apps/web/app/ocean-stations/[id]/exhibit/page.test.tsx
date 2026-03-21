import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import OceanStationExhibitPage from "@/app/ocean-stations/[id]/exhibit/page";
import { oceanStationDetails } from "@/lib/api/mock-data";

const STATION = oceanStationDetails["STA-NPC-01"];

const { mockApiClient, signals } = vi.hoisted(() => ({
  mockApiClient: {
    oceanStations: {
      getStationById: vi.fn(),
      trackStationView: vi.fn(),
    },
  },
  signals: {
    notFoundCalls: 0,
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    signals.notFoundCalls += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/ocean-stations/ocean-station-exhibit-workspace", () => ({
  OceanStationExhibitWorkspace: ({ station }: { station: { name: string } }) => (
    <div data-testid="exhibit-workspace">{station.name}</div>
  ),
}));

beforeEach(() => {
  signals.notFoundCalls = 0;
  mockApiClient.oceanStations.getStationById.mockReset();
  mockApiClient.oceanStations.trackStationView.mockReset();
  mockApiClient.oceanStations.getStationById.mockResolvedValue(STATION);
  mockApiClient.oceanStations.trackStationView.mockResolvedValue(undefined);
});

test("station exhibit route loads workspace and tracks exhibit views", async () => {
  const page = await OceanStationExhibitPage({ params: { id: STATION.id } });
  render(page);

  expect(mockApiClient.oceanStations.getStationById).toHaveBeenCalledWith(STATION.id);
  expect(mockApiClient.oceanStations.trackStationView).toHaveBeenCalledWith(STATION.id, "exhibit");
  expect(screen.getByTestId("exhibit-workspace")).toHaveTextContent(STATION.name);
});

test("station exhibit route returns not found when station is missing", async () => {
  mockApiClient.oceanStations.getStationById.mockResolvedValueOnce(null);

  await expect(OceanStationExhibitPage({ params: { id: "missing" } })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(signals.notFoundCalls).toBe(1);
  expect(mockApiClient.oceanStations.trackStationView).not.toHaveBeenCalled();
});
