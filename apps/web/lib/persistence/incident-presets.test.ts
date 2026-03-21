import { beforeEach, expect, test, vi } from "vitest";
import {
  INCIDENT_PRESET_SCHEMA_VERSION,
  INCIDENT_PRESET_STORAGE_KEY,
  deleteIncidentPresetById,
  loadIncidentPresets,
  markIncidentPresetUsed,
  saveIncidentPreset,
} from "@/lib/persistence/incident-presets";

beforeEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

test("loads empty when storage is empty", () => {
  expect(loadIncidentPresets()).toEqual([]);
});

test("returns empty on corrupt JSON", () => {
  window.localStorage.setItem(INCIDENT_PRESET_STORAGE_KEY, "{bad-json");

  expect(loadIncidentPresets()).toEqual([]);
});

test("returns empty on invalid schema", () => {
  window.localStorage.setItem(
    INCIDENT_PRESET_STORAGE_KEY,
    JSON.stringify({
      version: INCIDENT_PRESET_SCHEMA_VERSION,
      presets: {
        bad: true,
      },
    }),
  );

  expect(loadIncidentPresets()).toEqual([]);
});

test("migrates old v1 records into v2 shape and writes migrated records back", () => {
  window.localStorage.setItem(
    INCIDENT_PRESET_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Legacy Incident View",
          filters: {
            actor: "ops.lead@marine.local",
            ip: "203.0.113.22",
            eventType: "login_failure",
            since: "2026-03-16T08:00",
            until: "2026-03-16T10:00",
            source: "ioos_regional",
            status: "active",
            ruleType: "source_failed",
            limit: 50,
          },
        },
      ],
    }),
  );

  const loaded = loadIncidentPresets();

  expect(loaded).toHaveLength(1);
  expect(loaded[0]).toMatchObject({
    name: "Legacy Incident View",
    kind: "user",
    appliesTo: ["investigation", "operationalAlerts"],
    payload: {
      investigation: {
        actor: "ops.lead@marine.local",
        ip: "203.0.113.22",
        eventType: "login_failure",
        since: "2026-03-16T08:00",
        until: "2026-03-16T10:00",
        timeMode: "absolute",
      },
      operationalAlerts: {
        source: "ioos_regional",
        status: "active",
        ruleType: "source_failed",
        limit: 50,
      },
    },
    useCount: 0,
    lastUsedAt: null,
    origin: "local",
  });
  expect(loaded[0].id).toBeTruthy();

  const written = JSON.parse(window.localStorage.getItem(INCIDENT_PRESET_STORAGE_KEY) ?? "null");

  expect(written).toMatchObject({
    version: INCIDENT_PRESET_SCHEMA_VERSION,
    presets: [
      expect.objectContaining({
        id: expect.any(String),
        payload: expect.objectContaining({
          investigation: expect.objectContaining({
            actor: "ops.lead@marine.local",
          }),
        }),
      }),
    ],
  });
});

test("migration preserves usable data", () => {
  window.localStorage.setItem(
    INCIDENT_PRESET_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      presets: [
        {
          id: "legacy-keep-id",
          name: "Keep Legacy Data",
          createdAt: "2026-03-16T01:00:00.000Z",
          updatedAt: "2026-03-16T02:00:00.000Z",
          filters: {
            actor: "analyst@marine.local",
            ip: "198.51.100.8",
            eventType: "login_success",
            source: "alerting",
            status: "resolved",
            ruleType: "source_stale",
            limit: 100,
          },
        },
      ],
    }),
  );

  const loaded = loadIncidentPresets();

  expect(loaded[0]).toMatchObject({
    id: "legacy-keep-id",
    name: "Keep Legacy Data",
    createdAt: "2026-03-16T01:00:00.000Z",
    updatedAt: "2026-03-16T02:00:00.000Z",
    payload: {
      investigation: expect.objectContaining({
        actor: "analyst@marine.local",
        ip: "198.51.100.8",
        eventType: "login_success",
      }),
      operationalAlerts: expect.objectContaining({
        source: "alerting",
        status: "resolved",
        ruleType: "source_stale",
        limit: 100,
      }),
    },
  });
});

test("rejects duplicate names safely", () => {
  expect(
    saveIncidentPreset({
      name: "Primary View",
      payload: {
        investigation: {
          actor: "",
          ip: "",
          eventType: "",
          since: "",
          until: "",
          timeMode: "absolute",
        },
      },
    }).ok,
  ).toBe(true);

  const duplicate = saveIncidentPreset({
    name: "  primary view ",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });

  expect(duplicate).toMatchObject({
    ok: false,
    error: "Preset name already exists.",
  });
});

test("save fails when storage is unavailable", () => {
  const result = saveIncidentPreset(
    {
      name: "Unavailable Save",
      payload: {
        investigation: {
          actor: "",
          ip: "",
          eventType: "",
          since: "",
          until: "",
          timeMode: "absolute",
        },
      },
    },
    null,
  );

  expect(result).toMatchObject({
    ok: false,
    error: "Unable to save presets in this browser.",
  });
});

test("delete fails when storage is unavailable", () => {
  const result = deleteIncidentPresetById("missing-id", null);

  expect(result).toMatchObject({
    ok: false,
    error: "Unable to update presets in this browser.",
  });
});

test("delete returns not_found when preset ID is missing", () => {
  const saved = saveIncidentPreset({
    name: "Existing",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });

  expect(saved.ok).toBe(true);
  const beforeRaw = window.localStorage.getItem(INCIDENT_PRESET_STORAGE_KEY);

  const result = deleteIncidentPresetById("missing-id");

  expect(result).toMatchObject({
    ok: false,
    error: "Preset not found.",
    reason: "not_found",
  });
  expect(result.presets).toHaveLength(1);

  const afterRaw = window.localStorage.getItem(INCIDENT_PRESET_STORAGE_KEY);
  expect(afterRaw).toBe(beforeRaw);
});

test("mark-used increments useCount and sets lastUsedAt", () => {
  const saved = saveIncidentPreset({
    name: "Mark Used",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });

  expect(saved.ok).toBe(true);

  const presetId = saved.presets.find((preset) => preset.name === "Mark Used")?.id;
  expect(presetId).toBeTruthy();

  const marked = markIncidentPresetUsed(presetId ?? "");

  expect(marked.ok).toBe(true);

  const updated = marked.presets.find((preset) => preset.id === presetId);
  expect(updated?.useCount).toBe(1);
  expect(updated?.lastUsedAt).toBeTruthy();
  expect(updated?.lastUsedAt ? Number.isNaN(Date.parse(updated.lastUsedAt)) : true).toBe(false);
});

test("mark-used returns not_found for missing preset", () => {
  const saved = saveIncidentPreset({
    name: "Known Preset",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });

  expect(saved.ok).toBe(true);

  const marked = markIncidentPresetUsed("missing-id");

  expect(marked).toMatchObject({
    ok: false,
    error: "Preset not found.",
    reason: "not_found",
  });
  expect(marked.presets).toHaveLength(1);
});

test("delete by ID works", () => {
  const first = saveIncidentPreset({
    name: "First",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });
  const second = saveIncidentPreset({
    name: "Second",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });

  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);

  const firstId = first.presets.find((preset) => preset.name === "First")?.id;
  expect(firstId).toBeTruthy();

  const deleted = deleteIncidentPresetById(firstId ?? "");
  expect(deleted.ok).toBe(true);
  expect(deleted.presets.map((preset) => preset.name)).toEqual(["Second"]);
});

test("new presets receive stable unique IDs", () => {
  const first = saveIncidentPreset({
    name: "Unique One",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });
  const second = saveIncidentPreset({
    name: "Unique Two",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });

  const firstId = first.presets.find((preset) => preset.name === "Unique One")?.id;
  const secondId = second.presets.find((preset) => preset.name === "Unique Two")?.id;

  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toEqual(secondId);
  expect(firstId).not.toEqual("unique-one");
  expect(secondId).not.toEqual("unique-two");
});

test("generates a non-empty ID when crypto.randomUUID is unavailable", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.fill(11);
      return bytes;
    },
  } as Crypto);

  const saved = saveIncidentPreset({
    name: "Fallback ID",
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
    },
  });

  expect(saved.ok).toBe(true);

  const presetId = saved.presets.find((preset) => preset.name === "Fallback ID")?.id;
  expect(presetId).toBeTruthy();
  expect((presetId ?? "").trim().length).toBeGreaterThan(0);
});

test("relative-time-capable structure does not break absolute presets", () => {
  const saved = saveIncidentPreset({
    name: "Absolute Time Preset",
    payload: {
      investigation: {
        actor: "ops.lead@marine.local",
        ip: "",
        eventType: "login_failure",
        since: "2026-03-16T08:30",
        until: "2026-03-16T09:30",
        timeMode: "absolute",
      },
      operationalAlerts: {
        source: "ioos_regional",
        status: "resolved",
        ruleType: "source_failed",
        limit: 20,
      },
    },
  });

  expect(saved.ok).toBe(true);

  const loaded = loadIncidentPresets();

  expect(loaded[0]).toMatchObject({
    name: "Absolute Time Preset",
    payload: {
      investigation: {
        since: "2026-03-16T08:30",
        until: "2026-03-16T09:30",
        timeMode: "absolute",
      },
      operationalAlerts: {
        source: "ioos_regional",
        status: "resolved",
        ruleType: "source_failed",
        limit: 20,
      },
    },
  });
});
