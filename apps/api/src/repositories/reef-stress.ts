import {
  hasDatabasePath,
  resolveDatabasePath,
  getAsyncAdapter,
  type AsyncDbAdapter,
} from "../db/async-client";
import { CRW_SOURCE } from "../connectors/coral-reef-watch/constants";
import type { ReefAlertsFallbackReason } from "../types";
import type { ReefStressWatchItem } from "@marine/shared";
import {
  classifyCrwFreshness,
  verificationStatusFromFreshness,
} from "../services/environmental-harness/freshness-policy";
import { buildSignalProvenance } from "../services/environmental-harness/provenance";
import { annotateReefAlertTrust } from "../services/environmental-harness/lineage-presentation";
import type { EnvironmentalSignalLineageInsert } from "./observations";

interface StationMetricRow {
  metric_type: string;
  metric_value: number | string | null;
}

interface DerivedSignalRow {
  station_id: string | null;
  region_key: string;
  signal_label: string | null;
  signal_value: number | string | null;
  observed_at: number | string;
  source_timestamp: string;
  source_reference?: string | null;
  created_at?: number | string | null;
  harness_signal_id?: string | null;
  root_event_id?: string | null;
  source_ingestion_event_id?: string | null;
  verification_event_id?: string | null;
  provenance_hash?: string | null;
}

export interface CrwRiskHistoryItem {
  stationId: string | null;
  regionKey: string;
  observedAt: number;
  sourceTimestamp: string;
  sstAnomalyC: number | null;
  hotSpotC: number | null;
  dhw: number | null;
  stressLevel: string | null;
}

export interface StationMetricInsertInput extends EnvironmentalSignalLineageInsert {
  stationId: string | null;
  regionKey: string;
  metricType: "sst_anomaly_c" | "hotspot_c" | "dhw";
  metricValue: number;
  metricUnit: "celsius" | "week";
  source: string;
  observedAt: number;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  createdAt: number;
}

export interface DerivedSignalInsertInput extends EnvironmentalSignalLineageInsert {
  stationId: string | null;
  regionKey: string;
  signalType: "reef_bleaching_alert_level";
  signalValue: number | null;
  signalLabel: string | null;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  observedAt: number;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  createdAt: number;
}

interface ReefStressRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  getAdapter?: typeof getAsyncAdapter;
}

export type ReefStressReadResult =
  | { source: "db"; alerts: ReefStressWatchItem[] }
  | { source: "mock"; fallbackReason: ReefAlertsFallbackReason };

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toTimestamp(value: number | string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }

  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return Date.now();
}

function shouldExcludeSyntheticBaselineData(): boolean {
  return process.env.NODE_ENV === "production"
    && String(process.env.ALLOW_SYNTHETIC_BASELINE_IN_PRODUCTION ?? "false").trim().toLowerCase() !== "true";
}

function syntheticCrwPredicate(): string {
  if (!shouldExcludeSyntheticBaselineData()) {
    return "";
  }

  return " AND source_reference NOT LIKE 'synthetic://%'";
}

function signalKey(stationId: string | null, regionKey: string): string {
  return `${stationId ?? "region"}:${regionKey}`;
}

export async function ensureReefStressLineageColumns(adapter: AsyncDbAdapter): Promise<void> {
  const migrations = [
    "ALTER TABLE derived_signals ADD COLUMN harness_signal_id TEXT",
    "ALTER TABLE derived_signals ADD COLUMN root_event_id TEXT",
    "ALTER TABLE derived_signals ADD COLUMN source_ingestion_event_id TEXT",
    "ALTER TABLE derived_signals ADD COLUMN verification_event_id TEXT",
    "ALTER TABLE derived_signals ADD COLUMN provenance_hash TEXT",
    "ALTER TABLE station_metrics ADD COLUMN harness_signal_id TEXT",
    "ALTER TABLE station_metrics ADD COLUMN root_event_id TEXT",
    "ALTER TABLE station_metrics ADD COLUMN source_ingestion_event_id TEXT",
    "ALTER TABLE station_metrics ADD COLUMN verification_event_id TEXT",
    "ALTER TABLE station_metrics ADD COLUMN provenance_hash TEXT",
  ];

  for (const sql of migrations) {
    try {
      await adapter.execute(sql);
    } catch {
      // Column already exists.
    }
  }
}

export async function ensureStationMetricsTable(adapter: AsyncDbAdapter): Promise<void> {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS station_metrics (
      id TEXT PRIMARY KEY,
      station_id TEXT,
      region_key TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      metric_value REAL,
      metric_unit TEXT,
      source TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      ingestion_run_id TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  );

  await ensureReefStressLineageColumns(adapter);
}

export async function ensureDerivedSignalsTable(adapter: AsyncDbAdapter): Promise<void> {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS derived_signals (
      id TEXT PRIMARY KEY,
      station_id TEXT,
      region_key TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      signal_value REAL,
      signal_label TEXT,
      severity TEXT,
      source TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      ingestion_run_id TEXT NOT NULL,
      source_timestamp TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  );

  await ensureReefStressLineageColumns(adapter);
}

export async function reefStressSnapshotExists(
  adapter: AsyncDbAdapter,
  stationId: string | null,
  regionKey: string,
  observedAt: number,
  source: string,
): Promise<boolean> {
  const rows = await adapter.execute(
    `SELECT 1 AS found
     FROM derived_signals
     WHERE signal_type = 'reef_bleaching_alert_level'
       AND source = ?
       AND observed_at = ?
       AND region_key = ?
       AND ((station_id = ?) OR (station_id IS NULL AND ? IS NULL))
     LIMIT 1`,
    [source, observedAt, regionKey, stationId, stationId]
  ) as Array<{ found?: number }>;

  return rows.length > 0;
}

export async function insertStationMetric(adapter: AsyncDbAdapter, input: StationMetricInsertInput): Promise<string> {
  const id = `STM-${input.metricType}-${input.regionKey}-${input.observedAt}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  await adapter.execute(
    `INSERT INTO station_metrics (
      id,
      station_id,
      region_key,
      metric_type,
      metric_value,
      metric_unit,
      source,
      observed_at,
      ingestion_run_id,
      source_timestamp,
      source_reference,
      created_at,
      harness_signal_id,
      root_event_id,
      source_ingestion_event_id,
      verification_event_id,
      provenance_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.stationId,
      input.regionKey,
      input.metricType,
      input.metricValue,
      input.metricUnit,
      input.source,
      input.observedAt,
      input.ingestionRunId,
      input.sourceTimestamp,
      input.sourceReference,
      input.createdAt,
      input.signalId ?? null,
      input.rootEventId ?? null,
      input.sourceIngestionEventId ?? null,
      input.verificationEventId ?? null,
      input.provenanceHash ?? null,
    ]
  );

  return id;
}

export async function insertDerivedSignal(adapter: AsyncDbAdapter, input: DerivedSignalInsertInput): Promise<string> {
  const id = `DRS-${input.regionKey}-${input.observedAt}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  await adapter.execute(
    `INSERT INTO derived_signals (
      id,
      station_id,
      region_key,
      signal_type,
      signal_value,
      signal_label,
      severity,
      source,
      observed_at,
      ingestion_run_id,
      source_timestamp,
      source_reference,
      created_at,
      harness_signal_id,
      root_event_id,
      source_ingestion_event_id,
      verification_event_id,
      provenance_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.stationId,
      input.regionKey,
      input.signalType,
      input.signalValue,
      input.signalLabel,
      input.severity,
      input.source,
      input.observedAt,
      input.ingestionRunId,
      input.sourceTimestamp,
      input.sourceReference,
      input.createdAt,
      input.signalId ?? null,
      input.rootEventId ?? null,
      input.sourceIngestionEventId ?? null,
      input.verificationEventId ?? null,
      input.provenanceHash ?? null,
    ]
  );

  return id;
}

async function readMetricsForSnapshot(
  adapter: AsyncDbAdapter,
  source: string,
  regionKey: string,
  stationId: string | null,
  observedAt: number,
): Promise<Record<string, number | null>> {
  const rows = await adapter.execute(
    `SELECT metric_type, metric_value
     FROM station_metrics
     WHERE source = ?
       AND observed_at = ?
       AND region_key = ?
       AND ((station_id = ?) OR (station_id IS NULL AND ? IS NULL))`,
    [source, observedAt, regionKey, stationId, stationId]
  ) as StationMetricRow[];

  const metrics: Record<string, number | null> = {};

  for (const row of rows) {
    metrics[row.metric_type] = toNumber(row.metric_value);
  }

  return metrics;
}

export async function readLatestReefStressFromDb(
  adapter: AsyncDbAdapter,
  limit = 20,
): Promise<ReefStressWatchItem[]> {
  const rows = await adapter.execute(
    `SELECT station_id, region_key, signal_label, signal_value, observed_at, source_timestamp,
            source_reference, created_at, harness_signal_id, root_event_id,
            source_ingestion_event_id, verification_event_id, provenance_hash
     FROM derived_signals
     WHERE source = ?
       AND signal_type = 'reef_bleaching_alert_level'
       ${syntheticCrwPredicate()}
     ORDER BY observed_at DESC, id ASC
     LIMIT 200`,
    [CRW_SOURCE]
  ) as DerivedSignalRow[];

  const latestByKey = new Map<string, DerivedSignalRow>();

  for (const row of rows) {
    const key = signalKey(row.station_id, row.region_key);
    if (!latestByKey.has(key)) {
      latestByKey.set(key, row);
    }
  }

  const snapshots = [...latestByKey.values()].slice(0, limit);

  return Promise.all(snapshots.map(async (row) => {
    const observedAt = toTimestamp(row.observed_at);
    const createdAtMs = row.created_at != null ? toTimestamp(row.created_at) : null;
    const productDateMs = row.source_timestamp
      ? toTimestamp(row.source_timestamp)
      : observedAt;
    const productDateIso = new Date(productDateMs).toISOString();
    const ingestedAtIso = createdAtMs !== null ? new Date(createdAtMs).toISOString() : undefined;
    const freshnessStatus = classifyCrwFreshness(
      Number.isFinite(productDateMs) ? productDateMs : observedAt,
    );
    const verificationStatus = verificationStatusFromFreshness(freshnessStatus);
    const provenance = buildSignalProvenance({
      source: CRW_SOURCE,
      sourceFeed: row.source_reference ?? null,
      productDate: productDateIso,
      ingestedAt: ingestedAtIso ?? null,
      stationId: row.station_id,
      observedAt: new Date(observedAt).toISOString(),
    });
    const metrics = await readMetricsForSnapshot(
      adapter,
      CRW_SOURCE,
      row.region_key,
      row.station_id,
      observedAt,
    );

    return annotateReefAlertTrust({
      region: row.region_key,
      stationId: row.station_id,
      timestamp: new Date(observedAt).toISOString(),
      sstAnomalyC: metrics.sst_anomaly_c ?? null,
      hotSpotC: metrics.hotspot_c ?? null,
      dhw: metrics.dhw ?? null,
      stressLevel: row.signal_label,
      source: CRW_SOURCE,
      outputClass: "derived" as const,
      ingestedAt: ingestedAtIso,
      sourceFeed: row.source_reference ?? null,
      productDate: productDateIso,
      freshnessStatus,
      verificationStatus,
      provenance,
      signalId: row.harness_signal_id ?? null,
      rootEventId: row.root_event_id ?? null,
      sourceIngestionEventId: row.source_ingestion_event_id ?? null,
      verificationEventId: row.verification_event_id ?? null,
      provenanceHash: row.provenance_hash ?? provenance.contentHash ?? null,
    });
  }));
}

async function readCrwHistoryRows(
  adapter: AsyncDbAdapter,
  sinceObservedAt: number,
  limit: number,
): Promise<DerivedSignalRow[]> {
  return await adapter.execute(
    `SELECT station_id, region_key, signal_label, signal_value, observed_at, source_timestamp
     FROM derived_signals
     WHERE source = ?
       AND signal_type = 'reef_bleaching_alert_level'
       AND observed_at >= ?
       ${syntheticCrwPredicate()}
     ORDER BY observed_at DESC, id ASC
     LIMIT ?`,
    [CRW_SOURCE, sinceObservedAt, limit]
  ) as DerivedSignalRow[];
}

async function toCrwRiskHistoryItem(
  adapter: AsyncDbAdapter,
  row: DerivedSignalRow,
): Promise<CrwRiskHistoryItem> {
  const observedAt = toTimestamp(row.observed_at);
  const metrics = await readMetricsForSnapshot(
    adapter,
    CRW_SOURCE,
    row.region_key,
    row.station_id,
    observedAt,
  );

  return {
    stationId: row.station_id,
    regionKey: row.region_key,
    observedAt,
    sourceTimestamp: row.source_timestamp,
    sstAnomalyC: metrics.sst_anomaly_c ?? null,
    hotSpotC: metrics.hotspot_c ?? null,
    dhw: metrics.dhw ?? null,
    stressLevel: row.signal_label,
  };
}

export async function readRecentCrwRiskHistoryFromDb(
  adapter: AsyncDbAdapter,
  sinceObservedAt: number,
  limit = 120,
): Promise<CrwRiskHistoryItem[]> {
  const rows = await readCrwHistoryRows(adapter, sinceObservedAt, limit * 4);
  const latestByKey = new Map<string, DerivedSignalRow>();

  for (const row of rows) {
    const key = `${signalKey(row.station_id, row.region_key)}:${toTimestamp(row.observed_at)}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, row);
    }
  }

  const items = [...latestByKey.values()].slice(0, limit);
  return Promise.all(items.map(row => toCrwRiskHistoryItem(adapter, row)));
}

export async function readLatestCrwRiskSnapshotFromDb(
  adapter: AsyncDbAdapter,
): Promise<CrwRiskHistoryItem | null> {
  const history = await readRecentCrwRiskHistoryFromDb(adapter, 0, 1);
  return history[0] ?? null;
}

export async function listLatestReefStress(
  dependencies: ReefStressRepositoryDependencies = {},
): Promise<ReefStressReadResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const databasePath = resolvePath();

  const isTurso = !!process.env.TURSO_DATABASE_URL;
  if (!isTurso && !hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(true);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    return {
      source: "db",
      alerts: await readLatestReefStressFromDb(adapter),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    adapter.close();
  }
}
