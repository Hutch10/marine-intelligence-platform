import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  appendDataExplorerBehaviorEvent,
  clearSharedDataExplorerPresetStoreForTests,
  deleteDataExplorerPresetById,
  deleteSharedDataExplorerPresetById,
  exportDataExplorerBehaviorDedupeDropSummarySnapshot,
  listDataExplorerBehaviorDedupeExportHistory,
  listDataExplorerBehaviorDedupeDropSummary,
  listDataExplorerBehaviorEvents,
  listPresetAuditEvents,
  loadDataExplorerPresets,
  loadSharedDataExplorerPresets,
  markDataExplorerPresetUsed,
  markSharedDataExplorerPresetUsed,
  upsertDataExplorerPreset,
  upsertSharedDataExplorerPreset,
} from "@/lib/server/data-explorer-preset-store";
import { openReadOnlyDatabase, openWritableDatabase } from "../../../api/src/db/client";

let tempDir: string;
let sharedPresetPath: string;

interface PresetAuditEventRow {
  id: string;
  preset_id: string | null;
  preset_name: string;
  scope: string;
  action: string;
  actor_id: string | null;
  actor_type: string;
  owner_id: string | null;
  outcome: string;
  reason: string | null;
  metadata_json: string | null;
  created_at: string;
}

interface BehaviorEventRow {
  id: string;
  event_type: string;
  scope: string;
  actor_id: string | null;
  actor_label: string | null;
  owner_id: string | null;
  preset_id: string | null;
  preset_name: string | null;
  dataset_id: string | null;
  dataset_name: string | null;
  created_at: string;
  source_context_json: string | null;
}

interface BehaviorDedupeDropRow {
  id: string;
  event_type: string;
  scope: string;
  actor_id: string | null;
  owner_id: string | null;
  dataset_id: string | null;
  dropped_at: string;
  dedupe_window_ms: number;
}

interface BehaviorDedupeExportRow {
  id: string;
  scope: string;
  owner_id: string | null;
  actor_id: string | null;
  export_format: string;
  window_minutes: number;
  dataset_count: number;
  created_at: string;
}

function readPresetAuditEvents(): PresetAuditEventRow[] {
  const db = openReadOnlyDatabase();

  try {
    const statement = db.prepare(`
      SELECT id, preset_id, preset_name, scope, action, actor_id, actor_type, owner_id, outcome, reason, metadata_json, created_at
      FROM data_explorer_preset_audit_events
      ORDER BY created_at ASC
    `);
    return statement.all() as PresetAuditEventRow[];
  } finally {
    db.close();
  }
}

function readBehaviorEvents(): BehaviorEventRow[] {
  const db = openReadOnlyDatabase();

  try {
    const statement = db.prepare(`
      SELECT
        id,
        event_type,
        scope,
        actor_id,
        actor_label,
        owner_id,
        preset_id,
        preset_name,
        dataset_id,
        dataset_name,
        created_at,
        source_context_json
      FROM data_explorer_behavior_events
      ORDER BY created_at ASC
    `);
    return statement.all() as BehaviorEventRow[];
  } finally {
    db.close();
  }
}

function readBehaviorDedupeDrops(): BehaviorDedupeDropRow[] {
  const db = openReadOnlyDatabase();

  try {
    const statement = db.prepare(`
      SELECT
        id,
        event_type,
        scope,
        actor_id,
        owner_id,
        dataset_id,
        dropped_at,
        dedupe_window_ms
      FROM data_explorer_behavior_dedupe_drops
      ORDER BY dropped_at ASC
    `);
    return statement.all() as BehaviorDedupeDropRow[];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

function readBehaviorDedupeExports(): BehaviorDedupeExportRow[] {
  const db = openReadOnlyDatabase();

  try {
    const statement = db.prepare(`
      SELECT
        id,
        scope,
        owner_id,
        actor_id,
        export_format,
        window_minutes,
        dataset_count,
        created_at
      FROM data_explorer_behavior_dedupe_exports
      ORDER BY created_at ASC, export_format ASC, id ASC
    `);
    return statement.all() as BehaviorDedupeExportRow[];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "marine-presets-"));
  sharedPresetPath = join(tempDir, "shared-presets.json");
  vi.stubEnv(
    "MARINE_SHARED_DATA_EXPLORER_PRESETS_PATH",
    sharedPresetPath,
  );
  vi.stubEnv("MARINE_DB_PATH", join(tempDir, "marine.sqlite"));
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  clearSharedDataExplorerPresetStoreForTests();
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

test("shared preset store returns empty set when store does not exist", () => {
  const result = loadSharedDataExplorerPresets();

  expect(result.ok).toBe(true);
  expect(result.presets).toEqual([]);
});

test("shared preset store upserts and rejects case-insensitive duplicate names", () => {
  const createResult = upsertSharedDataExplorerPreset({
    name: "Thermal Live",
    filters: {
      q: "thermal",
      status: "Live",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(createResult.ok).toBe(true);
  expect(createResult.presets).toHaveLength(1);

  const duplicateResult = upsertSharedDataExplorerPreset({
    name: "thermal live",
    filters: {
      q: "thermal",
    },
  });

  expect(duplicateResult.ok).toBe(false);
  expect(duplicateResult.reason).toBe("duplicate_name");
});

test("shared preset store mark-used updates usage metadata", () => {
  const createResult = upsertSharedDataExplorerPreset({
    name: "Usage Target",
    filters: {
      q: "usage",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(createResult.ok).toBe(true);
  const presetId = createResult.presets[0]?.id;
  expect(presetId).toBeDefined();

  const markResult = markSharedDataExplorerPresetUsed(presetId ?? "");

  expect(markResult.ok).toBe(true);
  expect(markResult.presets[0]?.useCount).toBe(1);
  expect(markResult.presets[0]?.lastUsedAt).not.toBeNull();
});

test("shared preset store deletes persisted presets by id", () => {
  const createResult = upsertSharedDataExplorerPreset({
    name: "Delete Target",
    filters: {
      q: "cleanup",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(createResult.ok).toBe(true);
  const presetId = createResult.presets[0]?.id;

  const deleteResult = deleteSharedDataExplorerPresetById(presetId ?? "");

  expect(deleteResult.ok).toBe(true);
  expect(deleteResult.presets).toEqual([]);
  expect(loadSharedDataExplorerPresets().presets).toEqual([]);
});

test("shared preset store migrates legacy shared JSON into sqlite-backed storage", () => {
  writeFileSync(
    sharedPresetPath,
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Migrated Thermal",
          filters: {
            q: "thermal",
            region: "north-atlantic",
          },
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z",
        },
      ],
    }),
    "utf8",
  );

  const loaded = loadSharedDataExplorerPresets();

  expect(loaded.ok).toBe(true);
  expect(loaded.presets).toHaveLength(1);
  expect(loaded.presets[0]).toMatchObject({
    name: "Migrated Thermal",
    createdAt: "2026-03-10T00:00:00.000Z",
    updatedAt: "2026-03-11T00:00:00.000Z",
    filters: {
      q: "thermal",
      region: "north-atlantic",
      category: "",
      status: "",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  rmSync(sharedPresetPath, { force: true });

  const reloaded = loadSharedDataExplorerPresets();

  expect(reloaded.ok).toBe(true);
  expect(reloaded.presets).toHaveLength(1);
  expect(reloaded.presets[0]?.name).toBe("Migrated Thermal");
});

test("repository-backed preset store isolates personal scope from shared scope", () => {
  const sharedResult = upsertDataExplorerPreset({
    name: "Shared Ops",
    scope: "shared",
    filters: { q: "ops" },
  });
  const personalResult = upsertDataExplorerPreset({
    name: "Personal Ops",
    scope: "personal",
    ownerId: "operator-1",
    filters: { q: "ops-personal" },
  });

  expect(sharedResult.ok).toBe(true);
  expect(personalResult.ok).toBe(true);

  expect(loadDataExplorerPresets({ scope: "shared" }).presets.map((preset) => preset.name)).toEqual(["Shared Ops"]);
  expect(
    loadDataExplorerPresets({ scope: "personal", ownerId: "operator-1" }).presets.map((preset) => preset.name),
  ).toEqual(["Personal Ops"]);
});

test("repository-backed preset store isolates personal presets per operator while shared presets stay visible to all", () => {
  upsertDataExplorerPreset({
    name: "Shared Baseline",
    scope: "shared",
    filters: { q: "shared" },
  });
  upsertDataExplorerPreset({
    name: "Operator Alpha",
    scope: "personal",
    ownerId: "operator-alpha",
    filters: { q: "alpha" },
  });
  upsertDataExplorerPreset({
    name: "Operator Bravo",
    scope: "personal",
    ownerId: "operator-bravo",
    filters: { q: "bravo" },
  });

  expect(loadDataExplorerPresets({ scope: "shared" }).presets.map((preset) => preset.name)).toEqual([
    "Shared Baseline",
  ]);
  expect(
    loadDataExplorerPresets({ scope: "personal", ownerId: "operator-alpha" }).presets.map((preset) => preset.name),
  ).toEqual(["Operator Alpha"]);
  expect(
    loadDataExplorerPresets({ scope: "personal", ownerId: "operator-bravo" }).presets.map((preset) => preset.name),
  ).toEqual(["Operator Bravo"]);
});

test("repository-backed preset store requires owner context for personal scope", () => {
  const result = loadDataExplorerPresets({ scope: "personal" });

  expect(result).toMatchObject({
    ok: false,
    reason: "validation",
    error: "Personal preset scope requires an owner key.",
  });
});

test("repository-backed preset store allows duplicate names across scopes and tracks usage within scope", () => {
  const shared = upsertDataExplorerPreset({
    name: "Thermal Watch",
    scope: "shared",
    filters: { q: "shared" },
  });
  const personal = upsertDataExplorerPreset({
    name: "Thermal Watch",
    scope: "personal",
    ownerId: "operator-2",
    filters: { q: "personal" },
  });

  expect(shared.ok).toBe(true);
  expect(personal.ok).toBe(true);

  const personalId = personal.presets[0]?.id ?? "";
  const marked = markDataExplorerPresetUsed(personalId, {
    scope: "personal",
    ownerId: "operator-2",
  });

  expect(marked.ok).toBe(true);
  expect(marked.presets.find((preset) => preset.id === personalId)).toMatchObject({
    id: personalId,
    scope: "personal",
    useCount: 1,
  });
  expect(loadDataExplorerPresets({ scope: "shared" }).presets[0]).toMatchObject({
    name: "Thermal Watch",
    scope: "shared",
    useCount: 0,
  });

  const deleted = deleteDataExplorerPresetById(personalId, {
    scope: "personal",
    ownerId: "operator-2",
  });

  expect(deleted.ok).toBe(true);
  expect(loadDataExplorerPresets({ scope: "personal", ownerId: "operator-2" }).presets).toEqual([]);
  expect(loadDataExplorerPresets({ scope: "shared" }).presets).toHaveLength(1);
});

test("repository-backed preset mutations append durable shared-scope audit events", () => {
  const created = upsertDataExplorerPreset({
    name: "Shared Audit",
    scope: "shared",
    filters: { q: "audit" },
  });
  const presetId = created.presets[0]?.id ?? "";

  const updated = upsertDataExplorerPreset({
    id: presetId,
    name: "Shared Audit Updated",
    scope: "shared",
    filters: { q: "audit-updated" },
  });
  const marked = markDataExplorerPresetUsed(presetId, { scope: "shared" });
  const deleted = deleteDataExplorerPresetById(presetId, { scope: "shared" });

  expect(created.ok).toBe(true);
  expect(updated.ok).toBe(true);
  expect(marked.ok).toBe(true);
  expect(deleted.ok).toBe(true);

  const events = readPresetAuditEvents().map((event) => ({
    action: event.action,
    outcome: event.outcome,
    actor_type: event.actor_type,
    scope: event.scope,
    preset_id: event.preset_id,
  }));

  expect(events).toEqual([
    {
      action: "created",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
    {
      action: "updated",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
    {
      action: "marked_used",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
    {
      action: "deleted",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
  ]);
});

test("repository-backed personal preset mutations attribute audit events to station admin actor", () => {
  const created = upsertDataExplorerPreset({
    name: "Personal Audit",
    scope: "personal",
    ownerId: "operator-33",
    actor: {
      actorId: "operator-33",
      actorType: "station_admin",
    },
    filters: { q: "personal-audit" },
  });

  expect(created.ok).toBe(true);

  const events = readPresetAuditEvents();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    action: "created",
    outcome: "success",
    scope: "personal",
    owner_id: "operator-33",
    actor_id: "operator-33",
    actor_type: "station_admin",
  });
});

test("repository-backed preset duplicate and not-found mutations emit failure audit events", () => {
  upsertDataExplorerPreset({
    name: "Failure Baseline",
    scope: "shared",
    filters: { q: "base" },
  });

  const duplicate = upsertDataExplorerPreset({
    name: "failure baseline",
    scope: "shared",
    filters: { q: "duplicate" },
  });
  const notFoundDelete = deleteDataExplorerPresetById("missing-preset", { scope: "shared" });

  expect(duplicate.ok).toBe(false);
  expect(duplicate.reason).toBe("duplicate_name");
  expect(notFoundDelete.ok).toBe(false);
  expect(notFoundDelete.reason).toBe("not_found");

  const failureEvents = readPresetAuditEvents().filter((event) => event.outcome === "failure");

  expect(failureEvents).toHaveLength(2);
  expect(failureEvents[0]).toMatchObject({
    action: "created",
    outcome: "failure",
    reason: "duplicate_name",
  });
  expect(failureEvents[1]).toMatchObject({
    action: "deleted",
    outcome: "failure",
    reason: "not_found",
  });
});

test("repository-backed preset mutations stay successful when audit inserts fail", () => {
  const created = upsertDataExplorerPreset({
    name: "Audit Failure Tolerance",
    scope: "shared",
    filters: { q: "resilience" },
  });

  expect(created.ok).toBe(true);
  const presetId = created.presets[0]?.id ?? "";

  const db = openWritableDatabase();
  try {
    db.prepare("DROP TRIGGER IF EXISTS block_preset_audit_insert").run?.();
    db.prepare(`
      CREATE TRIGGER block_preset_audit_insert
      BEFORE INSERT ON data_explorer_preset_audit_events
      BEGIN
        SELECT RAISE(ABORT, 'blocked for test');
      END
    `).run?.();
  } finally {
    db.close();
  }

  const updated = upsertDataExplorerPreset({
    id: presetId,
    name: "Audit Failure Tolerance Updated",
    scope: "shared",
    filters: { q: "resilience-updated" },
  });

  expect(updated.ok).toBe(true);
  expect(updated.presets[0]?.name).toBe("Audit Failure Tolerance Updated");

  const cleanupDb = openWritableDatabase();
  try {
    cleanupDb.prepare("DROP TRIGGER IF EXISTS block_preset_audit_insert").run?.();
  } finally {
    cleanupDb.close();
  }
});

test("repository-backed preset audit reads return newest-first with bounded limits and parsed metadata", () => {
  upsertDataExplorerPreset({
    name: "Audit Read Seed",
    scope: "shared",
    filters: { q: "seed" },
  });

  const db = openWritableDatabase();
  try {
    db.prepare("DELETE FROM data_explorer_preset_audit_events").run?.();
    db.prepare(`
      INSERT INTO data_explorer_preset_audit_events (
        id,
        preset_id,
        preset_name,
        scope,
        action,
        actor_id,
        actor_type,
        owner_id,
        outcome,
        reason,
        created_at,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run?.(
      "audit-1",
      "preset-1",
      "Preset One",
      "shared",
      "created",
      null,
      "unknown",
      null,
      "success",
      null,
      "2026-03-20T10:00:00.000Z",
      JSON.stringify({
        source: "seed-1",
      }),
    );
    db.prepare(`
      INSERT INTO data_explorer_preset_audit_events (
        id,
        preset_id,
        preset_name,
        scope,
        action,
        actor_id,
        actor_type,
        owner_id,
        outcome,
        reason,
        created_at,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run?.(
      "audit-2",
      "preset-2",
      "Preset Two",
      "shared",
      "updated",
      "operator-2",
      "station_admin",
      null,
      "success",
      null,
      "2026-03-20T10:01:00.000Z",
      null,
    );
    db.prepare(`
      INSERT INTO data_explorer_preset_audit_events (
        id,
        preset_id,
        preset_name,
        scope,
        action,
        actor_id,
        actor_type,
        owner_id,
        outcome,
        reason,
        created_at,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run?.(
      "audit-3",
      "preset-3",
      "Preset Three",
      "shared",
      "deleted",
      "operator-3",
      "station_admin",
      null,
      "failure",
      "not_found",
      "2026-03-20T10:02:00.000Z",
      JSON.stringify({
        source: "seed-3",
      }),
    );
  } finally {
    db.close();
  }

  const result = listPresetAuditEvents({
    scope: "shared",
    limit: 2,
  });

  expect(result.ok).toBe(true);
  expect(result.events.map((event) => event.id)).toEqual(["audit-3", "audit-2"]);
  expect(result.events[0]).toMatchObject({
    action: "deleted",
    outcome: "failure",
    reason: "not_found",
    metadata: {
      source: "seed-3",
    },
  });
});

test("repository-backed preset audit reads apply preset, actor, action, and personal scope filters", () => {
  upsertDataExplorerPreset({
    name: "Audit Filter Seed",
    scope: "shared",
    filters: { q: "seed" },
  });

  const db = openWritableDatabase();
  try {
    db.prepare("DELETE FROM data_explorer_preset_audit_events").run?.();
    const insert = db.prepare(`
      INSERT INTO data_explorer_preset_audit_events (
        id,
        preset_id,
        preset_name,
        scope,
        action,
        actor_id,
        actor_type,
        owner_id,
        outcome,
        reason,
        created_at,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run?.(
      "audit-filter-1",
      "preset-target",
      "Target Preset",
      "personal",
      "updated",
      "operator-target",
      "station_admin",
      "operator-target",
      "success",
      null,
      "2026-03-20T11:00:00.000Z",
      null,
    );
    insert.run?.(
      "audit-filter-2",
      "preset-target",
      "Target Preset",
      "personal",
      "updated",
      "operator-other",
      "station_admin",
      "operator-target",
      "success",
      null,
      "2026-03-20T11:01:00.000Z",
      null,
    );
    insert.run?.(
      "audit-filter-3",
      "preset-other",
      "Other Preset",
      "shared",
      "created",
      null,
      "unknown",
      null,
      "success",
      null,
      "2026-03-20T11:02:00.000Z",
      null,
    );
    insert.run?.(
      "audit-filter-4",
      "preset-target",
      "Target Preset",
      "personal",
      "created",
      "operator-target",
      "station_admin",
      "operator-target",
      "success",
      null,
      "2026-03-20T11:03:00.000Z",
      null,
    );
  } finally {
    db.close();
  }

  const result = listPresetAuditEvents({
    scope: "personal",
    ownerId: "operator-target",
    presetId: "preset-target",
    actorId: "operator-target",
    action: "updated",
    limit: 25,
  });

  expect(result.ok).toBe(true);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({
    id: "audit-filter-1",
    scope: "personal",
    presetId: "preset-target",
    actorId: "operator-target",
    ownerId: "operator-target",
  });
});

test("repository-backed behavior events persist preset apply and dataset interaction rows", () => {
  const presetApplied = appendDataExplorerBehaviorEvent({
    eventType: "preset_applied",
    scope: "shared",
    actor: {
      actorId: "operator-42",
      actorType: "station_admin",
    },
    actorLabel: "operator-42",
    presetId: "preset-42",
    presetName: "Shared Thermal",
    sourceContext: {
      interaction: "preset-apply",
    },
    createdAt: "2026-03-20T12:00:00.000Z",
  });
  const datasetSelected = appendDataExplorerBehaviorEvent({
    eventType: "dataset_selected",
    scope: "shared",
    datasetId: "DST-200",
    datasetName: "Atlantic Thermal",
    sourceContext: {
      interaction: "dataset-list-click",
    },
    createdAt: "2026-03-20T12:01:00.000Z",
  });

  expect(presetApplied.ok).toBe(true);
  expect(datasetSelected.ok).toBe(true);

  const events = readBehaviorEvents();
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({
    event_type: "preset_applied",
    actor_id: "operator-42",
    actor_label: "operator-42",
    preset_id: "preset-42",
    preset_name: "Shared Thermal",
    dataset_id: null,
  });
  expect(events[1]).toMatchObject({
    event_type: "dataset_selected",
    actor_id: null,
    actor_label: "Unknown actor",
    dataset_id: "DST-200",
    dataset_name: "Atlantic Thermal",
  });
});

test("repository-backed dataset detail behavior events are deduped within a short window", () => {
  const first = appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-8",
    actor: {
      actorId: "operator-8",
      actorType: "station_admin",
    },
    actorLabel: "operator-8",
    datasetId: "DST-DEDUPE",
    datasetName: "Dedupe Dataset",
    createdAt: "2026-03-20T12:00:00.000Z",
  });
  const duplicate = appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-8",
    actor: {
      actorId: "operator-8",
      actorType: "station_admin",
    },
    actorLabel: "operator-8",
    datasetId: "DST-DEDUPE",
    datasetName: "Dedupe Dataset",
    createdAt: "2026-03-20T12:00:10.000Z",
  });

  expect(first.ok).toBe(true);
  expect(duplicate.ok).toBe(true);

  const events = readBehaviorEvents();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event_type: "dataset_detail_viewed",
    scope: "personal",
    owner_id: "operator-8",
    actor_id: "operator-8",
    dataset_id: "DST-DEDUPE",
    created_at: "2026-03-20T12:00:00.000Z",
  });

  const dedupeDrops = readBehaviorDedupeDrops();
  expect(dedupeDrops).toHaveLength(1);
  expect(dedupeDrops[0]).toMatchObject({
    event_type: "dataset_detail_viewed",
    scope: "personal",
    owner_id: "operator-8",
    actor_id: "operator-8",
    dataset_id: "DST-DEDUPE",
    dropped_at: "2026-03-20T12:00:10.000Z",
    dedupe_window_ms: 15000,
  });
});

test("repository-backed dedupe observability records each dropped dataset detail event", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-observe",
    actor: {
      actorId: "operator-observe",
      actorType: "station_admin",
    },
    actorLabel: "operator-observe",
    datasetId: "DST-OBSERVE",
    datasetName: "Observable Dataset",
    createdAt: "2026-03-20T15:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-observe",
    actor: {
      actorId: "operator-observe",
      actorType: "station_admin",
    },
    actorLabel: "operator-observe",
    datasetId: "DST-OBSERVE",
    datasetName: "Observable Dataset",
    createdAt: "2026-03-20T15:00:04.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-observe",
    actor: {
      actorId: "operator-observe",
      actorType: "station_admin",
    },
    actorLabel: "operator-observe",
    datasetId: "DST-OBSERVE",
    datasetName: "Observable Dataset",
    createdAt: "2026-03-20T15:00:08.000Z",
  });

  expect(readBehaviorEvents()).toHaveLength(1);

  const dedupeDrops = readBehaviorDedupeDrops();
  expect(dedupeDrops).toHaveLength(2);
  expect(dedupeDrops.map((row) => row.dropped_at)).toEqual([
    "2026-03-20T15:00:04.000Z",
    "2026-03-20T15:00:08.000Z",
  ]);
});

test("repository-backed dedupe summary groups recent drops by dataset", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-summary",
    actor: {
      actorId: "operator-summary",
      actorType: "station_admin",
    },
    actorLabel: "operator-summary",
    datasetId: "DST-A",
    datasetName: "Dataset A",
    createdAt: "2099-03-20T16:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-summary",
    actor: {
      actorId: "operator-summary",
      actorType: "station_admin",
    },
    actorLabel: "operator-summary",
    datasetId: "DST-A",
    datasetName: "Dataset A",
    createdAt: "2099-03-20T16:00:05.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-summary",
    actor: {
      actorId: "operator-summary",
      actorType: "station_admin",
    },
    actorLabel: "operator-summary",
    datasetId: "DST-B",
    datasetName: "Dataset B",
    createdAt: "2099-03-20T16:01:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-summary",
    actor: {
      actorId: "operator-summary",
      actorType: "station_admin",
    },
    actorLabel: "operator-summary",
    datasetId: "DST-B",
    datasetName: "Dataset B",
    createdAt: "2099-03-20T16:01:05.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-summary",
    actor: {
      actorId: "operator-summary",
      actorType: "station_admin",
    },
    actorLabel: "operator-summary",
    datasetId: "DST-B",
    datasetName: "Dataset B",
    createdAt: "2099-03-20T16:01:10.000Z",
  });

  const result = listDataExplorerBehaviorDedupeDropSummary({
    scope: "personal",
    ownerId: "operator-summary",
    windowMinutes: 24 * 60,
    limit: 5,
  });

  expect(result.ok).toBe(true);
  expect(result.windowMinutes).toBe(24 * 60);
  expect(result.summary).toEqual([
    {
      datasetId: "DST-B",
      dropCount: 2,
      mostRecentDroppedAt: "2099-03-20T16:01:10.000Z",
    },
    {
      datasetId: "DST-A",
      dropCount: 1,
      mostRecentDroppedAt: "2099-03-20T16:00:05.000Z",
    },
  ]);
});

test("internal dedupe export snapshot keeps deterministic ordering for equal drop counts", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-export",
    actor: {
      actorId: "operator-export",
      actorType: "station_admin",
    },
    actorLabel: "operator-export",
    datasetId: "DST-A",
    datasetName: "Dataset A",
    createdAt: "2099-03-20T17:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-export",
    actor: {
      actorId: "operator-export",
      actorType: "station_admin",
    },
    actorLabel: "operator-export",
    datasetId: "DST-A",
    datasetName: "Dataset A",
    createdAt: "2099-03-20T17:00:05.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-export",
    actor: {
      actorId: "operator-export",
      actorType: "station_admin",
    },
    actorLabel: "operator-export",
    datasetId: "DST-B",
    datasetName: "Dataset B",
    createdAt: "2099-03-20T17:10:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-export",
    actor: {
      actorId: "operator-export",
      actorType: "station_admin",
    },
    actorLabel: "operator-export",
    datasetId: "DST-B",
    datasetName: "Dataset B",
    createdAt: "2099-03-20T17:10:05.000Z",
  });

  const result = exportDataExplorerBehaviorDedupeDropSummarySnapshot({
    scope: "personal",
    ownerId: "operator-export",
    actor: {
      actorId: "operator-export",
      actorType: "station_admin",
    },
    windowMinutes: 24 * 60,
    limit: 5,
  });

  expect(result.ok).toBe(true);
  expect(result.filename).toContain("data-explorer-dedupe-summary-personal-");
  expect(result.snapshot).toMatchObject({
    schemaVersion: 1,
    scope: "personal",
    windowMinutes: 24 * 60,
    totalDatasets: 2,
  });
  expect(result.snapshot?.summary.map((entry) => entry.datasetId)).toEqual([
    "DST-A",
    "DST-B",
  ]);
  expect(result.snapshot?.summary.map((entry) => entry.dropCount)).toEqual([
    1,
    1,
  ]);
  expect(result.snapshot?.provenance).toEqual({
    source: "repository",
    route: "/api/data-explorer/activity/dedupe-summary/export",
    requestedFormat: "json",
    requestedLimit: 5,
    ordering: {
      primary: "dropCount:desc",
      secondary: "datasetId:asc",
    },
    requestedBy: {
      actorId: "operator-export",
      actorType: "station_admin",
      ownerId: "operator-export",
    },
    exportHistory: [
      {
        exportedAt: result.snapshot?.exportedAt,
        format: "json",
        scope: "personal",
        totalDatasets: 2,
        actorId: "operator-export",
      },
    ],
  });

  const exportRows = readBehaviorDedupeExports();
  expect(exportRows).toHaveLength(1);
  expect(exportRows[0]).toMatchObject({
    scope: "personal",
    owner_id: "operator-export",
    actor_id: "operator-export",
    export_format: "json",
    window_minutes: 24 * 60,
    dataset_count: 2,
  });
});

test("internal dedupe export snapshot appends history entries and returns deterministic CSV content", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-csv",
    actor: {
      actorId: "operator-csv",
      actorType: "station_admin",
    },
    actorLabel: "operator-csv",
    datasetId: "DST-A",
    datasetName: "Dataset A",
    createdAt: "2099-03-20T18:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-csv",
    actor: {
      actorId: "operator-csv",
      actorType: "station_admin",
    },
    actorLabel: "operator-csv",
    datasetId: "DST-A",
    datasetName: "Dataset A",
    createdAt: "2099-03-20T18:00:05.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-csv",
    actor: {
      actorId: "operator-csv",
      actorType: "station_admin",
    },
    actorLabel: "operator-csv",
    datasetId: "DST-B",
    datasetName: "Dataset B",
    createdAt: "2099-03-20T18:01:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-csv",
    actor: {
      actorId: "operator-csv",
      actorType: "station_admin",
    },
    actorLabel: "operator-csv",
    datasetId: "DST-B",
    datasetName: "Dataset B",
    createdAt: "2099-03-20T18:01:05.000Z",
  });

  vi.useFakeTimers();

  try {
    vi.setSystemTime(new Date("2099-03-20T18:10:00.000Z"));
    const jsonResult = exportDataExplorerBehaviorDedupeDropSummarySnapshot({
      scope: "personal",
      ownerId: "operator-csv",
      actor: {
        actorId: "operator-csv",
        actorType: "station_admin",
      },
      format: "json",
      windowMinutes: 24 * 60,
      limit: 5,
    });

    vi.setSystemTime(new Date("2099-03-20T18:11:00.000Z"));
    const csvResult = exportDataExplorerBehaviorDedupeDropSummarySnapshot({
      scope: "personal",
      ownerId: "operator-csv",
      actor: {
        actorId: "operator-csv",
        actorType: "station_admin",
      },
      format: "csv",
      windowMinutes: 24 * 60,
      limit: 5,
    });

    expect(jsonResult.ok).toBe(true);
    expect(csvResult.ok).toBe(true);
    expect(csvResult.format).toBe("csv");
    expect(csvResult.contentType).toBe("text/csv; charset=utf-8");
    expect(csvResult.filename).toContain(".csv");
    expect(csvResult.snapshot?.provenance.requestedFormat).toBe("csv");
    expect(csvResult.snapshot?.provenance.exportHistory).toEqual([
      {
        exportedAt: "2099-03-20T18:11:00.000Z",
        format: "csv",
        scope: "personal",
        totalDatasets: 2,
        actorId: "operator-csv",
      },
      {
        exportedAt: "2099-03-20T18:10:00.000Z",
        format: "json",
        scope: "personal",
        totalDatasets: 2,
        actorId: "operator-csv",
      },
    ]);
    expect(csvResult.content?.split("\n")).toEqual([
      "# schemaVersion=1",
      "# exportedAt=2099-03-20T18:11:00.000Z",
      "# scope=personal",
      `# windowMinutes=${24 * 60}`,
      "# requestedLimit=5",
      "# totalDatasets=2",
      "# source=repository",
      "# route=/api/data-explorer/activity/dedupe-summary/export",
      "# requestedFormat=csv",
      "# orderingPrimary=dropCount:desc",
      "# orderingSecondary=datasetId:asc",
      "# requestedByActorId=operator-csv",
      "# requestedByActorType=station_admin",
      "# requestedByOwnerId=operator-csv",
      "# exportHistory=[{\"exportedAt\":\"2099-03-20T18:11:00.000Z\",\"format\":\"csv\",\"scope\":\"personal\",\"totalDatasets\":2,\"actorId\":\"operator-csv\"},{\"exportedAt\":\"2099-03-20T18:10:00.000Z\",\"format\":\"json\",\"scope\":\"personal\",\"totalDatasets\":2,\"actorId\":\"operator-csv\"}]",
      "datasetId,dropCount,mostRecentDroppedAt",
      "DST-A,1,2099-03-20T18:00:05.000Z",
      "DST-B,1,2099-03-20T18:01:05.000Z",
    ]);

    const historyResult = listDataExplorerBehaviorDedupeExportHistory({
      scope: "personal",
      ownerId: "operator-csv",
      limit: 5,
    });

    expect(historyResult.ok).toBe(true);
    expect(historyResult.history).toEqual([
      {
        exportedAt: "2099-03-20T18:11:00.000Z",
        format: "csv",
        scope: "personal",
        totalDatasets: 2,
        actorId: "operator-csv",
      },
      {
        exportedAt: "2099-03-20T18:10:00.000Z",
        format: "json",
        scope: "personal",
        totalDatasets: 2,
        actorId: "operator-csv",
      },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("dedupe export history remains deterministic when timestamps match", () => {
  vi.useFakeTimers();

  try {
    vi.setSystemTime(new Date("2099-03-20T20:00:00.000Z"));

    const jsonResult = exportDataExplorerBehaviorDedupeDropSummarySnapshot({
      scope: "shared",
      format: "json",
      windowMinutes: 60,
      limit: 5,
    });

    const csvResult = exportDataExplorerBehaviorDedupeDropSummarySnapshot({
      scope: "shared",
      format: "csv",
      windowMinutes: 60,
      limit: 5,
    });

    expect(jsonResult.ok).toBe(true);
    expect(csvResult.ok).toBe(true);

    const historyResult = listDataExplorerBehaviorDedupeExportHistory({
      scope: "shared",
      limit: 2,
    });

    expect(historyResult.ok).toBe(true);
    expect(historyResult.history).toEqual([
      {
        exportedAt: "2099-03-20T20:00:00.000Z",
        format: "csv",
        scope: "shared",
        totalDatasets: 0,
        actorId: null,
      },
      {
        exportedAt: "2099-03-20T20:00:00.000Z",
        format: "json",
        scope: "shared",
        totalDatasets: 0,
        actorId: null,
      },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("internal dedupe export snapshot returns empty summary when no drops match", () => {
  vi.useFakeTimers();

  try {
    vi.setSystemTime(new Date("2099-03-20T19:00:00.000Z"));

    const result = exportDataExplorerBehaviorDedupeDropSummarySnapshot({
      scope: "shared",
      format: "csv",
      windowMinutes: 60,
      limit: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.format).toBe("csv");
    expect(result.snapshot).toMatchObject({
      schemaVersion: 1,
      scope: "shared",
      windowMinutes: 60,
      totalDatasets: 0,
      summary: [],
      provenance: {
        source: "repository",
        route: "/api/data-explorer/activity/dedupe-summary/export",
        requestedFormat: "csv",
        requestedBy: {
          actorId: null,
          actorType: "unknown",
          ownerId: null,
        },
      },
    });
    expect(result.content?.split("\n")).toEqual([
      "# schemaVersion=1",
      "# exportedAt=2099-03-20T19:00:00.000Z",
      "# scope=shared",
      "# windowMinutes=60",
      "# requestedLimit=5",
      "# totalDatasets=0",
      "# source=repository",
      "# route=/api/data-explorer/activity/dedupe-summary/export",
      "# requestedFormat=csv",
      "# orderingPrimary=dropCount:desc",
      "# orderingSecondary=datasetId:asc",
      "# requestedByActorId=",
      "# requestedByActorType=unknown",
      "# requestedByOwnerId=",
      "# exportHistory=[{\"exportedAt\":\"2099-03-20T19:00:00.000Z\",\"format\":\"csv\",\"scope\":\"shared\",\"totalDatasets\":0,\"actorId\":null}]",
      "datasetId,dropCount,mostRecentDroppedAt",
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test("repository-backed dedupe summary returns empty data for a window with no drops", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "shared",
    datasetId: "DST-EMPTY-WINDOW",
    datasetName: "Outside Window Dataset",
    createdAt: "2020-03-20T10:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "shared",
    datasetId: "DST-EMPTY-WINDOW",
    datasetName: "Outside Window Dataset",
    createdAt: "2020-03-20T10:00:05.000Z",
  });

  const result = listDataExplorerBehaviorDedupeDropSummary({
    scope: "shared",
    windowMinutes: 1,
    limit: 5,
  });

  expect(result.ok).toBe(true);
  expect(result.summary).toEqual([]);
});

test("repository-backed dedupe summary validates window and limit inputs", () => {
  const invalidWindow = listDataExplorerBehaviorDedupeDropSummary({
    scope: "shared",
    windowMinutes: 0,
  });
  expect(invalidWindow.ok).toBe(false);
  expect(invalidWindow.reason).toBe("validation");

  const invalidLimit = listDataExplorerBehaviorDedupeDropSummary({
    scope: "shared",
    limit: 0,
  });
  expect(invalidLimit.ok).toBe(false);
  expect(invalidLimit.reason).toBe("validation");
});

test("repository-backed dataset detail behavior events persist when outside the dedupe window", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-9",
    actor: {
      actorId: "operator-9",
      actorType: "station_admin",
    },
    actorLabel: "operator-9",
    datasetId: "DST-WINDOW",
    datasetName: "Window Dataset",
    createdAt: "2026-03-20T13:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-9",
    actor: {
      actorId: "operator-9",
      actorType: "station_admin",
    },
    actorLabel: "operator-9",
    datasetId: "DST-WINDOW",
    datasetName: "Window Dataset",
    createdAt: "2026-03-20T13:00:20.000Z",
  });

  const events = readBehaviorEvents();
  expect(events).toHaveLength(2);
  expect(events[0]?.created_at).toBe("2026-03-20T13:00:00.000Z");
  expect(events[1]?.created_at).toBe("2026-03-20T13:00:20.000Z");

  expect(readBehaviorDedupeDrops()).toHaveLength(0);
});

test("repository-backed non-detail behavior events remain non-deduped", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_selected",
    scope: "shared",
    datasetId: "DST-NON-DEDUPE",
    datasetName: "Selection Dataset",
    createdAt: "2026-03-20T14:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_selected",
    scope: "shared",
    datasetId: "DST-NON-DEDUPE",
    datasetName: "Selection Dataset",
    createdAt: "2026-03-20T14:00:05.000Z",
  });

  const events = readBehaviorEvents();
  expect(events).toHaveLength(2);
  expect(events.map((event) => event.event_type)).toEqual([
    "dataset_selected",
    "dataset_selected",
  ]);
  expect(readBehaviorDedupeDrops()).toHaveLength(0);
});

test("repository-backed behavior reads return newest-first and honor personal scope filters", () => {
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_selected",
    scope: "shared",
    datasetId: "DST-SHARED",
    datasetName: "Shared Dataset",
    createdAt: "2026-03-20T13:00:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-7",
    actor: {
      actorId: "operator-7",
      actorType: "station_admin",
    },
    actorLabel: "operator-7",
    datasetId: "DST-PERSONAL-A",
    datasetName: "Personal Dataset A",
    createdAt: "2026-03-20T13:01:00.000Z",
  });
  appendDataExplorerBehaviorEvent({
    eventType: "preset_applied",
    scope: "personal",
    ownerId: "operator-7",
    actor: {
      actorId: "operator-7",
      actorType: "station_admin",
    },
    actorLabel: "operator-7",
    presetId: "preset-personal",
    presetName: "Personal Preset",
    createdAt: "2026-03-20T13:02:00.000Z",
  });

  const personal = listDataExplorerBehaviorEvents({
    scope: "personal",
    ownerId: "operator-7",
    limit: 10,
  });

  expect(personal.ok).toBe(true);
  expect(personal.events.map((event) => event.eventType)).toEqual([
    "preset_applied",
    "dataset_detail_viewed",
  ]);

  const shared = listDataExplorerBehaviorEvents({
    scope: "shared",
    limit: 10,
  });

  expect(shared.ok).toBe(true);
  expect(shared.events).toHaveLength(1);
  expect(shared.events[0]).toMatchObject({
    eventType: "dataset_selected",
    datasetId: "DST-SHARED",
    scope: "shared",
  });
});

test("repository-backed behavior writes reject personal scope without trusted owner context", () => {
  const result = appendDataExplorerBehaviorEvent({
    eventType: "dataset_selected",
    scope: "personal",
    datasetId: "DST-UNAUTH",
    datasetName: "Blocked Dataset",
  });

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("validation");
  expect(result.error).toBe("Personal preset scope requires an owner key.");
});
