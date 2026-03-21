import { describe, expect, test } from "vitest";
import {
  formatDataExplorerPresetLastUsed,
  formatDataExplorerPresetUsageMeta,
  isDataExplorerPresetInSync,
  selectDataExplorerPresetById,
  selectSortedDataExplorerPresets,
  toDataExplorerPresetFilterSnapshot,
} from "@/components/data-explorer/preset-presentation";
import type { DataExplorerPresetRecord } from "@/lib/persistence/types";

function createPreset(overrides: Partial<DataExplorerPresetRecord>): DataExplorerPresetRecord {
  return {
    id: "preset-id",
    name: "Preset",
    scope: "shared",
    filters: {
      q: "",
      category: "",
      region: "",
      status: "",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
    createdAt: "2026-03-14T10:00:00.000Z",
    updatedAt: "2026-03-14T10:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
    ...overrides,
  };
}

describe("preset presentation helpers", () => {
  test("sorts presets by recent usage desc and then name asc", () => {
    const sorted = selectSortedDataExplorerPresets([
      createPreset({ id: "b", name: "Beta", lastUsedAt: "2026-03-14T11:00:00.000Z" }),
      createPreset({ id: "z", name: "Zeta", lastUsedAt: "2026-03-14T12:00:00.000Z" }),
      createPreset({ id: "a", name: "Alpha", lastUsedAt: "2026-03-14T11:00:00.000Z" }),
      createPreset({ id: "n", name: "No History", lastUsedAt: null }),
    ]);

    expect(sorted.map((preset) => preset.name)).toEqual(["Zeta", "Alpha", "Beta", "No History"]);
  });

  test("selects preset by id safely", () => {
    const presets = [
      createPreset({ id: "first", name: "First" }),
      createPreset({ id: "second", name: "Second" }),
    ];

    expect(selectDataExplorerPresetById(presets, "second")?.name).toBe("Second");
    expect(selectDataExplorerPresetById(presets, "missing")).toBeNull();
    expect(selectDataExplorerPresetById(presets, "")).toBeNull();
  });

  test("formats usage metadata with safe fallback values", () => {
    expect(formatDataExplorerPresetLastUsed("2026-03-14T12:34:56.000Z")).toBe("2026-03-14 12:34");
    expect(formatDataExplorerPresetLastUsed(null)).toBe("Never");
    expect(formatDataExplorerPresetLastUsed("not-a-date")).toBe("Never");

    expect(formatDataExplorerPresetUsageMeta(createPreset({ useCount: 5, lastUsedAt: "2026-03-14T12:34:56.000Z" }))).toBe(
      "Uses: 5 | Last used: 2026-03-14 12:34",
    );
    expect(formatDataExplorerPresetUsageMeta(createPreset({ useCount: undefined, lastUsedAt: null }))).toBe(
      "Uses: 0 | Last used: Never",
    );
  });

  test("builds snapshot and detects preset sync against current filters", () => {
    const filters = {
      q: "reef",
      category: "Temperature",
      region: "North Pacific",
      status: "Live",
      sortBy: "name" as const,
      sortDir: "asc" as const,
      page: 2,
      pageSize: 10,
    };

    expect(toDataExplorerPresetFilterSnapshot(filters)).toEqual({
      q: "reef",
      category: "Temperature",
      region: "North Pacific",
      status: "Live",
      sortBy: "name",
      sortDir: "asc",
      pageSize: 10,
    });

    const preset = createPreset({
      filters: {
        q: "reef",
        category: "Temperature",
        region: "North Pacific",
        status: "Live",
        sortBy: "name",
        sortDir: "asc",
        pageSize: 10,
      },
    });

    expect(isDataExplorerPresetInSync(preset, filters)).toBe(true);
    expect(
      isDataExplorerPresetInSync(preset, {
        ...filters,
        q: "updated",
      }),
    ).toBe(false);
  });
});
