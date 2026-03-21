# Step12 Modified Files

## apps/api/src/repositories/data-explorer-presets.ts
```ts
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import {
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
} from "../../../web/lib/persistence/types";
import {
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";

const PRESET_TABLE_NAME = "data_explorer_presets";
const PRESET_AUDIT_TABLE_NAME = "data_explorer_preset_audit_events";
const BEHAVIOR_EVENT_TABLE_NAME = "data_explorer_behavior_events";
const SHARED_SCOPE = "shared";
const PERSONAL_SCOPE = "personal";
const STORAGE_SCHEMA_VERSION = 2 as const;
const LEGACY_SCHEMA_VERSION = 1 as const;
const LEGACY_STORE_DEFAULT_PATH = resolve(process.cwd(), ".data", "data-explorer-presets.shared.json");

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

  const presetId = normalizeOptionalString(options.presetId);
  const actorId = normalizeOptionalString(options.actorId);
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
         ORDER BY created_at DESC
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
  const actorLabel = normalizeOptionalLabel(input.actorLabel)
    ?? actorContext.actorId
    ?? (actorContext.actorType === "unknown" ? "Unknown actor" : "Station admin");
  const sourceContextJson = input.sourceContext ? JSON.stringify(input.sourceContext) : null;

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensureBehaviorEventTable(db);

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
      normalizeOptionalLabel(input.presetId),
      normalizeOptionalLabel(input.presetName),
      normalizeOptionalLabel(input.datasetId),
      normalizeOptionalLabel(input.datasetName),
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
         ORDER BY created_at DESC
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
```

## apps/api/src/db/schema.ts
```ts
export type DatabaseColumnType = "text" | "integer" | "real" | "boolean" | "json" | "timestamp";

export interface DatabaseColumnReference {
  table: string;
  column: string;
}

export interface DatabaseColumnSchema {
  name: string;
  type: DatabaseColumnType;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string;
  references?: DatabaseColumnReference;
}

export interface DatabaseTableSchema {
  name: string;
  columns: DatabaseColumnSchema[];
}

const timestampColumns = [
  {
    name: "created_at",
    type: "timestamp",
    defaultValue: "CURRENT_TIMESTAMP",
  },
  {
    name: "updated_at",
    type: "timestamp",
    defaultValue: "CURRENT_TIMESTAMP",
  },
] as const satisfies DatabaseColumnSchema[];

export const databaseSchema: DatabaseTableSchema[] = [
  {
    name: "data_sources",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "priority", type: "integer", defaultValue: "0" },
      { name: "base_url", type: "text", nullable: true },
      { name: "active", type: "boolean", defaultValue: "1" },
      ...timestampColumns,
    ],
  },
  {
    name: "regions",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "status", type: "text" },
      { name: "summary", type: "text" },
      { name: "geometry", type: "json", nullable: true },
      { name: "buoy_count", type: "integer", nullable: true },
      { name: "nearest_buoy_label", type: "text", nullable: true },
      { name: "thermal_anomaly_label", type: "text", nullable: true },
      { name: "current_direction_label", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "ingestion_runs",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "source", type: "text" },
      { name: "status", type: "text" },
      { name: "station_count", type: "integer", defaultValue: "0" },
      { name: "inserted_rows", type: "integer", defaultValue: "0" },
      { name: "rejected_rows", type: "integer", defaultValue: "0" },
      { name: "started_at", type: "integer" },
      { name: "finished_at", type: "integer", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "observations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text" },
      { name: "source", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "sea_surface_temp_c", type: "real", nullable: true },
      { name: "wave_height_m", type: "real", nullable: true },
      { name: "wind_speed_mps", type: "real", nullable: true },
      { name: "pressure_hpa", type: "real", nullable: true },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "raw_line", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "provenance_records",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source", type: "text" },
      { name: "source_station_id", type: "text" },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "record_type", type: "text" },
      { name: "record_id", type: "text" },
      { name: "payload_json", type: "json" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "station_metrics",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", nullable: true, references: { table: "stations", column: "id" } },
      { name: "region_key", type: "text" },
      { name: "metric_type", type: "text" },
      { name: "metric_value", type: "real", nullable: true },
      { name: "metric_unit", type: "text", nullable: true },
      { name: "source", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "derived_signals",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", nullable: true, references: { table: "stations", column: "id" } },
      { name: "region_key", type: "text" },
      { name: "signal_type", type: "text" },
      { name: "signal_value", type: "real", nullable: true },
      { name: "signal_label", type: "text", nullable: true },
      { name: "severity", type: "text", nullable: true },
      { name: "source", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "live_ingestion_worker_runs",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "status", type: "text" },
      { name: "started_at", type: "integer" },
      { name: "completed_at", type: "integer" },
      { name: "duration_ms", type: "integer" },
      { name: "inserted_count", type: "integer", defaultValue: "0" },
      { name: "rejected_count", type: "integer", defaultValue: "0" },
      { name: "rejection_reasons_json", type: "json" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "live_ingestion_reports",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "worker_run_id", type: "text", references: { table: "live_ingestion_worker_runs", column: "id" } },
      { name: "source", type: "text" },
      { name: "started_at", type: "integer" },
      { name: "completed_at", type: "integer" },
      { name: "duration_ms", type: "integer" },
      { name: "inserted_count", type: "integer", defaultValue: "0" },
      { name: "rejected_count", type: "integer", defaultValue: "0" },
      { name: "rejection_reasons_json", type: "json" },
      { name: "status", type: "text" },
      { name: "run_id", type: "text", nullable: true },
      { name: "error", type: "text", nullable: true },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "operational_alerts",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "source", type: "text" },
      { name: "rule_type", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "title", type: "text" },
      { name: "detail", type: "text", nullable: true },
      { name: "metadata_json", type: "json", nullable: true },
      { name: "detected_at", type: "integer" },
      { name: "resolved_at", type: "integer", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "datasets",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "category", type: "text" },
      { name: "region_id", type: "text", references: { table: "regions", column: "id" } },
      { name: "status", type: "text" },
      { name: "record_count", type: "integer", nullable: true },
      { name: "refreshed_at", type: "timestamp", nullable: true },
      { name: "metadata", type: "json", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "data_explorer_presets",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "scope", type: "text", defaultValue: "'shared'" },
      { name: "owner_id", type: "text", nullable: true },
      { name: "filters_json", type: "json" },
      { name: "created_at", type: "timestamp" },
      { name: "updated_at", type: "timestamp" },
      { name: "last_used_at", type: "timestamp", nullable: true },
      { name: "use_count", type: "integer", defaultValue: "0" },
    ],
  },
  {
    name: "data_explorer_preset_audit_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "preset_id", type: "text", nullable: true },
      { name: "preset_name", type: "text" },
      { name: "scope", type: "text" },
      { name: "action", type: "text" },
      { name: "actor_id", type: "text", nullable: true },
      { name: "actor_type", type: "text" },
      { name: "owner_id", type: "text", nullable: true },
      { name: "outcome", type: "text" },
      { name: "reason", type: "text", nullable: true },
      { name: "created_at", type: "timestamp" },
      { name: "metadata_json", type: "json", nullable: true },
    ],
  },
  {
    name: "data_explorer_behavior_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_type", type: "text" },
      { name: "scope", type: "text" },
      { name: "actor_id", type: "text", nullable: true },
      { name: "actor_label", type: "text", nullable: true },
      { name: "owner_id", type: "text", nullable: true },
      { name: "preset_id", type: "text", nullable: true },
      { name: "preset_name", type: "text", nullable: true },
      { name: "dataset_id", type: "text", nullable: true },
      { name: "dataset_name", type: "text", nullable: true },
      { name: "created_at", type: "timestamp" },
      { name: "source_context_json", type: "json", nullable: true },
    ],
  },
  {
    name: "investigations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "state", type: "text" },
      { name: "region_id", type: "text", nullable: true, references: { table: "regions", column: "id" } },
      { name: "owner", type: "text", nullable: true },
      { name: "confidence", type: "integer", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "investigation_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "investigation_id", type: "text", references: { table: "investigations", column: "id" } },
      { name: "event_type", type: "text" },
      { name: "source", type: "text" },
      { name: "actor", type: "text", nullable: true },
      { name: "summary", type: "text" },
      { name: "detail", type: "text", nullable: true },
      { name: "confidence", type: "integer", nullable: true },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "signal_detections",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "signal_type", type: "text" },
      { name: "severity", type: "text" },
      { name: "confidence", type: "integer" },
      { name: "source_type", type: "text" },
      { name: "source_id", type: "text" },
      { name: "region", type: "text" },
      { name: "station_id", type: "text", nullable: true, references: { table: "stations", column: "id" } },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "detail", type: "text" },
      { name: "status", type: "text" },
      { name: "detected_at", type: "integer" },
      { name: "created_at", type: "integer" },
      { name: "updated_at", type: "integer" },
      { name: "linked_investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
    ],
  },
  {
    name: "species",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "common_name", type: "text" },
      { name: "scientific_name", type: "text" },
      { name: "conservation_status", type: "text" },
      { name: "habitat_region", type: "text" },
      { name: "summary", type: "text" },
      { name: "created_at", type: "integer" },
      { name: "updated_at", type: "integer" },
    ],
  },
  {
    name: "species_sightings",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "species_id", type: "text", references: { table: "species", column: "id" } },
      { name: "station_id", type: "text", nullable: true },
      { name: "region", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "latitude", type: "text" },
      { name: "longitude", type: "text" },
      { name: "count", type: "integer" },
      { name: "source", type: "text" },
      { name: "summary", type: "text" },
      { name: "verification_status", type: "text", defaultValue: "'pending'" },
      { name: "verified_at", type: "integer", nullable: true },
      { name: "verified_by", type: "text", nullable: true },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "species_movement_signals",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "species_id", type: "text", references: { table: "species", column: "id" } },
      { name: "signal_id", type: "text", nullable: true, references: { table: "signal_detections", column: "id" } },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "movement_type", type: "text" },
      { name: "confidence", type: "integer" },
      { name: "summary", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "ai_analyses",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "prompt", type: "text" },
      { name: "summary", type: "text", nullable: true },
      { name: "result_payload", type: "json", nullable: true },
      { name: "confidence_label", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "alerts",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "title", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "region_id", type: "text", nullable: true, references: { table: "regions", column: "id" } },
      { name: "dataset_id", type: "text", nullable: true, references: { table: "datasets", column: "id" } },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "detail", type: "text", nullable: true },
      { name: "detected_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "reports",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "title", type: "text" },
      { name: "report_type", type: "text" },
      { name: "status", type: "text" },
      { name: "region_id", type: "text", nullable: true, references: { table: "regions", column: "id" } },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "author", type: "text", nullable: true },
      { name: "published_at", type: "timestamp", nullable: true },
      { name: "content", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "map_layers",
    columns: [
      { name: "label", type: "text", primaryKey: true },
      { name: "description", type: "text" },
      { name: "active", type: "boolean" },
      { name: "accent", type: "text" },
      { name: "sort_order", type: "integer" },
      ...timestampColumns,
    ],
  },
  {
    name: "stations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "slug", type: "text", unique: true },
      { name: "region_id", type: "text", references: { table: "regions", column: "id" } },
      { name: "status", type: "text" },
      { name: "summary", type: "text" },
      { name: "location_label", type: "text" },
      { name: "depth_m", type: "integer", nullable: true },
      { name: "latitude", type: "text", nullable: true },
      { name: "longitude", type: "text", nullable: true },
      { name: "last_reported_at", type: "timestamp", nullable: true },
      { name: "hero_metric", type: "text", nullable: true },
      { name: "sponsor_name", type: "text", nullable: true },
      { name: "operator_name", type: "text", nullable: true },
      { name: "logo_url", type: "text", nullable: true },
      { name: "logo_label", type: "text", nullable: true },
      { name: "exhibit_title", type: "text", nullable: true },
      { name: "accent_color", type: "text", nullable: true },
      { name: "public_description", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_page_views",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "view_type", type: "text" },
      { name: "viewed_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_species",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "name", type: "text" },
      { name: "status", type: "text" },
      { name: "population_trend", type: "text", nullable: true },
      { name: "observed_at", type: "timestamp", nullable: true },
      { name: "notes", type: "text", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_sensors",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "name", type: "text" },
      { name: "category", type: "text" },
      { name: "value", type: "text" },
      { name: "unit", type: "text", nullable: true },
      { name: "status", type: "text" },
      { name: "sampled_at", type: "timestamp", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_alerts",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "title", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "detail", type: "text", nullable: true },
      { name: "detected_at", type: "timestamp", nullable: true },
      { name: "acknowledged_at", type: "timestamp", nullable: true },
      { name: "acknowledged_by", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_timelines",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "label", type: "text" },
      { name: "phase", type: "text" },
      { name: "detail", type: "text" },
      { name: "happened_at", type: "timestamp", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_content",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "content_type", type: "text" },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "href", type: "text", nullable: true },
      { name: "published_at", type: "timestamp", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_sessions",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "actor_id", type: "text" },
      { name: "actor_role", type: "text" },
      { name: "permissions", type: "json", nullable: true },
      { name: "csrf_token", type: "text" },
      { name: "issued_at", type: "timestamp" },
      { name: "expires_at", type: "timestamp" },
      { name: "last_active_at", type: "timestamp", nullable: true },
      { name: "revoked_at", type: "timestamp", nullable: true },
      { name: "metadata", type: "json", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_credentials",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "actor_role", type: "text" },
      { name: "password_hash", type: "text" },
      { name: "salt", type: "text" },
      { name: "mfa_enabled", type: "boolean", defaultValue: "0" },
      { name: "mfa_secret", type: "text", nullable: true },
      { name: "mfa_recovery_codes", type: "json", nullable: true },
      { name: "mfa_enrolled_at", type: "timestamp", nullable: true },
      { name: "mfa_last_verified_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_mfa_challenges",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "actor_id", type: "text" },
      { name: "challenge_purpose", type: "text" },
      { name: "session_id", type: "text", nullable: true, references: { table: "station_admin_sessions", column: "id" } },
      { name: "expires_at", type: "timestamp" },
      { name: "attempts_remaining", type: "integer", defaultValue: "5" },
      { name: "consumed_at", type: "timestamp", nullable: true },
      { name: "metadata", type: "json", nullable: true },
      { name: "created_at", type: "timestamp", defaultValue: "CURRENT_TIMESTAMP" },
    ],
  },
  {
    name: "station_admin_auth_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_type", type: "text" },
      { name: "actor_id", type: "text", nullable: true },
      { name: "session_id", type: "text", nullable: true },
      { name: "occurred_at", type: "timestamp" },
      { name: "metadata", type: "json", nullable: true },
      { name: "created_at", type: "timestamp", defaultValue: "CURRENT_TIMESTAMP" },
    ],
  },
  {
    name: "station_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "event_type", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "detected_at", type: "timestamp" },
      { name: "resolved_at", type: "timestamp", nullable: true },
      { name: "investigation_id", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_evidence",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "source", type: "text" },
      { name: "kind", type: "text" },
      { name: "captured_at", type: "timestamp" },
      { name: "detail", type: "text" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_notes",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "author_id", type: "text" },
      { name: "body", type: "text" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_actions",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "label", type: "text" },
      { name: "actor_id", type: "text" },
      { name: "performed_at", type: "timestamp" },
      { name: "detail", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_history",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "from_status", type: "text", nullable: true },
      { name: "to_status", type: "text" },
      { name: "changed_by", type: "text" },
      { name: "changed_at", type: "timestamp" },
      { name: "reason", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_investigations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "title", type: "text" },
      { name: "description", type: "text", nullable: true },
      { name: "status", type: "text" },
      { name: "owner", type: "text", nullable: true },
      { name: "opened_at", type: "timestamp" },
      { name: "closed_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_audits",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "actor_id", type: "text" },
      { name: "actor_role", type: "text" },
      { name: "area", type: "text" },
      { name: "changed_fields", type: "json" },
      { name: "changed_at", type: "timestamp" },
      ...timestampColumns,
    ],
  },
];

export const databaseTables = Object.fromEntries(
  databaseSchema.map((table) => [table.name, table]),
) as Record<DatabaseTableSchema["name"], DatabaseTableSchema>;
```

## apps/web/lib/persistence/types.ts
```ts
import type {
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
  DataExplorerSortDirection,
} from "@/lib/api/types";

export interface PersistenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DataExplorerPresetFilters = Pick<
  Required<DataExplorerDatasetFilters>,
  "q" | "category" | "region" | "status" | "sortBy" | "sortDir" | "pageSize"
>;

export type DataExplorerPresetScope = "shared" | "personal";

export interface DataExplorerPresetRecord {
  id: string;
  name: string;
  scope: DataExplorerPresetScope;
  filters: DataExplorerPresetFilters;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  useCount?: number;
}

export interface DataExplorerPresetDraft {
  name: string;
  scope?: DataExplorerPresetScope;
  filters: Partial<DataExplorerPresetFilters>;
}

export type DataExplorerPresetMutationReason =
  | "storage_unavailable"
  | "read_failed"
  | "write_failed"
  | "corrupt_json"
  | "invalid_schema"
  | "unsupported_version"
  | "duplicate_name"
  | "validation"
  | "not_found";

export interface DataExplorerPresetMutationResult {
  ok: boolean;
  presets: DataExplorerPresetRecord[];
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export type DataExplorerPresetAuditAction = "created" | "updated" | "deleted" | "marked_used";

export type DataExplorerPresetAuditActorType = "station_admin" | "unknown";

export type DataExplorerPresetAuditOutcome = "success" | "failure";

export interface DataExplorerPresetAuditEvent {
  id: string;
  presetId: string | null;
  presetName: string;
  scope: DataExplorerPresetScope;
  action: DataExplorerPresetAuditAction;
  actorId: string | null;
  actorType: DataExplorerPresetAuditActorType;
  ownerId: string | null;
  outcome: DataExplorerPresetAuditOutcome;
  reason?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DataExplorerPresetAuditListResult {
  ok: boolean;
  events: DataExplorerPresetAuditEvent[];
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export type DataExplorerBehaviorEventType =
  | "preset_applied"
  | "dataset_selected"
  | "dataset_detail_viewed";

export interface DataExplorerBehaviorEvent {
  id: string;
  eventType: DataExplorerBehaviorEventType;
  scope: DataExplorerPresetScope;
  actorId: string | null;
  actorLabel: string | null;
  ownerId: string | null;
  presetId: string | null;
  presetName: string | null;
  datasetId: string | null;
  datasetName: string | null;
  createdAt: string;
  sourceContext?: Record<string, unknown>;
}

export interface DataExplorerBehaviorEventWriteResult {
  ok: boolean;
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerBehaviorEventListResult {
  ok: boolean;
  events: DataExplorerBehaviorEvent[];
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerPresetStorageEnvelope {
  version: number;
  presets: DataExplorerPresetRecord[];
}

export type IntelligenceClassification = "stable" | "warning" | "critical";

export interface PersistedIntelligenceMatchedTerm {
  term: string;
  weight: number;
}

export interface PersistedIntelligenceEntry {
  id: string;
  timestamp: string;
  rawInput: string;
  score: number;
  classification: IntelligenceClassification;
  matchedTerms: PersistedIntelligenceMatchedTerm[];
}

export interface PersistedIntelligenceStore {
  list(): Promise<PersistedIntelligenceEntry[]>;
  save(entry: PersistedIntelligenceEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export const DATA_EXPLORER_DEFAULT_PRESET_FILTERS: DataExplorerPresetFilters = {
  q: "",
  category: "",
  region: "",
  status: "",
  sortBy: "updated",
  sortDir: "desc",
  pageSize: 25,
};

export const DATA_EXPLORER_ALLOWED_SORTS: DataExplorerDatasetSortBy[] = [
  "updated",
  "name",
  "records",
  "status",
];

export const DATA_EXPLORER_ALLOWED_DIRECTIONS: DataExplorerSortDirection[] = [
  "asc",
  "desc",
];
```

## apps/web/lib/server/data-explorer-preset-store.ts
```ts
export {
  appendDataExplorerBehaviorEvent,
  clearSharedDataExplorerPresetStoreForTests,
  deleteDataExplorerPresetById,
  deleteSharedDataExplorerPresetById,
  listDataExplorerBehaviorEvents,
  listPresetAuditEvents,
  loadDataExplorerPresets,
  loadSharedDataExplorerPresets,
  markDataExplorerPresetUsed,
  markSharedDataExplorerPresetUsed,
  upsertDataExplorerPreset,
  upsertSharedDataExplorerPreset,
} from "../../../api/src/repositories/data-explorer-presets";
```

## apps/web/app/api/data-explorer/activity/route.ts
```ts
import { NextResponse } from "next/server";
import {
  appendDataExplorerBehaviorEvent,
  listDataExplorerBehaviorEvents,
} from "@/lib/server/data-explorer-preset-store";
import type { DataExplorerBehaviorEventType, DataExplorerPresetScope } from "@/lib/persistence/types";
import { resolvePresetScopeContext } from "../presets/scope";

interface ActivityBody {
  eventType?: DataExplorerBehaviorEventType;
  scope?: DataExplorerPresetScope;
  presetId?: string;
  presetName?: string;
  datasetId?: string;
  datasetName?: string;
  sourceContext?: unknown;
}

const ALLOWED_EVENT_TYPES: DataExplorerBehaviorEventType[] = [
  "preset_applied",
  "dataset_selected",
  "dataset_detail_viewed",
];

function toStatusCode(reason?: string): number {
  switch (reason) {
    case "validation":
      return 400;
    case "read_failed":
    case "write_failed":
    case "storage_unavailable":
    case "invalid_schema":
    case "corrupt_json":
    case "unsupported_version":
      return 503;
    default:
      return 500;
  }
}

function isBehaviorEventType(value: unknown): value is DataExplorerBehaviorEventType {
  return typeof value === "string" && ALLOWED_EVENT_TYPES.includes(value as DataExplorerBehaviorEventType);
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function sanitizeSourceContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const allowedKeys = ["surface", "interaction", "listSource", "detailSource", "listDelivery", "detailDelivery"];
  const context: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    const entry = candidate[key];

    if (typeof entry === "string" && entry.trim()) {
      context[key] = entry.trim();
    }
  }

  return Object.keys(context).length > 0 ? context : undefined;
}

export async function GET(request: Request) {
  const scopeContext = await resolvePresetScopeContext(request);

  if (!scopeContext.ok) {
    return NextResponse.json(
      {
        ok: false,
        events: [],
        reason: "validation",
        error: scopeContext.result.error,
      },
      { status: scopeContext.status },
    );
  }

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  const result = listDataExplorerBehaviorEvents({
    scope: scopeContext.context.scope,
    ownerId: scopeContext.context.ownerId,
    limit,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}

export async function POST(request: Request) {
  let body: ActivityBody = {};

  try {
    body = (await request.json()) as ActivityBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        reason: "validation",
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  if (!isBehaviorEventType(body.eventType)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "validation",
        error: "Behavior event type is required.",
      },
      { status: 400 },
    );
  }

  const scopeContext = await resolvePresetScopeContext(request, body.scope, { includeActor: true });

  if (!scopeContext.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: "validation",
        error: scopeContext.result.error,
      },
      { status: scopeContext.status },
    );
  }

  const result = appendDataExplorerBehaviorEvent({
    eventType: body.eventType,
    scope: scopeContext.context.scope,
    ownerId: scopeContext.context.ownerId,
    actor: scopeContext.context.actor,
    actorLabel: scopeContext.context.actor?.actorId ?? "Unknown actor",
    presetId: body.presetId,
    presetName: body.presetName,
    datasetId: body.datasetId,
    datasetName: body.datasetName,
    sourceContext: {
      surface: "data-explorer-workspace",
      ...sanitizeSourceContext(body.sourceContext),
    },
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
```

## apps/web/app/api/data-explorer/activity/route.test.ts
```ts
import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockAppendDataExplorerBehaviorEvent, mockListDataExplorerBehaviorEvents, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockAppendDataExplorerBehaviorEvent: vi.fn(),
  mockListDataExplorerBehaviorEvents: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  appendDataExplorerBehaviorEvent: mockAppendDataExplorerBehaviorEvent,
  listDataExplorerBehaviorEvents: mockListDataExplorerBehaviorEvents,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../presets/scope";
import { GET, POST } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockAppendDataExplorerBehaviorEvent.mockReset();
  mockListDataExplorerBehaviorEvents.mockReset();

  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockAppendDataExplorerBehaviorEvent.mockReturnValue({ ok: true });
  mockListDataExplorerBehaviorEvents.mockReturnValue({ ok: true, events: [] });
});

test("GET recent usage allows shared scope without session lookup", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/activity?scope=shared&limit=5"));

  expect(response.status).toBe(200);
  expect(mockApiClient.stationAdminAuth.getSession).not.toHaveBeenCalled();
  expect(mockListDataExplorerBehaviorEvents).toHaveBeenCalledWith({
    scope: "shared",
    ownerId: undefined,
    limit: 5,
  });
});

test("GET personal recent usage rejects unauthenticated requests", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/activity?scope=personal"));

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    events: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockListDataExplorerBehaviorEvents).not.toHaveBeenCalled();
});

test("POST personal behavior events derive actor identity from trusted station-admin session", async () => {
  mockSessionCookie.mockReturnValue("session-21");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-21",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-21",
  });

  const response = await POST(
    new Request("http://localhost/api/data-explorer/activity?scope=personal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "dataset_detail_viewed",
        scope: "personal",
        datasetId: "DST-100",
        datasetName: "Atlantic Thermal",
        sourceContext: {
          interaction: "detail-load",
        },
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(mockAppendDataExplorerBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-21",
    actor: {
      actorId: "operator-21",
      actorType: "station_admin",
    },
    actorLabel: "operator-21",
    datasetId: "DST-100",
    datasetName: "Atlantic Thermal",
  }));
});

test("POST shared behavior events are accepted without station-admin session and attributed as unknown", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/activity?scope=shared", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "dataset_selected",
        scope: "shared",
        datasetId: "DST-300",
        datasetName: "Shared Dataset",
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(mockAppendDataExplorerBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
    eventType: "dataset_selected",
    scope: "shared",
    ownerId: undefined,
    actor: {
      actorId: null,
      actorType: "unknown",
    },
    actorLabel: "Unknown actor",
    datasetId: "DST-300",
    datasetName: "Shared Dataset",
  }));
});

test("POST personal behavior events reject unauthenticated requests", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/activity?scope=personal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "dataset_selected",
        scope: "personal",
        datasetId: "DST-100",
      }),
    }),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockAppendDataExplorerBehaviorEvent).not.toHaveBeenCalled();
});
```

## apps/web/lib/api/client.ts
```ts
import {
  aiLabWorkspaceData,
  dashboardOverviewData,
  investigationsTimelineFallbackData,
  investigationsWorkspaceData,
  signalDetectionsFallbackData,
  speciesFallbackData,
  speciesMovementSignalsFallbackData,
  speciesSightingsFallbackData,
  oceanStationAnalytics,
  oceanStationDetails,
  oceanStationsData,
  oceanMapWorkspaceData,
  liveMarineConditionsData,
  reefStressWatchData,
} from "@/lib/api/mock-data";
import { getDashboardRoute } from "../../../api/src/routes/dashboard";
import { getLiveConditionsRoute } from "../../../api/src/routes/live-conditions";
import { getOperationalAlertsRoute } from "../../../api/src/routes/operational-alerts";
import { getReefAlertsRoute } from "../../../api/src/routes/reef-alerts";
import {
  buildDatasetDetailRouteResponse,
  buildDatasetRecordsRouteResponse,
  buildDatasetsRouteResponse,
  getDatasetByIdRoute,
  getDatasetRecordsRoute,
  getDatasetsRoute,
} from "../../../api/src/routes/datasets";
import { getInvestigationsRoute } from "../../../api/src/routes/investigations";
import { getInvestigationTimelineRoute, postInvestigationEventRoute } from "../../../api/src/routes/investigation-events";
import {
  getSignalByIdRoute,
  getSignalsRoute,
  postSignalCreateRoute,
  postSignalDismissRoute,
  postSignalPromoteRoute,
} from "../../../api/src/routes/signals";
import {
  getSpeciesByIdRoute,
  getAllSpeciesSightingsRoute,
  getSpeciesMovementSignalsRoute,
  getSpeciesRoute,
  postSpeciesSightingRoute,
} from "../../../api/src/routes/species";
import { getAiLabRoute } from "../../../api/src/routes/ai-lab";
import { getRegionsRoute } from "../../../api/src/routes/regions";
import { postStationAdminSessionRoute } from "../../../api/src/routes/station-admin-auth";
import {
  getStationAdminAuthEventsExportRoute,
  getStationAdminAuthEventsRoute,
} from "../../../api/src/routes/station-admin-auth-events";
import {
  getStationAdminSecurityAlertsRoute,
  getStationAdminSecuritySummaryRoute,
  getStationAdminSessionsRoute,
} from "../../../api/src/routes/station-admin-security";
import {
  postStationAdminLoginRoute,
  postStationAdminLogoutRoute,
  postStationAdminMfaVerifyRoute,
  postStationAdminRefreshRoute,
  postStationAdminRevokeRoute,
} from "../../../api/src/routes/station-admin-lifecycle";
import {
  postMfaEnrollStartRoute,
  postMfaEnrollVerifyRoute,
  postMfaRecoveryRegenerateRoute,
  postMfaDisableRoute,
} from "../../../api/src/routes/station-admin-mfa";
import {
  getStationAdminAuditRoute,
  getStationAdminRoute,
  getStationAnalyticsRoute,
  getStationByIdRoute,
  getStationsRoute,
  patchStationBrandingRoute,
  patchStationContentRoute,
  patchStationRoute,
  postStationAlertAcknowledgeRoute,
  postStationViewRoute,
} from "../../../api/src/routes/stations";
import {
  getStationEventsRoute,
  getStationEventDetailRoute,
  getStationInvestigationsRoute,
  getStationInvestigationDetailRoute,
  postStationEventAcknowledgeRoute,
} from "../../../api/src/routes/station-events";
import { postAiAnalyzeRoute } from "../../../api/src/routes/ai";
import type { AnalyzeRequestBody } from "../../../api/src/types";
import type {
  InvestigationEventCreateResponse,
  InvestigationEventCreateTelemetry,
  InvestigationTimelineResponse,
  InvestigationTimelineTelemetry,
  SignalCreateRequest,
  SignalCreateResponse,
  SignalCreateTelemetry,
  SignalDetailResponse,
  SignalDetailTelemetry,
  SignalDismissResponse,
  SignalDismissTelemetry,
  SignalPromoteResponse,
  SignalPromoteTelemetry,
  SignalsListResponse,
  SignalsListTelemetry,
  SpeciesDetailResponse,
  SpeciesDetailTelemetry,
  SpeciesListResponse,
  SpeciesListTelemetry,
  SpeciesMovementSignalsResponse,
  SpeciesMovementSignalsTelemetry,
  SpeciesSightingCreateRequest,
  SpeciesSightingCreateResponse,
  SpeciesSightingCreateTelemetry,
  SpeciesSightingsResponse,
  SpeciesSightingsTelemetry,
  DatasetDetailTelemetry,
  DatasetRecordsTelemetry,
  DatasetsTelemetry,
  OceanStationAdminTelemetry,
  OceanStationAdminAuditTelemetry,
  OceanStationAnalyticsTelemetry,
  StationAdminAuthEventsExportResponse,
  StationAdminAuthEventsExportTelemetry,
  StationAdminAuthEventsResponse,
  StationAdminAuthEventsTelemetry,
  StationAdminSecurityAlertsResponse,
  StationAdminSecurityAlertsTelemetry,
  StationAdminSecuritySummaryResponse,
  StationAdminSecuritySummaryTelemetry,
  StationAdminLoginResponse,
  StationAdminLoginTelemetry,
  StationAdminMfaVerifyResponse,
  StationAdminMfaVerifyErrorResponse,
  StationAdminMfaVerifyTelemetry,
  StationAdminLogoutResponse,
  StationAdminLogoutTelemetry,
  StationAdminRefreshResponse,
  StationAdminRefreshTelemetry,
  StationAdminRevokeMfaRequiredResponse,
  StationAdminRevokeResponse,
  StationAdminRevokeTelemetry,
  StationAdminSessionAuthTelemetry,
  StationAdminSessionsResponse,
  StationAdminSessionsTelemetry,
  StationAlertAcknowledgeResponse,
  StationAlertAcknowledgeTelemetry,
  StationEventAcknowledgeResponse,
  StationEventAcknowledgeTelemetry,
  StationPatchTelemetry,
  StationViewTrackTelemetry,
  StationEventsListTelemetry,
  StationEventDetailTelemetry,
  StationInvestigationsListTelemetry,
  StationInvestigationDetailTelemetry,
  StationEventListResponse,
  StationEventDetailResponse,
  StationInvestigationListResponse,
  StationInvestigationDetailResponse,
  LiveConditionsResponse,
  LiveConditionsTelemetry,
  ReefAlertsResponse,
  ReefAlertsTelemetry,
} from "../../../api/src/types";
import type {
  OceanStationAdminAuthContext,
  OceanStationAdminAuditEntry,
  StationAdminAuthEvent,
  StationAdminAuthEventFilters,
  StationAdminAuthEventExportPayload,
  StationAdminAuthEventPage,
  StationAdminSecurityAlert,
  StationAdminSecuritySummary,
  OceanStationAdminBrandingPatch,
  OceanStationAdminContentPatch,
  OceanStationAdminPatch,
  OceanStationAlert,
  OceanStationAnalytics,
  OceanStationDetail,
  OceanStationViewType,
  StationAdminRequestMetadata,
  StationAdminMfaChallenge,
  StationAdminMfaEnrollmentState,
  StationAdminSessionSummary,
  StationAdminSessionsQuery,
  DataExplorerDatasetDetail,
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
  DataExplorerDatasetDetailFetchResult,
  DataExplorerFetchMeta,
  DataExplorerPageInfo,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsFetchResult,
  DataExplorerRelatedRecordsQuery,
  DataExplorerRelatedRecordsResult,
  DataExplorerSortDirection,
  DataExplorerWorkspaceFetchResult,
  InvestigationTimelineFilters,
  InvestigationTimelineItem,
  CreateSignalInput,
  PromoteSignalInput,
  CreateSpeciesSightingInput,
  RecordInvestigationEventInput,
  SignalDetection,
  SignalFilters,
  SpeciesFilters,
  SpeciesMovementSignalFilters,
  SpeciesMovementSignal,
  SpeciesProfile,
  SpeciesSighting,
  SpeciesSightingFilters,
  LiveMarineCondition,
  OperationalAlertItem,
  OperationalAlertsData,
  OperationalAlertsFallbackReason,
  OperationalAlertsFilters,
  ReefStressWatchItem,
  StationEventFilters,
  StationInvestigationFilters,
  StationEventListItem,
  StationEventDetail,
  StationInvestigationSummary,
  StationInvestigationDetail,
} from "@/lib/api/types";
import type {
  DataExplorerBehaviorEventListResult,
  DataExplorerBehaviorEventType,
  DataExplorerBehaviorEventWriteResult,
  DataExplorerPresetAuditListResult,
  DataExplorerPresetFilters,
  DataExplorerPresetMutationReason,
  DataExplorerPresetMutationResult,
  DataExplorerPresetScope,
} from "@/lib/persistence/types";

function nowIso() {
  return new Date().toISOString();
}

function cloneAnalytics(analytics: OceanStationAnalytics): OceanStationAnalytics {
  return {
    stationId: analytics.stationId,
    views: { ...analytics.views },
    lastViewedAt: analytics.lastViewedAt,
  };
}

function findMockStation(stationId: string): OceanStationDetail | null {
  if (oceanStationDetails[stationId]) {
    return oceanStationDetails[stationId];
  }

  return Object.values(oceanStationDetails).find((station) => station.slug === stationId) ?? null;
}

function syncMockStationSummary(station: OceanStationDetail) {
  const summaryIndex = oceanStationsData.findIndex((item) => item.id === station.id);

  if (summaryIndex === -1) {
    return;
  }

  oceanStationsData[summaryIndex] = {
    id: station.id,
    slug: station.slug,
    name: station.name,
    region: station.region,
    status: station.status,
    summary: station.summary,
    locationLabel: station.locationLabel,
    depthM: station.depthM,
    lastReported: station.lastReported,
    heroMetric: station.heroMetric,
    branding: { ...station.branding },
  };
}

function applyMockStationPatch(stationId: string, patch: OceanStationAdminPatch): OceanStationDetail | null {
  const station = findMockStation(stationId);

  if (!station) {
    return null;
  }

  if (patch.sponsorName !== undefined) {
    station.branding.sponsorName = patch.sponsorName;
  }

  if (patch.operatorName !== undefined) {
    station.branding.operatorName = patch.operatorName;
  }

  if (patch.exhibitTitle !== undefined) {
    station.branding.exhibitTitle = patch.exhibitTitle;
  }

  if (patch.publicDescription !== undefined) {
    station.branding.publicDescription = patch.publicDescription;
  }

  if (patch.accentColor !== undefined) {
    station.branding.accentColor = patch.accentColor;
  }

  if (patch.species !== undefined) {
    station.species = patch.species.map((item, index) => ({
      id: `SPC-${station.id}-${String(index + 1).padStart(3, "0")}`,
      name: item.name,
      status: item.status,
      populationTrend: item.populationTrend,
      notes: item.notes,
      observedAt: "Just now",
    }));
  }

  if (patch.alerts !== undefined) {
    station.alerts = patch.alerts.map((item, index) => ({
      id: `STA-ALT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      severity: item.severity,
      status: item.status,
      detail: item.detail,
      detectedAt: "Just now",
      acknowledgedAt: null,
      acknowledgedBy: null,
    }));
  }

  if (patch.timeline !== undefined) {
    station.timeline = patch.timeline.map((item, index) => ({
      id: `STL-${station.id}-${String(index + 1).padStart(3, "0")}`,
      label: item.label,
      phase: item.phase,
      detail: item.detail,
      happenedAt: "Just now",
    }));
  }

  if (patch.content !== undefined) {
    station.content = patch.content.map((item, index) => ({
      id: `CNT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      contentType: item.contentType,
      title: item.title,
      summary: item.summary,
      href: item.href ?? null,
      publishedAt: "Just now",
    }));
  }

  syncMockStationSummary(station);
  return station;
}

function buildFetchMeta(
  section: DataExplorerFetchMeta["section"],
  startedAtMs: number,
  options: Omit<DataExplorerFetchMeta, "section" | "startedAt" | "finishedAt" | "durationMs">,
): DataExplorerFetchMeta {
  const finishedAtMs = Date.now();

  return {
    section,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    ...options,
  };
}

function logDataExplorerFetch(meta: DataExplorerFetchMeta) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(`[DataExplorer:${meta.section}]`, meta);
}

const DATA_EXPLORER_SOURCE_HEADER = "x-marine-data-source";
const DATA_EXPLORER_FALLBACK_HEADER = "x-marine-fallback-reason";

function canUseDataExplorerNetworkBoundary() {
  return typeof window !== "undefined" && typeof fetch === "function";
}

function isPresetMutationReason(value: unknown): value is DataExplorerPresetMutationReason {
  return value === "validation"
    || value === "duplicate_name"
    || value === "not_found"
    || value === "read_failed"
    || value === "write_failed"
    || value === "storage_unavailable"
    || value === "invalid_schema"
    || value === "corrupt_json"
    || value === "unsupported_version";
}

function parsePresetMutationResult(payload: unknown): DataExplorerPresetMutationResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean" || !Array.isArray(candidate.presets)) {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    presets: candidate.presets,
    reason,
    error,
  };
}

function parsePresetAuditListResult(payload: unknown): DataExplorerPresetAuditListResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean" || !Array.isArray(candidate.events)) {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    events: candidate.events,
    reason,
    error,
  };
}

function parseBehaviorEventListResult(payload: unknown): DataExplorerBehaviorEventListResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean" || !Array.isArray(candidate.events)) {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    events: candidate.events,
    reason,
    error,
  };
}

function parseBehaviorEventWriteResult(payload: unknown): DataExplorerBehaviorEventWriteResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean") {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    reason,
    error,
  };
}

function buildPresetScopeUrl(scope: DataExplorerPresetScope, path = "/api/data-explorer/presets") {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("scope", scope);
  return `${url.pathname}${url.search}`;
}

function buildPresetScopeHeaders(): HeadersInit {
  return {
    Accept: "application/json",
  };
}

function createPresetStoreUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerPresetMutationResult {
  return {
    ok: false,
    presets: [],
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal preset store unavailable."
      : "Shared preset store unavailable.",
  };
}

function createPresetAuditStoreUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerPresetAuditListResult {
  return {
    ok: false,
    events: [],
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal preset audit store unavailable."
      : "Shared preset audit store unavailable.",
  };
}

function createBehaviorStoreUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerBehaviorEventListResult {
  return {
    ok: false,
    events: [],
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal activity store unavailable."
      : "Shared activity store unavailable.",
  };
}

function createBehaviorWriteUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerBehaviorEventWriteResult {
  return {
    ok: false,
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal activity write unavailable."
      : "Shared activity write unavailable.",
  };
}

function toDataExplorerFetchSource(value: string | null): DataExplorerFetchMeta["source"] {
  return value === "db" || value === "mock" ? value : undefined;
}

function toDataExplorerFallbackReason(
  value: string | null,
): DataExplorerFetchMeta["fallbackReason"] {
  return value === "db_path_missing" || value === "db_open_failed" || value === "db_query_failed"
    ? value
    : undefined;
}

function createDataExplorerHeaderMeta(response: Response): {
  source?: DataExplorerFetchMeta["source"];
  fallbackReason?: DataExplorerFetchMeta["fallbackReason"];
} {
  return {
    source: toDataExplorerFetchSource(response.headers.get(DATA_EXPLORER_SOURCE_HEADER)),
    fallbackReason: toDataExplorerFallbackReason(response.headers.get(DATA_EXPLORER_FALLBACK_HEADER)),
  };
}

function appendDataExplorerQuery(
  searchParams: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined || value === "") {
    return;
  }

  searchParams.set(key, String(value));
}

type HandlerResult<TJson, TTelemetry> = {
  status: number;
  json: TJson;
  telemetry?: TTelemetry;
};

type AuthMutationResult<TData> =
  | { ok: true; status: number; data: TData }
  | { ok: false; status: number; message: string };

type RevokeSessionResult =
  | { ok: true; status: number }
  | {
      ok: false;
      status: number;
      message: string;
      mfaRequired: true;
      challenge: StationAdminMfaChallenge;
    }
  | {
      ok: false;
      status: number;
      message: string;
      mfaRequired?: false;
    };

interface OperationalAlertsRouteResponseItem {
  id: string;
  source: string;
  rule_type: string;
  severity: string;
  status: string;
  title: string;
  detail: string | null;
  detected_at: number;
  resolved_at: number | null;
  created_at: string;
  updated_at: string;
}

interface OperationalAlertsRouteResponse {
  source: "db" | "unavailable";
  fallback_reason: OperationalAlertsFallbackReason | null;
  generated_at: string;
  summary: {
    active_alert_count: number;
    critical_count: number;
    warning_count: number;
    info_count: number;
    failed_source_count: number;
    stale_source_count: number;
    last_updated_at: string;
  };
  active_alerts: OperationalAlertsRouteResponseItem[];
  recent_history: OperationalAlertsRouteResponseItem[];
}

function mapOperationalAlertsItem(item: OperationalAlertsRouteResponseItem): OperationalAlertItem {
  return {
    id: item.id,
    source: item.source,
    ruleType: item.rule_type as OperationalAlertItem["ruleType"],
    severity: item.severity as OperationalAlertItem["severity"],
    status: item.status as OperationalAlertItem["status"],
    title: item.title,
    detail: item.detail,
    detectedAt: item.detected_at,
    resolvedAt: item.resolved_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function buildOperationalAlertsFallback(reason: OperationalAlertsFallbackReason = "db_query_failed"): OperationalAlertsData {
  const generatedAt = nowIso();

  return {
    source: "unavailable",
    fallbackReason: reason,
    generatedAt,
    summary: {
      activeAlertCount: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      failedSourceCount: 0,
      staleSourceCount: 0,
      lastUpdatedAt: generatedAt,
    },
    activeAlerts: [],
    recentHistory: [],
  };
}

function readRouteErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallbackMessage;
}

function normalizeDatasetFilters(filters: DataExplorerDatasetFilters = {}): DataExplorerDatasetFilters {
  return {
    q: filters.q?.trim() || undefined,
    category: filters.category?.trim() || undefined,
    region: filters.region?.trim() || undefined,
    status: filters.status?.trim() || undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export const apiClient = {
  stationAdminAuth: {
    async getSession(sessionId: string): Promise<OceanStationAdminAuthContext | null> {
      const normalizedSessionId = sessionId.trim();

      if (!normalizedSessionId) {
        return null;
      }

      try {
        const response = postStationAdminSessionRoute.handler({ body: { sessionId: normalizedSessionId } }) as HandlerResult<
          { auth: OceanStationAdminAuthContext } | { message: string },
          StationAdminSessionAuthTelemetry
        >;

        if (response.status !== 200 || !("auth" in response.json)) {
          return null;
        }

        return response.json.auth;
      } catch {
        return null;
      }
    },

    async login(
      actorId: string,
      password: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<AuthMutationResult<StationAdminLoginResponse>> {
      try {
        const response = postStationAdminLoginRoute.handler({
          body: { actorId, password, metadata },
        }) as HandlerResult<StationAdminLoginResponse | { message: string }, StationAdminLoginTelemetry>;

        if (
          (response.status === 200 && "sessionId" in response.json)
          || (response.status === 202 && "result" in response.json && response.json.result === "pending_mfa")
        ) {
          return {
            ok: true,
            status: response.status,
            data: response.json as StationAdminLoginResponse,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: readRouteErrorMessage(response.json, "Authentication failed"),
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "Authentication failed",
        };
      }
    },

    async verifyMfaChallenge(
      challengeId: string,
      options: {
        code?: string;
        recoveryCode?: string;
        sessionId?: string;
        csrfToken?: string;
        metadata?: StationAdminRequestMetadata;
      },
    ): Promise<
      | { ok: true; status: number; data: StationAdminMfaVerifyResponse }
      | { ok: false; status: number; message: string; error?: StationAdminMfaVerifyErrorResponse }
    > {
      try {
        const response = postStationAdminMfaVerifyRoute.handler({
          body: {
            challengeId,
            code: options.code,
            recoveryCode: options.recoveryCode,
            sessionId: options.sessionId,
            csrfToken: options.csrfToken,
            metadata: options.metadata,
          },
        }) as HandlerResult<
          StationAdminMfaVerifyResponse | StationAdminMfaVerifyErrorResponse | { message: string },
          StationAdminMfaVerifyTelemetry
        >;

        if (
          response.status === 200
          && "result" in response.json
          && (response.json.result === "issued" || response.json.result === "verified")
        ) {
          return {
            ok: true,
            status: response.status,
            data: response.json as StationAdminMfaVerifyResponse,
          };
        }

        const routeMessage = readRouteErrorMessage(response.json, "MFA verification failed");

        if (
          "result" in response.json
          && typeof response.json.result === "string"
          && "message" in response.json
          && typeof response.json.message === "string"
        ) {
          return {
            ok: false,
            status: response.status,
            message: routeMessage,
            error: response.json as StationAdminMfaVerifyErrorResponse,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: routeMessage,
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "MFA verification failed",
        };
      }
    },

    async logout(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<boolean> {
      try {
        const response = postStationAdminLogoutRoute.handler({
          body: { sessionId, csrfToken, metadata },
        }) as HandlerResult<StationAdminLogoutResponse | { message: string }, StationAdminLogoutTelemetry>;

        return response.status === 200 && "ok" in response.json && response.json.ok === true;
      } catch {
        return false;
      }
    },

    async refreshSession(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<{ sessionId: string; csrfToken: string; expiresAt: string } | null> {
      try {
        const response = postStationAdminRefreshRoute.handler({
          body: { sessionId, csrfToken, metadata },
        }) as HandlerResult<StationAdminRefreshResponse | { message: string }, StationAdminRefreshTelemetry>;

        if (response.status !== 200 || !("sessionId" in response.json)) {
          return null;
        }

        return response.json as StationAdminRefreshResponse;
      } catch {
        return null;
      }
    },

    async revokeSession(
      sessionId: string,
      csrfToken: string,
      targetSessionId: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<RevokeSessionResult> {
      try {
        const response = postStationAdminRevokeRoute.handler({
          body: { sessionId, csrfToken, targetSessionId, metadata },
        }) as HandlerResult<StationAdminRevokeResponse | StationAdminRevokeMfaRequiredResponse | { message: string }, StationAdminRevokeTelemetry>;

        if (response.status === 200 && "ok" in response.json && response.json.ok === true) {
          return {
            ok: true,
            status: response.status,
          };
        }

        if (response.status === 401 && "mfaRequired" in response.json && response.json.mfaRequired === true) {
          return {
            ok: false,
            status: response.status,
            message: "MFA verification required",
            mfaRequired: true,
            challenge: response.json.challenge,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: readRouteErrorMessage(response.json, "Revoke failed"),
          mfaRequired: false,
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "Revoke failed",
          mfaRequired: false,
        };
      }
    },

    async getEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEvent[] | null> {
      const page = await apiClient.stationAdminAuth.queryEvents(filters, auth);

      return page?.events ?? null;
    },

    async queryEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEventPage | null> {
      try {
        const response = getStationAdminAuthEventsRoute.handler({ body: undefined, query: filters, auth }) as HandlerResult<
          StationAdminAuthEventsResponse | { message: string },
          StationAdminAuthEventsTelemetry
        >;

        if (response.status !== 200 || !("events" in response.json)) {
          return null;
        }

        return {
          events: response.json.events,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return {
          events: [],
          nextCursor: null,
        };
      }
    },

    async exportEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEventExportPayload | null> {
      try {
        const response = getStationAdminAuthEventsExportRoute.handler({ body: undefined, query: filters, auth }) as HandlerResult<
          StationAdminAuthEventsExportResponse | { message: string },
          StationAdminAuthEventsExportTelemetry
        >;

        if (response.status !== 200 || !("export" in response.json)) {
          return null;
        }

        return response.json.export;
      } catch {
        return null;
      }
    },

    async getSessions(
      query: StationAdminSessionsQuery = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSessionSummary[] | null> {
      try {
        const response = getStationAdminSessionsRoute.handler({ body: undefined, query, auth }) as HandlerResult<
          StationAdminSessionsResponse | { message: string },
          StationAdminSessionsTelemetry
        >;

        if (response.status !== 200 || !("sessions" in response.json)) {
          return null;
        }

        return response.json.sessions;
      } catch {
        return [];
      }
    },

    async getSecuritySummary(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecuritySummary | null> {
      try {
        const response = getStationAdminSecuritySummaryRoute.handler({ body: undefined, auth }) as HandlerResult<
          StationAdminSecuritySummaryResponse | { message: string },
          StationAdminSecuritySummaryTelemetry
        >;

        if (response.status !== 200 || !("summary" in response.json)) {
          return null;
        }

        return response.json.summary;
      } catch {
        return null;
      }
    },

    async getSecurityAlerts(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecurityAlert[] | null> {
      try {
        const response = getStationAdminSecurityAlertsRoute.handler({ body: undefined, auth }) as HandlerResult<
          StationAdminSecurityAlertsResponse | { message: string },
          StationAdminSecurityAlertsTelemetry
        >;

        if (response.status !== 200 || !("alerts" in response.json)) {
          return null;
        }

        return response.json.alerts;
      } catch {
        return [];
      }
    },
  },
  stationAdminMfa: {
    async enrollStart(
      sessionId: string,
      csrfToken: string,
    ): Promise<{ ok: true; qrCodeUri: string; secret: string } | { ok: false; status: number; message: string }> {
      try {
        const response = postMfaEnrollStartRoute.handler({ body: { sessionId, csrfToken } }) as HandlerResult<
          { qrCodeUri: string; secret: string } | { message: string },
          never
        >;

        if (response.status === 200 && "qrCodeUri" in response.json) {
          return { ok: true, qrCodeUri: response.json.qrCodeUri, secret: response.json.secret };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Enrollment start failed") };
      } catch {
        return { ok: false, status: 503, message: "Enrollment start failed" };
      }
    },

    async enrollVerify(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string }
    > {
      try {
        const response = postMfaEnrollVerifyRoute.handler({ body: { sessionId, csrfToken, totpCode } }) as HandlerResult<
          { result: "enrolled"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] } | { message: string },
          never
        >;

        if (response.status === 200 && "result" in response.json && (response.json as { result?: string }).result === "enrolled") {
          const r = response.json as { result: "enrolled"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] };
          return { ok: true, mfa: r.mfa, recoveryCodes: r.recoveryCodes };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Enrollment verification failed") };
      } catch {
        return { ok: false, status: 503, message: "Enrollment verification failed" };
      }
    },

    async recoveryRegenerate(
      sessionId: string,
      csrfToken: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      try {
        const response = postMfaRecoveryRegenerateRoute.handler({ body: { sessionId, csrfToken } }) as HandlerResult<
          | { result: "regenerated"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
          | { mfaRequired: true; challenge: StationAdminMfaChallenge }
          | { message: string },
          never
        >;

        if (response.status === 200 && "result" in response.json && (response.json as { result?: string }).result === "regenerated") {
          const r = response.json as { result: "regenerated"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] };
          return { ok: true, mfa: r.mfa, recoveryCodes: r.recoveryCodes };
        }

        if (response.status === 401 && "mfaRequired" in response.json && (response.json as { mfaRequired?: boolean }).mfaRequired === true) {
          const r = response.json as { mfaRequired: true; challenge: StationAdminMfaChallenge };
          return { ok: false, status: 401, message: "MFA step-up required", mfaRequired: true, challenge: r.challenge };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Recovery code regeneration failed") };
      } catch {
        return { ok: false, status: 503, message: "Recovery code regeneration failed" };
      }
    },

    async disable(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      try {
        const response = postMfaDisableRoute.handler({ body: { sessionId, csrfToken, totpCode } }) as HandlerResult<
          | { ok: true }
          | { mfaRequired: true; challenge: StationAdminMfaChallenge }
          | { message: string },
          never
        >;

        if (response.status === 200 && "ok" in response.json && (response.json as { ok?: boolean }).ok === true) {
          return { ok: true };
        }

        if (response.status === 401 && "mfaRequired" in response.json && (response.json as { mfaRequired?: boolean }).mfaRequired === true) {
          const r = response.json as { mfaRequired: true; challenge: StationAdminMfaChallenge };
          return { ok: false, status: 401, message: "MFA step-up required", mfaRequired: true, challenge: r.challenge };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "MFA disable failed") };
      } catch {
        return { ok: false, status: 503, message: "MFA disable failed" };
      }
    },
  },

  dashboard: {
    async getOverview() {
      try {
        return getDashboardRoute.handler({ body: undefined }).json;
      } catch {
        return dashboardOverviewData;
      }
    },
  },
  liveConditions: {
    async getLatest(): Promise<LiveMarineCondition[]> {
      try {
        const response = getLiveConditionsRoute.handler({ body: undefined }) as HandlerResult<
          LiveConditionsResponse,
          LiveConditionsTelemetry
        >;

        return response.json.conditions;
      } catch {
        return liveMarineConditionsData;
      }
    },
  },
  reefAlerts: {
    async getLatest(): Promise<ReefStressWatchItem[]> {
      try {
        const response = getReefAlertsRoute.handler({ body: undefined }) as HandlerResult<
          ReefAlertsResponse,
          ReefAlertsTelemetry
        >;

        return response.json.alerts;
      } catch {
        return reefStressWatchData;
      }
    },
  },
  ingestionOperations: {
    async getOperationalAlerts(filters: OperationalAlertsFilters = {}): Promise<OperationalAlertsData> {
      const query: OperationalAlertsFilters = {};

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.ruleType) {
        query.ruleType = filters.ruleType;
      }

      const source = filters.source?.trim();
      if (source) {
        query.source = source;
      }

      if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
        query.limit = filters.limit;
      } else if (typeof filters.historyLimit === "number" && Number.isFinite(filters.historyLimit)) {
        query.historyLimit = filters.historyLimit;
      }

      try {
        const response = getOperationalAlertsRoute.handler({ body: undefined, query }) as HandlerResult<
          OperationalAlertsRouteResponse,
          { route: string; source: "db" | "unavailable" }
        >;

        const payload = response.json;

        return {
          source: payload.source,
          fallbackReason: payload.fallback_reason,
          generatedAt: payload.generated_at,
          summary: {
            activeAlertCount: payload.summary.active_alert_count,
            criticalCount: payload.summary.critical_count,
            warningCount: payload.summary.warning_count,
            infoCount: payload.summary.info_count,
            failedSourceCount: payload.summary.failed_source_count,
            staleSourceCount: payload.summary.stale_source_count,
            lastUpdatedAt: payload.summary.last_updated_at,
          },
          activeAlerts: payload.active_alerts.map(mapOperationalAlertsItem),
          recentHistory: payload.recent_history.map(mapOperationalAlertsItem),
        };
      } catch {
        return buildOperationalAlertsFallback();
      }
    },
  },
  investigations: {
    async getWorkspace() {
      try {
        const workspace = getInvestigationsRoute.handler({ body: undefined }).json.workspace;
        const activeInvestigationId = workspace.analysisTracks[0]?.id;

        if (!activeInvestigationId) {
          return {
            ...workspace,
            timeline: [],
          };
        }

        const timelineResponse = getInvestigationTimelineRoute.handler({
          body: { id: activeInvestigationId },
          query: { limit: 50 },
        }) as HandlerResult<InvestigationTimelineResponse, InvestigationTimelineTelemetry>;

        return {
          ...workspace,
          timeline: timelineResponse.json.timeline,
        };
      } catch {
        return {
          ...investigationsWorkspaceData,
          timeline: investigationsTimelineFallbackData,
        };
      }
    },

    async getTimeline(
      investigationId: string,
      filters: InvestigationTimelineFilters = {},
    ): Promise<InvestigationTimelineItem[]> {
      try {
        const response = getInvestigationTimelineRoute.handler({
          body: { id: investigationId },
          query: filters,
        }) as HandlerResult<InvestigationTimelineResponse, InvestigationTimelineTelemetry>;

        return response.json.timeline;
      } catch {
        const eventType = filters.eventType;
        const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
        const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
        const filtered = eventType
          ? investigationsTimelineFallbackData.filter((item) => item.eventType === eventType)
          : investigationsTimelineFallbackData;

        return filtered.slice(0, boundedLimit);
      }
    },

    async recordEvent(
      investigationId: string,
      input: RecordInvestigationEventInput,
    ): Promise<InvestigationTimelineItem | null> {
      try {
        const response = postInvestigationEventRoute.handler({
          body: {
            id: investigationId,
            eventType: input.eventType,
            source: input.source,
            actor: input.actor,
            summary: input.summary,
            detail: input.detail,
            confidence: input.confidence,
          },
        }) as HandlerResult<InvestigationEventCreateResponse | { message: string }, InvestigationEventCreateTelemetry>;

        if (response.status !== 201 || !("event" in response.json)) {
          return null;
        }

        return response.json.event;
      } catch {
        return null;
      }
    },
  },
  signals: {
    async list(filters: SignalFilters = {}): Promise<SignalDetection[]> {
      try {
        const response = getSignalsRoute.handler({
          body: undefined,
          query: {
            signalType: filters.signalType,
            severity: filters.severity,
            status: filters.status,
            region: filters.region,
            stationId: filters.stationId,
            limit: filters.limit,
          },
        }) as HandlerResult<SignalsListResponse, SignalsListTelemetry>;

        return response.json.signals;
      } catch {
        const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
        const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

        return signalDetectionsFallbackData
          .filter((signal) => {
            if (filters.signalType && signal.signalType !== filters.signalType) {
              return false;
            }

            if (filters.severity && signal.severity !== filters.severity) {
              return false;
            }

            if (filters.status && signal.status !== filters.status) {
              return false;
            }

            if (filters.region && signal.region.toLowerCase() !== filters.region.trim().toLowerCase()) {
              return false;
            }

            if (filters.stationId && signal.stationId !== filters.stationId) {
              return false;
            }

            return true;
          })
          .sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime())
          .slice(0, boundedLimit);
      }
    },

    async getById(signalId: string): Promise<SignalDetection | null> {
      try {
        const response = getSignalByIdRoute.handler({ body: { id: signalId } }) as HandlerResult<
          SignalDetailResponse | { message: string },
          SignalDetailTelemetry
        >;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return signalDetectionsFallbackData.find((signal) => signal.id === signalId) ?? null;
      }
    },

    async create(input: CreateSignalInput): Promise<SignalDetection | null> {
      try {
        const response = postSignalCreateRoute.handler({ body: input as SignalCreateRequest }) as HandlerResult<
          SignalCreateResponse | { message: string },
          SignalCreateTelemetry
        >;

        if (response.status !== 201 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },

    async promote(signalId: string, input: PromoteSignalInput): Promise<SignalDetection | null> {
      try {
        const response = postSignalPromoteRoute.handler({
          body: {
            id: signalId,
            investigationId: input.investigationId,
            actor: input.actor,
          },
        }) as HandlerResult<SignalPromoteResponse | { message: string }, SignalPromoteTelemetry>;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },

    async dismiss(signalId: string, actor?: string): Promise<SignalDetection | null> {
      try {
        const response = postSignalDismissRoute.handler({
          body: {
            id: signalId,
            actor,
          },
        }) as HandlerResult<SignalDismissResponse | { message: string }, SignalDismissTelemetry>;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },
  },
  species: {
    async list(filters: SpeciesFilters = {}): Promise<SpeciesProfile[]> {
      try {
        const response = getSpeciesRoute.handler({
          body: undefined,
          query: {
            region: filters.region,
            conservationStatus: filters.conservationStatus,
            limit: filters.limit,
          },
        }) as HandlerResult<SpeciesListResponse | { message: string }, SpeciesListTelemetry>;

        if (response.status !== 200 || !("species" in response.json)) {
          return [];
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.species;
      } catch {
        return [];
      }
    },

    async getById(speciesId: string): Promise<SpeciesProfile | null> {
      try {
        const response = getSpeciesByIdRoute.handler({ body: { id: speciesId } }) as HandlerResult<
          SpeciesDetailResponse | { message: string },
          SpeciesDetailTelemetry
        >;

        if (response.status !== 200 || !("species" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return null;
        }

        return response.json.species;
      } catch {
        return null;
      }
    },

    async listSightings(filters: SpeciesSightingFilters = {}): Promise<SpeciesSighting[]> {
      if (filters.speciesId) {
        const bySpecies = await apiClient.species.getSightingsBySpecies(filters.speciesId, {
          region: filters.region,
          stationId: filters.stationId,
          verificationStatus: filters.verificationStatus,
          limit: filters.limit,
        });

        return bySpecies ?? [];
      }

      const species = await apiClient.species.list({ limit: 25 });

      if (species.length === 0) {
        return [];
      }

      const sightingsGroups = await Promise.all(
        species.map((entry) =>
          apiClient.species.getSightingsBySpecies(entry.id, {
            region: filters.region,
            stationId: filters.stationId,
            verificationStatus: filters.verificationStatus,
            limit: filters.limit ?? 8,
          }),
        ),
      );

      const merged = sightingsGroups
        .flatMap((group) => group ?? [])
        .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime());

      const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
      const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

      return merged.slice(0, boundedLimit);
    },

    async getSightingsBySpecies(
      speciesId: string,
      filters: Omit<SpeciesSightingFilters, "speciesId"> = {},
    ): Promise<SpeciesSighting[] | null> {
      try {
        const response = getAllSpeciesSightingsRoute.handler({
          body: { id: speciesId },
          query: {
            region: filters.region,
            stationId: filters.stationId,
            verificationStatus: filters.verificationStatus,
            limit: filters.limit,
          },
        }) as HandlerResult<SpeciesSightingsResponse | { message: string }, SpeciesSightingsTelemetry>;

        if (response.status === 404) {
          return null;
        }

        if (response.status !== 200 || !("sightings" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.sightings;
      } catch {
        return null;
      }
    },

    async createSighting(
      input: CreateSpeciesSightingInput,
      auth?: OceanStationAdminAuthContext,
    ): Promise<SpeciesSighting | null> {
      try {
        const response = postSpeciesSightingRoute.handler({
          body: {
            ...(input as SpeciesSightingCreateRequest),
            csrfToken: auth?.csrfToken ?? "",
          },
          auth,
        }) as HandlerResult<SpeciesSightingCreateResponse | { message: string }, SpeciesSightingCreateTelemetry>;

        if (response.status !== 201 || !("sighting" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return null;
        }

        return response.json.sighting;
      } catch {
        return null;
      }
    },

    async listMovementSignals(
      speciesId: string,
      filters: SpeciesMovementSignalFilters = {},
    ): Promise<SpeciesMovementSignal[] | null> {
      try {
        const response = getSpeciesMovementSignalsRoute.handler({
          body: { id: speciesId },
          query: {
            movementType: filters.movementType,
            minConfidence: filters.minConfidence,
            startDate: filters.startDate,
            endDate: filters.endDate,
            region: filters.region,
            stationId: filters.stationId,
            investigationId: filters.investigationId,
            limit: filters.limit,
          },
        }) as HandlerResult<
          SpeciesMovementSignalsResponse | { message: string },
          SpeciesMovementSignalsTelemetry
        >;

        if (response.status === 404) {
          return null;
        }

        if (response.status !== 200 || !("movementSignals" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.movementSignals;
      } catch {
        return null;
      }
    },

    getFallbackSpecies(): SpeciesProfile[] {
      return speciesFallbackData;
    },

    getFallbackSightings(): SpeciesSighting[] {
      return speciesSightingsFallbackData;
    },

    getFallbackMovementSignals(): SpeciesMovementSignal[] {
      return speciesMovementSignalsFallbackData;
    },
  },
  dataExplorer: {
    async getWorkspace(filters?: DataExplorerDatasetFilters): Promise<DataExplorerWorkspaceFetchResult> {
      const query = normalizeDatasetFilters(filters);
      const startedAtMs = Date.now();

      try {
        if (canUseDataExplorerNetworkBoundary()) {
          const searchParams = new URLSearchParams();
          appendDataExplorerQuery(searchParams, "q", query.q);
          appendDataExplorerQuery(searchParams, "category", query.category);
          appendDataExplorerQuery(searchParams, "region", query.region);
          appendDataExplorerQuery(searchParams, "status", query.status);
          appendDataExplorerQuery(searchParams, "sortBy", query.sortBy);
          appendDataExplorerQuery(searchParams, "sortDir", query.sortDir);
          appendDataExplorerQuery(searchParams, "page", query.page);
          appendDataExplorerQuery(searchParams, "pageSize", query.pageSize);

          const endpoint = searchParams.size > 0
            ? `/api/data-explorer?${searchParams.toString()}`
            : "/api/data-explorer";
          const response = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" } });
          const payload = (await response.json()) as
            | DataExplorerWorkspaceFetchResult["data"]
            | { message?: string };

          if (response.ok && "datasets" in payload) {
            const headerMeta = createDataExplorerHeaderMeta(response);
            const result = {
              data: payload,
              meta: buildFetchMeta("workspace", startedAtMs, {
                state: "success",
                  delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerWorkspaceFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          throw new Error("Network workspace response was not in the expected shape.");
        }

        const response = getDatasetsRoute.handler({ body: undefined, query }) as HandlerResult<
          DataExplorerWorkspaceFetchResult["data"],
          DatasetsTelemetry
        >;
        const result = {
          data: response.json,
          meta: buildFetchMeta("workspace", startedAtMs, {
            state: "success",
            delivery: "in_process",
            source: response.telemetry?.source,
            fallbackReason: response.telemetry?.fallbackReason,
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      } catch {
        const fallbackResponse = buildDatasetsRouteResponse(query);
        const result = {
          data: fallbackResponse.json,
          meta: buildFetchMeta("workspace", startedAtMs, {
            state: "success",
            delivery: "fallback_builder",
            source: fallbackResponse.telemetry.source,
            fallbackReason: fallbackResponse.telemetry.fallbackReason,
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async getDatasetDetail(datasetId: string): Promise<DataExplorerDatasetDetailFetchResult> {
      const startedAtMs = Date.now();

      try {
        if (canUseDataExplorerNetworkBoundary()) {
          const response = await fetch(`/api/data-explorer/${encodeURIComponent(datasetId)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          const payload = (await response.json()) as DataExplorerDatasetDetail | { message?: string };
          const headerMeta = createDataExplorerHeaderMeta(response);

          if (response.status === 404) {
            const result = {
              data: null,
              meta: buildFetchMeta("detail", startedAtMs, {
                state: "not_found",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerDatasetDetailFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          if (response.ok && "id" in payload) {
            const result = {
              data: payload,
              meta: buildFetchMeta("detail", startedAtMs, {
                state: "success",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerDatasetDetailFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          throw new Error("Network detail response was not in the expected shape.");
        }

        const response = getDatasetByIdRoute.handler({ body: { id: datasetId } }) as HandlerResult<
          DataExplorerDatasetDetail | { message: string },
          DatasetDetailTelemetry
        >;

        if (response.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "not_found",
              datasetId,
              delivery: "in_process",
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        const result = {
          data: response.json as DataExplorerDatasetDetail,
          meta: buildFetchMeta("detail", startedAtMs, {
            state: "success",
            datasetId,
            delivery: "in_process",
            source: response.telemetry?.source,
            fallbackReason: response.telemetry?.fallbackReason,
          }),
        } satisfies DataExplorerDatasetDetailFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      } catch (error) {
        const fallbackResponse = buildDatasetDetailRouteResponse(datasetId);

        if (fallbackResponse.status === 200 && !("message" in fallbackResponse.json)) {
          const result = {
            data: fallbackResponse.json,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "fallback_builder",
              source: fallbackResponse.telemetry.source,
              fallbackReason: fallbackResponse.telemetry.fallbackReason,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        if (fallbackResponse.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "not_found",
              datasetId,
              delivery: "fallback_builder",
              source: fallbackResponse.telemetry.source,
              fallbackReason: fallbackResponse.telemetry.fallbackReason,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        const result = {
          data: null,
          meta: buildFetchMeta("detail", startedAtMs, {
            state: "error",
            datasetId,
            delivery: "fallback_builder",
            source: "mock",
            fallbackReason: "db_query_failed",
            errorMessage: error instanceof Error ? error.message : "Unknown detail fetch error",
          }),
        } satisfies DataExplorerDatasetDetailFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async getDatasetRecords(
      datasetId: string,
      query?: DataExplorerRelatedRecordsQuery,
    ): Promise<DataExplorerRelatedRecordsFetchResult> {
      const startedAtMs = Date.now();

      try {
        if (canUseDataExplorerNetworkBoundary()) {
          const searchParams = new URLSearchParams();
          appendDataExplorerQuery(searchParams, "sortBy", query?.sortBy);
          appendDataExplorerQuery(searchParams, "sortDir", query?.sortDir);
          appendDataExplorerQuery(searchParams, "page", query?.page);
          appendDataExplorerQuery(searchParams, "pageSize", query?.pageSize);
          const endpoint = searchParams.size > 0
            ? `/api/data-explorer/${encodeURIComponent(datasetId)}/records?${searchParams.toString()}`
            : `/api/data-explorer/${encodeURIComponent(datasetId)}/records`;

          const response = await fetch(endpoint, {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          const payload = (await response.json()) as
            | DataExplorerRelatedRecordsResult
            | { message?: string };
          const headerMeta = createDataExplorerHeaderMeta(response);

          if (response.status === 404) {
            const result = {
              data: null,
              meta: buildFetchMeta("records", startedAtMs, {
                state: "not_found",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerRelatedRecordsFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          if (response.ok && "records" in payload) {
            const result = {
              data: payload,
              meta: buildFetchMeta("records", startedAtMs, {
                state: "success",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerRelatedRecordsFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          throw new Error("Network records response was not in the expected shape.");
        }

        const response = getDatasetRecordsRoute.handler({ body: { id: datasetId }, query }) as HandlerResult<
          DataExplorerRelatedRecordsResult | { message: string },
          DatasetRecordsTelemetry
        >;

        if (response.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "not_found",
              datasetId,
              delivery: "in_process",
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        if ("records" in response.json) {
          const result = {
            data: response.json,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "in_process",
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }
      } catch {
        const fallbackResponse = buildDatasetRecordsRouteResponse(datasetId, query);

        if (fallbackResponse.status === 200 && "records" in fallbackResponse.json) {
          const result = {
            data: fallbackResponse.json,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "fallback_builder",
              source: fallbackResponse.telemetry.source,
              fallbackReason: fallbackResponse.telemetry.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        const result = {
          data: null,
          meta: buildFetchMeta("records", startedAtMs, {
            state: "not_found",
            datasetId,
            delivery: "fallback_builder",
            source: fallbackResponse.telemetry.source,
            fallbackReason: fallbackResponse.telemetry.fallbackReason,
          }),
        } satisfies DataExplorerRelatedRecordsFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }

      throw new Error("Dataset records response was not in the expected shape.");
    },
    async listPresetAuditEvents(options?: {
      scope?: DataExplorerPresetScope;
      presetId?: string;
      actorId?: string;
      limit?: number;
    }): Promise<DataExplorerPresetAuditListResult> {
      const scope = options?.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetAuditStoreUnavailableResult(scope);
      }

      try {
        const url = new URL("/api/data-explorer/presets/audit", "http://localhost");
        url.searchParams.set("scope", scope);

        if (options?.presetId) {
          url.searchParams.set("presetId", options.presetId);
        }

        if (options?.actorId) {
          url.searchParams.set("actorId", options.actorId);
        }

        if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
          url.searchParams.set("limit", String(Math.floor(options.limit)));
        }

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parsePresetAuditListResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetAuditStoreUnavailableResult(scope);
    },
    async listBehaviorEvents(options?: {
      scope?: DataExplorerPresetScope;
      limit?: number;
    }): Promise<DataExplorerBehaviorEventListResult> {
      const scope = options?.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createBehaviorStoreUnavailableResult(scope);
      }

      try {
        const url = new URL("/api/data-explorer/activity", "http://localhost");
        url.searchParams.set("scope", scope);

        if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
          url.searchParams.set("limit", String(Math.floor(options.limit)));
        }

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parseBehaviorEventListResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createBehaviorStoreUnavailableResult(scope);
    },
    async writeBehaviorEvent(input: {
      eventType: DataExplorerBehaviorEventType;
      scope?: DataExplorerPresetScope;
      presetId?: string;
      presetName?: string;
      datasetId?: string;
      datasetName?: string;
      sourceContext?: Record<string, unknown>;
    }): Promise<DataExplorerBehaviorEventWriteResult> {
      const scope = input.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createBehaviorWriteUnavailableResult(scope);
      }

      try {
        const url = new URL("/api/data-explorer/activity", "http://localhost");
        url.searchParams.set("scope", scope);

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "POST",
          headers: {
            ...buildPresetScopeHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        const payload = parseBehaviorEventWriteResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createBehaviorWriteUnavailableResult(scope);
    },
    async listPresets(scope: DataExplorerPresetScope = "shared"): Promise<DataExplorerPresetMutationResult> {
      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(buildPresetScopeUrl(scope), {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
    async upsertPreset(input: {
      id?: string;
      name: string;
      scope?: DataExplorerPresetScope;
      filters: Partial<DataExplorerPresetFilters>;
    }): Promise<DataExplorerPresetMutationResult> {
      const scope = input.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(buildPresetScopeUrl(scope), {
          method: "POST",
          headers: {
            ...buildPresetScopeHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
    async deletePreset(
      presetId: string,
      scope: DataExplorerPresetScope = "shared",
    ): Promise<DataExplorerPresetMutationResult> {
      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(
          buildPresetScopeUrl(scope, `/api/data-explorer/presets/${encodeURIComponent(presetId)}`),
          {
          method: "DELETE",
            headers: buildPresetScopeHeaders(),
          },
        );
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
    async markPresetUsed(
      presetId: string,
      scope: DataExplorerPresetScope = "shared",
    ): Promise<DataExplorerPresetMutationResult> {
      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(
          buildPresetScopeUrl(scope, `/api/data-explorer/presets/${encodeURIComponent(presetId)}/mark-used`),
          {
            method: "POST",
            headers: buildPresetScopeHeaders(),
          },
        );
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
  },
  oceanMap: {
    async getWorkspace() {
      try {
        return getRegionsRoute.handler({ body: undefined }).json.map;
      } catch {
        return oceanMapWorkspaceData;
      }
    },
  },
  oceanStations: {
    async getStations() {
      try {
        return getStationsRoute.handler({ body: undefined }).json.stations;
      } catch {
        return oceanStationsData;
      }
    },
    async getStationById(stationId: string): Promise<OceanStationDetail | null> {
      try {
        const response = getStationByIdRoute.handler({ body: { id: stationId } });

        if (response.status === 404 || "message" in response.json) {
          return null;
        }

        return response.json;
      } catch {
        return findMockStation(stationId);
      }
    },
    async getStationBySlug(slug: string): Promise<OceanStationDetail | null> {
      return apiClient.oceanStations.getStationById(slug);
    },
    async getStationAdmin(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = getStationAdminRoute.handler({ body: { id: stationId }, auth }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          OceanStationAdminTelemetry
        >;

        if ((response.status === 404 || response.status === 403) || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return findMockStation(stationId);
      }
    },
    async getStationAdminAudit(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationAdminAuditEntry[] | null> {
      try {
        const response = getStationAdminAuditRoute.handler({ body: { id: stationId }, auth }) as HandlerResult<
          { entries: OceanStationAdminAuditEntry[] } | { message: string },
          OceanStationAdminAuditTelemetry
        >;

        if ((response.status === 404 || response.status === 403) || !("entries" in response.json)) {
          return null;
        }

        return response.json.entries;
      } catch {
        return [];
      }
    },
    async updateStation(
      stationId: string,
      patch: OceanStationAdminPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async updateStationBranding(
      stationId: string,
      patch: OceanStationAdminBrandingPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationBrandingRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async updateStationContent(
      stationId: string,
      patch: OceanStationAdminContentPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationContentRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async getStationAnalytics(stationId: string): Promise<OceanStationAnalytics | null> {
      try {
        const response = getStationAnalyticsRoute.handler({ body: { id: stationId } }) as HandlerResult<
          { analytics: OceanStationAnalytics } | { message: string },
          OceanStationAnalyticsTelemetry
        >;

        if (response.status === 404 || !("analytics" in response.json)) {
          return null;
        }

        return response.json.analytics;
      } catch {
        const fromId = oceanStationAnalytics[stationId];

        if (fromId) {
          return cloneAnalytics(fromId);
        }

        const bySlug = Object.values(oceanStationDetails).find((station) => station.slug === stationId);

        if (!bySlug) {
          return null;
        }

        const fromSlug = oceanStationAnalytics[bySlug.id];
        return fromSlug ? cloneAnalytics(fromSlug) : null;
      }
    },
    async trackStationView(stationId: string, viewType: OceanStationViewType): Promise<void> {
      try {
        postStationViewRoute.handler({ body: { id: stationId, viewType } }) as HandlerResult<
          { ok: true; stationId: string; viewType: OceanStationViewType; viewedAt: string } | { message: string },
          StationViewTrackTelemetry
        >;
      } catch {
        const station = findMockStation(stationId);

        if (!station) {
          return;
        }

        const current = oceanStationAnalytics[station.id] ?? {
          stationId: station.id,
          views: { detail: 0, exhibit: 0, public: 0, total: 0 },
          lastViewedAt: null,
        };

        current.views[viewType] += 1;
        current.views.total += 1;
        current.lastViewedAt = nowIso();
        oceanStationAnalytics[station.id] = current;
      }
    },
    async acknowledgeAlert(
      stationId: string,
      alertId: string,
      actorId: string,
    ): Promise<
      | { ok: true; alert: OceanStationAlert; timelineEvent?: StationAlertAcknowledgeResponse["timelineEvent"] }
      | { ok: false; status: 404 | 409; message: string }
    > {
      try {
        const response = postStationAlertAcknowledgeRoute.handler({
          body: { id: stationId, alertId, actorId },
        }) as HandlerResult<StationAlertAcknowledgeResponse | { message: string }, StationAlertAcknowledgeTelemetry>;

        if (response.status === 200 && "alert" in response.json) {
          return {
            ok: true,
            alert: response.json.alert,
            timelineEvent: "timelineEvent" in response.json ? response.json.timelineEvent : undefined,
          };
        }

        const message = "message" in response.json ? response.json.message : "Unexpected error";
        return { ok: false, status: response.status as 404 | 409, message };
      } catch {
        return { ok: false, status: 404, message: "Failed to acknowledge alert" };
      }
    },
  },
  aiLab: {
    async getWorkspace() {
      try {
        return getAiLabRoute.handler({ body: undefined }).json;
      } catch {
        return aiLabWorkspaceData;
      }
    },
    async analyze(input: AnalyzeRequestBody) {
      try {
        return postAiAnalyzeRoute.handler({ body: input }).json;
      } catch {
        const [summary, findings, evidence, confidence, uncertainty, suggestedNextActions] =
          aiLabWorkspaceData.results;

        return {
          prompt: input.prompt,
          summary,
          findings,
          evidence,
          confidence,
          uncertainty,
          suggestedNextActions,
          sources: aiLabWorkspaceData.sources,
        };
      }
    },
  },
  stationEvents: {
    async queryEvents(
      stationId: string,
      filters: StationEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventListResponse | null> {
      try {
        const response = getStationEventsRoute.handler({
          body: { id: stationId },
          query: filters,
          auth,
        }) as HandlerResult<StationEventListResponse | { message: string }, StationEventsListTelemetry>;

        if (response.status !== 200 || !("events" in response.json)) {
          return null;
        }

        return {
          events: response.json.events,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return { events: [], nextCursor: null };
      }
    },

    async getEvents(
      stationId: string,
      filters: StationEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventListItem[] | null> {
      const page = await apiClient.stationEvents.queryEvents(stationId, filters, auth);

      return page?.events ?? null;
    },

    async getEventDetail(
      stationId: string,
      eventId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventDetail | null> {
      try {
        const response = getStationEventDetailRoute.handler({
          body: { id: stationId, eventId },
          auth,
        }) as HandlerResult<StationEventDetailResponse | { message: string }, StationEventDetailTelemetry>;

        if (response.status !== 200 || !("event" in response.json)) {
          return null;
        }

        return response.json.event;
      } catch {
        return null;
      }
    },

    async queryInvestigations(
      stationId: string,
      filters: StationInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationListResponse | null> {
      try {
        const response = getStationInvestigationsRoute.handler({
          body: { id: stationId },
          query: filters,
          auth,
        }) as HandlerResult<StationInvestigationListResponse | { message: string }, StationInvestigationsListTelemetry>;

        if (response.status !== 200 || !("investigations" in response.json)) {
          return null;
        }

        return {
          investigations: response.json.investigations,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return { investigations: [], nextCursor: null };
      }
    },

    async getInvestigations(
      stationId: string,
      filters: StationInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationSummary[] | null> {
      const page = await apiClient.stationEvents.queryInvestigations(stationId, filters, auth);

      return page?.investigations ?? null;
    },

    async getInvestigationDetail(
      stationId: string,
      investigationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationDetail | null> {
      try {
        const response = getStationInvestigationDetailRoute.handler({
          body: { id: stationId, investigationId },
          auth,
        }) as HandlerResult<StationInvestigationDetailResponse | { message: string }, StationInvestigationDetailTelemetry>;

        if (response.status !== 200 || !("investigation" in response.json)) {
          return null;
        }

        return response.json.investigation;
      } catch {
        return null;
      }
    },

    async acknowledgeEvent(
      stationId: string,
      eventId: string,
      actorId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; event: StationEventAcknowledgeResponse["event"] }
      | { ok: false; status: 403 | 404 | 409; message: string }
    > {
      try {
        const response = postStationEventAcknowledgeRoute.handler({
          body: { id: stationId, eventId, actorId },
          auth,
        }) as HandlerResult<StationEventAcknowledgeResponse | { message: string }, StationEventAcknowledgeTelemetry>;

        if (response.status === 200 && "event" in response.json) {
          return { ok: true, event: response.json.event };
        }

        const message = "message" in response.json ? response.json.message : "Unexpected error";
        return { ok: false, status: response.status as 403 | 404 | 409, message };
      } catch {
        return { ok: false, status: 404, message: "Failed to acknowledge event" };
      }
    },
  },
};
```

## apps/web/lib/api/client.data-explorer.test.ts
```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import { dataExplorerWorkspaceData } from "@/lib/api/mock-data";
import * as datasetsRoutes from "../../../api/src/routes/datasets";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("network unavailable"));
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("workspace fetch uses network API boundary in browser mode when available", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ...dataExplorerWorkspaceData,
        datasets: [dataExplorerWorkspaceData.datasets[0]!],
        pageInfo: {
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
          sortBy: "updated",
          sortDir: "desc",
        },
      }),
      {
        status: 200,
        headers: {
          "x-marine-data-source": "db",
          "x-marine-fallback-reason": "",
        },
      },
    ),
  );

  const result = await apiClient.dataExplorer.getWorkspace({ q: "thermal" });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer?q=thermal",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.meta.delivery).toBe("browser_api");
  expect(result.meta.source).toBe("db");
  expect(result.meta.state).toBe("success");
  expect(result.data.datasets).toHaveLength(1);
});

test("dataset detail fetch maps network 404 to not_found", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ message: "Dataset not found" }), {
      status: 404,
      headers: {
        "x-marine-data-source": "db",
      },
    }),
  );

  const result = await apiClient.dataExplorer.getDatasetDetail("DST-MISSING");

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/DST-MISSING",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.data).toBeNull();
  expect(result.meta.state).toBe("not_found");
  expect(result.meta.source).toBe("db");
});

test("workspace fetch falls back through typed dataset route builder when route handler throws", async () => {
  vi.spyOn(datasetsRoutes.getDatasetsRoute, "handler").mockImplementation(() => {
    throw new Error("handler failed");
  });

  const buildSpy = vi.spyOn(datasetsRoutes, "buildDatasetsRouteResponse").mockReturnValue({
    json: {
      ...dataExplorerWorkspaceData,
      datasets: [dataExplorerWorkspaceData.datasets[0]!],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
        sortBy: "updated",
        sortDir: "desc",
      },
    },
    telemetry: {
      route: "GET /datasets",
      source: "db",
      datasetCount: 1,
      filtersApplied: true,
      filterSummary: {
        q: "thermal",
      },
      sortBy: "updated",
      sortDir: "desc",
      page: 1,
      pageSize: 25,
    },
  });

  const result = await apiClient.dataExplorer.getWorkspace({ q: "  thermal " });

  expect(buildSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      q: "thermal",
    }),
  );
  expect(result.data.datasets).toHaveLength(1);
  expect(result.meta.state).toBe("success");
  expect(result.meta.source).toBe("db");
});

test("dataset detail fetch falls back through typed dataset detail route builder when route handler throws", async () => {
  vi.spyOn(datasetsRoutes.getDatasetByIdRoute, "handler").mockImplementation(() => {
    throw new Error("handler failed");
  });

  vi.spyOn(datasetsRoutes, "buildDatasetDetailRouteResponse").mockReturnValue({
    status: 200,
    json: {
      id: "DST-104",
      name: "Pacific Thermal Front Observations",
      category: "Temperature",
      region: "North Pacific",
      updated: "5 min ago",
      records: "1.2M",
      status: "Live",
      metadata: {
        Owner: "Ocean Systems Lab",
      },
    },
    telemetry: {
      route: "GET /datasets/:id",
      datasetId: "DST-104",
      source: "db",
      result: "found",
      metadataSource: "db_full",
    },
  });

  const result = await apiClient.dataExplorer.getDatasetDetail("DST-104");

  expect(result.meta.state).toBe("success");
  expect(result.meta.source).toBe("db");
  expect(result.data?.id).toBe("DST-104");
});

test("dataset records fetch falls back through typed dataset records route builder when route handler throws", async () => {
  vi.spyOn(datasetsRoutes.getDatasetRecordsRoute, "handler").mockImplementation(() => {
    throw new Error("handler failed");
  });

  vi.spyOn(datasetsRoutes, "buildDatasetRecordsRouteResponse").mockReturnValue({
    status: 200,
    json: {
      records: [
        {
          id: "ALT-214",
          title: "Thermal spike detected in reef-edge grid",
          type: "Alert",
          status: "Open",
          updated: "11 min ago",
          summary: "Elevated surface temperature exceeded the seasonal envelope.",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 5,
        totalItems: 1,
        totalPages: 1,
        sortBy: "updated",
        sortDir: "desc",
      },
    },
    telemetry: {
      route: "GET /datasets/:id/records",
      datasetId: "DST-104",
      source: "db",
      recordCount: 1,
      result: "found",
      sortBy: "updated",
      sortDir: "desc",
      page: 1,
      pageSize: 5,
    },
  });

  const result = await apiClient.dataExplorer.getDatasetRecords("DST-104", {
    sortBy: "updated",
    sortDir: "desc",
    page: 1,
    pageSize: 5,
  });

  expect(result.meta.state).toBe("success");
  expect(result.meta.source).toBe("db");
  expect(result.data?.records).toHaveLength(1);
});

test("listPresets fetches shared presets from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        presets: [
          {
            id: "shared-1",
            name: "Shared Thermal",
            scope: "shared",
            filters: {
              q: "thermal",
              category: "",
              region: "",
              status: "Live",
              sortBy: "updated",
              sortDir: "desc",
              pageSize: 25,
            },
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:00:00.000Z",
            lastUsedAt: null,
            useCount: 0,
          },
        ],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listPresets();

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets?scope=shared",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.presets).toHaveLength(1);
  expect(result.presets[0]?.name).toBe("Shared Thermal");
});

test("listPresets does not send a client owner header for personal scope", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        presets: [],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listPresets("personal");

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets?scope=personal",
    expect.objectContaining({ method: "GET" }),
  );
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    headers: {
      Accept: "application/json",
    },
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
  expect(result.ok).toBe(true);
});

test("upsertPreset returns storage_unavailable when shared preset API call fails", async () => {
  fetchMock.mockRejectedValueOnce(new Error("network unavailable"));

  const result = await apiClient.dataExplorer.upsertPreset({
    name: "Thermal Live",
    filters: {
      q: "thermal",
      status: "Live",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets?scope=shared",
    expect.objectContaining({ method: "POST" }),
  );
  expect(result.ok).toBe(false);
  expect(result.reason).toBe("storage_unavailable");
});

test("preset mutations keep personal scope in the route path without a client owner header", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, presets: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, presets: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, presets: [] }), { status: 200 }));

  await apiClient.dataExplorer.upsertPreset({
    name: "Personal Thermal",
    scope: "personal",
    filters: { q: "thermal" },
  });
  await apiClient.dataExplorer.deletePreset("preset-1", "personal");
  await apiClient.dataExplorer.markPresetUsed("preset-1", "personal");

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/data-explorer/presets?scope=personal",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        name: "Personal Thermal",
        scope: "personal",
        filters: { q: "thermal" },
      }),
    }),
  );
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");

  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/data-explorer/presets/preset-1?scope=personal",
    expect.objectContaining({
      method: "DELETE",
    }),
  );
  expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
    Accept: "application/json",
  });
  expect(fetchMock.mock.calls[1]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");

  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "/api/data-explorer/presets/preset-1/mark-used?scope=personal",
    expect.objectContaining({
      method: "POST",
    }),
  );
  expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({
    Accept: "application/json",
  });
  expect(fetchMock.mock.calls[2]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
});

test("listPresetAuditEvents fetches scoped preset activity from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        events: [
          {
            id: "audit-1",
            presetId: "shared-1",
            presetName: "Shared Thermal",
            scope: "shared",
            action: "created",
            actorId: null,
            actorType: "unknown",
            ownerId: null,
            outcome: "success",
            createdAt: "2026-03-20T10:00:00.000Z",
            metadata: {
              filters: {
                q: "thermal",
              },
            },
          },
        ],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listPresetAuditEvents({
    scope: "shared",
    limit: 5,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets/audit?scope=shared&limit=5",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]?.action).toBe("created");
});

test("listPresetAuditEvents keeps personal scope route query and no client owner header", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, events: [] }), { status: 200 }));

  const result = await apiClient.dataExplorer.listPresetAuditEvents({
    scope: "personal",
    presetId: "preset-1",
    actorId: "operator-1",
    limit: 10,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets/audit?scope=personal&presetId=preset-1&actorId=operator-1&limit=10",
    expect.objectContaining({ method: "GET" }),
  );
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    headers: {
      Accept: "application/json",
    },
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
  expect(result.ok).toBe(true);
});

test("listBehaviorEvents fetches recent usage rows from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        events: [
          {
            id: "behavior-1",
            eventType: "dataset_selected",
            scope: "shared",
            actorId: null,
            actorLabel: "Unknown actor",
            ownerId: null,
            presetId: null,
            presetName: null,
            datasetId: "DST-101",
            datasetName: "Atlantic Thermal",
            createdAt: "2026-03-20T13:00:00.000Z",
          },
        ],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listBehaviorEvents({
    scope: "shared",
    limit: 5,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/activity?scope=shared&limit=5",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]?.eventType).toBe("dataset_selected");
});

test("writeBehaviorEvent posts scoped activity without client owner headers", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

  const result = await apiClient.dataExplorer.writeBehaviorEvent({
    eventType: "preset_applied",
    scope: "personal",
    presetId: "preset-1",
    presetName: "Personal Thermal",
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/activity?scope=personal",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        eventType: "preset_applied",
        scope: "personal",
        presetId: "preset-1",
        presetName: "Personal Thermal",
      }),
    }),
  );
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
  expect(result.ok).toBe(true);
});
```

## apps/web/components/data-explorer/data-explorer-workspace.tsx
```ts
"use client";

import {
  BellDot,
  Bot,
  Database,
  Download,
  Eye,
  FileSearch,
  Filter,
  Layers3,
  Play,
  Search,
  Sparkles,
  Table2,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiClient } from "@/lib/api/client";
import type {
  DataExplorerDatasetDetail,
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
  DataExplorerFetchMeta,
  DataExplorerPageInfo,
  DataExplorerDatasetRow,
  DataExplorerMetadataItem,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsPageInfo,
  DataExplorerRelatedRecordsQuery,
  DataExplorerRelatedRecordSortBy,
  DataExplorerSortDirection,
  DataExplorerWorkspaceData,
  ExplorerAction,
} from "@/lib/api/types";
import {
  deleteDataExplorerPresetById,
  loadDataExplorerPresets,
  markDataExplorerPresetUsed,
  saveDataExplorerPreset,
  upsertDataExplorerPreset,
} from "@/lib/persistence/data-explorer-presets";
import type {
  DataExplorerBehaviorEvent,
  DataExplorerPresetAuditEvent,
  DataExplorerPresetMutationReason,
  DataExplorerPresetRecord,
  DataExplorerPresetScope,
} from "@/lib/persistence/types";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDataExplorerPresetUsageMeta,
  isDataExplorerPresetInSync,
  selectDataExplorerPresetById,
  selectSortedDataExplorerPresets,
  toDataExplorerPresetFilterSnapshot,
} from "@/components/data-explorer/preset-presentation";

const STATUS_STYLES = {
  Curated: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  Live: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  Draft: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const TONE_STYLES = {
  cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const ACTION_ICONS: Record<ExplorerAction["icon"], LucideIcon> = {
  play: Play,
  download: Download,
  layers: Layers3,
};

const EMPTY_FILTERS: Required<DataExplorerDatasetFilters> = {
  q: "",
  category: "",
  region: "",
  status: "",
  sortBy: "updated",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
};

const EMPTY_RECORD_FILTERS: Required<DataExplorerRelatedRecordsQuery> = {
  sortBy: "updated",
  sortDir: "desc",
  page: 1,
  pageSize: 5,
};

type DetailStatus = "idle" | "loading" | "not_found" | "error";
type RecordsStatus = "idle" | "loading" | "empty" | "not_found" | "error";
type ListStatus = "idle" | "loading" | "empty" | "error";
type PresetStatus = "idle" | "error";
type PresetActivityStatus = "idle" | "loading" | "error";
type BehaviorActivityStatus = "idle" | "loading" | "error";

const SHOW_DEBUG = process.env.NODE_ENV !== "production";

interface DataExplorerWorkspaceProps {
  data: DataExplorerWorkspaceData;
  initialMeta?: DataExplorerFetchMeta | null;
}

function formatFallbackReasonLabel(
  fallbackReason: DataExplorerFetchMeta["fallbackReason"],
): string {
  if (fallbackReason === "db_path_missing") {
    return "DB path missing";
  }

  if (fallbackReason === "db_open_failed") {
    return "DB open failed";
  }

  if (fallbackReason === "db_query_failed") {
    return "DB query failed";
  }

  return "Backend unavailable";
}

function buildFallbackDetail(dataset: DataExplorerDatasetRow | undefined, metadata: DataExplorerMetadataItem[]) {
  if (!dataset) {
    return null;
  }

  return {
    id: dataset.id,
    name: dataset.name,
    category: dataset.category,
    region: dataset.region,
    updated: dataset.updated,
    records: dataset.records,
    status: dataset.status,
    metadata: Object.fromEntries(metadata.map((item) => [item.label, item.value])),
  } satisfies DataExplorerDatasetDetail;
}

function toMetadataItems(detail: DataExplorerDatasetDetail | null): DataExplorerMetadataItem[] {
  if (!detail?.metadata) {
    return [];
  }

  return Object.entries(detail.metadata).map(([label, value]) => ({
    label,
    value: value == null ? "Unavailable" : String(value),
  }));
}

function normalizeFilters(filters: Required<DataExplorerDatasetFilters>): DataExplorerDatasetFilters {
  return {
    q: filters.q.trim() || undefined,
    category: filters.category || undefined,
    region: filters.region || undefined,
    status: filters.status || undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

function formatDebugMeta(meta: DataExplorerFetchMeta | null): string {
  if (!meta) {
    return "No diagnostics yet";
  }

  const parts = [
    meta.section,
    meta.state,
    meta.delivery ?? "delivery-unknown",
    meta.source ?? "unknown",
    `${meta.durationMs}ms`,
  ];

  if (meta.fallbackReason) {
    parts.push(meta.fallbackReason);
  }

  if (meta.datasetId) {
    parts.push(meta.datasetId);
  }

  return parts.join(" · ");
}

function shouldFallbackToLocalPresetStore(reason: DataExplorerPresetMutationReason | undefined): boolean {
  return reason === "storage_unavailable"
    || reason === "read_failed"
    || reason === "write_failed"
    || reason === "invalid_schema"
    || reason === "corrupt_json"
    || reason === "unsupported_version";
}

function canUseLocalPresetFallback(
  scope: DataExplorerPresetScope,
  reason: DataExplorerPresetMutationReason | undefined,
): boolean {
  return scope === "shared" && shouldFallbackToLocalPresetStore(reason);
}

function formatPresetScopeLabel(scope: DataExplorerPresetScope): string {
  return scope === "personal" ? "Personal" : "Shared";
}

function formatPresetScopeDescription(scope: DataExplorerPresetScope): string {
  return scope === "personal"
    ? "Personal scope follows the active station admin session and stays unavailable if that session cannot be verified. Preset mutations are audit logged with that session actor."
    : "Shared scope uses the repository-backed preset catalog and can fall back to this browser if the repository path is unavailable. Preset mutations are audit logged when repository storage is available.";
}

function formatPresetActivityAction(action: DataExplorerPresetAuditEvent["action"]): string {
  switch (action) {
    case "created":
      return "Created";
    case "updated":
      return "Updated";
    case "deleted":
      return "Deleted";
    case "marked_used":
      return "Marked used";
    default:
      return action;
  }
}

function formatPresetActivityActor(event: DataExplorerPresetAuditEvent): string {
  if (event.actorId) {
    return event.actorId;
  }

  return event.actorType === "unknown" ? "Unknown actor" : "Station admin";
}

function formatPresetActivityTimestamp(value: string): string {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function formatBehaviorEventLabel(event: DataExplorerBehaviorEvent): string {
  switch (event.eventType) {
    case "preset_applied":
      return "Preset applied";
    case "dataset_selected":
      return "Dataset selected";
    case "dataset_detail_viewed":
      return "Dataset detail viewed";
    default:
      return event.eventType;
  }
}

function formatBehaviorEventSubject(event: DataExplorerBehaviorEvent): string {
  if (event.presetName) {
    return event.presetName;
  }

  if (event.datasetName) {
    return event.datasetName;
  }

  if (event.datasetId) {
    return event.datasetId;
  }

  if (event.presetId) {
    return event.presetId;
  }

  return "(no label)";
}

function DebugBadge({ meta, label }: { meta: DataExplorerFetchMeta | null; label: string }) {
  if (!SHOW_DEBUG) {
    return null;
  }

  return (
    <div
      data-testid={`debug-${label}`}
      className="rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] text-slate-400"
    >
      <span className="font-medium uppercase tracking-[0.18em] text-cyan-400">{label}</span>
      <span className="ml-2">{formatDebugMeta(meta)}</span>
    </div>
  );
}

export function DataExplorerWorkspace({ data, initialMeta = null }: DataExplorerWorkspaceProps) {
  const { actions, datasets: initialDatasets, previewSeries, metadata, summarySignals } = data;
  const [datasets, setDatasets] = useState(initialDatasets);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [presetName, setPresetName] = useState("");
  const [presetScope, setPresetScope] = useState<DataExplorerPresetScope>("shared");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [savedPresets, setSavedPresets] = useState<DataExplorerPresetRecord[]>([]);
  const [presetStatus, setPresetStatus] = useState<PresetStatus>("idle");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetActivity, setPresetActivity] = useState<DataExplorerPresetAuditEvent[]>([]);
  const [presetActivityStatus, setPresetActivityStatus] = useState<PresetActivityStatus>("idle");
  const [presetActivityError, setPresetActivityError] = useState<string | null>(null);
  const [behaviorActivity, setBehaviorActivity] = useState<DataExplorerBehaviorEvent[]>([]);
  const [behaviorActivityStatus, setBehaviorActivityStatus] = useState<BehaviorActivityStatus>("idle");
  const [behaviorActivityError, setBehaviorActivityError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<DataExplorerDatasetFilters>({});
  const [pageInfo, setPageInfo] = useState<DataExplorerPageInfo>(
    data.pageInfo ?? {
      page: 1,
      pageSize: Math.max(initialDatasets.length, 1),
      totalItems: initialDatasets.length,
      totalPages: initialDatasets.length > 0 ? 1 : 0,
      sortBy: "updated",
      sortDir: "desc",
    },
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(initialDatasets[0]?.id ?? null);
  const [selectedDetail, setSelectedDetail] = useState<DataExplorerDatasetDetail | null>(
    buildFallbackDetail(initialDatasets[0], metadata),
  );
  const [listMeta, setListMeta] = useState<DataExplorerFetchMeta | null>(initialMeta);
  const [detailMeta, setDetailMeta] = useState<DataExplorerFetchMeta | null>(null);
  const [recordsMeta, setRecordsMeta] = useState<DataExplorerFetchMeta | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>(initialDatasets[0] ? "loading" : "idle");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [relatedRecords, setRelatedRecords] = useState<DataExplorerRelatedRecord[]>([]);
  const [recordFilters, setRecordFilters] = useState(EMPTY_RECORD_FILTERS);
  const [recordsPageInfo, setRecordsPageInfo] = useState<DataExplorerRelatedRecordsPageInfo>({
    page: 1,
    pageSize: EMPTY_RECORD_FILTERS.pageSize,
    totalItems: 0,
    totalPages: 0,
    sortBy: EMPTY_RECORD_FILTERS.sortBy,
    sortDir: EMPTY_RECORD_FILTERS.sortDir,
  });
  const [recordsStatus, setRecordsStatus] = useState<RecordsStatus>(initialDatasets[0] ? "loading" : "idle");
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<ListStatus>(initialDatasets.length > 0 ? "idle" : "empty");
  const [listError, setListError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const maxValue = Math.max(1, ...previewSeries.map((item) => item.value));

  const categoryOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.category))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const regionOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.region))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const statusOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.status))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const sortedPresets = useMemo(() => selectSortedDataExplorerPresets(savedPresets), [savedPresets]);
  const selectedPreset = useMemo(
    () => selectDataExplorerPresetById(sortedPresets, selectedPresetId),
    [sortedPresets, selectedPresetId],
  );
  const selectedPresetInSync = useMemo(() => {
    if (!selectedPreset) {
      return false;
    }

    return isDataExplorerPresetInSync(selectedPreset, draftFilters);
  }, [selectedPreset, draftFilters]);

  async function refreshPresetActivity(scope: DataExplorerPresetScope = presetScope) {
    setPresetActivityStatus("loading");
    setPresetActivityError(null);

    try {
      const result = await apiClient.dataExplorer.listPresetAuditEvents({
        scope,
        limit: 5,
      });

      if (!result.ok) {
        if (scope === "personal" && result.reason === "validation") {
          setPresetActivity([]);
          setPresetActivityStatus("idle");
          setPresetActivityError(null);
          return;
        }

        setPresetActivity([]);
        setPresetActivityStatus("error");
        setPresetActivityError(result.error ?? "Unable to load preset activity right now.");
        return;
      }

      setPresetActivity(result.events);
      setPresetActivityStatus("idle");
      setPresetActivityError(null);
    } catch {
      setPresetActivity([]);
      setPresetActivityStatus("error");
      setPresetActivityError("Unable to load preset activity right now.");
    }
  }

  async function refreshBehaviorActivity(scope: DataExplorerPresetScope = presetScope) {
    setBehaviorActivityStatus("loading");
    setBehaviorActivityError(null);

    try {
      const result = await apiClient.dataExplorer.listBehaviorEvents({
        scope,
        limit: 5,
      });

      if (!result.ok) {
        if (scope === "personal" && result.reason === "validation") {
          setBehaviorActivity([]);
          setBehaviorActivityStatus("idle");
          setBehaviorActivityError(null);
          return;
        }

        setBehaviorActivity([]);
        setBehaviorActivityStatus("error");
        setBehaviorActivityError(result.error ?? "Unable to load recent operator activity right now.");
        return;
      }

      setBehaviorActivity(result.events);
      setBehaviorActivityStatus("idle");
      setBehaviorActivityError(null);
    } catch {
      setBehaviorActivity([]);
      setBehaviorActivityStatus("error");
      setBehaviorActivityError("Unable to load recent operator activity right now.");
    }
  }

  function recordBehaviorEvent(input: {
    eventType: DataExplorerBehaviorEvent["eventType"];
    presetId?: string;
    presetName?: string;
    datasetId?: string;
    datasetName?: string;
    sourceContext?: Record<string, unknown>;
  }) {
    void apiClient.dataExplorer.writeBehaviorEvent({
      eventType: input.eventType,
      scope: presetScope,
      presetId: input.presetId,
      presetName: input.presetName,
      datasetId: input.datasetId,
      datasetName: input.datasetName,
      sourceContext: input.sourceContext,
    }).then((result) => {
      if (!result.ok) {
        return;
      }

      void refreshBehaviorActivity(presetScope);
    }).catch(() => {
      // Behavior tracking is best-effort and should never block workspace interactions.
    });
  }

  useEffect(() => {
    setSelectedPresetId("");
    setSavedPresets(presetScope === "shared" ? loadDataExplorerPresets(presetScope) : []);
    setPresetStatus("idle");
    setPresetError(null);

    let cancelled = false;

    void apiClient.dataExplorer.listPresets(presetScope).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (canUseLocalPresetFallback(presetScope, result.reason)) {
          return;
        }

        setSavedPresets([]);
        setPresetStatus("error");
        setPresetError(result.error ?? "Unable to load presets right now.");
        return;
      }

      setSavedPresets(result.presets);
      setPresetStatus("idle");
      setPresetError(null);
    }).catch(() => {
      if (cancelled || presetScope === "shared") {
        return;
      }

      setSavedPresets([]);
      setPresetStatus("error");
      setPresetError("Unable to load personal presets right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [presetScope]);

  useEffect(() => {
    let cancelled = false;

    setBehaviorActivity([]);
    setBehaviorActivityStatus("loading");
    setBehaviorActivityError(null);

    void apiClient.dataExplorer.listBehaviorEvents({
      scope: presetScope,
      limit: 5,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (presetScope === "personal" && result.reason === "validation") {
          setBehaviorActivity([]);
          setBehaviorActivityStatus("idle");
          setBehaviorActivityError(null);
          return;
        }

        setBehaviorActivity([]);
        setBehaviorActivityStatus("error");
        setBehaviorActivityError(result.error ?? "Unable to load recent operator activity right now.");
        return;
      }

      setBehaviorActivity(result.events);
      setBehaviorActivityStatus("idle");
      setBehaviorActivityError(null);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setBehaviorActivity([]);
      setBehaviorActivityStatus("error");
      setBehaviorActivityError("Unable to load recent operator activity right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [presetScope]);

  useEffect(() => {
    let cancelled = false;

    setPresetActivity([]);
    setPresetActivityStatus("loading");
    setPresetActivityError(null);

    void apiClient.dataExplorer.listPresetAuditEvents({
      scope: presetScope,
      limit: 5,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (presetScope === "personal" && result.reason === "validation") {
          setPresetActivity([]);
          setPresetActivityStatus("idle");
          setPresetActivityError(null);
          return;
        }

        setPresetActivity([]);
        setPresetActivityStatus("error");
        setPresetActivityError(result.error ?? "Unable to load preset activity right now.");
        return;
      }

      setPresetActivity(result.events);
      setPresetActivityStatus("idle");
      setPresetActivityError(null);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setPresetActivity([]);
      setPresetActivityStatus("error");
      setPresetActivityError("Unable to load preset activity right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [presetScope]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setSelectedDetail(null);
      setDetailStatus("idle");
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailStatus("loading");
    setDetailError(null);

    void apiClient.dataExplorer.getDatasetDetail(selectedDatasetId).then(({ data: detail, meta }) => {
      if (cancelled) return;
      setDetailMeta(meta);
      if (!detail) {
        setDetailStatus(meta.state === "error" ? "error" : "not_found");
        if (meta.state === "error") {
          setDetailError(meta.errorMessage ?? "Unable to load dataset detail right now.");
        }
        return;
      }
      setSelectedDetail(detail);
      setDetailStatus("idle");

      recordBehaviorEvent({
        eventType: "dataset_detail_viewed",
        datasetId: detail.id,
        datasetName: detail.name,
        sourceContext: {
          interaction: "dataset-detail-loaded",
          detailSource: meta.source ?? "unknown",
          detailDelivery: meta.delivery ?? "unknown",
        },
      });
    }).catch(() => {
      if (cancelled) return;
      setDetailStatus("error");
      setDetailError("Unable to load dataset detail right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setRelatedRecords([]);
      setRecordsPageInfo({
        page: 1,
        pageSize: recordFilters.pageSize,
        totalItems: 0,
        totalPages: 0,
        sortBy: recordFilters.sortBy,
        sortDir: recordFilters.sortDir,
      });
      setRecordsStatus("idle");
      setRecordsError(null);
      return;
    }

    let cancelled = false;
    setRecordsStatus("loading");
    setRecordsError(null);
    setRelatedRecords([]);

    void apiClient.dataExplorer.getDatasetRecords(selectedDatasetId, recordFilters).then(({ data: result, meta }) => {
      if (cancelled) return;
      setRecordsMeta(meta);
      if (!result) {
        setRecordsStatus(meta.state === "error" ? "error" : "not_found");
        if (meta.state === "error") {
          setRecordsError(meta.errorMessage ?? "Unable to load related records right now.");
        }
        return;
      }
      setRelatedRecords(result.records);
      setRecordsPageInfo(
        result.pageInfo ?? {
          page: recordFilters.page,
          pageSize: recordFilters.pageSize,
          totalItems: result.records.length,
          totalPages: result.records.length > 0 ? 1 : 0,
          sortBy: recordFilters.sortBy,
          sortDir: recordFilters.sortDir,
        },
      );
      setRecordsStatus(result.records.length > 0 ? "idle" : "empty");
    }).catch(() => {
      if (cancelled) return;
      setRecordsStatus("error");
      setRecordsError("Unable to load related records right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [recordFilters, selectedDatasetId]);

  function prepareSelection(dataset: DataExplorerDatasetRow | undefined) {
    setSelectedDatasetId(dataset?.id ?? null);
    setSelectedDetail(buildFallbackDetail(dataset, metadata));
    setDetailStatus(dataset ? "loading" : "idle");
    setDetailError(null);
    setDetailMeta(null);
    setRecordFilters(EMPTY_RECORD_FILTERS);
    setRelatedRecords([]);
    setRecordsPageInfo({
      page: 1,
      pageSize: EMPTY_RECORD_FILTERS.pageSize,
      totalItems: 0,
      totalPages: 0,
      sortBy: EMPTY_RECORD_FILTERS.sortBy,
      sortDir: EMPTY_RECORD_FILTERS.sortDir,
    });
    setRecordsStatus(dataset ? "loading" : "idle");
    setRecordsError(null);
    setRecordsMeta(null);
  }

  function handleDatasetSelect(dataset: DataExplorerDatasetRow) {
    prepareSelection(dataset);
    recordBehaviorEvent({
      eventType: "dataset_selected",
      datasetId: dataset.id,
      datasetName: dataset.name,
      sourceContext: {
        interaction: "dataset-list-click",
        listSource: listMeta?.source ?? "unknown",
        listDelivery: listMeta?.delivery ?? "unknown",
      },
    });
  }

  async function applyFilters(filters: Required<DataExplorerDatasetFilters>) {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const normalized = normalizeFilters(filters);

    setListStatus("loading");
    setListError(null);

    try {
      const response = await apiClient.dataExplorer.getWorkspace(normalized);

      if (requestSequence.current !== requestId) {
        return;
      }

      setListMeta(response.meta);
      setDatasets(response.data.datasets);
      setActiveFilters(normalized);
      setPageInfo(
        response.data.pageInfo ?? {
          page: normalized.page ?? 1,
          pageSize: normalized.pageSize ?? 25,
          totalItems: response.data.datasets.length,
          totalPages: response.data.datasets.length > 0 ? 1 : 0,
          sortBy: normalized.sortBy ?? "updated",
          sortDir: normalized.sortDir ?? "desc",
        },
      );

      if (response.data.datasets.length === 0) {
        setListStatus("empty");
        prepareSelection(undefined);
        return;
      }

      setListStatus("idle");

      if (selectedDatasetId && response.data.datasets.some((dataset) => dataset.id === selectedDatasetId)) {
        return;
      }

      prepareSelection(response.data.datasets[0]);
    } catch {
      if (requestSequence.current !== requestId) {
        return;
      }
      setListStatus("error");
      setListError("Unable to refresh datasets right now.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void applyFilters(draftFilters);
  }

  function handleResetFilters() {
    setDraftFilters(EMPTY_FILTERS);
    void applyFilters(EMPTY_FILTERS);
  }

  async function handleSavePreset() {
    const draft = {
      name: presetName,
      scope: presetScope,
      filters: {
        q: draftFilters.q,
        category: draftFilters.category,
        region: draftFilters.region,
        status: draftFilters.status,
        sortBy: draftFilters.sortBy,
        sortDir: draftFilters.sortDir,
        pageSize: draftFilters.pageSize,
      },
    };

    const sharedResult = await apiClient.dataExplorer.upsertPreset(draft);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      const savedPreset = sharedResult.presets.find((preset) => preset.name === presetName.trim());
      setSelectedPresetId(savedPreset?.id ?? "");
      setPresetName("");
      setPresetStatus("idle");
      setPresetError(null);
      void refreshPresetActivity(presetScope);
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to save ${presetScope} presets right now.`);
      return;
    }

    const result = saveDataExplorerPreset(draft);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to save presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    const savedPreset = result.presets.find((preset) => preset.name === presetName.trim());
    setSelectedPresetId(savedPreset?.id ?? "");
    setPresetName("");
    setPresetStatus("idle");
    setPresetError(null);
  }

  function handleApplyPreset() {
    const preset = savedPresets.find((item) => item.id === selectedPresetId);

    if (!preset) {
      return;
    }

    const nextFilters: Required<DataExplorerDatasetFilters> = {
      ...EMPTY_FILTERS,
      ...preset.filters,
      page: 1,
    };

    setDraftFilters(nextFilters);
    setPresetStatus("idle");
    setPresetError(null);

    recordBehaviorEvent({
      eventType: "preset_applied",
      presetId: preset.id,
      presetName: preset.name,
      sourceContext: {
        interaction: "preset-apply",
        listSource: listMeta?.source ?? "unknown",
      },
    });

    // Usage tracking is best-effort and should never block preset application.
    void apiClient.dataExplorer.markPresetUsed(preset.id, presetScope).then((result) => {
      if (result.ok) {
        setSavedPresets(result.presets);
        void refreshPresetActivity(presetScope);
        return;
      }

      if (!canUseLocalPresetFallback(presetScope, result.reason)) {
        return;
      }

      const markUsedResult = markDataExplorerPresetUsed(preset.id, presetScope);

      if (markUsedResult.ok) {
        setSavedPresets(markUsedResult.presets);
      }
    }).catch(() => {
      if (presetScope !== "shared") {
        return;
      }

      const markUsedResult = markDataExplorerPresetUsed(preset.id, presetScope);

      if (markUsedResult.ok) {
        setSavedPresets(markUsedResult.presets);
      }
    });

    void applyFilters(nextFilters);
  }

  async function handleUpdatePreset() {
    const preset = selectDataExplorerPresetById(savedPresets, selectedPresetId);

    if (!preset) {
      return;
    }

    const draft = {
      id: preset.id,
      name: preset.name,
      scope: presetScope,
      filters: toDataExplorerPresetFilterSnapshot(draftFilters),
    };

    const sharedResult = await apiClient.dataExplorer.upsertPreset(draft);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      setSelectedPresetId(preset.id);
      setPresetStatus("idle");
      setPresetError(null);
      void refreshPresetActivity(presetScope);
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to update ${presetScope} presets right now.`);
      return;
    }

    const result = upsertDataExplorerPreset(draft);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to update presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    setSelectedPresetId(preset.id);
    setPresetStatus("idle");
    setPresetError(null);
  }

  async function handleDeletePreset() {
    if (!selectedPresetId) {
      return;
    }

    const sharedResult = await apiClient.dataExplorer.deletePreset(selectedPresetId, presetScope);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      setSelectedPresetId("");
      setPresetStatus("idle");
      setPresetError(null);
      void refreshPresetActivity(presetScope);
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to delete ${presetScope} presets right now.`);
      return;
    }

    const result = deleteDataExplorerPresetById(selectedPresetId, presetScope);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to update presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    setSelectedPresetId("");
    setPresetStatus("idle");
    setPresetError(null);
  }

  const detailMetadata = toMetadataItems(selectedDetail);
  const filtersApplied = Boolean(activeFilters.q || activeFilters.category || activeFilters.region || activeFilters.status);
  const canGoToPreviousPage = pageInfo.page > 1;
  const canGoToNextPage = pageInfo.totalPages > 0 && pageInfo.page < pageInfo.totalPages;
  const canGoToPreviousRecordsPage = recordsPageInfo.page > 1;
  const canGoToNextRecordsPage =
    recordsPageInfo.totalPages > 0 && recordsPageInfo.page < recordsPageInfo.totalPages;
  const workspaceDegraded = listMeta?.state === "success" && listMeta.source === "mock";
  const workspaceDegradedReason = workspaceDegraded
    ? formatFallbackReasonLabel(listMeta?.fallbackReason)
    : null;
  const recordsDegraded = recordsMeta?.state === "success" && recordsMeta.source === "mock";
  const recordsDegradedReason = recordsDegraded
    ? formatFallbackReasonLabel(recordsMeta?.fallbackReason)
    : null;
  const recentPresetActivity = presetActivity.slice(0, 5);
  const shouldShowPresetActivity = sortedPresets.length > 0
    || recentPresetActivity.length > 0
    || presetActivityStatus !== "idle";
  const recentBehaviorActivity = behaviorActivity.slice(0, 5);
  const shouldShowBehaviorActivity = sortedPresets.length > 0
    || recentBehaviorActivity.length > 0
    || behaviorActivityStatus !== "idle";

  function handleSortByChange(value: DataExplorerDatasetSortBy) {
    const next = { ...draftFilters, sortBy: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handleSortDirChange(value: DataExplorerSortDirection) {
    const next = { ...draftFilters, sortDir: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handlePageSizeChange(value: number) {
    const next = { ...draftFilters, pageSize: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handlePageChange(nextPage: number) {
    const next = { ...draftFilters, page: nextPage };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handleRecordSortByChange(value: DataExplorerRelatedRecordSortBy) {
    setRecordFilters((current) => ({ ...current, sortBy: value, page: 1 }));
  }

  function handleRecordSortDirChange(value: DataExplorerSortDirection) {
    setRecordFilters((current) => ({ ...current, sortDir: value, page: 1 }));
  }

  function handleRecordPageSizeChange(value: number) {
    setRecordFilters((current) => ({ ...current, pageSize: value, page: 1 }));
  }

  function handleRecordPageChange(nextPage: number) {
    setRecordFilters((current) => ({ ...current, page: nextPage }));
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">Data Explorer</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">Research dataset access and rapid preview workspace</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Search across active marine datasets, inspect structure and freshness, and review AI-assisted
          summaries before exporting or joining with other feeds.
        </p>
      </div>

      <Panel
        title="Search and Actions"
        subtitle="Refine the active catalog without leaving the platform shell."
        action={
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Database size={12} className="text-cyan-400" />
            {pageInfo.totalItems} indexed matches
          </div>
        }
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <form className="flex flex-1 flex-col gap-3" onSubmit={handleSubmit}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_160px]">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={draftFilters.q}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))}
                  className="w-full rounded-xl border border-surface-borderSubtle bg-ocean-850 py-2.5 pl-9 pr-4 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                  aria-label="Dataset search"
                  placeholder="Search by dataset name or category"
                />
              </div>
              <select value={draftFilters.category} onChange={(event) => setDraftFilters((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset category filter">
                <option value="">All categories</option>
                {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={draftFilters.region} onChange={(event) => setDraftFilters((current) => ({ ...current, region: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset region filter">
                <option value="">All regions</option>
                {regionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset status filter">
                <option value="">All statuses</option>
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="grid gap-3 lg:grid-cols-[180px_160px_160px_minmax(0,1fr)]">
              <select value={draftFilters.sortBy} onChange={(event) => handleSortByChange(event.target.value as DataExplorerDatasetSortBy)} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset sort field">
                <option value="updated">Sort: Updated</option>
                <option value="name">Sort: Name</option>
                <option value="records">Sort: Records</option>
                <option value="status">Sort: Status</option>
              </select>
              <select value={draftFilters.sortDir} onChange={(event) => handleSortDirChange(event.target.value as DataExplorerSortDirection)} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset sort direction">
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
              <select value={draftFilters.pageSize} onChange={(event) => handlePageSizeChange(Number.parseInt(event.target.value, 10))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset page size">
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
              </select>
              <div className="flex items-center justify-end text-[11px] text-slate-500">
                Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page} of {pageInfo.totalPages}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
              <select
                value={presetScope}
                onChange={(event) => setPresetScope(event.target.value as DataExplorerPresetScope)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Preset scope"
              >
                <option value="shared">Shared preset scope</option>
                <option value="personal">Personal preset scope</option>
              </select>
              <div
                data-testid="preset-scope-description"
                className="flex items-center rounded-xl border border-surface-borderSubtle bg-ocean-900/60 px-3 py-2.5 text-[11px] leading-relaxed text-slate-400"
              >
                {formatPresetScopeDescription(presetScope)}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <input
                type="text"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Preset name"
                placeholder="Save current search as..."
              />
              <select
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Saved presets"
              >
                <option value="">Saved presets</option>
                {sortedPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  void handleSavePreset();
                }}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
              >
                Save preset
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  disabled={!selectedPresetId}
                  className="inline-flex items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleUpdatePreset();
                  }}
                  disabled={!selectedPresetId || selectedPresetInSync}
                  className="inline-flex items-center justify-center rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Update preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeletePreset();
                  }}
                  disabled={!selectedPresetId}
                  className="inline-flex items-center justify-center rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-rose-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500" data-testid="saved-preset-usage-meta">
              {selectedPreset
                ? formatDataExplorerPresetUsageMeta(selectedPreset)
                : "Select a preset to view usage metadata."}
            </div>
            <div className="text-[11px] text-slate-500" data-testid="selected-preset-scope">
              Scope: {formatPresetScopeLabel(selectedPreset?.scope ?? presetScope)}
            </div>
            {shouldShowPresetActivity && (
              <div
                data-testid="preset-activity-panel"
                className="rounded-xl border border-surface-borderSubtle bg-ocean-900/55 px-3 py-2.5"
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recent preset activity</p>
                {presetActivityStatus === "loading" && (
                  <p className="mt-1 text-[11px] text-slate-500">Loading recent preset activity...</p>
                )}
                {presetActivityStatus === "error" && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="preset-activity-error">
                    {presetActivityError ?? "Unable to load preset activity right now."}
                  </p>
                )}
                {presetActivityStatus === "idle" && recentPresetActivity.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="preset-activity-empty">
                    No recent preset activity for this scope.
                  </p>
                )}
                {presetActivityStatus === "idle" && recentPresetActivity.length > 0 && (
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-400" data-testid="preset-activity-list">
                    {recentPresetActivity.map((event) => (
                      <li key={event.id} data-testid="preset-activity-item">
                        {formatPresetActivityAction(event.action)} {event.presetName} ({formatPresetScopeLabel(event.scope)})
                        {" · "}
                        {formatPresetActivityTimestamp(event.createdAt)}
                        {" · "}
                        {formatPresetActivityActor(event)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {shouldShowBehaviorActivity && (
              <div
                data-testid="behavior-activity-panel"
                className="rounded-xl border border-surface-borderSubtle bg-ocean-900/55 px-3 py-2.5"
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recent operator activity</p>
                {behaviorActivityStatus === "loading" && (
                  <p className="mt-1 text-[11px] text-slate-500">Loading recent operator activity...</p>
                )}
                {behaviorActivityStatus === "error" && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="behavior-activity-error">
                    {behaviorActivityError ?? "Unable to load recent operator activity right now."}
                  </p>
                )}
                {behaviorActivityStatus === "idle" && recentBehaviorActivity.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="behavior-activity-empty">
                    No recent operator activity for this scope.
                  </p>
                )}
                {behaviorActivityStatus === "idle" && recentBehaviorActivity.length > 0 && (
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-400" data-testid="behavior-activity-list">
                    {recentBehaviorActivity.map((event) => (
                      <li key={event.id} data-testid="behavior-activity-item">
                        {formatBehaviorEventLabel(event)} {formatBehaviorEventSubject(event)}
                        {" · "}
                        {formatPresetScopeLabel(event.scope)}
                        {" · "}
                        {formatPresetActivityTimestamp(event.createdAt)}
                        {" · "}
                        {event.actorLabel ?? "Unknown actor"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {selectedPreset && (
              <div className="text-[11px] text-slate-500" data-testid="saved-preset-sync-status">
                {selectedPresetInSync
                  ? "Preset is in sync with current filters."
                  : "Current filters differ from selected preset."}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={listStatus === "loading"} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:cursor-wait disabled:opacity-70">
                <Filter size={13} />
                {listStatus === "loading" ? "Filtering..." : "Apply Filters"}
              </button>
              <button type="button" onClick={handleResetFilters} className="inline-flex items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100">
                <X size={13} className="text-slate-400" />
                Reset
              </button>

              {(listStatus === "loading" || listStatus === "error" || presetStatus === "error" || filtersApplied || workspaceDegraded) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {listStatus === "loading" && <StatusBadge label="Refreshing dataset list" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />}
                  {listStatus === "error" && listError && <StatusBadge label={listError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                  {presetStatus === "error" && presetError && <StatusBadge label={presetError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                  {filtersApplied && <StatusBadge label="Filters active" className="border-amber-500/25 bg-amber-500/10 text-amber-300" />}
                  {workspaceDegraded && (
                    <StatusBadge
                      label={`Fallback data mode (${workspaceDegradedReason})`}
                      className="border-amber-500/25 bg-amber-500/10 text-amber-300"
                    />
                  )}
                </div>
              )}
            </div>

            <DebugBadge label="list" meta={listMeta} />
          </form>

          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.icon];
              return (
                <button
                  key={action.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                    action.tone === "primary"
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15"
                      : "border-surface-borderSubtle bg-ocean-850 text-slate-300 hover:border-cyan-500/30 hover:text-slate-100",
                  )}
                >
                  <Icon size={13} className={action.tone === "primary" ? "text-cyan-400" : "text-slate-400"} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <div className="space-y-6">
          <Panel title="Dataset Catalog" subtitle="A focused list view for recent data products relevant to the current case." action={<div className="flex items-center gap-2 text-[11px] text-slate-500"><Table2 size={13} className="text-cyan-400" />List view</div>}>
            {workspaceDegraded && (
              <div
                data-testid="workspace-degraded-state"
                className="mb-3 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-3"
              >
                <p className="text-xs font-medium text-slate-100">Backend degraded mode</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Showing fallback dataset output because the live repository is unavailable ({workspaceDegradedReason}).
                </p>
              </div>
            )}
            {listStatus === "empty" ? (
              <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/60 p-6">
                <p className="text-sm font-medium text-slate-100">
                  {workspaceDegraded ? "Live dataset catalog unavailable" : "No datasets match the current filters"}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {workspaceDegraded
                    ? `The backend is currently degraded (${workspaceDegradedReason}). Retry after recovery to access live dataset rows.`
                    : "Adjust the search or clear one of the category, region, or status filters to restore results."}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-borderSubtle">
                <div className="grid grid-cols-[120px_minmax(0,1.4fr)_110px_120px_90px_96px] gap-3 bg-ocean-850 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>Dataset</span><span>Name</span><span>Category</span><span>Region</span><span>Records</span><span>Status</span>
                </div>
                <div className="divide-y divide-surface-borderSubtle">
                  {datasets.map((dataset) => {
                    const selected = dataset.id === selectedDatasetId;
                    return (
                      <button key={dataset.id} type="button" onClick={() => handleDatasetSelect(dataset)} className={cn("grid w-full grid-cols-[120px_minmax(0,1.4fr)_110px_120px_90px_96px] gap-3 px-4 py-4 text-left transition-colors", selected ? "bg-cyan-500/8" : "bg-ocean-900/70 hover:bg-ocean-850/70")}>
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] text-slate-500">{dataset.id}</span>
                          <span className="text-[10px] text-slate-600">{dataset.updated}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">{dataset.name}</p>
                          <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><FileSearch size={11} className="text-cyan-400" />Indexed for investigation joins and anomaly review</p>
                        </div>
                        <span className="text-xs text-slate-300">{dataset.category}</span>
                        <span className="text-xs text-slate-400">{dataset.region}</span>
                        <span className="font-mono text-xs text-slate-300">{dataset.records}</span>
                        <div className="flex items-start justify-start"><StatusBadge label={dataset.status} className={STATUS_STYLES[dataset.status]} /></div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-borderSubtle bg-ocean-900/70 px-4 py-3 text-[11px] text-slate-500">
                  <span>
                    Showing {datasets.length === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1}
                    {" "}-{" "}
                    {Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.totalItems)} of {pageInfo.totalItems}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePageChange(pageInfo.page - 1)}
                      disabled={!canGoToPreviousPage || listStatus === "loading"}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="font-mono text-[10px] text-slate-500">
                      Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page}/{pageInfo.totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePageChange(pageInfo.page + 1)}
                      disabled={!canGoToNextPage || listStatus === "loading"}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Dataset Preview" subtitle="A fast look at the currently selected feed before deeper analysis." action={<button className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"><Eye size={12} />Open full preview</button>}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_280px]">
              <div className="rounded-2xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_rgba(2,13,24,0)_38%),linear-gradient(180deg,rgba(6,27,48,0.94),rgba(4,20,37,0.96))] p-5">
                {selectedDetail ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-400">Selected Dataset</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-100">{selectedDetail.name}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">Live blended observations tracking thermal front intensity across the reef boundary, optimized for fast anomaly checks and cross-feed joins.</p>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span>{selectedDetail.category}</span><span className="text-slate-700">•</span><span>{selectedDetail.region}</span><span className="text-slate-700">•</span><span>{selectedDetail.records} records</span>
                        </div>
                      </div>
                      <StatusBadge label={selectedDetail.status} className={STATUS_STYLES[selectedDetail.status]} />
                    </div>

                    {(detailStatus === "loading" || detailStatus === "not_found" || detailStatus === "error") && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                        {detailStatus === "loading" && <StatusBadge label="Loading dataset detail" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />}
                        {detailStatus === "not_found" && <StatusBadge label="Dataset not found" className="border-amber-500/25 bg-amber-500/10 text-amber-300" />}
                        {detailStatus === "error" && detailError && <StatusBadge label={detailError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                      </div>
                    )}

                    <div className="mt-4">
                      <DebugBadge label="detail" meta={detailMeta} />
                    </div>

                    <div className="mt-6">
                      {detailStatus === "not_found" ? (
                        <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-5">
                          <p className="text-sm font-medium text-slate-100">Dataset detail unavailable</p>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">The selected dataset is no longer available in the current detail catalog.</p>
                        </div>
                      ) : (
                        <div className="flex h-48 items-end gap-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-4">
                          {previewSeries.map((point) => (
                            <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                              <div className="flex h-full w-full items-end">
                                <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-cyan-300" style={{ height: `${(point.value / maxValue) * 100}%` }} />
                              </div>
                              <span className="font-mono text-[10px] text-slate-500">{point.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/70 p-5">
                    <p className="text-sm font-medium text-slate-100">No dataset selected</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Adjust the filters or select a dataset from the catalog to load detail.</p>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Preview Metrics</p>
                  <div className="mt-3 space-y-3">
                    <div><p className="text-2xl font-semibold text-slate-100">97.4%</p><p className="text-[11px] text-slate-500">Completeness across active window</p></div>
                    <div><p className="text-2xl font-semibold text-slate-100">5 min</p><p className="text-[11px] text-slate-500">Median ingestion lag</p></div>
                    <div><p className="text-2xl font-semibold text-slate-100">14 grids</p><p className="text-[11px] text-slate-500">High-priority anomaly cells surfaced</p></div>
                  </div>
                </div>

                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Related Records</p>
                    <BellDot size={14} className="text-cyan-400" />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_110px]">
                    <select
                      value={recordFilters.sortBy}
                      onChange={(event) =>
                        handleRecordSortByChange(event.target.value as DataExplorerRelatedRecordSortBy)
                      }
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records sort field"
                    >
                      <option value="updated">Sort: Updated</option>
                      <option value="title">Sort: Title</option>
                      <option value="status">Sort: Status</option>
                      <option value="type">Sort: Type</option>
                    </select>
                    <select
                      value={recordFilters.sortDir}
                      onChange={(event) => handleRecordSortDirChange(event.target.value as DataExplorerSortDirection)}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records sort direction"
                    >
                      <option value="desc">Desc</option>
                      <option value="asc">Asc</option>
                    </select>
                    <select
                      value={recordFilters.pageSize}
                      onChange={(event) => handleRecordPageSizeChange(Number.parseInt(event.target.value, 10))}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records page size"
                    >
                      <option value="2">2 / page</option>
                      <option value="5">5 / page</option>
                      <option value="10">10 / page</option>
                    </select>
                  </div>
                  <div className="mt-3">
                    <DebugBadge label="records" meta={recordsMeta} />
                  </div>
                  {recordsStatus === "loading" && <div className="mt-3"><StatusBadge label="Loading related records" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" /></div>}
                  {recordsStatus === "not_found" && <div className="mt-3 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-4"><p className="text-xs font-medium text-slate-100">Dataset not found</p><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Related records are unavailable because the selected dataset detail no longer exists.</p></div>}
                  {recordsStatus === "error" && <div className="mt-3 rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-4"><p className="text-xs font-medium text-slate-100">Related records unavailable</p><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{recordsError ?? "The related records request failed. Try selecting the dataset again."}</p></div>}
                  {recordsStatus === "empty" && (
                    <div className="mt-3 rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/60 p-4">
                      <p className="text-xs font-medium text-slate-100">
                        {recordsDegraded ? "Related records unavailable in degraded mode" : "No related records yet"}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        {recordsDegraded
                          ? `The related-record repository is currently degraded (${recordsDegradedReason}).`
                          : "No linked records were returned for the currently selected dataset."}
                      </p>
                    </div>
                  )}
                  {recordsStatus === "idle" && relatedRecords.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {relatedRecords.map((record) => (
                        <div key={record.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-[10px] text-slate-500">{record.id}</p>
                              <p className="mt-1 text-xs font-medium text-slate-100">{record.title}</p>
                            </div>
                            <StatusBadge label={record.status} className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span>{record.type}</span><span className="text-slate-700">•</span><span>{record.updated}</span></div>
                          {record.summary && <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{record.summary}</p>}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-[11px] text-slate-500">
                        <span>
                          Showing {relatedRecords.length === 0 ? 0 : (recordsPageInfo.page - 1) * recordsPageInfo.pageSize + 1}
                          {" "}-{" "}
                          {Math.min(recordsPageInfo.page * recordsPageInfo.pageSize, recordsPageInfo.totalItems)} of {recordsPageInfo.totalItems}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRecordPageChange(recordsPageInfo.page - 1)}
                            disabled={!canGoToPreviousRecordsPage}
                            className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Previous records
                          </button>
                          <span className="font-mono text-[10px] text-slate-500">
                            Page {recordsPageInfo.totalPages === 0 ? 0 : recordsPageInfo.page}/{recordsPageInfo.totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRecordPageChange(recordsPageInfo.page + 1)}
                            disabled={!canGoToNextRecordsPage}
                            className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Next records
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Waves size={16} className="mt-0.5 text-cyan-400" />
                    <div>
                      <p className="text-xs font-medium text-slate-200">Suggested next step</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Compare this feed against dissolved oxygen outliers before promoting it to the investigation evidence stack.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Metadata" subtitle="Operational context for the selected dataset." action={<Database size={14} className="text-cyan-400" />} className="h-fit">
            <div className="space-y-3">
              {detailStatus === "not_found" ? (
                <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-4">
                  <p className="text-xs font-medium text-slate-100">Dataset not found</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Metadata could not be loaded because the selected dataset detail no longer exists.</p>
                </div>
              ) : detailStatus === "error" ? (
                <div className="rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-4">
                  <p className="text-xs font-medium text-slate-100">Detail unavailable</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{detailError ?? "The dataset detail request failed. Try selecting the dataset again."}</p>
                </div>
              ) : detailMetadata.length > 0 ? (
                detailMetadata.map((item) => (
                  <div key={item.label} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-200">{item.value}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-4">
                  <p className="text-xs font-medium text-slate-100">No metadata available</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Select a dataset to inspect operational context.</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="AI Summary" subtitle="Machine-assisted readout of the active dataset." action={<Bot size={14} className="text-violet-400" />} className="h-fit">
            <div className="space-y-3">
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
                <div className="flex items-center gap-2"><Sparkles size={14} className="text-violet-400" /><p className="text-xs font-medium text-slate-100">OceanGPT assistant</p></div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">This dataset is a strong candidate for anomaly triage and temporal comparison because it combines stable cadence with high cross-source agreement.</p>
              </div>
              {summarySignals.map((signal) => (
                <div key={signal.title} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-100">{signal.title}</p>
                    <StatusBadge label="Active" className={TONE_STYLES[signal.tone]} />
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{signal.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
```

## apps/web/components/data-explorer/data-explorer-workspace.test.tsx
```ts
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { DataExplorerWorkspace } from "@/components/data-explorer/data-explorer-workspace";
import { dataExplorerWorkspaceData } from "@/lib/api/mock-data";
import type {
  DataExplorerDatasetDetail,
  DataExplorerFetchMeta,
  DataExplorerDatasetRow,
  DataExplorerPageInfo,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsResult,
  DataExplorerWorkspaceData,
} from "@/lib/api/types";
import type { DataExplorerPresetMutationResult } from "@/lib/persistence/types";

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    dataExplorer: {
      getWorkspace: vi.fn(),
      getDatasetDetail: vi.fn(),
      getDatasetRecords: vi.fn(),
      listBehaviorEvents: vi.fn(),
      writeBehaviorEvent: vi.fn(),
      listPresetAuditEvents: vi.fn(),
      listPresets: vi.fn(),
      upsertPreset: vi.fn(),
      deletePreset: vi.fn(),
      markPresetUsed: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

const BASE_DATASETS = dataExplorerWorkspaceData.datasets.slice(0, 3);

function createPageInfo(
  datasets: DataExplorerDatasetRow[],
  overrides: Partial<DataExplorerPageInfo> = {},
): DataExplorerPageInfo {
  return {
    page: 1,
    pageSize: 25,
    totalItems: datasets.length,
    totalPages: datasets.length > 0 ? 1 : 0,
    sortBy: "updated",
    sortDir: "desc",
    ...overrides,
  };
}

function createWorkspace(
  datasets: DataExplorerDatasetRow[] = BASE_DATASETS,
  overrides: Partial<DataExplorerWorkspaceData> = {},
): DataExplorerWorkspaceData {
  return {
    ...dataExplorerWorkspaceData,
    datasets,
    pageInfo: createPageInfo(datasets),
    ...overrides,
  };
}

function createDetail(dataset: DataExplorerDatasetRow): DataExplorerDatasetDetail {
  return {
    ...dataset,
    metadata: {
      Source: "Mocked Source",
      Coverage: dataset.region,
      Cadence: "5 minute ingest",
      Schema: "temperature_c, anomaly_index",
      Owner: "Ocean Systems Lab",
    },
  };
}

function createRecords(datasetId: string): DataExplorerRelatedRecord[] {
  return [
    {
      id: `${datasetId}-REC-1`,
      title: `Related record for ${datasetId}`,
      type: "Alert",
      status: "Open",
      updated: "4 min ago",
      summary: "Localized anomaly cluster persisted through the latest ingest window.",
    },
  ];
}

function createRecordsResult(
  records: DataExplorerRelatedRecord[],
  overrides: Partial<DataExplorerRelatedRecordsResult["pageInfo"]> = {},
): DataExplorerRelatedRecordsResult {
  return {
    records,
    pageInfo: {
      page: 1,
      pageSize: 5,
      totalItems: records.length,
      totalPages: records.length > 0 ? 1 : 0,
      sortBy: "updated",
      sortDir: "desc",
      ...overrides,
    },
  };
}

function createMeta(
  section: DataExplorerFetchMeta["section"],
  overrides: Partial<DataExplorerFetchMeta> = {},
): DataExplorerFetchMeta {
  return {
    section,
    state: "success",
    startedAt: "2026-03-14T12:00:00.000Z",
    finishedAt: "2026-03-14T12:00:00.012Z",
    durationMs: 12,
    delivery: "browser_api",
    source: "db",
    ...overrides,
  };
}

function createWorkspaceResponse(data: DataExplorerWorkspaceData) {
  return {
    data,
    meta: createMeta("workspace"),
  };
}

function createDetailResponse(data: DataExplorerDatasetDetail | null, datasetId: string) {
  return {
    data,
    meta: createMeta("detail", {
      datasetId,
      state: data ? "success" : "not_found",
    }),
  };
}

function createRecordsResponse(data: DataExplorerRelatedRecordsResult | null, datasetId: string) {
  return {
    data,
    meta: createMeta("records", {
      datasetId,
      state: data ? "success" : "not_found",
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function sharedPresetsUnavailable(): DataExplorerPresetMutationResult {
  return {
    ok: false,
    presets: [],
    reason: "storage_unavailable",
    error: "Shared preset store unavailable.",
  };
}

function renderWorkspace(
  data = createWorkspace(),
  initialMeta: DataExplorerFetchMeta | null = null,
) {
  return render(<DataExplorerWorkspace data={data} initialMeta={initialMeta} />);
}

beforeEach(() => {
  window.localStorage.clear();
  mockApiClient.dataExplorer.getWorkspace.mockReset();
  mockApiClient.dataExplorer.getDatasetDetail.mockReset();
  mockApiClient.dataExplorer.getDatasetRecords.mockReset();
  mockApiClient.dataExplorer.listBehaviorEvents.mockReset();
  mockApiClient.dataExplorer.writeBehaviorEvent.mockReset();
  mockApiClient.dataExplorer.listPresetAuditEvents.mockReset();
  mockApiClient.dataExplorer.listPresets.mockReset();
  mockApiClient.dataExplorer.upsertPreset.mockReset();
  mockApiClient.dataExplorer.deletePreset.mockReset();
  mockApiClient.dataExplorer.markPresetUsed.mockReset();

  mockApiClient.dataExplorer.listPresets.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.upsertPreset.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.deletePreset.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.markPresetUsed.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValue({ ok: true, events: [] });
  mockApiClient.dataExplorer.writeBehaviorEvent.mockResolvedValue({ ok: true });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValue({ ok: true, events: [] });

  mockApiClient.dataExplorer.getDatasetDetail.mockImplementation(async (datasetId: string) => {
    const dataset = BASE_DATASETS.find((item) => item.id === datasetId);
    return createDetailResponse(dataset ? createDetail(dataset) : null, datasetId);
  });

  mockApiClient.dataExplorer.getDatasetRecords.mockImplementation(async (datasetId: string) => {
    const dataset = BASE_DATASETS.find((item) => item.id === datasetId);
    return createRecordsResponse(dataset ? createRecordsResult(createRecords(datasetId)) : null, datasetId);
  });
});

test("applying filters triggers a dataset list refresh with the current query", async () => {
  const user = userEvent.setup();
  const filteredWorkspace = createWorkspace([BASE_DATASETS[2]!]);
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(createWorkspaceResponse(filteredWorkspace));

  renderWorkspace();

  await user.type(screen.getByLabelText("Dataset search"), "chemistry");
  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "chemistry",
        sortBy: "updated",
        sortDir: "desc",
        page: 1,
        pageSize: 25,
      }),
    );
  });
});

test("changing sort triggers a dataset list refresh", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(createWorkspace([...BASE_DATASETS].reverse())),
  );

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Dataset sort field"), "name");

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: "name",
        sortDir: "desc",
        page: 1,
      }),
    );
  });
});

test("changing page triggers a dataset list refresh", async () => {
  const user = userEvent.setup();
  const pageOne = createWorkspace([BASE_DATASETS[0]!], {
    pageInfo: createPageInfo([BASE_DATASETS[0]!], {
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    }),
  });
  const pageTwo = createWorkspace([BASE_DATASETS[1]!], {
    pageInfo: createPageInfo([BASE_DATASETS[1]!], {
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    }),
  });
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(createWorkspaceResponse(pageTwo));

  renderWorkspace(pageOne);

  await user.click(screen.getByRole("button", { name: "Next" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 25,
      }),
    );
  });
});

test("selection is preserved when the selected dataset still exists after refresh", async () => {
  const user = userEvent.setup();
  const preservedDataset = BASE_DATASETS[1]!;
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(createWorkspace([BASE_DATASETS[0]!, preservedDataset])),
  );

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: new RegExp(preservedDataset.name, "i") }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: preservedDataset.name })).toBeInTheDocument();
  });

  const detailCallsBeforeRefresh = mockApiClient.dataExplorer.getDatasetDetail.mock.calls.length;

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: preservedDataset.name })).toBeInTheDocument();
  });

  expect(mockApiClient.dataExplorer.getDatasetDetail.mock.calls).toHaveLength(detailCallsBeforeRefresh);
});

test("selection resets to the first dataset when the previous selection is absent after refresh", async () => {
  const user = userEvent.setup();
  const selectedDataset = BASE_DATASETS[1]!;
  const nextDataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(createWorkspaceResponse(createWorkspace([nextDataset])));

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: new RegExp(selectedDataset.name, "i") }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: selectedDataset.name })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: nextDataset.name })).toBeInTheDocument();
  });

  expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenLastCalledWith(nextDataset.id);
});

test("empty refresh results clear the selected detail and related-record panels safely", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([], {
        pageInfo: createPageInfo([], {
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
        }),
      }),
    ),
  );

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(screen.getByText("No datasets match the current filters")).toBeInTheDocument();
    expect(screen.getByText("No dataset selected")).toBeInTheDocument();
    expect(screen.getByText("No metadata available")).toBeInTheDocument();
  });
});

test("list loading state appears during refresh", async () => {
  const user = userEvent.setup();
  const pendingResponse = deferred<ReturnType<typeof createWorkspaceResponse>>();
  mockApiClient.dataExplorer.getWorkspace.mockReturnValue(pendingResponse.promise);

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  expect(screen.getByText("Refreshing dataset list")).toBeInTheDocument();

  pendingResponse.resolve(createWorkspaceResponse(createWorkspace([BASE_DATASETS[0]!])));

  await waitFor(() => {
    expect(screen.queryByText("Refreshing dataset list")).not.toBeInTheDocument();
  });
});

test("initial degraded workspace state is visible without becoming noisy", async () => {
  renderWorkspace(
    createWorkspace(),
    createMeta("workspace", {
      source: "mock",
      fallbackReason: "db_query_failed",
      state: "success",
    }),
  );

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalled();
  });

  expect(screen.getByText("Fallback data mode (DB query failed)")).toBeInTheDocument();
  expect(screen.getByTestId("workspace-degraded-state")).toHaveTextContent("Backend degraded mode");
  expect(screen.queryByText("Unable to refresh datasets right now.")).not.toBeInTheDocument();
});

test("empty and degraded states remain distinguishable", async () => {
  renderWorkspace(
    createWorkspace([], {
      pageInfo: createPageInfo([], {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      }),
    }),
    createMeta("workspace", {
      source: "mock",
      fallbackReason: "db_open_failed",
      state: "success",
    }),
  );

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).not.toHaveBeenCalled();
  });

  expect(screen.getByText("Live dataset catalog unavailable")).toBeInTheDocument();
  expect(screen.getByTestId("workspace-degraded-state")).toHaveTextContent(
    "Showing fallback dataset output because the live repository is unavailable (DB open failed).",
  );
});

test("list errors preserve the last known good list and selection", async () => {
  const user = userEvent.setup();
  const selectedDataset = BASE_DATASETS[1]!;
  mockApiClient.dataExplorer.getWorkspace.mockRejectedValue(new Error("refresh failed"));

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: new RegExp(selectedDataset.name, "i") }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: selectedDataset.name })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(screen.getByText("Unable to refresh datasets right now.")).toBeInTheDocument();
  });

  expect(screen.getByRole("heading", { name: selectedDataset.name })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: new RegExp(selectedDataset.name, "i") })).toBeInTheDocument();
});

test("changing related-record sort triggers a related-record refresh", async () => {
  const user = userEvent.setup();
  const dataset = BASE_DATASETS[0]!;

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenCalledWith(
      dataset.id,
      expect.objectContaining({
        sortBy: "updated",
        sortDir: "desc",
        page: 1,
        pageSize: 5,
      }),
    );
  });

  await user.selectOptions(screen.getByLabelText("Related records sort field"), "title");

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenLastCalledWith(
      dataset.id,
      expect.objectContaining({
        sortBy: "title",
        sortDir: "desc",
        page: 1,
        pageSize: 5,
      }),
    );
  });
});

test("changing related-record page triggers a related-record refresh", async () => {
  const user = userEvent.setup();
  const dataset = BASE_DATASETS[0]!;
  const firstPageRecords = createRecordsResult(
    [
      {
        id: `${dataset.id}-REC-1`,
        title: `First page record for ${dataset.id}`,
        type: "Alert",
        status: "Open",
        updated: "4 min ago",
      },
      {
        id: `${dataset.id}-REC-2`,
        title: `Second page record for ${dataset.id}`,
        type: "Alert",
        status: "Monitoring",
        updated: "8 min ago",
      },
      {
        id: `${dataset.id}-REC-3`,
        title: `Third page record for ${dataset.id}`,
        type: "Alert",
        status: "Review",
        updated: "12 min ago",
      },
      {
        id: `${dataset.id}-REC-4`,
        title: `Fourth page record for ${dataset.id}`,
        type: "Alert",
        status: "Closed",
        updated: "16 min ago",
      },
      {
        id: `${dataset.id}-REC-5`,
        title: `Fifth page record for ${dataset.id}`,
        type: "Alert",
        status: "Open",
        updated: "20 min ago",
      },
    ],
    {
      page: 1,
      pageSize: 5,
      totalItems: 6,
      totalPages: 2,
    },
  );
  const secondPageRecords = createRecordsResult(
    [
      {
        id: `${dataset.id}-REC-6`,
        title: `Second page record for ${dataset.id}`,
        type: "Alert",
        status: "Monitoring",
        updated: "12 min ago",
      },
    ],
    {
      page: 2,
      pageSize: 5,
      totalItems: 6,
      totalPages: 2,
    },
  );

  mockApiClient.dataExplorer.getDatasetRecords
    .mockResolvedValueOnce(createRecordsResponse(firstPageRecords, dataset.id))
    .mockResolvedValueOnce(createRecordsResponse(secondPageRecords, dataset.id));

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Next records" })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: "Next records" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenLastCalledWith(
      dataset.id,
      expect.objectContaining({
        page: 2,
        pageSize: 5,
      }),
    );
  });
});

test("empty related-record results render safely", async () => {
  const user = userEvent.setup();
  const dataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce(
    createRecordsResponse(
      createRecordsResult([], {
        totalItems: 0,
        totalPages: 0,
      }),
      dataset.id,
    ),
  );

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByText("No related records yet")).toBeInTheDocument();
  });

  await user.selectOptions(screen.getByLabelText("Related records sort field"), "status");

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenLastCalledWith(
      dataset.id,
      expect.objectContaining({
        sortBy: "status",
      }),
    );
  });
});

test("degraded related-record responses render explicit degraded messaging", async () => {
  const dataset = BASE_DATASETS[0]!;

  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce({
    data: createRecordsResult([], {
      totalItems: 0,
      totalPages: 0,
    }),
    meta: createMeta("records", {
      datasetId: dataset.id,
      state: "success",
      source: "mock",
      fallbackReason: "db_path_missing",
    }),
  });

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByText("Related records unavailable in degraded mode")).toBeInTheDocument();
  });

  expect(screen.getByText("The related-record repository is currently degraded (DB path missing).")).toBeInTheDocument();
});

test("related-record errors remain local and non-fatal", async () => {
  const dataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce({
    data: null,
    meta: createMeta("records", {
      datasetId: dataset.id,
      state: "error",
      source: "mock",
      fallbackReason: "db_query_failed",
      errorMessage: "records failed",
    }),
  });

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByText("Related records unavailable")).toBeInTheDocument();
  });

  expect(screen.getByRole("heading", { name: dataset.name })).toBeInTheDocument();
  expect(screen.getByText("Preview Metrics")).toBeInTheDocument();
});

test("dev-only debug info renders source and fallback metadata", async () => {
  const dataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce({
    data: createRecordsResult(createRecords(dataset.id)),
    meta: createMeta("records", {
      datasetId: dataset.id,
      source: "mock",
      fallbackReason: "db_query_failed",
      durationMs: 21,
    }),
  });

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByTestId("debug-records")).toHaveTextContent("records");
    expect(screen.getByTestId("debug-records")).toHaveTextContent("browser_api");
    expect(screen.getByTestId("debug-records")).toHaveTextContent("mock");
    expect(screen.getByTestId("debug-records")).toHaveTextContent("db_query_failed");
  });
});

test("saved presets are sorted by recent usage and display usage metadata", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-beta",
          name: "Beta",
          filters: {
            q: "beta",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
          lastUsedAt: "2026-03-14T11:00:00.000Z",
          useCount: 3,
        },
        {
          id: "preset-zeta",
          name: "Zeta",
          filters: {
            q: "zeta",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
          lastUsedAt: "2026-03-14T12:00:00.000Z",
          useCount: 5,
        },
        {
          id: "preset-alpha",
          name: "Alpha",
          filters: {
            q: "alpha",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
          lastUsedAt: "2026-03-14T11:00:00.000Z",
          useCount: 1,
        },
        {
          id: "preset-none",
          name: "No History",
          filters: {
            q: "none",
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
        },
      ],
    }),
  );

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const optionLabels = within(presetSelect).getAllByRole("option").map((option) => option.textContent);

  expect(optionLabels).toEqual(["Saved presets", "Zeta", "Alpha", "Beta", "No History"]);

  const zetaOption = within(presetSelect).getByRole("option", { name: "Zeta" }) as HTMLOptionElement;
  await user.selectOptions(presetSelect, zetaOption.value);

  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 5");
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Last used: 2026-03-14 12:00");
});

test("saving a preset stores the current control state", async () => {
  const user = userEvent.setup();

  renderWorkspace();

  await user.type(screen.getByLabelText("Dataset search"), "thermal");
  await user.selectOptions(screen.getByLabelText("Dataset status filter"), "Live");
  await user.selectOptions(screen.getByLabelText("Dataset sort field"), "name");
  await user.selectOptions(screen.getByLabelText("Dataset sort direction"), "asc");
  await user.type(screen.getByLabelText("Preset name"), "Thermal Live");
  await user.click(screen.getByRole("button", { name: "Save preset" }));

  await waitFor(() => {
    const raw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
    expect(raw).not.toBeNull();
  });

  const raw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  const parsed = JSON.parse(raw ?? "null") as {
    version: number;
    presets: Array<{
      id: string;
      name: string;
      filters: {
        q: string;
        status: string;
        sortBy: string;
        sortDir: string;
      };
    }>;
  };
  const savedPreset = parsed.presets.find((preset) => preset.name === "Thermal Live");

  expect(savedPreset).toBeDefined();
  expect(savedPreset?.id).toEqual(expect.any(String));
  expect(savedPreset?.filters.q).toBe("thermal");
  expect(savedPreset?.filters.status).toBe("Live");
  expect(savedPreset?.filters.sortBy).toBe("name");
  expect(savedPreset?.filters.sortDir).toBe("asc");

  const presetSelect = screen.getByLabelText("Saved presets") as HTMLSelectElement;
  const presetOption = screen.getByRole("option", { name: "Thermal Live" }) as HTMLOptionElement;

  expect(presetOption.value).toBe(savedPreset?.id);
  expect(presetSelect.value).toBe(savedPreset?.id);
});

test("updating a selected preset replaces its filter snapshot without creating a duplicate", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-update",
          name: "Update Target",
          filters: {
            q: "before",
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
        },
      ],
    }),
  );

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const presetOption = await within(presetSelect).findByRole("option", { name: "Update Target" });
  const presetId = (presetOption as HTMLOptionElement).value;

  await user.selectOptions(presetSelect, presetId);
  expect(screen.getByTestId("saved-preset-sync-status")).toHaveTextContent(
    "Current filters differ from selected preset.",
  );
  expect(screen.getByRole("button", { name: "Update preset" })).toBeEnabled();

  await user.clear(screen.getByLabelText("Dataset search"));
  await user.type(screen.getByLabelText("Dataset search"), "after");
  expect(screen.getByTestId("saved-preset-sync-status")).toHaveTextContent(
    "Current filters differ from selected preset.",
  );
  expect(screen.getByRole("button", { name: "Update preset" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Update preset" }));

  await waitFor(() => {
    const current = window.localStorage.getItem("marine.dataExplorer.presets.v1");
    expect(current).not.toBeNull();
  });

  const raw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  const parsed = JSON.parse(raw ?? "null") as {
    presets: Array<{
      id: string;
      name: string;
      filters: {
        q: string;
      };
    }>;
  };

  expect(parsed.presets).toHaveLength(1);
  expect(parsed.presets[0]).toMatchObject({
    id: "preset-update",
    name: "Update Target",
    filters: {
      q: "after",
    },
  });
  expect(screen.getByLabelText("Saved presets")).toHaveValue("preset-update");
  expect(screen.getByTestId("saved-preset-sync-status")).toHaveTextContent(
    "Preset is in sync with current filters.",
  );
  expect(screen.getByRole("button", { name: "Update preset" })).toBeDisabled();
});

test("applying a preset updates controls, triggers refresh, and resets page to 1", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Chemistry Live",
          filters: {
            q: "chemistry",
            category: "",
            region: "",
            status: "Live",
            sortBy: "name",
            sortDir: "asc",
            pageSize: 10,
          },
        },
      ],
    }),
  );
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([BASE_DATASETS[2]!], {
        pageInfo: createPageInfo([BASE_DATASETS[2]!], {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          sortBy: "name",
          sortDir: "asc",
        }),
      }),
    ),
  );

  renderWorkspace(
    createWorkspace(BASE_DATASETS, {
      pageInfo: createPageInfo(BASE_DATASETS, {
        page: 2,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
      }),
    }),
  );

  const migratedPresetOption = await screen.findByRole("option", { name: "Chemistry Live" });
  const migratedPresetId = (migratedPresetOption as HTMLOptionElement).value;

  expect(migratedPresetId).not.toBe("");
  expect(migratedPresetId).not.toBe("Chemistry Live");

  await user.selectOptions(screen.getByLabelText("Saved presets"), migratedPresetId);
  expect(screen.getByLabelText("Saved presets")).toHaveValue(migratedPresetId);
  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "chemistry",
        status: "Live",
        sortBy: "name",
        sortDir: "asc",
        page: 1,
        pageSize: 10,
      }),
    );
  });

  expect(screen.getByLabelText("Dataset search")).toHaveValue("chemistry");
  expect(screen.getByLabelText("Dataset status filter")).toHaveValue("Live");
  expect(screen.getByLabelText("Dataset sort field")).toHaveValue("name");
});

test("applying a preset updates rendered usage metadata", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-usage-update",
          name: "Usage Update",
          filters: {
            q: "usage",
            category: "",
            region: "",
            status: "Live",
            sortBy: "name",
            sortDir: "asc",
            pageSize: 10,
          },
          createdAt: "2026-03-14T12:00:00.000Z",
          updatedAt: "2026-03-14T12:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([BASE_DATASETS[2]!], {
        pageInfo: createPageInfo([BASE_DATASETS[2]!], {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          sortBy: "name",
          sortDir: "asc",
        }),
      }),
    ),
  );

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const presetOption = await within(presetSelect).findByRole("option", { name: "Usage Update" });
  const presetId = (presetOption as HTMLOptionElement).value;

  await user.selectOptions(presetSelect, presetId);
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 0");
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Last used: Never");

  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 1");
  });
  expect(screen.getByTestId("saved-preset-usage-meta")).not.toHaveTextContent("Last used: Never");
});

test("presets without usage history render usage metadata safely", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Legacy No Usage",
          filters: {
            q: "legacy",
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

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const legacyOption = await within(presetSelect).findByRole("option", { name: "Legacy No Usage" });
  await user.selectOptions(presetSelect, (legacyOption as HTMLOptionElement).value);

  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 0");
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Last used: Never");
});

test("applying a preset still works when usage tracking fails", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-usage-failure",
          name: "Chemistry Live",
          filters: {
            q: "chemistry",
            category: "",
            region: "",
            status: "Live",
            sortBy: "name",
            sortDir: "asc",
            pageSize: 10,
          },
          createdAt: "2026-03-14T12:00:00.000Z",
          updatedAt: "2026-03-14T12:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([BASE_DATASETS[2]!], {
        pageInfo: createPageInfo([BASE_DATASETS[2]!], {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          sortBy: "name",
          sortDir: "asc",
        }),
      }),
    ),
  );

  renderWorkspace();

  const presetOption = await screen.findByRole("option", { name: "Chemistry Live" });
  const presetId = (presetOption as HTMLOptionElement).value;
  await user.selectOptions(screen.getByLabelText("Saved presets"), presetId);

  const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage write failed");
  });

  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "chemistry",
        status: "Live",
        sortBy: "name",
        sortDir: "asc",
        page: 1,
        pageSize: 10,
      }),
    );
  });

  expect(screen.getByLabelText("Dataset search")).toHaveValue("chemistry");
  expect(screen.getByLabelText("Dataset status filter")).toHaveValue("Live");
  expect(screen.queryByText("Unable to update presets in this browser.")).not.toBeInTheDocument();

  setItemSpy.mockRestore();
});

test("deleting a preset removes it from storage and the preset list", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Delete Me",
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

  renderWorkspace();

  const presetOption = await screen.findByRole("option", { name: "Delete Me" });
  const presetId = (presetOption as HTMLOptionElement).value;

  expect(presetId).not.toBe("");
  expect(presetId).not.toBe("Delete Me");

  await user.selectOptions(screen.getByLabelText("Saved presets"), presetId);
  expect(screen.getByLabelText("Saved presets")).toHaveValue(presetId);
  await user.click(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(screen.queryByRole("option", { name: "Delete Me" })).not.toBeInTheDocument();
  });

  const updatedRaw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  const updated = JSON.parse(updatedRaw ?? "null") as {
    presets: Array<{ id: string; name: string }>;
  };

  expect(updated.presets).toEqual([]);
});

test("corrupt preset storage fails safely", async () => {
  window.localStorage.setItem("marine.dataExplorer.presets.v1", "{bad-json");

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalledTimes(1);
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenCalledTimes(1);
  });

  await screen.findByText(/^Related record for /i);

  expect(screen.getByLabelText("Saved presets")).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Delete Me" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save preset" })).toBeEnabled();
});

test("shared preset load overrides local presets when shared store is available", async () => {
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "local-only",
          name: "Local Only",
          filters: {
            q: "local",
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
        },
      ],
    }),
  );
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "shared-1",
        name: "Shared Thermal",
        scope: "shared",
        filters: {
          q: "thermal",
          category: "",
          region: "",
          status: "Live",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
        lastUsedAt: "2026-03-14T12:00:00.000Z",
        useCount: 2,
      },
    ],
  });

  renderWorkspace();

  await screen.findByRole("option", { name: "Shared Thermal" });
  expect(screen.queryByRole("option", { name: "Local Only" })).not.toBeInTheDocument();
});

test("preset scope selector switches the visible preset catalog and labels the active mode", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({
      ok: true,
      presets: [
        {
          id: "personal-remote",
          name: "Personal Remote",
          scope: "personal",
          filters: {
            q: "personal-remote",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T11:30:00.000Z",
          updatedAt: "2026-03-14T11:30:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 3,
      presets: [
        {
          id: "shared-local",
          name: "Shared Local",
          scope: "shared",
          filters: {
            q: "shared",
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
        },
        {
          id: "personal-local",
          name: "Personal Local",
          scope: "personal",
          filters: {
            q: "personal",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T11:00:00.000Z",
          updatedAt: "2026-03-14T11:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );

  renderWorkspace();

  expect(screen.getByTestId("selected-preset-scope")).toHaveTextContent("Scope: Shared");
  expect(screen.getByTestId("preset-scope-description")).toHaveTextContent("repository-backed preset catalog");
  expect(await screen.findByRole("option", { name: "Shared Local" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Personal Local" })).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");

  await waitFor(() => {
    expect(screen.getByTestId("selected-preset-scope")).toHaveTextContent("Scope: Personal");
  });
  expect(screen.getByTestId("preset-scope-description")).toHaveTextContent("active station admin session");
  expect(await screen.findByRole("option", { name: "Personal Remote" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Shared Local" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Personal Local" })).not.toBeInTheDocument();
});

test("saving a preset in personal scope passes scope through the shared API path", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({ ok: true, presets: [] });
  mockApiClient.dataExplorer.upsertPreset.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "personal-1",
        name: "Personal Thermal",
        scope: "personal",
        filters: {
          q: "thermal",
          category: "",
          region: "",
          status: "Live",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");
  await user.type(screen.getByLabelText("Dataset search"), "thermal");
  await user.selectOptions(screen.getByLabelText("Dataset status filter"), "Live");
  await user.type(screen.getByLabelText("Preset name"), "Personal Thermal");
  await user.click(screen.getByRole("button", { name: "Save preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.upsertPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Personal Thermal",
        scope: "personal",
      }),
    );
  });
  expect(screen.getByLabelText("Saved presets")).toHaveValue("personal-1");
});

test("personal scope does not fall back to browser-local presets when authenticated loading fails", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({
      ok: false,
      presets: [],
      reason: "validation",
      error: "Personal preset scope requires an authenticated station admin session.",
    });
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 3,
      presets: [
        {
          id: "personal-local",
          name: "Personal Local",
          scope: "personal",
          filters: {
            q: "personal",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T11:00:00.000Z",
          updatedAt: "2026-03-14T11:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");

  await waitFor(() => {
    expect(screen.getByText("Personal preset scope requires an authenticated station admin session.")).toBeInTheDocument();
  });
  expect(screen.queryByRole("option", { name: "Personal Local" })).not.toBeInTheDocument();
});

test("personal scope save failures do not write browser-local fallback presets", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({ ok: true, presets: [] });
  mockApiClient.dataExplorer.upsertPreset.mockResolvedValueOnce({
    ok: false,
    presets: [],
    reason: "storage_unavailable",
    error: "Personal preset store unavailable.",
  });

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");
  await user.type(screen.getByLabelText("Dataset search"), "thermal");
  await user.type(screen.getByLabelText("Preset name"), "Personal Local Blocked");
  await user.click(screen.getByRole("button", { name: "Save preset" }));

  await waitFor(() => {
    expect(screen.getByText("Personal preset store unavailable.")).toBeInTheDocument();
  });

  const persisted = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  expect(persisted).toBeNull();
});

test("recent preset activity renders compact event rows when audit history exists", async () => {
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValueOnce({
    ok: true,
    events: [
      {
        id: "audit-1",
        presetId: "shared-1",
        presetName: "Shared Thermal",
        scope: "shared",
        action: "created",
        actorId: "operator-1",
        actorType: "station_admin",
        ownerId: null,
        outcome: "success",
        createdAt: "2026-03-20T12:00:00.000Z",
      },
    ],
  });

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.listPresetAuditEvents).toHaveBeenCalledWith({
      scope: "shared",
      limit: 5,
    });
  });

  const activityList = await screen.findByTestId("preset-activity-list");
  expect(activityList).toHaveTextContent("Created Shared Thermal (Shared)");
  expect(activityList).toHaveTextContent("operator-1");
});

test("recent preset activity shows an empty state when no scope activity exists", async () => {
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "shared-1",
        name: "Shared Thermal",
        scope: "shared",
        filters: {
          q: "thermal",
          category: "",
          region: "",
          status: "",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValueOnce({
    ok: true,
    events: [],
  });

  renderWorkspace();

  expect(await screen.findByRole("option", { name: "Shared Thermal" })).toBeInTheDocument();
  expect(await screen.findByTestId("preset-activity-empty")).toHaveTextContent(
    "No recent preset activity for this scope.",
  );
});

test("recent preset activity fetch failures are non-fatal and keep preset controls usable", async () => {
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "shared-2",
        name: "Shared Stable",
        scope: "shared",
        filters: {
          q: "stable",
          category: "",
          region: "",
          status: "",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-20T10:10:00.000Z",
        updatedAt: "2026-03-20T10:10:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValueOnce({
    ok: false,
    events: [],
    reason: "read_failed",
    error: "Preset audit history unavailable.",
  });

  renderWorkspace();

  expect(await screen.findByRole("option", { name: "Shared Stable" })).toBeInTheDocument();
  expect(await screen.findByTestId("preset-activity-error")).toHaveTextContent(
    "Preset audit history unavailable.",
  );
  expect(screen.getByRole("button", { name: "Save preset" })).toBeEnabled();
});

test("recent operator activity renders compact behavior rows", async () => {
  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValueOnce({
    ok: true,
    events: [
      {
        id: "behavior-1",
        eventType: "dataset_selected",
        scope: "shared",
        actorId: "operator-1",
        actorLabel: "operator-1",
        ownerId: null,
        presetId: null,
        presetName: null,
        datasetId: "DST-101",
        datasetName: "Atlantic Thermal",
        createdAt: "2026-03-20T14:00:00.000Z",
      },
    ],
  });

  renderWorkspace();

  const activity = await screen.findByTestId("behavior-activity-list");
  expect(activity).toHaveTextContent("Dataset selected Atlantic Thermal");
  expect(activity).toHaveTextContent("Shared");
  expect(activity).toHaveTextContent("operator-1");
});

test("recent operator activity fetch failures are non-fatal", async () => {
  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValueOnce({
    ok: false,
    events: [],
    reason: "read_failed",
    error: "Data Explorer behavior audit unavailable.",
  });

  renderWorkspace();

  expect(await screen.findByTestId("behavior-activity-error")).toHaveTextContent(
    "Data Explorer behavior audit unavailable.",
  );
  expect(screen.getByRole("button", { name: "Save preset" })).toBeEnabled();
});

test("dataset selection writes a dataset_selected behavior event", async () => {
  const user = userEvent.setup();

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalled();
  });

  mockApiClient.dataExplorer.writeBehaviorEvent.mockClear();

  await user.click(screen.getByRole("button", { name: new RegExp(BASE_DATASETS[1]!.name, "i") }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.writeBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "dataset_selected",
      datasetId: BASE_DATASETS[1]!.id,
      datasetName: BASE_DATASETS[1]!.name,
      scope: "shared",
    }));
  });
});

test("applying a preset writes a preset_applied behavior event", async () => {
  const user = userEvent.setup();

  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 3,
      presets: [
        {
          id: "shared-local-preset",
          name: "Shared Local Preset",
          scope: "shared",
          filters: {
            q: "local",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-20T10:00:00.000Z",
          updatedAt: "2026-03-20T10:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );

  renderWorkspace();

  await screen.findByRole("option", { name: "Shared Local Preset" });

  mockApiClient.dataExplorer.writeBehaviorEvent.mockClear();
  await user.selectOptions(screen.getByLabelText("Saved presets"), "shared-local-preset");
  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.writeBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "preset_applied",
      presetId: "shared-local-preset",
      presetName: "Shared Local Preset",
      scope: "shared",
    }));
  });
});
```

## apps/web/lib/server/data-explorer-preset-store.test.ts
```ts
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  appendDataExplorerBehaviorEvent,
  clearSharedDataExplorerPresetStoreForTests,
  deleteDataExplorerPresetById,
  deleteSharedDataExplorerPresetById,
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

test("repository-backed preset audit reads apply preset, actor, and personal scope filters", () => {
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
  } finally {
    db.close();
  }

  const result = listPresetAuditEvents({
    scope: "personal",
    ownerId: "operator-target",
    presetId: "preset-target",
    actorId: "operator-target",
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
```

