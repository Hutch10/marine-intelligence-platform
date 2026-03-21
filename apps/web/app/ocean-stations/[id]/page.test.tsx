import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import OceanStationDetailPage from "@/app/ocean-stations/[id]/page";
import { oceanStationDetails } from "@/lib/api/mock-data";

const STATION = oceanStationDetails["STA-NPC-01"];

const { mockApiClient, signals } = vi.hoisted(() => ({
  mockApiClient: {
    oceanStations: {
      getStationById: vi.fn(),
      trackStationView: vi.fn(),
      getStationAnalytics: vi.fn(),
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

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ocean-stations/ocean-station-detail-workspace", () => ({
  OceanStationDetailWorkspace: ({
    station,
    analytics,
  }: {
    station: { name: string };
    analytics: { views: { total: number } } | null;
  }) => (
    <div data-testid="detail-workspace">
      {station.name}:{analytics?.views.total ?? 0}
    </div>
  ),
}));

beforeEach(() => {
  signals.notFoundCalls = 0;
  mockApiClient.oceanStations.getStationById.mockReset();
  mockApiClient.oceanStations.trackStationView.mockReset();
  mockApiClient.oceanStations.getStationAnalytics.mockReset();
  mockApiClient.oceanStations.getStationById.mockResolvedValue(STATION);
  mockApiClient.oceanStations.trackStationView.mockResolvedValue(undefined);
  mockApiClient.oceanStations.getStationAnalytics.mockResolvedValue({
    stationId: STATION.id,
    views: { detail: 3, exhibit: 2, public: 1, total: 6 },
    lastViewedAt: null,
  });
});

test("station detail route loads workspace and tracks detail views", async () => {
  const page = await OceanStationDetailPage({ params: { id: STATION.id } });
  render(page);

  expect(mockApiClient.oceanStations.getStationById).toHaveBeenCalledWith(STATION.id);
  expect(mockApiClient.oceanStations.trackStationView).toHaveBeenCalledWith(STATION.id, "detail");
  expect(mockApiClient.oceanStations.getStationAnalytics).toHaveBeenCalledWith(STATION.id);
  expect(screen.getByTestId("detail-workspace")).toHaveTextContent(`${STATION.name}:6`);
});

test("station detail route returns not found when station is missing", async () => {
  mockApiClient.oceanStations.getStationById.mockResolvedValueOnce(null);

  await expect(OceanStationDetailPage({ params: { id: "missing" } })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(signals.notFoundCalls).toBe(1);
  expect(mockApiClient.oceanStations.trackStationView).not.toHaveBeenCalled();
  expect(mockApiClient.oceanStations.getStationAnalytics).not.toHaveBeenCalled();
});
