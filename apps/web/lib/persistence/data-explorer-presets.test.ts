import { beforeEach, expect, test, vi } from "vitest";
import {
  DATA_EXPLORER_PRESET_STORAGE_KEY,
  DATA_EXPLORER_PRESET_SCHEMA_VERSION,
  deleteDataExplorerPresetById,
  loadDataExplorerPresets,
  markDataExplorerPresetUsed,
  saveDataExplorerPreset,
  upsertDataExplorerPreset,
} from "@/lib/persistence/data-explorer-presets";

beforeEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

test("preset save, load, and delete work through the persistence seam", () => {
  const saveResult = saveDataExplorerPreset({
    name: "Thermal Live",
    filters: {
      q: "thermal",
      status: "Live",
      sortBy: "name",
      sortDir: "asc",
      pageSize: 10,
    },
  });

  expect(saveResult.ok).toBe(true);
  expect(saveResult.presets).toHaveLength(1);
  expect(saveResult.presets[0]).toMatchObject({
    id: expect.any(String),
    name: "Thermal Live",
    scope: "shared",
    filters: expect.objectContaining({
      q: "thermal",
      status: "Live",
      sortBy: "name",
      sortDir: "asc",
      pageSize: 10,
    }),
  });

  const loaded = loadDataExplorerPresets();
  expect(loaded).toHaveLength(1);
  expect(loaded[0]?.id).toBe(saveResult.presets[0]?.id);
  expect(loaded[0]?.createdAt).toEqual(loaded[0]?.updatedAt);

  const deleteResult = deleteDataExplorerPresetById(saveResult.presets[0]?.id ?? "");
  expect(deleteResult.ok).toBe(true);
  expect(deleteResult.presets).toHaveLength(0);
  expect(loadDataExplorerPresets()).toEqual([]);
});

test("existing stored preset payloads are migrated into the typed schema", () => {
  window.localStorage.setItem(
    DATA_EXPLORER_PRESET_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Legacy Preset",
          filters: {
            q: "chemistry",
            status: "Live",
            sortBy: "name",
            sortDir: "asc",
            pageSize: 10,
          },
        },
      ],
    }),
  );

  const loaded = loadDataExplorerPresets();

  expect(loaded).toHaveLength(1);
  expect(loaded[0]).toMatchObject({
    id: expect.any(String),
    name: "Legacy Preset",
    filters: expect.objectContaining({
      q: "chemistry",
      status: "Live",
      sortBy: "name",
      sortDir: "asc",
      pageSize: 10,
    }),
    useCount: 0,
    lastUsedAt: null,
    scope: "shared",
  });

  const migrated = JSON.parse(window.localStorage.getItem(DATA_EXPLORER_PRESET_STORAGE_KEY) ?? "null");
  expect(migrated).toMatchObject({
    version: DATA_EXPLORER_PRESET_SCHEMA_VERSION,
    presets: [
      expect.objectContaining({
        id: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        useCount: 0,
        lastUsedAt: null,
        scope: "shared",
      }),
    ],
  });
});

test("corrupt preset storage fails safely to an empty list", () => {
  window.localStorage.setItem(DATA_EXPLORER_PRESET_STORAGE_KEY, "{bad-json");

  expect(loadDataExplorerPresets()).toEqual([]);
});

test("upsert updates an existing preset by ID", () => {
  const saved = saveDataExplorerPreset({
    name: "Ocean View",
    filters: {
      q: "ocean",
      sortBy: "updated",
      sortDir: "desc",
    },
  });

  expect(saved.ok).toBe(true);

  const preset = saved.presets.find((entry) => entry.name === "Ocean View");
  expect(preset?.id).toBeTruthy();

  const updated = upsertDataExplorerPreset({
    id: preset?.id,
    name: "Ocean View Updated",
    filters: {
      q: "ocean-updated",
      sortBy: "name",
      sortDir: "asc",
      pageSize: 10,
    },
  });

  expect(updated.ok).toBe(true);
  expect(updated.presets).toHaveLength(1);
  expect(updated.presets[0]).toMatchObject({
    id: preset?.id,
    name: "Ocean View Updated",
    scope: "shared",
    filters: expect.objectContaining({
      q: "ocean-updated",
      sortBy: "name",
      sortDir: "asc",
      pageSize: 10,
    }),
  });
  expect(updated.presets[0]?.createdAt).toBe(preset?.createdAt);
});

test("new presets receive stable unique IDs", () => {
  const first = saveDataExplorerPreset({
    name: "Unique One",
    filters: {},
  });
  const second = saveDataExplorerPreset({
    name: "Unique Two",
    filters: {},
  });

  const firstId = first.presets.find((preset) => preset.name === "Unique One")?.id;
  const secondId = second.presets.find((preset) => preset.name === "Unique Two")?.id;

  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toEqual(secondId);
  expect(firstId).not.toEqual("preset-unique-one");
  expect(secondId).not.toEqual("preset-unique-two");
});

test("delete by ID returns not_found and does not mutate storage when missing", () => {
  const saved = saveDataExplorerPreset({
    name: "Delete Target",
    filters: {
      q: "target",
    },
  });

  expect(saved.ok).toBe(true);
  const beforeRaw = window.localStorage.getItem(DATA_EXPLORER_PRESET_STORAGE_KEY);

  const deleted = deleteDataExplorerPresetById("missing-id");

  expect(deleted).toMatchObject({
    ok: false,
    error: "Preset not found.",
    reason: "not_found",
  });
  expect(deleted.presets).toHaveLength(1);

  const afterRaw = window.localStorage.getItem(DATA_EXPLORER_PRESET_STORAGE_KEY);
  expect(afterRaw).toBe(beforeRaw);
});

test("mark-used increments useCount and sets lastUsedAt", () => {
  const saved = saveDataExplorerPreset({
    name: "Mark Used",
    filters: {
      q: "used",
    },
  });

  expect(saved.ok).toBe(true);

  const presetId = saved.presets.find((preset) => preset.name === "Mark Used")?.id;
  expect(presetId).toBeTruthy();

  const marked = markDataExplorerPresetUsed(presetId ?? "");

  expect(marked.ok).toBe(true);

  const updated = marked.presets.find((preset) => preset.id === presetId);
  expect(updated?.useCount).toBe(1);
  expect(updated?.lastUsedAt).toBeTruthy();
  expect(updated?.lastUsedAt ? Number.isNaN(Date.parse(updated.lastUsedAt)) : true).toBe(false);
});

test("mark-used returns not_found and does not mutate storage when preset is missing", () => {
  const saved = saveDataExplorerPreset({
    name: "Known Preset",
    filters: {
      q: "known",
    },
  });

  expect(saved.ok).toBe(true);
  const beforeRaw = window.localStorage.getItem(DATA_EXPLORER_PRESET_STORAGE_KEY);

  const marked = markDataExplorerPresetUsed("missing-id");

  expect(marked).toMatchObject({
    ok: false,
    error: "Preset not found.",
    reason: "not_found",
  });
  expect(marked.presets).toHaveLength(1);

  const afterRaw = window.localStorage.getItem(DATA_EXPLORER_PRESET_STORAGE_KEY);
  expect(afterRaw).toBe(beforeRaw);
});

test("empty and duplicate preset names are rejected", () => {
  expect(
    saveDataExplorerPreset({
      name: "   ",
      filters: {},
    }),
  ).toMatchObject({
    ok: false,
    error: "Preset name is required.",
  });

  expect(
    saveDataExplorerPreset({
      name: "Ocean View",
      filters: {},
    }).ok,
  ).toBe(true);

  expect(
    saveDataExplorerPreset({
      name: "  ocean view  ",
      filters: {},
    }),
  ).toMatchObject({
    ok: false,
    error: "Preset name already exists.",
    reason: "duplicate_name",
  });
});

test("legacy presets get IDs and can be deleted by ID", () => {
  window.localStorage.setItem(
    DATA_EXPLORER_PRESET_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Legacy Delete",
          filters: {
            q: "",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
        },
      ],
    }),
  );

  const loaded = loadDataExplorerPresets();
  expect(loaded).toHaveLength(1);
  expect(loaded[0]?.id).toEqual(expect.any(String));

  const deleted = deleteDataExplorerPresetById(loaded[0]?.id ?? "");

  expect(deleted.ok).toBe(true);
  expect(deleted.presets).toEqual([]);
});

test("scope-aware persistence keeps personal and shared presets isolated", () => {
  expect(
    saveDataExplorerPreset({
      name: "Shared Tide",
      scope: "shared",
      filters: { q: "tide" },
    }).ok,
  ).toBe(true);

  expect(
    saveDataExplorerPreset({
      name: "Personal Tide",
      scope: "personal",
      filters: { q: "operator" },
    }).ok,
  ).toBe(true);

  expect(loadDataExplorerPresets("shared").map((preset) => preset.name)).toEqual(["Shared Tide"]);
  expect(loadDataExplorerPresets("personal").map((preset) => preset.name)).toEqual(["Personal Tide"]);
});

test("duplicate names are enforced within a scope but allowed across scopes", () => {
  expect(
    saveDataExplorerPreset({
      name: "Thermal Watch",
      scope: "shared",
      filters: {},
    }).ok,
  ).toBe(true);

  expect(
    saveDataExplorerPreset({
      name: "Thermal Watch",
      scope: "personal",
      filters: {},
    }).ok,
  ).toBe(true);

  expect(
    saveDataExplorerPreset({
      name: "Thermal Watch",
      scope: "personal",
      filters: {},
    }),
  ).toMatchObject({
    ok: false,
    reason: "duplicate_name",
  });
});

test("mark-used and delete operate within the selected scope", () => {
  const shared = saveDataExplorerPreset({
    name: "Shared Usage",
    scope: "shared",
    filters: {},
  });
  const personal = saveDataExplorerPreset({
    name: "Personal Usage",
    scope: "personal",
    filters: {},
  });

  const sharedId = shared.presets[0]?.id ?? "";
  const personalId = personal.presets[0]?.id ?? "";

  const marked = markDataExplorerPresetUsed(personalId, "personal");

  expect(marked.ok).toBe(true);
  expect(marked.presets[0]).toMatchObject({
    id: personalId,
    scope: "personal",
    useCount: 1,
  });
  expect(loadDataExplorerPresets("shared")[0]).toMatchObject({
    id: sharedId,
    scope: "shared",
    useCount: 0,
  });

  const deleted = deleteDataExplorerPresetById(sharedId, "shared");

  expect(deleted.ok).toBe(true);
  expect(loadDataExplorerPresets("shared")).toEqual([]);
  expect(loadDataExplorerPresets("personal")[0]).toMatchObject({
    id: personalId,
    scope: "personal",
  });
});
