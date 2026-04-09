import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import {
  type DataExplorerBehaviorDedupeDropSummaryExportFormat,
  type DataExplorerBehaviorDedupeDropSummaryExportHistoryItem,
  type DataExplorerBehaviorDedupeDropSummaryExportHistoryResult,
  type DataExplorerBehaviorDedupeDropSummaryItem,
  type DataExplorerBehaviorDedupeDropSummaryResult,
  type DataExplorerDedupeExportLogPayload,
  DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE,
  compareDataExplorerBehaviorDedupeDropSummaryItems,
  DATA_EXPLORER_ALLOWED_DIRECTIONS,
  DATA_EXPLORER_ALLOWED_SORTS,
  type DataExplorerBehaviorEvent,
  type DataExplorerBehaviorEventListResult,
  type DataExplorerBehaviorEventType,
  type DataExplorerBehaviorEventWriteResult,
  DATA_EXPLORER_DEFAULT_PRESET_FILTERS,
  type DataExplorerPresetAuditAction,
  type DataExplorerPresetAuditActorType,
  type DataExplorerPresetAuditEvent,
  type DataExplorerPresetAuditListResult,
  type DataExplorerPresetFilters,
  type DataExplorerPresetMutationReason,
  type DataExplorerPresetMutationResult,
  type DataExplorerPresetRecord,
  type DataExplorerPresetScope,
} from "@/lib/persistence/types";
import {
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "@/lib/server/sqlite-client";

const PRESET_TABLE_NAME = "data_explorer_presets";
const PRESET_AUDIT_TABLE_NAME = "data_explorer_preset_audit_events";
const BEHAVIOR_EVENT_TABLE_NAME = "data_explorer_behavior_events";
const BEHAVIOR_DEDUPE_DROP_TABLE_NAME = "data_explorer_behavior_dedupe_drops";
const BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME = "data_explorer_behavior_dedupe_exports";
const SHARED_SCOPE = "shared";
const PERSONAL_SCOPE = "personal";
const STORAGE_SCHEMA_VERSION = 2 as const;
const LEGACY_SCHEMA_VERSION = 1 as const;
const LEGACY_STORE_DEFAULT_PATH = resolve(process.cwd(), ".data", "data-explorer-presets.shared.json");
const DATASET_DETAIL_VIEWED_DEDUPE_WINDOW_MS = 15_000;

const DEFAULT_SCOPE: DataExplorerPresetScope = SHARED_SCOPE;

interface PresetDbRow {
  id: string;
  name: string;
  scope: string;
  filters_json: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  use_count: number | null;
}

interface PresetAuditDbRow {
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
  created_at: string;
  metadata_json: string | null;
}

interface BehaviorEventDbRow {
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

interface BehaviorDedupeDropSummaryDbRow {
  dataset_id: string;
  drop_count: number;
  most_recent_dropped_at: string;
}

interface BehaviorDedupeExportDbRow {
  scope: string;
  actor_id: string | null;
  export_format: string;
  dataset_count: number;
  created_at: string;
  id: string;
}

interface PresetStorageEnvelopeV2 {
  version: typeof STORAGE_SCHEMA_VERSION;
  presets: DataExplorerPresetRecord[];
}

interface PresetStorageEnvelopeV1 {
  version: typeof LEGACY_SCHEMA_VERSION;
  presets: Array<{
    id?: string;
    name?: string;
    filters?: unknown;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

interface UpsertSharedPresetDraft {
  id?: string;
  name: string;
  filters: Partial<DataExplorerPresetFilters>;
}

export interface DataExplorerPresetScopeContext {
  scope?: DataExplorerPresetScope;
  ownerId?: string;
  actor?: DataExplorerPresetActorContext;
}

export type DataExplorerPresetActorContext = {
  actorId: string | null;
  actorType: "station_admin" | "unknown";
};

export interface DataExplorerPresetAuditListOptions extends DataExplorerPresetScopeContext {
  presetId?: string;
  actorId?: string;
  action?: string;
  limit?: number;
}

export interface DataExplorerBehaviorEventInput extends DataExplorerPresetScopeContext {
  eventType: DataExplorerBehaviorEventType;
  actorLabel?: string;
  presetId?: string;
  presetName?: string;
  datasetId?: string;
  datasetName?: string;
  sourceContext?: Record<string, unknown>;
  createdAt?: string;
}

export interface DataExplorerBehaviorEventListOptions extends DataExplorerPresetScopeContext {
  limit?: number;
}

export interface DataExplorerBehaviorDedupeDropSummaryOptions extends DataExplorerPresetScopeContext {
  windowMinutes?: number;
  limit?: number;
}

export interface DataExplorerBehaviorDedupeExportEventInput extends DataExplorerPresetScopeContext {
  format: DataExplorerBehaviorDedupeDropSummaryExportFormat;
  windowMinutes: number;
  datasetCount: number;
  createdAt?: string;
}

export interface DataExplorerBehaviorDedupeExportHistoryOptions extends DataExplorerPresetScopeContext {
  limit?: number;
}

interface DataExplorerPresetAuditEventInput {
  presetId: string | null;
  presetName: string;
  scope: DataExplorerPresetScope;
  action: DataExplorerPresetAuditAction;
  actorId: string | null;
  actorType: DataExplorerPresetAuditActorType;
  ownerId: string | null;
  outcome: "success" | "failure";
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface DataExplorerPresetUpsertInput extends UpsertSharedPresetDraft, DataExplorerPresetScopeContext {}

interface StoreReadResult {
  ok: boolean;
  presets: DataExplorerPresetRecord[];
  reason?: DataExplorerPresetMutationReason;
}

function createPresetAuditEventId(timestamp: string): string {
  return `preset-audit-${timestamp}-${createPresetId()}`;
}

function createBehaviorEventId(timestamp: string): string {
  return `behavior-${timestamp}-${createPresetId()}`;
}

function createBehaviorDedupeDropId(timestamp: string): string {
  return `behavior-dedupe-${timestamp}-${createPresetId()}`;
}

function createBehaviorDedupeExportId(timestamp: string): string {
  return `behavior-dedupe-export-${timestamp}-${createPresetId()}`;
}

function normalizeActorContext(context?: DataExplorerPresetActorContext): DataExplorerPresetActorContext {
  if (!context) {
    return {
      actorId: null,
      actorType: "unknown",
    };
  }

  const actorId = normalizeOptionalString(context.actorId) ?? null;
  const actorType = actorId
    ? "station_admin"
    : "unknown";

  return {
    actorId,
    actorType,
  };
}

function normalizeAuditPresetName(value: string): string {
  const normalized = value.trim();
  return normalized || "(unnamed preset)";
}

function normalizeOptionalLabel(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function toFilterSummary(filters: DataExplorerPresetFilters): Record<string, unknown> {
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

function summarizeChangedFields(
  previous: DataExplorerPresetRecord,
  next: DataExplorerPresetRecord,
): string[] {
  const changedFields: string[] = [];

  if (previous.name !== next.name) {
    changedFields.push("name");
  }

  if (previous.filters.q !== next.filters.q) {
    changedFields.push("filters.q");
  }

  if (previous.filters.category !== next.filters.category) {
    changedFields.push("filters.category");
  }

  if (previous.filters.region !== next.filters.region) {
    changedFields.push("filters.region");
  }

  if (previous.filters.status !== next.filters.status) {
    changedFields.push("filters.status");
  }

  if (previous.filters.sortBy !== next.filters.sortBy) {
    changedFields.push("filters.sortBy");
  }

  if (previous.filters.sortDir !== next.filters.sortDir) {
    changedFields.push("filters.sortDir");
  }

  if (previous.filters.pageSize !== next.filters.pageSize) {
    changedFields.push("filters.pageSize");
  }

  return changedFields;
}

function toStatement(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
  return db.prepare(sql);
}

function runStatement(statement: SqliteStatementLike, ...params: unknown[]) {
  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

function allStatement<T>(statement: SqliteStatementLike, ...params: unknown[]): T[] {
  return statement.all(...params) as T[];
}

function getLegacyStorePath(): string {
  if (process.env.MARINE_SHARED_DATA_EXPLORER_PRESETS_PATH) {
    return resolve(process.env.MARINE_SHARED_DATA_EXPLORER_PRESETS_PATH);
  }

  return LEGACY_STORE_DEFAULT_PATH;
}

function sortPresets(presets: DataExplorerPresetRecord[]): DataExplorerPresetRecord[] {
  return [...presets].sort((left, right) => left.name.localeCompare(right.name));
}

function sanitizePresetFilters(filters: Partial<DataExplorerPresetFilters>): DataExplorerPresetFilters {
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

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function createPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const runtimeRequire = eval("require") as NodeRequire;
  const cryptoModule = runtimeRequire("node:crypto") as {
    randomUUID?: () => string;
  };

  if (typeof cryptoModule.randomUUID === "function") {
    return cryptoModule.randomUUID();
  }

  return `preset-${Date.now().toString(16)}-${Math.floor(Math.random() * 1_000_000_000).toString(16)}`;
}

function normalizePresetScope(value: unknown): DataExplorerPresetScope {
  return value === PERSONAL_SCOPE ? PERSONAL_SCOPE : DEFAULT_SCOPE;
}

function normalizeOwnerId(value: unknown): string | null {
  return normalizeOptionalString(value) ?? null;
}

function createScopeContext(
  context?: DataExplorerPresetScopeContext,
): { scope: DataExplorerPresetScope; ownerId: string | null; validation?: DataExplorerPresetMutationResult } {
  const scope = normalizePresetScope(context?.scope);
  const ownerId = scope === PERSONAL_SCOPE
    ? normalizeOwnerId(context?.ownerId)
    : null;

  if (scope === PERSONAL_SCOPE && !ownerId) {
    return {
      scope,
      ownerId,
      validation: {
        ok: false,
        presets: [],
        reason: "validation",
        error: "Personal preset scope requires an owner key.",
      },
    };
  }

  return { scope, ownerId };
}

function normalizePresetRecord(value: unknown, fallbackTimestamp: string): DataExplorerPresetRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = normalizeOptionalString(record.name);

  if (!name) {
    return null;
  }

  return {
    id: normalizeOptionalString(record.id) ?? createPresetId(),
    name,
    scope: normalizePresetScope(record.scope),
    filters: sanitizePresetFilters((record.filters as Partial<DataExplorerPresetFilters>) ?? {}),
    createdAt: isIsoTimestamp(record.createdAt) ? record.createdAt : fallbackTimestamp,
    updatedAt: isIsoTimestamp(record.updatedAt) ? record.updatedAt : fallbackTimestamp,
    lastUsedAt: record.lastUsedAt === null
      ? null
      : (isIsoTimestamp(record.lastUsedAt) ? record.lastUsedAt : null),
    useCount:
      typeof record.useCount === "number" && Number.isFinite(record.useCount) && record.useCount >= 0
        ? Math.floor(record.useCount)
        : 0,
  };
}

function dedupePresetsByName(presets: DataExplorerPresetRecord[]): DataExplorerPresetRecord[] {
  const selected = new Map<string, DataExplorerPresetRecord>();

  for (const preset of presets) {
    const key = preset.name.toLowerCase();
    const existing = selected.get(key);

    if (!existing || preset.updatedAt > existing.updatedAt) {
      selected.set(key, preset);
    }
  }

  return [...selected.values()];
}

function migrateEnvelopeToCurrent(parsed: unknown): PresetStorageEnvelopeV2 | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const rawPresets = Array.isArray(record.presets) ? record.presets : null;

  if (!rawPresets) {
    return null;
  }

  const version = typeof record.version === "number"
    ? record.version
    : LEGACY_SCHEMA_VERSION;

  if (version !== LEGACY_SCHEMA_VERSION && version !== STORAGE_SCHEMA_VERSION) {
    return null;
  }

  const fallbackTimestamp = new Date().toISOString();
  const sourcePresets = version === LEGACY_SCHEMA_VERSION
    ? (record as unknown as PresetStorageEnvelopeV1).presets
    : (record as unknown as PresetStorageEnvelopeV2).presets;

  const normalizedPresets = sourcePresets
    .map((preset) => normalizePresetRecord(preset, fallbackTimestamp))
    .filter((preset): preset is DataExplorerPresetRecord => preset !== null);

  return {
    version: STORAGE_SCHEMA_VERSION,
    presets: sortPresets(dedupePresetsByName(normalizedPresets)),
  };
}

function readLegacyStore(): StoreReadResult {
  const path = getLegacyStorePath();

  try {
    if (!existsSync(path)) {
      return {
        ok: true,
        presets: [],
      };
    }

    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateEnvelopeToCurrent(parsed);

    if (!migrated) {
      return {
        ok: false,
        presets: [],
        reason: "invalid_schema",
      };
    }

    return {
      ok: true,
      presets: migrated.presets,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        presets: [],
        reason: "corrupt_json",
      };
    }

    return {
      ok: false,
      presets: [],
      reason: "read_failed",
    };
  }
}

function ensureDatabaseDirectory(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function ensurePresetTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS ${PRESET_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'shared',
        owner_id TEXT,
        filters_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        use_count INTEGER NOT NULL DEFAULT 0
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `DROP INDEX IF EXISTS idx_${PRESET_TABLE_NAME}_scope_name_ci`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_${PRESET_TABLE_NAME}_scope_name_ci
       ON ${PRESET_TABLE_NAME} (scope, COALESCE(owner_id, ''), LOWER(name))`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_TABLE_NAME}_scope_last_used
       ON ${PRESET_TABLE_NAME} (scope, owner_id, last_used_at DESC, use_count DESC)`,
    ),
  );
}

function ensurePresetAuditTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS ${PRESET_AUDIT_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        preset_id TEXT,
        preset_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT NOT NULL,
        owner_id TEXT,
        outcome TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        metadata_json TEXT
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_AUDIT_TABLE_NAME}_preset_time
       ON ${PRESET_AUDIT_TABLE_NAME} (preset_id, created_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_AUDIT_TABLE_NAME}_scope_time
       ON ${PRESET_AUDIT_TABLE_NAME} (scope, owner_id, created_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_AUDIT_TABLE_NAME}_actor_time
       ON ${PRESET_AUDIT_TABLE_NAME} (actor_id, created_at DESC)`,
    ),
  );
}

function ensureBehaviorEventTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS ${BEHAVIOR_EVENT_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        scope TEXT NOT NULL,
        actor_id TEXT,
        actor_label TEXT,
        owner_id TEXT,
        preset_id TEXT,
        preset_name TEXT,
        dataset_id TEXT,
        dataset_name TEXT,
        created_at TEXT NOT NULL,
        source_context_json TEXT
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${BEHAVIOR_EVENT_TABLE_NAME}_scope_time
       ON ${BEHAVIOR_EVENT_TABLE_NAME} (scope, owner_id, created_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${BEHAVIOR_EVENT_TABLE_NAME}_actor_time
       ON ${BEHAVIOR_EVENT_TABLE_NAME} (actor_id, created_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${BEHAVIOR_EVENT_TABLE_NAME}_event_time
       ON ${BEHAVIOR_EVENT_TABLE_NAME} (event_type, created_at DESC)`,
    ),
  );
}

function ensureBehaviorDedupeDropTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS ${BEHAVIOR_DEDUPE_DROP_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        scope TEXT NOT NULL,
        owner_id TEXT,
        actor_id TEXT,
        dataset_id TEXT,
        dropped_at TEXT NOT NULL,
        dedupe_window_ms INTEGER NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${BEHAVIOR_DEDUPE_DROP_TABLE_NAME}_event_time
       ON ${BEHAVIOR_DEDUPE_DROP_TABLE_NAME} (event_type, scope, dropped_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${BEHAVIOR_DEDUPE_DROP_TABLE_NAME}_dataset_time
       ON ${BEHAVIOR_DEDUPE_DROP_TABLE_NAME} (dataset_id, dropped_at DESC)`,
    ),
  );
}

function ensureBehaviorDedupeExportTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS ${BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        owner_id TEXT,
        actor_id TEXT,
        export_format TEXT NOT NULL,
        window_minutes INTEGER NOT NULL,
        dataset_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME}_scope_time
       ON ${BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME} (scope, owner_id, created_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME}_actor_time
       ON ${BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME} (actor_id, created_at DESC)`,
    ),
  );
}

function appendPresetAuditEvent(
  db: SqliteDatabaseLike,
  event: DataExplorerPresetAuditEventInput,
) {
  try {
    ensurePresetAuditTable(db);
    const timestamp = event.createdAt ?? new Date().toISOString();
    const metadataJson = event.metadata ? JSON.stringify(event.metadata) : null;

    runStatement(
      toStatement(
        db,
        `INSERT INTO ${PRESET_AUDIT_TABLE_NAME} (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      createPresetAuditEventId(timestamp),
      event.presetId,
      normalizeAuditPresetName(event.presetName),
      event.scope,
      event.action,
      event.actorId,
      event.actorType,
      event.ownerId,
      event.outcome,
      event.reason ?? null,
      timestamp,
      metadataJson,
    );
  } catch {
    // Audit writes are best-effort and must not block user mutations.
  }
}

function openPresetDatabase(): SqliteDatabaseLike {
  const path = resolveDatabasePath();
  ensureDatabaseDirectory(path);
  return openWritableDatabase(path);
}

function normalizePresetRow(row: PresetDbRow): DataExplorerPresetRecord | null {
  let parsedFilters: unknown;

  try {
    parsedFilters = JSON.parse(row.filters_json);
  } catch {
    return null;
  }

  return normalizePresetRecord(
    {
      id: row.id,
      name: row.name,
      scope: row.scope,
      filters: parsedFilters,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      useCount: row.use_count,
    },
    new Date().toISOString(),
  );
}

function readPresetsFromDatabase(
  db: SqliteDatabaseLike,
  context: { scope: DataExplorerPresetScope; ownerId: string | null },
): DataExplorerPresetRecord[] {
  const scopeSql = context.ownerId === null
    ? `scope = ? AND owner_id IS NULL`
    : `scope = ? AND owner_id = ?`;
  const scopeParams = context.ownerId === null
    ? [context.scope]
    : [context.scope, context.ownerId];
  const rows = allStatement<PresetDbRow>(
    toStatement(
      db,
      `SELECT id, name, scope, filters_json, created_at, updated_at, last_used_at, use_count
       FROM ${PRESET_TABLE_NAME}
       WHERE ${scopeSql}
       ORDER BY LOWER(name) ASC, created_at ASC`,
    ),
    ...scopeParams,
  );

  return sortPresets(
    rows
      .map((row) => normalizePresetRow(row))
      .filter((preset): preset is DataExplorerPresetRecord => preset !== null),
  );
}

function parseAuditMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function parseBehaviorSourceContext(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isPresetAuditAction(value: string): value is DataExplorerPresetAuditAction {
  return value === "created"
    || value === "updated"
    || value === "deleted"
    || value === "marked_used";
}

function isPresetAuditActorType(value: string): value is DataExplorerPresetAuditActorType {
  return value === "station_admin" || value === "unknown";
}

function isBehaviorEventType(value: string): value is DataExplorerBehaviorEventType {
  return value === "preset_applied"
    || value === "dataset_selected"
    || value === "dataset_detail_viewed";
}

function normalizeAuditEventRow(row: PresetAuditDbRow): DataExplorerPresetAuditEvent | null {
  if (!isPresetAuditAction(row.action)) {
    return null;
  }

  if (!isPresetAuditActorType(row.actor_type)) {
    return null;
  }

  if (row.outcome !== "success" && row.outcome !== "failure") {
    return null;
  }

  return {
    id: row.id,
    presetId: row.preset_id,
    presetName: row.preset_name,
    scope: normalizePresetScope(row.scope),
    action: row.action,
    actorId: row.actor_id,
    actorType: row.actor_type,
    ownerId: row.owner_id,
    outcome: row.outcome,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
    metadata: parseAuditMetadata(row.metadata_json),
  };
}

function sanitizeAuditLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 25;
  }

  const normalized = Math.floor(limit);

  if (normalized <= 0) {
    return 25;
  }

  return Math.min(normalized, 100);
}

function normalizeBehaviorEventRow(row: BehaviorEventDbRow): DataExplorerBehaviorEvent | null {
  if (!isBehaviorEventType(row.event_type)) {
    return null;
  }

  return {
    id: row.id,
    eventType: row.event_type,
    scope: normalizePresetScope(row.scope),
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    ownerId: row.owner_id,
    presetId: row.preset_id,
    presetName: row.preset_name,
    datasetId: row.dataset_id,
    datasetName: row.dataset_name,
    createdAt: row.created_at,
    sourceContext: parseBehaviorSourceContext(row.source_context_json),
  };
}

function migrateLegacyStoreIfNeeded(db: SqliteDatabaseLike): { ok: boolean; reason?: DataExplorerPresetMutationReason } {
  const countRows = allStatement<Array<{ total: number }> extends never ? never : { total: number }>(
    toStatement(db, `SELECT COUNT(*) AS total FROM ${PRESET_TABLE_NAME} WHERE scope = ? AND owner_id IS NULL`),
    SHARED_SCOPE,
  );

  if ((countRows[0]?.total ?? 0) > 0) {
    return { ok: true };
  }

  const legacyStore = readLegacyStore();

  if (!legacyStore.ok) {
    return {
      ok: false,
      reason: legacyStore.reason,
    };
  }

  if (legacyStore.presets.length === 0) {
    return { ok: true };
  }

  const insertStatement = toStatement(
    db,
    `INSERT OR REPLACE INTO ${PRESET_TABLE_NAME} (
      id,
      name,
      scope,
      owner_id,
      filters_json,
      created_at,
      updated_at,
      last_used_at,
      use_count
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  );

  for (const preset of dedupePresetsByName(legacyStore.presets)) {
    runStatement(
      insertStatement,
      preset.id,
      preset.name,
      SHARED_SCOPE,
      JSON.stringify(sanitizePresetFilters(preset.filters)),
      preset.createdAt,
      preset.updatedAt,
      preset.lastUsedAt ?? null,
      Math.max(0, Math.floor(preset.useCount ?? 0)),
    );
  }

  return { ok: true };
}

function createResult(
  ok: boolean,
  presets: DataExplorerPresetRecord[],
  reason?: DataExplorerPresetMutationReason,
  error?: string,
): DataExplorerPresetMutationResult {
  return {
    ok,
    presets,
    reason,
    error,
  };
}

function createAuditResult(
  ok: boolean,
  events: DataExplorerPresetAuditEvent[],
  reason?: DataExplorerPresetMutationReason,
  error?: string,
): DataExplorerPresetAuditListResult {
  return {
    ok,
    events,
    reason,
    error,
  };
}

function createBehaviorWriteResult(
  ok: boolean,
  reason?: DataExplorerPresetMutationReason,
  error?: string,
): DataExplorerBehaviorEventWriteResult {
  return {
    ok,
    reason,
    error,
  };
}

function createBehaviorListResult(
  ok: boolean,
  events: DataExplorerBehaviorEvent[],
  reason?: DataExplorerPresetMutationReason,
  error?: string,
): DataExplorerBehaviorEventListResult {
  return {
    ok,
    events,
    reason,
    error,
  };
}

function createBehaviorDedupeDropSummaryResult(
  ok: boolean,
  summary: DataExplorerBehaviorDedupeDropSummaryItem[],
  windowMinutes: number,
  reason?: DataExplorerPresetMutationReason,
  error?: string,
): DataExplorerBehaviorDedupeDropSummaryResult {
  return {
    ok,
    summary,
    windowMinutes,
    reason,
    error,
  };
}

function createBehaviorDedupeExportHistoryResult(
  ok: boolean,
  history: DataExplorerBehaviorDedupeDropSummaryExportHistoryItem[],
  reason?: DataExplorerPresetMutationReason,
  error?: string,
): DataExplorerBehaviorDedupeDropSummaryExportHistoryResult {
  return {
    ok,
    history,
    reason,
    error,
  };
}

function logDataExplorerDedupeExport(payload: Omit<DataExplorerDedupeExportLogPayload, "layer">) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE, {
    layer: "repository",
    ...payload,
  } satisfies DataExplorerDedupeExportLogPayload);
}

function normalizeDedupeSummaryWindowMinutes(value: number | undefined): { ok: true; value: number } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: 60 };
  }

  if (!Number.isFinite(value)) {
    return { ok: false };
  }

  const normalized = Math.floor(value);

  if (normalized <= 0) {
    return { ok: false };
  }

  return {
    ok: true,
    value: Math.min(normalized, 24 * 60),
  };
}

function normalizeDedupeSummaryLimit(value: number | undefined): { ok: true; value: number } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: 5 };
  }

  if (!Number.isFinite(value)) {
    return { ok: false };
  }

  const normalized = Math.floor(value);

  if (normalized <= 0) {
    return { ok: false };
  }

  return {
    ok: true,
    value: Math.min(normalized, 20),
  };
}

function isBehaviorDedupeExportFormat(value: string): value is DataExplorerBehaviorDedupeDropSummaryExportFormat {
  return value === "json" || value === "csv";
}

function normalizeDedupeExportHistoryLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 5;
  }

  const normalized = Math.floor(value);

  if (normalized <= 0) {
    return 5;
  }

  return Math.min(normalized, 10);
}

function normalizeBehaviorDedupeExportRow(
  row: BehaviorDedupeExportDbRow,
): DataExplorerBehaviorDedupeDropSummaryExportHistoryItem | null {
  if (!isBehaviorDedupeExportFormat(row.export_format)) {
    return null;
  }

  return {
    exportedAt: row.created_at,
    format: row.export_format,
    scope: normalizePresetScope(row.scope),
    totalDatasets: Math.max(0, Math.floor(row.dataset_count)),
    actorId: row.actor_id,
  };
}

function shouldDedupeBehaviorEvent(
  db: SqliteDatabaseLike,
  input: {
    eventType: DataExplorerBehaviorEventType;
    scope: DataExplorerPresetScope;
    ownerId: string | null;
    actorId: string | null;
    datasetId: string | null;
    createdAt: string;
  },
): boolean {
  if (input.eventType !== "dataset_detail_viewed") {
    return false;
  }

  if (!input.datasetId) {
    return false;
  }

  const createdAtMs = Date.parse(input.createdAt);

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  const windowStart = new Date(createdAtMs - DATASET_DETAIL_VIEWED_DEDUPE_WINDOW_MS).toISOString();
  const where: string[] = [
    "event_type = ?",
    "scope = ?",
    "dataset_id = ?",
    "created_at >= ?",
  ];
  const params: unknown[] = [
    input.eventType,
    input.scope,
    input.datasetId,
    windowStart,
  ];

  if (input.ownerId === null) {
    where.push("owner_id IS NULL");
  } else {
    where.push("owner_id = ?");
    params.push(input.ownerId);
  }

  if (input.actorId === null) {
    where.push("actor_id IS NULL");
  } else {
    where.push("actor_id = ?");
    params.push(input.actorId);
  }

  const matches = allStatement<{ id: string }>(
    toStatement(
      db,
      `SELECT id
       FROM ${BEHAVIOR_EVENT_TABLE_NAME}
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT 1`,
    ),
    ...params,
  );

  return matches.length > 0;
}

function appendBehaviorDedupeDropMarker(
  db: SqliteDatabaseLike,
  input: {
    eventType: DataExplorerBehaviorEventType;
    scope: DataExplorerPresetScope;
    ownerId: string | null;
    actorId: string | null;
    datasetId: string;
    droppedAt: string;
  },
) {
  try {
    ensureBehaviorDedupeDropTable(db);

    runStatement(
      toStatement(
        db,
        `INSERT INTO ${BEHAVIOR_DEDUPE_DROP_TABLE_NAME} (
          id,
          event_type,
          scope,
          owner_id,
          actor_id,
          dataset_id,
          dropped_at,
          dedupe_window_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
      ),
      createBehaviorDedupeDropId(input.droppedAt),
      input.eventType,
      input.scope,
      input.ownerId,
      input.actorId,
      input.datasetId,
      input.droppedAt,
      DATASET_DETAIL_VIEWED_DEDUPE_WINDOW_MS,
    );
  } catch {
    // Dedupe observability writes are best-effort and must not block event ingestion.
  }
}

export function appendDataExplorerBehaviorDedupeExportEvent(
  input: DataExplorerBehaviorDedupeExportEventInput,
): DataExplorerBehaviorEventWriteResult {
  const scopeContext = createScopeContext(input);
  const actorContext = normalizeActorContext(input.actor);

  if (scopeContext.validation) {
    logDataExplorerDedupeExport({
      event: "failure",
      scope: input.scope,
      format: input.format,
      windowMinutes: input.windowMinutes,
      reason: scopeContext.validation.reason,
      error: scopeContext.validation.error,
    });
    return createBehaviorWriteResult(false, scopeContext.validation.reason, scopeContext.validation.error);
  }

  if (!isBehaviorDedupeExportFormat(input.format)) {
    logDataExplorerDedupeExport({
      event: "failure",
      scope: scopeContext.scope,
      format: "json",
      windowMinutes: input.windowMinutes,
      reason: "validation",
      error: "Export format is not supported.",
    });
    return createBehaviorWriteResult(false, "validation", "Export format is not supported.");
  }

  if (!Number.isFinite(input.windowMinutes) || Math.floor(input.windowMinutes) <= 0) {
    logDataExplorerDedupeExport({
      event: "failure",
      scope: scopeContext.scope,
      format: input.format,
      windowMinutes: input.windowMinutes,
      reason: "validation",
      error: "Window minutes must be a positive number.",
    });
    return createBehaviorWriteResult(false, "validation", "Window minutes must be a positive number.");
  }

  if (!Number.isFinite(input.datasetCount) || Math.floor(input.datasetCount) < 0) {
    logDataExplorerDedupeExport({
      event: "failure",
      scope: scopeContext.scope,
      format: input.format,
      windowMinutes: input.windowMinutes,
      datasetCount: input.datasetCount,
      reason: "validation",
      error: "Dataset count must be zero or greater.",
    });
    return createBehaviorWriteResult(false, "validation", "Dataset count must be zero or greater.");
  }

  const timestamp = input.createdAt ?? new Date().toISOString();

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensureBehaviorDedupeExportTable(db);

    runStatement(
      toStatement(
        db,
        `INSERT INTO ${BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME} (
          id,
          scope,
          owner_id,
          actor_id,
          export_format,
          window_minutes,
          dataset_count,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      createBehaviorDedupeExportId(timestamp),
      scopeContext.scope,
      scopeContext.ownerId,
      actorContext.actorId,
      input.format,
      Math.floor(input.windowMinutes),
      Math.max(0, Math.floor(input.datasetCount)),
      timestamp,
    );

    logDataExplorerDedupeExport({
      event: "success",
      scope: scopeContext.scope,
      format: input.format,
      windowMinutes: Math.floor(input.windowMinutes),
      datasetCount: Math.max(0, Math.floor(input.datasetCount)),
    });

    return createBehaviorWriteResult(true);
  } catch {
    logDataExplorerDedupeExport({
      event: "failure",
      scope: scopeContext.scope,
      format: input.format,
      windowMinutes: input.windowMinutes,
      datasetCount: input.datasetCount,
      reason: "write_failed",
      error: "Data Explorer dedupe export audit unavailable.",
    });
    return createBehaviorWriteResult(false, "write_failed", "Data Explorer dedupe export audit unavailable.");
  } finally {
    db?.close();
  }
}

export function listDataExplorerBehaviorDedupeExportHistory(
  options: DataExplorerBehaviorDedupeExportHistoryOptions = {},
): DataExplorerBehaviorDedupeDropSummaryExportHistoryResult {
  const hasScopeFilter = options.scope !== undefined;
  const scopeContext = hasScopeFilter
    ? createScopeContext(options)
    : { scope: SHARED_SCOPE as DataExplorerPresetScope, ownerId: null as string | null };

  if (hasScopeFilter && scopeContext.validation) {
    logDataExplorerDedupeExport({
      event: "failure",
      scope: options.scope,
      reason: scopeContext.validation.reason,
      error: scopeContext.validation.error,
      limit: options.limit,
    });
    return createBehaviorDedupeExportHistoryResult(
      false,
      [],
      scopeContext.validation.reason,
      scopeContext.validation.error,
    );
  }

  const limit = normalizeDedupeExportHistoryLimit(options.limit);
  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensureBehaviorDedupeExportTable(db);

    const where: string[] = [];
    const params: unknown[] = [];

    if (hasScopeFilter) {
      if (scopeContext.ownerId === null) {
        where.push("scope = ? AND owner_id IS NULL");
        params.push(scopeContext.scope);
      } else {
        where.push("scope = ? AND owner_id = ?");
        params.push(scopeContext.scope, scopeContext.ownerId);
      }
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = allStatement<BehaviorDedupeExportDbRow>(
      toStatement(
        db,
        `SELECT
           scope,
           actor_id,
           export_format,
           dataset_count,
           created_at,
           id
         FROM ${BEHAVIOR_DEDUPE_EXPORT_TABLE_NAME}
         ${whereSql}
         ORDER BY created_at DESC, export_format ASC, id ASC
         LIMIT ?`,
      ),
      ...params,
      limit,
    );

    const history = rows
      .map((row) => normalizeBehaviorDedupeExportRow(row))
      .filter((entry): entry is DataExplorerBehaviorDedupeDropSummaryExportHistoryItem => entry !== null);

    logDataExplorerDedupeExport({
      event: history.length === 0 ? "empty" : "success",
      scope: hasScopeFilter ? scopeContext.scope : undefined,
      limit,
      datasetCount: history.length,
    });

    return createBehaviorDedupeExportHistoryResult(
      true,
      history,
    );
  } catch {
    logDataExplorerDedupeExport({
      event: "failure",
      scope: hasScopeFilter ? scopeContext.scope : undefined,
      limit,
      reason: "read_failed",
      error: "Data Explorer dedupe export history unavailable.",
    });
    return createBehaviorDedupeExportHistoryResult(
      false,
      [],
      "read_failed",
      "Data Explorer dedupe export history unavailable.",
    );
  } finally {
    db?.close();
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export function loadDataExplorerPresets(context?: DataExplorerPresetScopeContext): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(context);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch {
    return createResult(false, [], "read_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function listPresetAuditEvents(
  options: DataExplorerPresetAuditListOptions = {},
): DataExplorerPresetAuditListResult {
  const hasScopeFilter = options.scope !== undefined;
  const scopeContext = hasScopeFilter
    ? createScopeContext(options)
    : { scope: SHARED_SCOPE as DataExplorerPresetScope, ownerId: null as string | null };

  if (hasScopeFilter && scopeContext.validation) {
    return createAuditResult(false, [], scopeContext.validation.reason, scopeContext.validation.error);
  }

  if (options.presetId !== undefined && !normalizeOptionalString(options.presetId)) {
    return createAuditResult(false, [], "validation", "Preset id filter must be a non-empty string.");
  }

  if (options.actorId !== undefined && !normalizeOptionalString(options.actorId)) {
    return createAuditResult(false, [], "validation", "Actor id filter must be a non-empty string.");
  }

  if (options.action !== undefined && !normalizeOptionalString(options.action)) {
    return createAuditResult(false, [], "validation", "Action filter must be a non-empty string.");
  }

  const presetId = normalizeOptionalString(options.presetId);
  const actorId = normalizeOptionalString(options.actorId);
  const action = normalizeOptionalString(options.action);

  if (action && !isPresetAuditAction(action)) {
    return createAuditResult(false, [], "validation", "Action filter is not supported.");
  }

  const limit = sanitizeAuditLimit(options.limit);

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetAuditTable(db);

    const where: string[] = [];
    const params: unknown[] = [];

    if (hasScopeFilter) {
      if (scopeContext.ownerId === null) {
        where.push("scope = ? AND owner_id IS NULL");
        params.push(scopeContext.scope);
      } else {
        where.push("scope = ? AND owner_id = ?");
        params.push(scopeContext.scope, scopeContext.ownerId);
      }
    }

    if (presetId) {
      where.push("preset_id = ?");
      params.push(presetId);
    }

    if (actorId) {
      where.push("actor_id = ?");
      params.push(actorId);
    }

    if (action) {
      where.push("action = ?");
      params.push(action);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = allStatement<PresetAuditDbRow>(
      toStatement(
        db,
        `SELECT
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
         FROM ${PRESET_AUDIT_TABLE_NAME}
         ${whereSql}
         ORDER BY created_at DESC, id ASC
         LIMIT ?`,
      ),
      ...params,
      limit,
    );

    return createAuditResult(
      true,
      rows
        .map((row) => normalizeAuditEventRow(row))
        .filter((event): event is DataExplorerPresetAuditEvent => event !== null),
    );
  } catch {
    return createAuditResult(false, [], "read_failed", "Preset audit history unavailable.");
  } finally {
    db?.close();
  }
}

export function appendDataExplorerBehaviorEvent(
  input: DataExplorerBehaviorEventInput,
): DataExplorerBehaviorEventWriteResult {
  const scopeContext = createScopeContext(input);
  const actorContext = normalizeActorContext(input.actor);

  if (scopeContext.validation) {
    return createBehaviorWriteResult(false, scopeContext.validation.reason, scopeContext.validation.error);
  }

  if (!isBehaviorEventType(input.eventType)) {
    return createBehaviorWriteResult(false, "validation", "Behavior event type is not supported.");
  }

  const timestamp = input.createdAt ?? new Date().toISOString();
  const presetId = normalizeOptionalLabel(input.presetId);
  const presetName = normalizeOptionalLabel(input.presetName);
  const datasetId = normalizeOptionalLabel(input.datasetId);
  const datasetName = normalizeOptionalLabel(input.datasetName);
  const actorLabel = normalizeOptionalLabel(input.actorLabel)
    ?? actorContext.actorId
    ?? (actorContext.actorType === "unknown" ? "Unknown actor" : "Station admin");
  const sourceContextJson = input.sourceContext ? JSON.stringify(input.sourceContext) : null;

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensureBehaviorEventTable(db);

    const shouldDedupe = datasetId !== null && shouldDedupeBehaviorEvent(db, {
      eventType: input.eventType,
      scope: scopeContext.scope,
      ownerId: scopeContext.ownerId,
      actorId: actorContext.actorId,
      datasetId,
      createdAt: timestamp,
    });

    if (shouldDedupe) {
      appendBehaviorDedupeDropMarker(db, {
        eventType: input.eventType,
        scope: scopeContext.scope,
        ownerId: scopeContext.ownerId,
        actorId: actorContext.actorId,
        datasetId,
        droppedAt: timestamp,
      });
      return createBehaviorWriteResult(true);
    }

    runStatement(
      toStatement(
        db,
        `INSERT INTO ${BEHAVIOR_EVENT_TABLE_NAME} (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      createBehaviorEventId(timestamp),
      input.eventType,
      scopeContext.scope,
      actorContext.actorId,
      actorLabel,
      scopeContext.ownerId,
      presetId,
      presetName,
      datasetId,
      datasetName,
      timestamp,
      sourceContextJson,
    );

    return createBehaviorWriteResult(true);
  } catch {
    return createBehaviorWriteResult(false, "write_failed", "Data Explorer behavior audit unavailable.");
  } finally {
    db?.close();
  }
}

export function listDataExplorerBehaviorEvents(
  options: DataExplorerBehaviorEventListOptions = {},
): DataExplorerBehaviorEventListResult {
  const hasScopeFilter = options.scope !== undefined;
  const scopeContext = hasScopeFilter
    ? createScopeContext(options)
    : { scope: SHARED_SCOPE as DataExplorerPresetScope, ownerId: null as string | null };

  if (hasScopeFilter && scopeContext.validation) {
    return createBehaviorListResult(false, [], scopeContext.validation.reason, scopeContext.validation.error);
  }

  const limit = sanitizeAuditLimit(options.limit);
  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensureBehaviorEventTable(db);

    const where: string[] = [];
    const params: unknown[] = [];

    if (hasScopeFilter) {
      if (scopeContext.ownerId === null) {
        where.push("scope = ? AND owner_id IS NULL");
        params.push(scopeContext.scope);
      } else {
        where.push("scope = ? AND owner_id = ?");
        params.push(scopeContext.scope, scopeContext.ownerId);
      }
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = allStatement<BehaviorEventDbRow>(
      toStatement(
        db,
        `SELECT
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
         FROM ${BEHAVIOR_EVENT_TABLE_NAME}
         ${whereSql}
         ORDER BY created_at DESC, id ASC
         LIMIT ?`,
      ),
      ...params,
      limit,
    );

    return createBehaviorListResult(
      true,
      rows
        .map((row) => normalizeBehaviorEventRow(row))
        .filter((event): event is DataExplorerBehaviorEvent => event !== null),
    );
  } catch {
    return createBehaviorListResult(false, [], "read_failed", "Data Explorer behavior audit unavailable.");
  } finally {
    db?.close();
  }
}

export function listDataExplorerBehaviorDedupeDropSummary(
  options: DataExplorerBehaviorDedupeDropSummaryOptions = {},
): DataExplorerBehaviorDedupeDropSummaryResult {
  const hasScopeFilter = options.scope !== undefined;
  const scopeContext = hasScopeFilter
    ? createScopeContext(options)
    : { scope: SHARED_SCOPE as DataExplorerPresetScope, ownerId: null as string | null };

  if (hasScopeFilter && scopeContext.validation) {
    return createBehaviorDedupeDropSummaryResult(
      false,
      [],
      60,
      scopeContext.validation.reason,
      scopeContext.validation.error,
    );
  }

  const normalizedWindow = normalizeDedupeSummaryWindowMinutes(options.windowMinutes);

  if (!normalizedWindow.ok) {
    return createBehaviorDedupeDropSummaryResult(
      false,
      [],
      60,
      "validation",
      "Window minutes must be a positive number.",
    );
  }

  const normalizedLimit = normalizeDedupeSummaryLimit(options.limit);

  if (!normalizedLimit.ok) {
    return createBehaviorDedupeDropSummaryResult(
      false,
      [],
      normalizedWindow.value,
      "validation",
      "Limit must be a positive number.",
    );
  }

  const windowMinutes = normalizedWindow.value;
  const limit = normalizedLimit.value;
  const windowStart = new Date(Date.now() - (windowMinutes * 60_000)).toISOString();

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensureBehaviorDedupeDropTable(db);

    const where: string[] = [
      "event_type = ?",
      "dropped_at >= ?",
      "dataset_id IS NOT NULL",
    ];
    const params: unknown[] = [
      "dataset_detail_viewed",
      windowStart,
    ];

    if (hasScopeFilter) {
      if (scopeContext.ownerId === null) {
        where.push("scope = ? AND owner_id IS NULL");
        params.push(scopeContext.scope);
      } else {
        where.push("scope = ? AND owner_id = ?");
        params.push(scopeContext.scope, scopeContext.ownerId);
      }
    }

    const rows = allStatement<BehaviorDedupeDropSummaryDbRow>(
      toStatement(
        db,
        `SELECT
           dataset_id,
           COUNT(*) AS drop_count,
           MAX(dropped_at) AS most_recent_dropped_at
         FROM ${BEHAVIOR_DEDUPE_DROP_TABLE_NAME}
         WHERE ${where.join(" AND ")}
         GROUP BY dataset_id
        ORDER BY drop_count DESC, dataset_id ASC
         LIMIT ?`,
      ),
      ...params,
      limit,
    );

    const summary = rows
      .map((row) => ({
        datasetId: row.dataset_id,
        dropCount: Math.max(0, Math.floor(row.drop_count)),
        mostRecentDroppedAt: row.most_recent_dropped_at,
      }))
      .sort(compareDataExplorerBehaviorDedupeDropSummaryItems)
      .slice(0, limit);

    return createBehaviorDedupeDropSummaryResult(
      true,
      summary,
      windowMinutes,
    );
  } catch {
    return createBehaviorDedupeDropSummaryResult(
      false,
      [],
      windowMinutes,
      "read_failed",
      "Data Explorer dedupe diagnostics unavailable.",
    );
  } finally {
    db?.close();
  }
}

export function upsertDataExplorerPreset(input: DataExplorerPresetUpsertInput): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(input);
  const actorContext = normalizeActorContext(input.actor);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    const currentPresets = readPresetsFromDatabase(db, scopeContext);
    const name = input.name.trim();

    if (!name) {
      appendPresetAuditEvent(db, {
        presetId: input.id ?? null,
        presetName: input.name,
        scope: scopeContext.scope,
        action: input.id ? "updated" : "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "validation",
        metadata: {
          message: "Preset name is required.",
        },
      });
      return createResult(false, currentPresets, "validation", "Preset name is required.");
    }

    const existing = input.id
      ? currentPresets.find((preset) => preset.id === input.id)
      : undefined;
    const duplicate = currentPresets.some((preset) => {
      if (existing && preset.id === existing.id) {
        return false;
      }

      return preset.name.toLowerCase() === name.toLowerCase();
    });

    if (duplicate) {
      appendPresetAuditEvent(db, {
        presetId: input.id ?? null,
        presetName: name,
        scope: scopeContext.scope,
        action: existing ? "updated" : "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "duplicate_name",
      });
      return createResult(false, currentPresets, "duplicate_name", "Preset name already exists.");
    }

    const timestamp = new Date().toISOString();
    const nextPreset: DataExplorerPresetRecord = existing
      ? {
        ...existing,
        name,
        scope: scopeContext.scope,
        filters: sanitizePresetFilters(input.filters),
        updatedAt: timestamp,
      }
      : {
        id: input.id ?? createPresetId(),
        name,
        scope: scopeContext.scope,
        filters: sanitizePresetFilters(input.filters),
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUsedAt: null,
        useCount: 0,
      };

    if (existing) {
      runStatement(
        toStatement(
          db,
          `UPDATE ${PRESET_TABLE_NAME}
           SET name = ?,
               filters_json = ?,
               updated_at = ?,
               last_used_at = ?,
               use_count = ?
           WHERE id = ? AND scope = ? AND ${scopeContext.ownerId === null ? "owner_id IS NULL" : "owner_id = ?"}`,
        ),
        nextPreset.name,
        JSON.stringify(nextPreset.filters),
        nextPreset.updatedAt,
        nextPreset.lastUsedAt ?? null,
        nextPreset.useCount ?? 0,
        nextPreset.id,
        scopeContext.scope,
        ...(scopeContext.ownerId === null ? [] : [scopeContext.ownerId]),
      );

      appendPresetAuditEvent(db, {
        presetId: nextPreset.id,
        presetName: nextPreset.name,
        scope: scopeContext.scope,
        action: "updated",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "success",
        metadata: {
          changedFields: summarizeChangedFields(existing, nextPreset),
          filters: toFilterSummary(nextPreset.filters),
        },
      });
    } else {
      runStatement(
        toStatement(
          db,
          `INSERT INTO ${PRESET_TABLE_NAME} (
            id,
            name,
            scope,
            owner_id,
            filters_json,
            created_at,
            updated_at,
            last_used_at,
            use_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        ),
        nextPreset.id,
        nextPreset.name,
        scopeContext.scope,
        scopeContext.ownerId,
        JSON.stringify(nextPreset.filters),
        nextPreset.createdAt,
        nextPreset.updatedAt,
        nextPreset.lastUsedAt ?? null,
        nextPreset.useCount ?? 0,
      );

      appendPresetAuditEvent(db, {
        presetId: nextPreset.id,
        presetName: nextPreset.name,
        scope: scopeContext.scope,
        action: "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "success",
        metadata: {
          filters: toFilterSummary(nextPreset.filters),
        },
      });
    }

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      if (db) {
        appendPresetAuditEvent(db, {
          presetId: input.id ?? null,
          presetName: input.name,
          scope: scopeContext.scope,
          action: input.id ? "updated" : "created",
          actorId: actorContext.actorId,
          actorType: actorContext.actorType,
          ownerId: scopeContext.ownerId,
          outcome: "failure",
          reason: "duplicate_name",
        });
      }
      const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
      return createResult(false, presets, "duplicate_name", "Preset name already exists.");
    }

    if (db) {
      appendPresetAuditEvent(db, {
        presetId: input.id ?? null,
        presetName: input.name,
        scope: scopeContext.scope,
        action: input.id ? "updated" : "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "write_failed",
      });
    }

    const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
    return createResult(false, presets, "write_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function deleteDataExplorerPresetById(
  presetId: string,
  context?: DataExplorerPresetScopeContext,
): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(context);
  const actorContext = normalizeActorContext(context?.actor);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    const currentPresets = readPresetsFromDatabase(db, scopeContext);
    const existingPreset = currentPresets.find((preset) => preset.id === presetId);

    if (!existingPreset) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "deleted",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "not_found",
      });
      return createResult(false, currentPresets, "not_found", "Preset not found.");
    }

    runStatement(
      toStatement(
        db,
        `DELETE FROM ${PRESET_TABLE_NAME} WHERE id = ? AND scope = ? AND ${scopeContext.ownerId === null ? "owner_id IS NULL" : "owner_id = ?"}`,
      ),
      presetId,
      scopeContext.scope,
      ...(scopeContext.ownerId === null ? [] : [scopeContext.ownerId]),
    );

    appendPresetAuditEvent(db, {
      presetId,
      presetName: existingPreset.name,
      scope: scopeContext.scope,
      action: "deleted",
      actorId: actorContext.actorId,
      actorType: actorContext.actorType,
      ownerId: scopeContext.ownerId,
      outcome: "success",
      metadata: {
        useCount: existingPreset.useCount,
      },
    });

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch {
    if (db) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "deleted",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "write_failed",
      });
    }
    const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
    return createResult(false, presets, "write_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function markDataExplorerPresetUsed(
  presetId: string,
  context?: DataExplorerPresetScopeContext,
): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(context);
  const actorContext = normalizeActorContext(context?.actor);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    const currentPresets = readPresetsFromDatabase(db, scopeContext);
    const existingPreset = currentPresets.find((preset) => preset.id === presetId);

    if (!existingPreset) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "marked_used",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "not_found",
      });
      return createResult(false, currentPresets, "not_found", "Preset not found.");
    }

    const timestamp = new Date().toISOString();
    runStatement(
      toStatement(
        db,
        `UPDATE ${PRESET_TABLE_NAME}
         SET updated_at = ?,
             last_used_at = ?,
             use_count = COALESCE(use_count, 0) + 1
         WHERE id = ? AND scope = ? AND ${scopeContext.ownerId === null ? "owner_id IS NULL" : "owner_id = ?"}`,
      ),
      timestamp,
      timestamp,
      presetId,
      scopeContext.scope,
      ...(scopeContext.ownerId === null ? [] : [scopeContext.ownerId]),
    );

    appendPresetAuditEvent(db, {
      presetId,
      presetName: existingPreset.name,
      scope: scopeContext.scope,
      action: "marked_used",
      actorId: actorContext.actorId,
      actorType: actorContext.actorType,
      ownerId: scopeContext.ownerId,
      outcome: "success",
      createdAt: timestamp,
      metadata: {
        previousUseCount: existingPreset.useCount,
        nextUseCount: (existingPreset.useCount ?? 0) + 1,
      },
    });

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch {
    if (db) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "marked_used",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "write_failed",
      });
    }
    const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
    return createResult(false, presets, "write_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function loadSharedDataExplorerPresets(): DataExplorerPresetMutationResult {
  return loadDataExplorerPresets({ scope: SHARED_SCOPE });
}

export function upsertSharedDataExplorerPreset(draft: UpsertSharedPresetDraft): DataExplorerPresetMutationResult {
  return upsertDataExplorerPreset({ ...draft, scope: SHARED_SCOPE });
}

export function deleteSharedDataExplorerPresetById(presetId: string): DataExplorerPresetMutationResult {
  return deleteDataExplorerPresetById(presetId, { scope: SHARED_SCOPE });
}

export function markSharedDataExplorerPresetUsed(presetId: string): DataExplorerPresetMutationResult {
  return markDataExplorerPresetUsed(presetId, { scope: SHARED_SCOPE });
}

export function clearSharedDataExplorerPresetStoreForTests() {
  if (process.env.NODE_ENV !== "test") {
    return;
  }

  const dbPath = resolveDatabasePath();
  const legacyStorePath = getLegacyStorePath();

  for (const path of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`, legacyStorePath]) {
    try {
      rmSync(path, { force: true });
    } catch {
      // Ignore cleanup failures in tests.
    }
  }
}
