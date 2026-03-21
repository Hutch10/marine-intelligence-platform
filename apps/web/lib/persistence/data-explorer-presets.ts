"use client";

import {
  DATA_EXPLORER_ALLOWED_DIRECTIONS,
  DATA_EXPLORER_ALLOWED_SORTS,
  DATA_EXPLORER_DEFAULT_PRESET_FILTERS,
  type DataExplorerPresetDraft,
  type DataExplorerPresetFilters,
  type DataExplorerPresetMutationReason,
  type DataExplorerPresetMutationResult,
  type DataExplorerPresetRecord,
  type DataExplorerPresetScope,
  type PersistenceStore,
} from "@/lib/persistence/types";

// Keep this key stable so existing browser data remains discoverable across schema upgrades.
// Versioned envelope migrations handle schema evolution rather than key renames.
export const DATA_EXPLORER_PRESET_STORAGE_KEY = "marine.dataExplorer.presets.v1";
export const DATA_EXPLORER_PRESET_SCHEMA_VERSION = 3 as const;

const DATA_EXPLORER_PRESET_LEGACY_SCHEMA_VERSION = 1 as const;
const DATA_EXPLORER_PRESET_SCOPELESS_SCHEMA_VERSION = 2 as const;
const DEFAULT_PRESET_SCOPE = "shared" as const satisfies DataExplorerPresetScope;

type DataExplorerPresetStorageReadReason =
  | "storage_unavailable"
  | "read_failed";

type DataExplorerPresetStorageWriteReason =
  | "storage_unavailable"
  | "write_failed";

type DataExplorerPresetParseReason =
  | "corrupt_json"
  | "invalid_schema"
  | "unsupported_version";

type DataExplorerPresetLoadReason =
  | DataExplorerPresetStorageReadReason
  | DataExplorerPresetParseReason;

export interface DataExplorerPresetUpsertDraft {
  id?: string;
  name: string;
  scope?: DataExplorerPresetScope;
  filters: Partial<DataExplorerPresetFilters>;
}

interface DataExplorerPresetStorageEnvelopeV1 {
  version: typeof DATA_EXPLORER_PRESET_LEGACY_SCHEMA_VERSION;
  presets: Array<{
    id?: string;
    name?: string;
    filters?: unknown;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

interface DataExplorerPresetStorageEnvelopeV2 {
  version: typeof DATA_EXPLORER_PRESET_SCOPELESS_SCHEMA_VERSION;
  presets: Array<Omit<DataExplorerPresetRecord, "scope">>;
}

interface DataExplorerPresetStorageEnvelopeV3 {
  version: typeof DATA_EXPLORER_PRESET_SCHEMA_VERSION;
  presets: DataExplorerPresetRecord[];
}

interface ParseEnvelopeSuccess {
  ok: true;
  envelope: DataExplorerPresetStorageEnvelopeV3;
  migrated: boolean;
}

interface ParseEnvelopeFailure {
  ok: false;
  reason: DataExplorerPresetParseReason;
}

type ParseEnvelopeResult = ParseEnvelopeSuccess | ParseEnvelopeFailure;

interface LoadPresetStateResult {
  presets: DataExplorerPresetRecord[];
  reason?: DataExplorerPresetLoadReason;
}

interface DataExplorerPresetStorageAdapter {
  readRaw: () =>
    | { ok: true; raw: string | null }
    | { ok: false; reason: DataExplorerPresetStorageReadReason };
  writeRaw: (raw: string) =>
    | { ok: true }
    | { ok: false; reason: DataExplorerPresetStorageWriteReason };
}

const SHOW_DEBUG = process.env.NODE_ENV !== "production";

function logPersistence(event: string, detail?: Record<string, unknown>) {
  if (!SHOW_DEBUG) {
    return;
  }

  console.debug("[DataExplorerPresets]", {
    event,
    ...detail,
  });
}

function getDefaultStore(store?: PersistenceStore | null) {
  if (store === null) {
    return null;
  }

  if (store) {
    return store;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asFiniteNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return fallback;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function generateDataExplorerPresetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const fallbackPart = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
    ? (() => {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((part) => part.toString(16).padStart(2, "0"))
        .join("");
    })()
    : `${Date.now().toString(16)}-${Math.floor(Math.random() * 1_000_000_000).toString(16)}`;

  return `preset-${fallbackPart}`;
}

function ensurePresetId(value: unknown): string {
  const id = normalizeOptionalString(value);
  return id ?? generateDataExplorerPresetId();
}

function normalizePresetScope(value: unknown): DataExplorerPresetScope {
  return value === "personal" ? "personal" : DEFAULT_PRESET_SCOPE;
}

export function sanitizePresetFilters(filters: Partial<DataExplorerPresetFilters>): DataExplorerPresetFilters {
  return {
    q: typeof filters.q === "string" ? filters.q : "",
    category: typeof filters.category === "string" ? filters.category : "",
    region: typeof filters.region === "string" ? filters.region : "",
    status: typeof filters.status === "string" ? filters.status : "",
    sortBy: DATA_EXPLORER_ALLOWED_SORTS.includes(filters.sortBy ?? "updated")
      ? (filters.sortBy ?? "updated")
      : DATA_EXPLORER_DEFAULT_PRESET_FILTERS.sortBy,
    sortDir: DATA_EXPLORER_ALLOWED_DIRECTIONS.includes(filters.sortDir ?? "desc")
      ? (filters.sortDir ?? "desc")
      : DATA_EXPLORER_DEFAULT_PRESET_FILTERS.sortDir,
    pageSize:
      typeof filters.pageSize === "number" && Number.isFinite(filters.pageSize) && filters.pageSize > 0
        ? filters.pageSize
        : DATA_EXPLORER_DEFAULT_PRESET_FILTERS.pageSize,
  };
}

function filtersEqual(left: DataExplorerPresetFilters, right: DataExplorerPresetFilters) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortPresets(presets: DataExplorerPresetRecord[]): DataExplorerPresetRecord[] {
  return [...presets].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeIsoOrFallback(value: unknown, fallback: string): string {
  return isIsoTimestamp(value) ? value : fallback;
}

function normalizePresetRecord(
  value: unknown,
  fallbackTimestamp: string,
): { preset: DataExplorerPresetRecord | null; migrated: boolean } {
  const record = toRecord(value);

  if (!record) {
    return { preset: null, migrated: false };
  }

  const name = normalizeOptionalString(record.name);

  if (!name) {
    return { preset: null, migrated: false };
  }

  const filters = sanitizePresetFilters(toRecord(record.filters) ?? {});
  const id = ensurePresetId(record.id);
  const createdAt = normalizeIsoOrFallback(record.createdAt, fallbackTimestamp);
  const updatedAt = normalizeIsoOrFallback(record.updatedAt, fallbackTimestamp);
  const lastUsedAt = record.lastUsedAt === null
    ? null
    : (isIsoTimestamp(record.lastUsedAt) ? record.lastUsedAt : null);
  const useCount = asFiniteNonNegativeNumber(record.useCount, 0);
  const scope = normalizePresetScope(record.scope);
  const normalized: DataExplorerPresetRecord = {
    id,
    name,
    scope,
    filters,
    createdAt,
    updatedAt,
    lastUsedAt,
    useCount,
  };

  const migrated =
    normalizeOptionalString(record.id) !== id
    || !isIsoTimestamp(record.createdAt)
    || !isIsoTimestamp(record.updatedAt)
    || ((record.lastUsedAt !== null) && (record.lastUsedAt !== undefined) && !isIsoTimestamp(record.lastUsedAt))
    || !(typeof record.useCount === "number" && Number.isFinite(record.useCount) && record.useCount >= 0)
    || normalizePresetScope(record.scope) !== scope
    || !filtersEqual(sanitizePresetFilters(toRecord(record.filters) ?? {}), filters)
    || normalizeOptionalString(record.name) !== name;

  return {
    preset: normalized,
    migrated,
  };
}

function migrateEnvelopeV1ToV2(source: DataExplorerPresetStorageEnvelopeV1): DataExplorerPresetStorageEnvelopeV2 {
  const fallbackTimestamp = new Date().toISOString();
  const presets: DataExplorerPresetRecord[] = [];

  for (const legacyPreset of source.presets) {
    const name = normalizeOptionalString(legacyPreset.name);

    if (!name) {
      continue;
    }

    presets.push({
      id: ensurePresetId(legacyPreset.id),
      name,
      scope: DEFAULT_PRESET_SCOPE,
      filters: sanitizePresetFilters(toRecord(legacyPreset.filters) ?? {}),
      createdAt: normalizeIsoOrFallback(legacyPreset.createdAt, fallbackTimestamp),
      updatedAt: normalizeIsoOrFallback(legacyPreset.updatedAt, fallbackTimestamp),
      lastUsedAt: null,
      useCount: 0,
    });
  }

  return {
    version: DATA_EXPLORER_PRESET_SCOPELESS_SCHEMA_VERSION,
    presets: sortPresets(presets),
  };
}

function migrateEnvelopeV2ToV3(source: DataExplorerPresetStorageEnvelopeV2): DataExplorerPresetStorageEnvelopeV3 {
  return {
    version: DATA_EXPLORER_PRESET_SCHEMA_VERSION,
    presets: source.presets.map((preset) => ({
      ...preset,
      scope: DEFAULT_PRESET_SCOPE,
    })),
  };
}

function coerceVersionedEnvelope(parsed: unknown): { version: number; presets: unknown[] } | null {
  const record = toRecord(parsed);

  if (!record || !Array.isArray(record.presets)) {
    return null;
  }

  if (typeof record.version === "number" && Number.isInteger(record.version)) {
    return {
      version: record.version,
      presets: record.presets,
    };
  }

  return {
    version: DATA_EXPLORER_PRESET_LEGACY_SCHEMA_VERSION,
    presets: record.presets,
  };
}

function migrateEnvelopeToCurrent(parsed: unknown): ParseEnvelopeResult {
  const versioned = coerceVersionedEnvelope(parsed);

  if (!versioned) {
    return {
      ok: false,
      reason: "invalid_schema",
    };
  }

  if (versioned.version < DATA_EXPLORER_PRESET_LEGACY_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unsupported_version",
    };
  }

  let migrated = false;
  let currentVersion = versioned.version;
  let currentPresets = versioned.presets;

  while (currentVersion < DATA_EXPLORER_PRESET_SCHEMA_VERSION) {
    if (currentVersion === DATA_EXPLORER_PRESET_LEGACY_SCHEMA_VERSION) {
      const migratedEnvelope = migrateEnvelopeV1ToV2({
        version: DATA_EXPLORER_PRESET_LEGACY_SCHEMA_VERSION,
        presets: currentPresets as DataExplorerPresetStorageEnvelopeV1["presets"],
      });
      currentVersion = migratedEnvelope.version;
      currentPresets = migratedEnvelope.presets;
      migrated = true;
      continue;
    }

    if (currentVersion === DATA_EXPLORER_PRESET_SCOPELESS_SCHEMA_VERSION) {
      const migratedEnvelope = migrateEnvelopeV2ToV3({
        version: DATA_EXPLORER_PRESET_SCOPELESS_SCHEMA_VERSION,
        presets: currentPresets as DataExplorerPresetStorageEnvelopeV2["presets"],
      });
      currentVersion = migratedEnvelope.version;
      currentPresets = migratedEnvelope.presets;
      migrated = true;
      continue;
    }

    return {
      ok: false,
      reason: "unsupported_version",
    };
  }

  if (currentVersion !== DATA_EXPLORER_PRESET_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unsupported_version",
    };
  }

  const fallbackTimestamp = new Date().toISOString();
  let normalizedMigration = migrated;
  const presets = currentPresets
    .map((preset) => {
      const normalized = normalizePresetRecord(preset, fallbackTimestamp);
      normalizedMigration = normalizedMigration || normalized.migrated;
      return normalized.preset;
    })
    .filter((preset): preset is DataExplorerPresetRecord => preset !== null);

  return {
    ok: true,
    envelope: {
      version: DATA_EXPLORER_PRESET_SCHEMA_VERSION,
      presets: sortPresets(presets),
    },
    migrated: normalizedMigration,
  };
}

function parseStoredPresets(raw: string): ParseEnvelopeResult {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return migrateEnvelopeToCurrent(parsed);
  } catch {
    return {
      ok: false,
      reason: "corrupt_json",
    };
  }
}

function buildStorageEnvelope(presets: DataExplorerPresetRecord[]): DataExplorerPresetStorageEnvelopeV3 {
  return {
    version: DATA_EXPLORER_PRESET_SCHEMA_VERSION,
    presets,
  };
}

function serializeStorageEnvelope(envelope: DataExplorerPresetStorageEnvelopeV3): string {
  return JSON.stringify(envelope);
}

function createDataExplorerPresetStorageAdapter(
  store?: PersistenceStore | null,
): DataExplorerPresetStorageAdapter {
  const activeStore = getDefaultStore(store);

  if (!activeStore) {
    return {
      readRaw: () => ({ ok: false, reason: "storage_unavailable" }),
      writeRaw: () => ({ ok: false, reason: "storage_unavailable" }),
    };
  }

  return {
    readRaw: () => {
      try {
        return {
          ok: true,
          raw: activeStore.getItem(DATA_EXPLORER_PRESET_STORAGE_KEY),
        };
      } catch {
        return {
          ok: false,
          reason: "read_failed",
        };
      }
    },
    writeRaw: (raw: string) => {
      try {
        activeStore.setItem(DATA_EXPLORER_PRESET_STORAGE_KEY, raw);
        return { ok: true };
      } catch {
        return {
          ok: false,
          reason: "write_failed",
        };
      }
    },
  };
}

function persistPresets(
  adapter: DataExplorerPresetStorageAdapter,
  presets: DataExplorerPresetRecord[],
): { ok: true } | { ok: false; reason: DataExplorerPresetStorageWriteReason } {
  return adapter.writeRaw(
    serializeStorageEnvelope(buildStorageEnvelope(sortPresets(presets))),
  );
}

function loadPresetState(adapter: DataExplorerPresetStorageAdapter): LoadPresetStateResult {
  const readResult = adapter.readRaw();

  if (!readResult.ok) {
    logPersistence("load_failed", { reason: readResult.reason });
    return {
      presets: [],
      reason: readResult.reason,
    };
  }

  if (!readResult.raw) {
    logPersistence("load_success", { presetCount: 0, migrated: false });
    return {
      presets: [],
    };
  }

  const parsed = parseStoredPresets(readResult.raw);

  if (!parsed.ok) {
    logPersistence("load_failed", { reason: parsed.reason });
    return {
      presets: [],
      reason: parsed.reason,
    };
  }

  if (parsed.migrated) {
    const migrationWrite = persistPresets(adapter, parsed.envelope.presets);

    if (!migrationWrite.ok) {
      logPersistence("migration_write_failed", { reason: migrationWrite.reason });
    }
  }

  logPersistence("load_success", {
    presetCount: parsed.envelope.presets.length,
    migrated: parsed.migrated,
  });

  return {
    presets: parsed.envelope.presets,
  };
}

function createMutationResult(
  ok: boolean,
  presets: DataExplorerPresetRecord[],
  error?: string,
  reason?: DataExplorerPresetMutationReason,
): DataExplorerPresetMutationResult {
  return {
    ok,
    presets,
    error,
    reason,
  };
}

function selectPresetsForScope(
  presets: DataExplorerPresetRecord[],
  scope: DataExplorerPresetScope,
): DataExplorerPresetRecord[] {
  return presets.filter((preset) => normalizePresetScope(preset.scope) === scope);
}

function mergeScopedPresets(
  presets: DataExplorerPresetRecord[],
  scope: DataExplorerPresetScope,
  scopedPresets: DataExplorerPresetRecord[],
): DataExplorerPresetRecord[] {
  return sortPresets([
    ...presets.filter((preset) => normalizePresetScope(preset.scope) !== scope),
    ...scopedPresets,
  ]);
}

export function loadDataExplorerPresets(
  scope: DataExplorerPresetScope = DEFAULT_PRESET_SCOPE,
  store?: PersistenceStore | null,
): DataExplorerPresetRecord[] {
  const adapter = createDataExplorerPresetStorageAdapter(store);
  return selectPresetsForScope(loadPresetState(adapter).presets, scope);
}

export function upsertDataExplorerPreset(
  draft: DataExplorerPresetUpsertDraft,
  store?: PersistenceStore | null,
): DataExplorerPresetMutationResult {
  const adapter = createDataExplorerPresetStorageAdapter(store);
  const loaded = loadPresetState(adapter);
  const scope = normalizePresetScope(draft.scope);
  const allPresets = loaded.presets;
  const current = selectPresetsForScope(allPresets, scope);
  const name = draft.name.trim();

  if (!name) {
    return createMutationResult(false, current, "Preset name is required.", "validation");
  }

  if (loaded.reason === "storage_unavailable") {
    return createMutationResult(false, current, "Unable to save presets in this browser.", loaded.reason);
  }

  const existing = draft.id
    ? current.find((preset) => preset.id === draft.id)
    : undefined;

  if (current.some((preset) => {
    if (existing && preset.id === existing.id) {
      return false;
    }

    return preset.name.toLowerCase() === name.toLowerCase();
  })) {
    return createMutationResult(false, current, "Preset name already exists.", "duplicate_name");
  }

  const timestamp = new Date().toISOString();
  const nextPreset: DataExplorerPresetRecord = existing
    ? {
      ...existing,
      name,
      filters: sanitizePresetFilters(draft.filters),
      updatedAt: timestamp,
    }
    : {
      id: draft.id ?? generateDataExplorerPresetId(),
      name,
      scope,
      filters: sanitizePresetFilters(draft.filters),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
      useCount: 0,
    };

  const nextScopedPresets = sortPresets(existing
    ? current.map((preset) => (preset.id === existing.id ? nextPreset : preset))
    : [...current, nextPreset]);
  const nextPresets = mergeScopedPresets(allPresets, scope, nextScopedPresets);
  const writeResult = persistPresets(adapter, nextPresets);

  if (!writeResult.ok) {
    return createMutationResult(false, current, "Unable to save presets in this browser.", writeResult.reason);
  }

  logPersistence("upsert_success", {
    presetCount: nextScopedPresets.length,
    presetId: nextPreset.id,
  });

  return createMutationResult(true, nextScopedPresets);
}

export function saveDataExplorerPreset(
  draft: DataExplorerPresetDraft,
  store?: PersistenceStore | null,
): DataExplorerPresetMutationResult {
  return upsertDataExplorerPreset({
    name: draft.name,
    scope: draft.scope,
    filters: draft.filters,
  }, store);
}

export function deleteDataExplorerPresetById(
  presetId: string,
  scope: DataExplorerPresetScope = DEFAULT_PRESET_SCOPE,
  store?: PersistenceStore | null,
): DataExplorerPresetMutationResult {
  const adapter = createDataExplorerPresetStorageAdapter(store);
  const loaded = loadPresetState(adapter);
  const allPresets = loaded.presets;
  const current = selectPresetsForScope(allPresets, scope);

  if (loaded.reason === "storage_unavailable") {
    return createMutationResult(false, current, "Unable to update presets in this browser.", loaded.reason);
  }

  const exists = current.some((preset) => preset.id === presetId);

  if (!exists) {
    return createMutationResult(false, current, "Preset not found.", "not_found");
  }

  const nextScopedPresets = current.filter((preset) => preset.id !== presetId);
  const nextPresets = mergeScopedPresets(allPresets, scope, nextScopedPresets);
  const writeResult = persistPresets(adapter, nextPresets);

  if (!writeResult.ok) {
    return createMutationResult(false, current, "Unable to update presets in this browser.", writeResult.reason);
  }

  logPersistence("delete_success", {
    presetCount: nextScopedPresets.length,
    presetId,
  });

  return createMutationResult(true, nextScopedPresets);
}

export function markDataExplorerPresetUsed(
  presetId: string,
  scope: DataExplorerPresetScope = DEFAULT_PRESET_SCOPE,
  store?: PersistenceStore | null,
): DataExplorerPresetMutationResult {
  const adapter = createDataExplorerPresetStorageAdapter(store);
  const loaded = loadPresetState(adapter);
  const allPresets = loaded.presets;
  const current = selectPresetsForScope(allPresets, scope);

  if (loaded.reason === "storage_unavailable") {
    return createMutationResult(false, current, "Unable to update presets in this browser.", loaded.reason);
  }

  const target = current.find((preset) => preset.id === presetId);

  if (!target) {
    return createMutationResult(false, current, "Preset not found.", "not_found");
  }

  const timestamp = new Date().toISOString();
  const nextScopedPresets = sortPresets(current.map((preset) => (
    preset.id === presetId
      ? {
        ...preset,
        updatedAt: timestamp,
        lastUsedAt: timestamp,
        useCount: (preset.useCount ?? 0) + 1,
      }
      : preset
  )));
  const nextPresets = mergeScopedPresets(allPresets, scope, nextScopedPresets);
  const writeResult = persistPresets(adapter, nextPresets);

  if (!writeResult.ok) {
    return createMutationResult(false, current, "Unable to update presets in this browser.", writeResult.reason);
  }

  logPersistence("mark_used_success", {
    presetId,
  });

  return createMutationResult(true, nextScopedPresets);
}
