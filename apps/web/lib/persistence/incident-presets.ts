"use client";

import type {
  OperationalAlertRuleType,
  OperationalAlertStatus,
  StationAdminAuthEventType,
} from "@/lib/api/types";
import type { PersistenceStore } from "@/lib/persistence/types";

// Keep this key stable so existing browser data remains discoverable across schema upgrades.
// Versioned envelope migrations handle schema evolution rather than key renames.
export const INCIDENT_PRESET_STORAGE_KEY = "marine.incidentPresets.v1";
export const INCIDENT_PRESET_SCHEMA_VERSION = 2 as const;

const INCIDENT_PRESET_LEGACY_SCHEMA_VERSION = 1 as const;
const DEFAULT_APPLIES_TO = ["investigation", "operationalAlerts"] as const;

type IncidentPresetStorageReadReason =
  | "storage_unavailable"
  | "read_failed";

type IncidentPresetStorageWriteReason =
  | "storage_unavailable"
  | "write_failed";

type IncidentPresetParseReason =
  | "corrupt_json"
  | "invalid_schema"
  | "unsupported_version";

type IncidentPresetLoadReason =
  | IncidentPresetStorageReadReason
  | IncidentPresetParseReason;

export type IncidentPresetScope = "investigation" | "operationalAlerts";

export type IncidentPresetKind = "user" | "system";

export type IncidentPresetOrigin = "local" | "imported" | "synced" | "system";

export type IncidentPresetTimeMode = "absolute" | "relative";

export type IncidentPresetRelativeWindow = string;

export interface IncidentInvestigationPresetPayload {
  actor: string;
  ip: string;
  eventType: StationAdminAuthEventType | "";
  since: string;
  until: string;
  timeMode?: IncidentPresetTimeMode;
  relativeWindow?: IncidentPresetRelativeWindow;
}

export interface IncidentOperationalAlertsPresetPayload {
  source: string;
  status: OperationalAlertStatus | "";
  ruleType: OperationalAlertRuleType | "";
  limit: number;
}

export interface IncidentPresetPayload {
  investigation?: IncidentInvestigationPresetPayload;
  operationalAlerts?: IncidentOperationalAlertsPresetPayload;
}

export interface IncidentPresetControlSnapshot {
  actor: string;
  ip: string;
  eventType: StationAdminAuthEventType | "";
  since: string;
  until: string;
  source: string;
  status: OperationalAlertStatus | "";
  ruleType: OperationalAlertRuleType | "";
  limit: number;
}

export interface IncidentPresetRecord {
  id: string;
  name: string;
  description?: string;
  kind: IncidentPresetKind;
  readonly?: boolean;
  appliesTo: IncidentPresetScope[];
  payload: IncidentPresetPayload;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  useCount?: number;
  origin?: IncidentPresetOrigin;
}

export interface IncidentPresetDraft {
  name: string;
  description?: string;
  payload: IncidentPresetPayload;
  appliesTo?: IncidentPresetScope[];
}

export interface IncidentPresetUpsertDraft {
  id?: string;
  name: string;
  description?: string;
  payload: IncidentPresetPayload;
  appliesTo?: IncidentPresetScope[];
  kind?: IncidentPresetKind;
  readonly?: boolean;
  origin?: IncidentPresetOrigin;
}

export interface IncidentPresetMutationResult {
  ok: boolean;
  presets: IncidentPresetRecord[];
  error?: string;
  reason?: IncidentPresetLoadReason | IncidentPresetStorageWriteReason | "duplicate_name" | "validation" | "not_found";
}

interface IncidentPresetStorageEnvelopeV1 {
  version: typeof INCIDENT_PRESET_LEGACY_SCHEMA_VERSION;
  presets: Array<{
    id?: string;
    name?: string;
    filters?: unknown;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

interface IncidentPresetStorageEnvelopeV2 {
  version: typeof INCIDENT_PRESET_SCHEMA_VERSION;
  presets: IncidentPresetRecord[];
}

interface ParseEnvelopeSuccess {
  ok: true;
  envelope: IncidentPresetStorageEnvelopeV2;
  migrated: boolean;
}

interface ParseEnvelopeFailure {
  ok: false;
  reason: IncidentPresetParseReason;
}

type ParseEnvelopeResult = ParseEnvelopeSuccess | ParseEnvelopeFailure;

interface LoadPresetStateResult {
  presets: IncidentPresetRecord[];
  reason?: IncidentPresetLoadReason;
}

export interface IncidentPresetStorageAdapter {
  readRaw: () =>
    | { ok: true; raw: string | null }
    | { ok: false; reason: IncidentPresetStorageReadReason };
  writeRaw: (raw: string) =>
    | { ok: true }
    | { ok: false; reason: IncidentPresetStorageWriteReason };
}

const SHOW_DEBUG = process.env.NODE_ENV !== "production";

function logPersistence(event: string, detail?: Record<string, unknown>) {
  if (!SHOW_DEBUG) {
    return;
  }

  console.debug("[IncidentPresets]", {
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

function asSafeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFiniteNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return fallback;
}

function asFinitePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
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

function generateIncidentPresetId() {
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

function sanitizeOrigin(value: unknown): IncidentPresetOrigin {
  if (value === "local" || value === "imported" || value === "synced" || value === "system") {
    return value;
  }

  return "local";
}

function sanitizeKind(value: unknown): IncidentPresetKind {
  return value === "system" ? "system" : "user";
}

function sanitizeInvestigationPayload(value: unknown): IncidentInvestigationPresetPayload | undefined {
  const record = toRecord(value);

  if (!record) {
    return undefined;
  }

  const timeMode = record.timeMode === "relative" ? "relative" : "absolute";
  const relativeWindow = normalizeOptionalString(record.relativeWindow);

  return {
    actor: asSafeString(record.actor),
    ip: asSafeString(record.ip),
    eventType: asSafeString(record.eventType) as StationAdminAuthEventType | "",
    since: asSafeString(record.since),
    until: asSafeString(record.until),
    timeMode,
    relativeWindow: timeMode === "relative" ? relativeWindow : undefined,
  };
}

function sanitizeOperationalAlertsPayload(value: unknown): IncidentOperationalAlertsPresetPayload | undefined {
  const record = toRecord(value);

  if (!record) {
    return undefined;
  }

  return {
    source: asSafeString(record.source),
    status: asSafeString(record.status) as OperationalAlertStatus | "",
    ruleType: asSafeString(record.ruleType) as OperationalAlertRuleType | "",
    limit: asFinitePositiveNumber(record.limit, 20),
  };
}

function sanitizeIncidentPresetPayload(value: unknown): IncidentPresetPayload {
  const record = toRecord(value);

  if (!record) {
    return {};
  }

  return {
    investigation: sanitizeInvestigationPayload(record.investigation),
    operationalAlerts: sanitizeOperationalAlertsPayload(record.operationalAlerts),
  };
}

function buildPayloadFromLegacyFilters(value: unknown): IncidentPresetPayload {
  const filters = toRecord(value);

  if (!filters) {
    return {
      investigation: {
        actor: "",
        ip: "",
        eventType: "",
        since: "",
        until: "",
        timeMode: "absolute",
      },
      operationalAlerts: {
        source: "",
        status: "",
        ruleType: "",
        limit: 20,
      },
    };
  }

  return {
    investigation: {
      actor: asSafeString(filters.actor),
      ip: asSafeString(filters.ip),
      eventType: asSafeString(filters.eventType) as StationAdminAuthEventType | "",
      since: asSafeString(filters.since),
      until: asSafeString(filters.until),
      timeMode: "absolute",
    },
    operationalAlerts: {
      source: asSafeString(filters.source),
      status: asSafeString(filters.status) as OperationalAlertStatus | "",
      ruleType: asSafeString(filters.ruleType) as OperationalAlertRuleType | "",
      limit: asFinitePositiveNumber(filters.limit, 20),
    },
  };
}

function payloadEquals(left: IncidentPresetPayload, right: IncidentPresetPayload) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sanitizeAppliesTo(value: unknown, payload: IncidentPresetPayload): IncidentPresetScope[] {
  if (!Array.isArray(value)) {
    if (payload.investigation || payload.operationalAlerts) {
      return [...DEFAULT_APPLIES_TO];
    }

    return ["investigation"];
  }

  const appliesTo = value
    .filter((entry): entry is IncidentPresetScope => entry === "investigation" || entry === "operationalAlerts")
    .filter((entry, index, entries) => entries.indexOf(entry) === index);

  return appliesTo.length > 0 ? appliesTo : [...DEFAULT_APPLIES_TO];
}

function ensurePresetId(value: unknown): string {
  const id = normalizeOptionalString(value);
  return id ?? generateIncidentPresetId();
}

function normalizeIsoOrFallback(value: unknown, fallback: string): string {
  return isIsoTimestamp(value) ? value : fallback;
}

function sortIncidentPresets(presets: IncidentPresetRecord[]): IncidentPresetRecord[] {
  return [...presets].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeV2PresetRecord(
  value: unknown,
  fallbackTimestamp: string,
): { preset: IncidentPresetRecord | null; migrated: boolean } {
  const record = toRecord(value);

  if (!record) {
    return { preset: null, migrated: false };
  }

  const name = normalizeOptionalString(record.name);

  if (!name) {
    return { preset: null, migrated: false };
  }

  const sanitizedPayload = sanitizeIncidentPresetPayload(record.payload);
  const fallbackPayload = "filters" in record
    ? buildPayloadFromLegacyFilters(record.filters)
    : sanitizedPayload;
  const payload = sanitizedPayload.investigation || sanitizedPayload.operationalAlerts
    ? sanitizedPayload
    : fallbackPayload;
  const appliesTo = sanitizeAppliesTo(record.appliesTo, payload);
  const createdAt = normalizeIsoOrFallback(record.createdAt, fallbackTimestamp);
  const updatedAt = normalizeIsoOrFallback(record.updatedAt, fallbackTimestamp);
  const lastUsedAt = record.lastUsedAt === null
    ? null
    : (isIsoTimestamp(record.lastUsedAt) ? record.lastUsedAt : null);
  const useCount = asFiniteNonNegativeNumber(record.useCount, 0);
  const preset: IncidentPresetRecord = {
    id: ensurePresetId(record.id),
    name,
    description: normalizeOptionalString(record.description),
    kind: sanitizeKind(record.kind),
    readonly: typeof record.readonly === "boolean" ? record.readonly : undefined,
    appliesTo,
    payload,
    createdAt,
    updatedAt,
    lastUsedAt,
    useCount,
    origin: sanitizeOrigin(record.origin),
  };

  const migrated =
    normalizeOptionalString(record.id) !== preset.id
    || normalizeOptionalString(record.name) !== preset.name
    || normalizeOptionalString(record.description) !== preset.description
    || sanitizeKind(record.kind) !== record.kind
    || !Array.isArray(record.appliesTo)
    || !payloadEquals(sanitizeIncidentPresetPayload(record.payload), preset.payload)
    || !isIsoTimestamp(record.createdAt)
    || !isIsoTimestamp(record.updatedAt)
    || ((record.lastUsedAt !== null) && (record.lastUsedAt !== undefined) && !isIsoTimestamp(record.lastUsedAt))
    || !(typeof record.useCount === "number" && Number.isFinite(record.useCount) && record.useCount >= 0)
    || sanitizeOrigin(record.origin) !== record.origin;

  return { preset, migrated };
}

function migrateEnvelopeV1ToV2(source: IncidentPresetStorageEnvelopeV1): IncidentPresetStorageEnvelopeV2 {
  const fallbackTimestamp = new Date().toISOString();
  const presets: IncidentPresetRecord[] = [];

  for (const legacy of source.presets) {
    const name = normalizeOptionalString(legacy.name);

    if (!name) {
      continue;
    }

    presets.push({
      id: ensurePresetId(legacy.id),
      name,
      kind: "user",
      appliesTo: [...DEFAULT_APPLIES_TO],
      payload: buildPayloadFromLegacyFilters(legacy.filters),
      createdAt: normalizeIsoOrFallback(legacy.createdAt, fallbackTimestamp),
      updatedAt: normalizeIsoOrFallback(legacy.updatedAt, fallbackTimestamp),
      lastUsedAt: null,
      useCount: 0,
      origin: "local",
    });
  }

  return {
    version: INCIDENT_PRESET_SCHEMA_VERSION,
    presets: sortIncidentPresets(presets),
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
    version: INCIDENT_PRESET_LEGACY_SCHEMA_VERSION,
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

  if (versioned.version < INCIDENT_PRESET_LEGACY_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unsupported_version",
    };
  }

  let migrated = false;
  let currentVersion = versioned.version;
  let currentPresets = versioned.presets;

  while (currentVersion < INCIDENT_PRESET_SCHEMA_VERSION) {
    if (currentVersion === INCIDENT_PRESET_LEGACY_SCHEMA_VERSION) {
      const migratedEnvelope = migrateEnvelopeV1ToV2({
        version: INCIDENT_PRESET_LEGACY_SCHEMA_VERSION,
        presets: currentPresets as IncidentPresetStorageEnvelopeV1["presets"],
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

  if (currentVersion !== INCIDENT_PRESET_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: "unsupported_version",
    };
  }

  const fallbackTimestamp = new Date().toISOString();
  let normalizedMigration = migrated;
  const normalizedPresets = currentPresets
    .map((value) => {
      const normalized = normalizeV2PresetRecord(value, fallbackTimestamp);
      normalizedMigration = normalizedMigration || normalized.migrated;
      return normalized.preset;
    })
    .filter((preset): preset is IncidentPresetRecord => preset !== null);

  return {
    ok: true,
    envelope: {
      version: INCIDENT_PRESET_SCHEMA_VERSION,
      presets: sortIncidentPresets(normalizedPresets),
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

function buildStorageEnvelope(presets: IncidentPresetRecord[]): IncidentPresetStorageEnvelopeV2 {
  return {
    version: INCIDENT_PRESET_SCHEMA_VERSION,
    presets,
  };
}

function serializeStorageEnvelope(envelope: IncidentPresetStorageEnvelopeV2): string {
  return JSON.stringify(envelope);
}

export function createIncidentPresetStorageAdapter(
  store?: PersistenceStore | null,
): IncidentPresetStorageAdapter {
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
          raw: activeStore.getItem(INCIDENT_PRESET_STORAGE_KEY),
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
        activeStore.setItem(INCIDENT_PRESET_STORAGE_KEY, raw);
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
  adapter: IncidentPresetStorageAdapter,
  presets: IncidentPresetRecord[],
): { ok: true } | { ok: false; reason: IncidentPresetStorageWriteReason } {
  return adapter.writeRaw(
    serializeStorageEnvelope(buildStorageEnvelope(sortIncidentPresets(presets))),
  );
}

function loadPresetState(adapter: IncidentPresetStorageAdapter): LoadPresetStateResult {
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

export function createIncidentPresetPayloadFromControls(
  controls: IncidentPresetControlSnapshot,
): IncidentPresetPayload {
  return {
    investigation: {
      actor: controls.actor,
      ip: controls.ip,
      eventType: controls.eventType,
      since: controls.since,
      until: controls.until,
      timeMode: "absolute",
    },
    operationalAlerts: {
      source: controls.source,
      status: controls.status,
      ruleType: controls.ruleType,
      limit: controls.limit,
    },
  };
}

export function extractIncidentPresetControls(
  payload: IncidentPresetPayload,
): IncidentPresetControlSnapshot {
  const investigation = sanitizeInvestigationPayload(payload.investigation) ?? {
    actor: "",
    ip: "",
    eventType: "",
    since: "",
    until: "",
    timeMode: "absolute" as const,
  };

  const operationalAlerts = sanitizeOperationalAlertsPayload(payload.operationalAlerts) ?? {
    source: "",
    status: "",
    ruleType: "",
    limit: 20,
  };

  return {
    actor: investigation.actor,
    ip: investigation.ip,
    eventType: investigation.eventType,
    since: investigation.timeMode === "relative" ? "" : investigation.since,
    until: investigation.timeMode === "relative" ? "" : investigation.until,
    source: operationalAlerts.source,
    status: operationalAlerts.status,
    ruleType: operationalAlerts.ruleType,
    limit: operationalAlerts.limit,
  };
}

export function loadIncidentPresets(store?: PersistenceStore | null): IncidentPresetRecord[] {
  const adapter = createIncidentPresetStorageAdapter(store);
  return loadPresetState(adapter).presets;
}

export function upsertIncidentPreset(
  draft: IncidentPresetUpsertDraft,
  store?: PersistenceStore | null,
): IncidentPresetMutationResult {
  const adapter = createIncidentPresetStorageAdapter(store);
  const loaded = loadPresetState(adapter);
  const current = loaded.presets;
  const name = draft.name.trim();

  if (!name) {
    return {
      ok: false,
      presets: current,
      error: "Preset name is required.",
      reason: "validation",
    };
  }

  if (loaded.reason === "storage_unavailable") {
    return {
      ok: false,
      presets: current,
      error: "Unable to save presets in this browser.",
      reason: loaded.reason,
    };
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
    return {
      ok: false,
      presets: current,
      error: "Preset name already exists.",
      reason: "duplicate_name",
    };
  }

  const timestamp = new Date().toISOString();
  const payload = sanitizeIncidentPresetPayload(draft.payload);
  const nextPreset: IncidentPresetRecord = existing
    ? {
      ...existing,
      name,
      description: normalizeOptionalString(draft.description),
      kind: draft.kind ?? existing.kind,
      readonly: typeof draft.readonly === "boolean" ? draft.readonly : existing.readonly,
      appliesTo: draft.appliesTo ?? existing.appliesTo,
      payload,
      updatedAt: timestamp,
      origin: draft.origin ?? existing.origin,
    }
    : {
      id: draft.id ?? generateIncidentPresetId(),
      name,
      description: normalizeOptionalString(draft.description),
      kind: draft.kind ?? "user",
      readonly: typeof draft.readonly === "boolean" ? draft.readonly : undefined,
      appliesTo: draft.appliesTo ?? [...DEFAULT_APPLIES_TO],
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
      useCount: 0,
      origin: draft.origin ?? "local",
    };

  const nextPresets = sortIncidentPresets(existing
    ? current.map((preset) => (preset.id === existing.id ? nextPreset : preset))
    : [...current, nextPreset]);

  const writeResult = persistPresets(adapter, nextPresets);

  if (!writeResult.ok) {
    return {
      ok: false,
      presets: current,
      error: "Unable to save presets in this browser.",
      reason: writeResult.reason,
    };
  }

  logPersistence("upsert_success", {
    presetCount: nextPresets.length,
    presetId: nextPreset.id,
  });

  return {
    ok: true,
    presets: nextPresets,
  };
}

export function saveIncidentPreset(
  draft: IncidentPresetDraft,
  store?: PersistenceStore | null,
): IncidentPresetMutationResult {
  return upsertIncidentPreset(
    {
      name: draft.name,
      description: draft.description,
      payload: draft.payload,
      appliesTo: draft.appliesTo,
      kind: "user",
      origin: "local",
    },
    store,
  );
}

export function deleteIncidentPresetById(
  presetId: string,
  store?: PersistenceStore | null,
): IncidentPresetMutationResult {
  const adapter = createIncidentPresetStorageAdapter(store);
  const loaded = loadPresetState(adapter);
  const current = loaded.presets;

  if (loaded.reason === "storage_unavailable") {
    return {
      ok: false,
      presets: current,
      error: "Unable to update presets in this browser.",
      reason: loaded.reason,
    };
  }

  const exists = current.some((preset) => preset.id === presetId);

  if (!exists) {
    return {
      ok: false,
      presets: current,
      error: "Preset not found.",
      reason: "not_found",
    };
  }

  const nextPresets = current.filter((preset) => preset.id !== presetId);
  const writeResult = persistPresets(adapter, nextPresets);

  if (!writeResult.ok) {
    return {
      ok: false,
      presets: current,
      error: "Unable to update presets in this browser.",
      reason: writeResult.reason,
    };
  }

  logPersistence("delete_success", {
    presetCount: nextPresets.length,
    presetId,
  });

  return {
    ok: true,
    presets: nextPresets,
  };
}

export function markIncidentPresetUsed(
  presetId: string,
  store?: PersistenceStore | null,
): IncidentPresetMutationResult {
  const adapter = createIncidentPresetStorageAdapter(store);
  const loaded = loadPresetState(adapter);
  const current = loaded.presets;

  if (loaded.reason === "storage_unavailable") {
    return {
      ok: false,
      presets: current,
      error: "Unable to update presets in this browser.",
      reason: loaded.reason,
    };
  }

  const target = current.find((preset) => preset.id === presetId);

  if (!target) {
    return {
      ok: false,
      presets: current,
      error: "Preset not found.",
      reason: "not_found",
    };
  }

  const timestamp = new Date().toISOString();
  const nextPresets = sortIncidentPresets(current.map((preset) => (
    preset.id === presetId
      ? {
        ...preset,
        updatedAt: timestamp,
        lastUsedAt: timestamp,
        useCount: (preset.useCount ?? 0) + 1,
      }
      : preset
  )));
  const writeResult = persistPresets(adapter, nextPresets);

  if (!writeResult.ok) {
    return {
      ok: false,
      presets: current,
      error: "Unable to update presets in this browser.",
      reason: writeResult.reason,
    };
  }

  logPersistence("mark_used_success", {
    presetId,
  });

  return {
    ok: true,
    presets: nextPresets,
  };
}