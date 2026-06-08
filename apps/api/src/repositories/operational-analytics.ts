import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import type {
  OperationalAnalyticsDailyBucket,
  OperationalAnalyticsEventType,
  OperationalAnalyticsSummary,
} from "@marine/shared";

export interface OperationalAnalyticsIncrementInput {
  eventType: OperationalAnalyticsEventType;
  dimension?: string;
  occurredAtMs?: number;
}

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function ensureOperationalAnalyticsTable(adapter: AsyncDbAdapter): Promise<void> {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS operational_analytics_daily (
      day_utc TEXT NOT NULL,
      event_type TEXT NOT NULL,
      dimension TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (day_utc, event_type, dimension)
    )`,
  );

  await adapter.execute(
    "CREATE INDEX IF NOT EXISTS idx_operational_analytics_event_day ON operational_analytics_daily (event_type, day_utc)",
  );
}

export async function incrementOperationalAnalytics(
  adapter: AsyncDbAdapter,
  input: OperationalAnalyticsIncrementInput,
): Promise<void> {
  const dimension = (input.dimension ?? "").trim().slice(0, 64);
  const nowMs = input.occurredAtMs ?? Date.now();
  const dayUtc = utcDayKey(nowMs);

  await adapter.execute(
    `INSERT INTO operational_analytics_daily (day_utc, event_type, dimension, count, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(day_utc, event_type, dimension)
     DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
    [dayUtc, input.eventType, dimension, nowMs],
  );
}

export async function readOperationalAnalyticsSummary(
  adapter: AsyncDbAdapter,
  lookbackDays = 30,
): Promise<OperationalAnalyticsDailyBucket[]> {
  const cutoffDay = utcDayKey(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await adapter.execute(
    `SELECT day_utc, event_type, dimension, count
     FROM operational_analytics_daily
     WHERE day_utc >= ?
     ORDER BY day_utc DESC, event_type ASC, dimension ASC`,
    [cutoffDay],
  ) as Array<{
    day_utc: string;
    event_type: string;
    dimension: string;
    count: number;
  }>;

  return rows.map((row) => ({
    day: row.day_utc,
    eventType: row.event_type as OperationalAnalyticsEventType,
    dimension: row.dimension ?? "",
    count: Number(row.count) || 0,
  }));
}

export type RecordOperationalAnalyticsResult =
  | { source: "db"; ok: true }
  | { source: "unavailable"; fallbackReason: "disabled" | "db_path_missing" | "db_open_failed" | "db_query_failed" };

export async function recordOperationalAnalyticsEvent(
  input: OperationalAnalyticsIncrementInput,
  dependencies: {
    resolvePath?: typeof resolveDatabasePath;
    hasPath?: typeof hasDatabasePath;
    getAdapter?: (readOnly?: boolean) => AsyncDbAdapter;
    now?: () => number;
    enabled?: boolean;
  } = {},
): Promise<RecordOperationalAnalyticsResult> {
  const enabled = dependencies.enabled ?? String(process.env.OPERATIONAL_ANALYTICS_ENABLED ?? "true").trim().toLowerCase() !== "false";
  if (!enabled) {
    return { source: "unavailable", fallbackReason: "disabled" };
  }

  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;

  const dbPath = resolvePath();
  const isTurso = Boolean(process.env.TURSO_DATABASE_URL?.trim());

  if (!isTurso && !hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;
  try {
    adapter = getAdapter(false);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureOperationalAnalyticsTable(adapter);
    await incrementOperationalAnalytics(adapter, { ...input, occurredAtMs: now() });
    return { source: "db", ok: true };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}

export function buildOperationalAnalyticsSummary(
  buckets: OperationalAnalyticsDailyBucket[],
  generatedAt = new Date().toISOString(),
): OperationalAnalyticsSummary {
  const totalsByEventType: OperationalAnalyticsSummary["totalsByEventType"] = {
    page_view: 0,
    investigation_open: 0,
    lineage_open: 0,
    export: 0,
    operator_usage: 0,
  };

  for (const bucket of buckets) {
    totalsByEventType[bucket.eventType] = (totalsByEventType[bucket.eventType] ?? 0) + bucket.count;
  }

  return {
    generatedAt,
    privacy: {
      accounts: false,
      personalIdentifiers: false,
      advertisingAnalytics: false,
      aggregation: "daily_counts_only",
      note:
        "Counts are aggregated by UTC day, event type, and coarse dimension only. No user ids, sessions, IPs, or resource identifiers are stored.",
    },
    totalsByEventType,
    last30Days: buckets,
  };
}

export async function getOperationalAnalyticsSummary(
  lookbackDays = 30,
  dependencies: {
    resolvePath?: typeof resolveDatabasePath;
    hasPath?: typeof hasDatabasePath;
    getAdapter?: (readOnly?: boolean) => AsyncDbAdapter;
  } = {},
): Promise<
  | { source: "db"; summary: OperationalAnalyticsSummary }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" }
> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;

  const dbPath = resolvePath();
  const isTurso = Boolean(process.env.TURSO_DATABASE_URL?.trim());

  if (!isTurso && !hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;
  try {
    adapter = getAdapter(true);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    await ensureOperationalAnalyticsTable(adapter);
    const buckets = await readOperationalAnalyticsSummary(adapter, lookbackDays);
    return {
      source: "db",
      summary: buildOperationalAnalyticsSummary(buckets),
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    await adapter.close();
  }
}
