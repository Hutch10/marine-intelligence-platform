const DEFAULT_NEIGHBOR_LIMIT = 5;
const MIN_NEIGHBOR_LIMIT = 3;
const MAX_NEIGHBOR_LIMIT = 8;

const CURATED_NDBC_NEIGHBORS: Record<string, string[]> = {
  "41009": ["41010", "41012", "41013", "41044", "42036", "42040"],
  "41010": ["41009", "41012", "41013", "41044", "42036", "42040"],
  "41012": ["41009", "41010", "41013", "41044", "42036", "42040"],
  "41013": ["41012", "41009", "41010", "41025", "41044", "42036"],
  "41025": ["41013", "41012", "41010", "41009", "41044"],
  "41044": ["41013", "41012", "41009", "41010", "42036", "42040"],
  "42003": ["42019", "42036", "42040", "42056", "41044"],
  "42019": ["42036", "42040", "42003", "41044", "41013"],
  "42036": ["42019", "42040", "41044", "41013", "41012", "41009"],
  "42040": ["42036", "42019", "41044", "41013", "41012", "41009"],
  "42056": ["42003", "42019", "42036", "42040"],
};

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_NEIGHBOR_LIMIT;
  }

  return Math.min(MAX_NEIGHBOR_LIMIT, Math.max(MIN_NEIGHBOR_LIMIT, Math.floor(limit!)));
}

export function listNeighborStationIds(
  stationId: string,
  options: {
    limit?: number;
    fallbackStationIds?: string[];
  } = {},
): string[] {
  const normalizedStationId = stationId.trim();
  const limit = normalizeLimit(options.limit);
  const curated = CURATED_NDBC_NEIGHBORS[normalizedStationId] ?? [];

  if (curated.length > 0) {
    return curated.slice(0, limit);
  }

  return (options.fallbackStationIds ?? [])
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0 && candidate !== normalizedStationId)
    .slice(0, limit);
}
