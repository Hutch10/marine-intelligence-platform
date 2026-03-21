import type { DataExplorerPresetRecord } from "@/lib/persistence/types";
import type { DataExplorerDatasetFilters } from "@/lib/api/types";

function toSortablePresetTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function selectSortedDataExplorerPresets(
  presets: DataExplorerPresetRecord[],
): DataExplorerPresetRecord[] {
  return [...presets].sort((left, right) => {
    const rightUsed = toSortablePresetTimestamp(right.lastUsedAt);
    const leftUsed = toSortablePresetTimestamp(left.lastUsedAt);

    if (rightUsed !== leftUsed) {
      return rightUsed - leftUsed;
    }

    return left.name.localeCompare(right.name);
  });
}

export function selectDataExplorerPresetById(
  presets: DataExplorerPresetRecord[],
  presetId: string,
): DataExplorerPresetRecord | null {
  if (!presetId) {
    return null;
  }

  return presets.find((preset) => preset.id === presetId) ?? null;
}

export function formatDataExplorerPresetLastUsed(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return "Never";
  }

  return value.slice(0, 16).replace("T", " ");
}

export function formatDataExplorerPresetUsageMeta(
  preset: Pick<DataExplorerPresetRecord, "useCount" | "lastUsedAt">,
): string {
  return `Uses: ${preset.useCount ?? 0} | Last used: ${formatDataExplorerPresetLastUsed(preset.lastUsedAt)}`;
}

export function toDataExplorerPresetFilterSnapshot(
  filters: Required<DataExplorerDatasetFilters>,
): DataExplorerPresetRecord["filters"] {
  return {
    q: filters.q,
    category: filters.category,
    region: filters.region,
    status: filters.status,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    pageSize: filters.pageSize,
  };
}

export function isDataExplorerPresetInSync(
  preset: Pick<DataExplorerPresetRecord, "filters">,
  filters: Required<DataExplorerDatasetFilters>,
): boolean {
  const snapshot = toDataExplorerPresetFilterSnapshot(filters);

  return JSON.stringify(preset.filters) === JSON.stringify(snapshot);
}
