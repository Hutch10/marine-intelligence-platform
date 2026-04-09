
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

export function listMarineRegionConfigs(): MarineRegionConfig[] {
  return MARINE_REGION_CONFIGS;
}

export function getMarineRegionConfig(id: string): MarineRegionConfig | undefined {
  return MARINE_REGION_CONFIGS.find((r) => r.id === id || r.id === id.toLowerCase());
}
