
import type { MarineRegionConfig } from "./types";

// Example region config list (replace with real data)
const MARINE_REGION_CONFIGS: MarineRegionConfig[] = [
  {
    id: "example-region",
    name: "Example Region",
    stationIds: ["station-1", "station-2"],
    minimumHealthyStationRequirement: 1,
    crwRegionKey: "example-key",
  },
];

function readEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

function shouldHideFixtureRegionsInTruthMode(): boolean {
  if (readEnv("NODE_ENV") !== "production") {
    return false;
  }

  return String(readEnv("MARINE_ALLOW_FIXTURE_REGIONS_IN_TRUTH_MODE") ?? "false").trim().toLowerCase() !== "true";
}

function isFixtureRegionConfig(region: MarineRegionConfig): boolean {
  const normalizedId = region.id.trim().toLowerCase();
  const normalizedName = region.name.trim().toLowerCase();
  const stationIds = region.stationIds.map((stationId) => stationId.trim().toLowerCase());

  if (normalizedId === "example-region") {
    return true;
  }

  if (normalizedName === "example region") {
    return true;
  }

  return stationIds.includes("station-1");
}

function listVisibleMarineRegionConfigs(): MarineRegionConfig[] {
  if (!shouldHideFixtureRegionsInTruthMode()) {
    return MARINE_REGION_CONFIGS;
  }

  return MARINE_REGION_CONFIGS.filter((region) => !isFixtureRegionConfig(region));
}

export function listMarineRegionConfigs(): MarineRegionConfig[] {
  return listVisibleMarineRegionConfigs();
}

export function getMarineRegionConfig(id: string): MarineRegionConfig | undefined {
  const normalizedId = id.toLowerCase();
  return listVisibleMarineRegionConfigs().find((region) => region.id === id || region.id === normalizedId);
}
