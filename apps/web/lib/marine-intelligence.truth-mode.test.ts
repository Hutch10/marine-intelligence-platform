import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { mockListMarineRegionConfigs } = vi.hoisted(() => ({
  mockListMarineRegionConfigs: vi.fn(),
}));

vi.mock("@marine/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@marine/shared")>();
  return {
    ...actual,
    getMarineRegionConfig: vi.fn(),
    listMarineRegionConfigs: mockListMarineRegionConfigs,
  };
});

import {
  getMarineRegionByName,
  getMarineRegionForStation,
} from "@/lib/marine-intelligence";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MARINE_ALLOW_CONFIG_ONLY_TRUTH_ENTITIES", "false");

  mockListMarineRegionConfigs.mockReturnValue([
    {
      id: "example-region",
      name: "Example Region",
      stationIds: ["station-1", "station-2"],
      minimumHealthyStationRequirement: 1,
      crwRegionKey: "example-key",
    },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

test("station-1 cannot appear in production truth mode", () => {
  const region = getMarineRegionForStation("station-1");
  expect(region).toBeNull();
});

test("example-region cannot appear in production truth mode", () => {
  const region = getMarineRegionForStation("station-1");
  expect(region?.id).not.toBe("example-region");
});

test("Example Region cannot appear in production truth mode", () => {
  const region = getMarineRegionByName("Example Region");
  expect(region).toBeNull();
});
