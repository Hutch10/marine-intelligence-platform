import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import OceanStationPublicPage from "@/app/station/[slug]/page";
import { oceanStationDetails } from "@/lib/api/mock-data";

const STATION = oceanStationDetails["STA-NPC-01"];

const { mockApiClient, signals } = vi.hoisted(() => ({
  mockApiClient: {
    oceanStations: {
      getStationBySlug: vi.fn(),
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

vi.mock("@/components/ocean-stations/ocean-station-public-workspace", () => ({
  OceanStationPublicWorkspace: ({ station }: { station: { name: string } }) => (
    <div data-testid="public-workspace">{station.name}</div>
  ),
}));

beforeEach(() => {
  signals.notFoundCalls = 0;
  mockApiClient.oceanStations.getStationBySlug.mockReset();
  mockApiClient.oceanStations.trackStationView.mockReset();
  mockApiClient.oceanStations.getStationBySlug.mockResolvedValue(STATION);
  mockApiClient.oceanStations.trackStationView.mockResolvedValue(undefined);
});

test("station public route loads workspace and tracks public views", async () => {
  const page = await OceanStationPublicPage({ params: { slug: STATION.slug } });
  render(page);

  expect(mockApiClient.oceanStations.getStationBySlug).toHaveBeenCalledWith(STATION.slug);
  expect(mockApiClient.oceanStations.trackStationView).toHaveBeenCalledWith(STATION.id, "public");
  expect(screen.getByTestId("public-workspace")).toHaveTextContent(STATION.name);
});

test("station public route returns not found when station is missing", async () => {
  mockApiClient.oceanStations.getStationBySlug.mockResolvedValueOnce(null);

  await expect(OceanStationPublicPage({ params: { slug: "missing" } })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(signals.notFoundCalls).toBe(1);
  expect(mockApiClient.oceanStations.trackStationView).not.toHaveBeenCalled();
});
