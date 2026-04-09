import type {
  BillingAccountCreateRequest,
  BillingAccountPlanUpdateRequest,
  BillingAccountRecord,
  BillingUsageRecord,
  BillingUsageSummary,
} from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";

interface BillingAccountRow {
  id: string;
  provider: string;
  external_customer_id: string | null;
  name: string;
  email: string | null;
  tier: string;
  status: string;
  monthly_quota: number | string;
  cost_per_request_cents: number | string;
  created_at: number | string;
  updated_at: number | string;
}

interface BillingUsageRow {
  id: string;
  key_id: string;
  billing_account_id: string | null;
  route: string;
  status_code: number | string;
  request_at: number | string;
  units: number | string;
  cost_cents: number | string;
  billing_month: string;
}

interface BillingRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

export interface BillingPlanPolicy {
  tier: "free" | "pro" | "enterprise";
  monthlyQuota: number;
  costPerRequestCents: number;
}

export const BILLING_PLAN_POLICIES: Record<string, BillingPlanPolicy> = {
  free: { tier: "free", monthlyQuota: 1000, costPerRequestCents: 0 },
  pro: { tier: "pro", monthlyQuota: 10000, costPerRequestCents: 2 },
  enterprise: { tier: "enterprise", monthlyQuota: 100000, costPerRequestCents: 1 },
};

export type BillingAccountMutationResult =
  | { source: "db"; result: { ok: true; account: BillingAccountRecord } }
  | { source: "db"; result: { ok: false; error: string } }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export type BillingAccountLookupResult =
  | { source: "db"; result: { ok: true; account: BillingAccountRecord | null } }
  | { source: "db"; result: { ok: false; error: string } }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export type BillingUsageWriteResult =
  | { source: "db"; result: { ok: true; usage: BillingUsageRecord } }
  | { source: "db"; result: { ok: false; error: string } }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export type BillingUsageSummaryResult =
  | { source: "db"; result: { ok: true; summary: BillingUsageSummary } }
  | { source: "db"; result: { ok: false; error: string } }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

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

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTier(value: string | null | undefined): BillingPlanPolicy["tier"] | null {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "free" || normalized === "pro" || normalized === "enterprise") {
    return normalized;
  }

  return null;
}

function normalizeNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolvePlanPolicy(tier: string | null | undefined): BillingPlanPolicy {
  const normalizedTier = normalizeTier(tier) ?? "free";
  return BILLING_PLAN_POLICIES[normalizedTier];
}

function billingMonthFromEpochMs(epochMs: number): string {
  const date = new Date(epochMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function mapAccountRow(row: BillingAccountRow): BillingAccountRecord {
  return {
    id: row.id,
    provider: row.provider,
    externalCustomerId: row.external_customer_id,
    name: row.name,
    email: row.email,
    tier: row.tier,
    status: row.status === "inactive" ? "inactive" : "active",
    monthlyQuota: normalizeNumber(row.monthly_quota) ?? 0,
    costPerRequestCents: normalizeNumber(row.cost_per_request_cents) ?? 0,
    createdAt: new Date(normalizeNumber(row.created_at) ?? Date.now()).toISOString(),
    updatedAt: new Date(normalizeNumber(row.updated_at) ?? Date.now()).toISOString(),
  };
}

function mapUsageRow(row: BillingUsageRow): BillingUsageRecord {
  return {
    id: row.id,
    keyId: row.key_id,
    billingAccountId: row.billing_account_id,
    route: row.route,
    statusCode: normalizeNumber(row.status_code) ?? 0,
    requestAt: new Date(normalizeNumber(row.request_at) ?? Date.now()).toISOString(),
    units: normalizeNumber(row.units) ?? 0,
    costCents: normalizeNumber(row.cost_cents) ?? 0,
    billingMonth: row.billing_month,
  };
}

function loadBillingAccountById(db: SqliteDatabaseLike, id: string): BillingAccountRow | null {
  const rows = toStatement(
    db,
    `SELECT id, provider, external_customer_id, name, email, tier, status, monthly_quota, cost_per_request_cents, created_at, updated_at
     FROM billing_accounts
     WHERE id = ?
     LIMIT 1`,
  ).all(id) as BillingAccountRow[];

  return rows[0] ?? null;
}

function nextSequence(db: SqliteDatabaseLike, tableName: "billing_accounts" | "billing_usage_records"): number {
  const rows = toStatement(
    db,
    `SELECT COUNT(*) AS total
     FROM ${tableName}`,
  ).all() as Array<{ total?: number | string }>;

  return (normalizeNumber(rows[0]?.total ?? 0) ?? 0) + 1;
}

export function ensureBillingTables(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS billing_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        external_customer_id TEXT,
        name TEXT NOT NULL,
        email TEXT,
        tier TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        monthly_quota INTEGER NOT NULL,
        cost_per_request_cents INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS billing_usage_records (
        id TEXT PRIMARY KEY,
        key_id TEXT NOT NULL,
        billing_account_id TEXT,
        route TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        request_at INTEGER NOT NULL,
        units INTEGER NOT NULL,
        cost_cents INTEGER NOT NULL,
        billing_month TEXT NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_billing_usage_key_month ON billing_usage_records (key_id, billing_month, request_at DESC)",
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_billing_usage_account_month ON billing_usage_records (billing_account_id, billing_month, request_at DESC)",
    ),
  );
}

export function createBillingAccount(
  input: BillingAccountCreateRequest,
  dependencies: BillingRepositoryDependencies = {},
): BillingAccountMutationResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const name = normalizeText(input.name);
  const tier = normalizeTier(input.tier);

  if (!name) {
    return { source: "db", result: { ok: false, error: "name is required" } };
  }

  if (!tier) {
    return { source: "db", result: { ok: false, error: "tier is invalid" } };
  }

  const dbPath = resolvePath();
  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureBillingTables(db);
    const nowMs = now();
    const plan = resolvePlanPolicy(tier);
    const accountId = `BACC-${nowMs}-${nextSequence(db, "billing_accounts")}`;

    runStatement(
      toStatement(
        db,
        `INSERT INTO billing_accounts (
          id, provider, external_customer_id, name, email, tier, status, monthly_quota, cost_per_request_cents, created_at, updated_at
        ) VALUES (?, 'manual', ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      ),
      accountId,
      normalizeText(input.externalCustomerId ?? null),
      name,
      normalizeText(input.email ?? null),
      tier,
      plan.monthlyQuota,
      plan.costPerRequestCents,
      nowMs,
      nowMs,
    );

    const row = loadBillingAccountById(db, accountId);
    if (!row) {
      return { source: "db", result: { ok: false, error: "billing account creation failed" } };
    }

    return { source: "db", result: { ok: true, account: mapAccountRow(row) } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function updateBillingAccountPlan(
  input: BillingAccountPlanUpdateRequest,
  dependencies: BillingRepositoryDependencies = {},
): BillingAccountMutationResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const billingAccountId = normalizeText(input.billingAccountId);
  const tier = normalizeTier(input.tier);

  if (!billingAccountId) {
    return { source: "db", result: { ok: false, error: "billingAccountId is required" } };
  }

  if (!tier) {
    return { source: "db", result: { ok: false, error: "tier is invalid" } };
  }

  const dbPath = resolvePath();
  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureBillingTables(db);
    const plan = resolvePlanPolicy(tier);
    const nowMs = now();

    runStatement(
      toStatement(
        db,
        `UPDATE billing_accounts
         SET tier = ?, monthly_quota = ?, cost_per_request_cents = ?, updated_at = ?
         WHERE id = ?`,
      ),
      tier,
      plan.monthlyQuota,
      plan.costPerRequestCents,
      nowMs,
      billingAccountId,
    );

    const row = loadBillingAccountById(db, billingAccountId);
    if (!row) {
      return { source: "db", result: { ok: false, error: "billingAccountId was not found" } };
    }

    return { source: "db", result: { ok: true, account: mapAccountRow(row) } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function getBillingAccountById(
  id: string,
  dependencies: BillingRepositoryDependencies = {},
): BillingAccountLookupResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const normalizedId = normalizeText(id);

  if (!normalizedId) {
    return { source: "db", result: { ok: false, error: "id is required" } };
  }

  const dbPath = resolvePath();
  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureBillingTables(db);
    const row = loadBillingAccountById(db, normalizedId);
    return { source: "db", result: { ok: true, account: row ? mapAccountRow(row) : null } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function recordBillingUsage(
  input: {
    keyId: string;
    billingAccountId?: string | null;
    route: string;
    statusCode: number;
    requestAt?: number;
    units: number;
    costCents: number;
  },
  dependencies: BillingRepositoryDependencies = {},
): BillingUsageWriteResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const keyId = normalizeText(input.keyId);
  const route = normalizeText(input.route);

  if (!keyId) {
    return { source: "db", result: { ok: false, error: "keyId is required" } };
  }

  if (!route) {
    return { source: "db", result: { ok: false, error: "route is required" } };
  }

  if (!Number.isFinite(input.units) || input.units < 0) {
    return { source: "db", result: { ok: false, error: "units must be a non-negative number" } };
  }

  if (!Number.isFinite(input.costCents) || input.costCents < 0) {
    return { source: "db", result: { ok: false, error: "costCents must be a non-negative number" } };
  }

  const dbPath = resolvePath();
  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureBillingTables(db);
    const requestAt = input.requestAt ?? now();
    const id = `BUSG-${requestAt}-${nextSequence(db, "billing_usage_records")}`;
    const billingMonth = billingMonthFromEpochMs(requestAt);

    runStatement(
      toStatement(
        db,
        `INSERT INTO billing_usage_records (
          id, key_id, billing_account_id, route, status_code, request_at, units, cost_cents, billing_month
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      id,
      keyId,
      normalizeText(input.billingAccountId ?? null),
      route,
      input.statusCode,
      requestAt,
      Math.floor(input.units),
      Math.round(input.costCents),
      billingMonth,
    );

    return {
      source: "db",
      result: {
        ok: true,
        usage: mapUsageRow({
          id,
          key_id: keyId,
          billing_account_id: normalizeText(input.billingAccountId ?? null),
          route,
          status_code: input.statusCode,
          request_at: requestAt,
          units: Math.floor(input.units),
          cost_cents: Math.round(input.costCents),
          billing_month: billingMonth,
        }),
      },
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function getBillingUsageSummary(
  input: {
    keyId: string;
    billingAccountId?: string | null;
    billingMonth: string;
    monthlyQuota: number;
    costPerRequestCents: number;
  },
  dependencies: BillingRepositoryDependencies = {},
): BillingUsageSummaryResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const keyId = normalizeText(input.keyId);
  const billingMonth = normalizeText(input.billingMonth);

  if (!keyId) {
    return { source: "db", result: { ok: false, error: "keyId is required" } };
  }

  if (!billingMonth) {
    return { source: "db", result: { ok: false, error: "billingMonth is required" } };
  }

  const dbPath = resolvePath();
  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureBillingTables(db);
    const rows = toStatement(
      db,
      `SELECT id, key_id, billing_account_id, route, status_code, request_at, units, cost_cents, billing_month
       FROM billing_usage_records
       WHERE key_id = ?
         AND billing_month = ?`,
    ).all(keyId, billingMonth) as BillingUsageRow[];

    const billableRequests = rows.reduce((sum, row) => sum + (normalizeNumber(row.units) ?? 0), 0);
    const estimatedCostCents = rows.reduce((sum, row) => sum + (normalizeNumber(row.cost_cents) ?? 0), 0);

    return {
      source: "db",
      result: {
        ok: true,
        summary: {
          provider: "manual",
          keyId,
          billingAccountId: normalizeText(input.billingAccountId ?? null),
          billingMonth,
          billableRequests,
          estimatedCostCents,
          estimatedCostUsd: Math.round((estimatedCostCents / 100) * 100) / 100,
          costPerRequestCents: input.costPerRequestCents,
          remainingQuota: Math.max(0, input.monthlyQuota - billableRequests),
        },
      },
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
