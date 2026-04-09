import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";

export interface RegionalRiskSnapshotRecord {
  id: string;
  regionId: string;
  regionName: string;
  computedAt: string;
  regionalRiskLevel: "low" | "medium" | "high" | "critical" | "unknown";
  regionalConfidence: number;
  weightedRegionalScore: number;
  healthyStationCount: number;
  analyzedStationCount: number;
  stationCountWithElevatedRisk: number;
  corroboratingHealthyStationCount: number;
  dominantDrivers: string[];
  crwSupported: boolean;
  operatorSummary: string;
}

interface RegionalRiskSnapshotRow {
  id: string;
  region_id: string;
  region_name: string;
  computed_at: number | string;
  regional_risk_level: "low" | "medium" | "high" | "critical" | "unknown";
  regional_confidence: number | string;
  weighted_regional_score: number | string;
  healthy_station_count: number | string;
  analyzed_station_count: number | string;
  station_count_with_elevated_risk: number | string;
  corroborating_healthy_station_count: number | string;
  dominant_drivers_json: string;
  crw_supported: number | string;
  operator_summary: string;
}

interface RegionalRiskSnapshotsRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
}

export type RegionalRiskSnapshotsReadResult =
  | { source: "db"; snapshots: RegionalRiskSnapshotRecord[] }
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

function toEpochMs(value: number | string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function toSafeNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDominantDrivers(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function toSnapshotRecord(row: RegionalRiskSnapshotRow): RegionalRiskSnapshotRecord {
  return {
    id: row.id,
    regionId: row.region_id,
    regionName: row.region_name,
    computedAt: new Date(toEpochMs(row.computed_at)).toISOString(),
    regionalRiskLevel: row.regional_risk_level,
    regionalConfidence: toSafeNumber(row.regional_confidence),
    weightedRegionalScore: toSafeNumber(row.weighted_regional_score),
    healthyStationCount: toSafeNumber(row.healthy_station_count),
    analyzedStationCount: toSafeNumber(row.analyzed_station_count),
    stationCountWithElevatedRisk: toSafeNumber(row.station_count_with_elevated_risk),
    corroboratingHealthyStationCount: toSafeNumber(row.corroborating_healthy_station_count),
    dominantDrivers: parseDominantDrivers(row.dominant_drivers_json),
    crwSupported: Boolean(toSafeNumber(row.crw_supported)),
    operatorSummary: row.operator_summary,
  };
}

function buildSnapshotId(regionId: string, computedAt: string): string {
  return `RRS-${regionId}-${toEpochMs(computedAt)}`;
}

export function ensureRegionalRiskSnapshotsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS regional_risk_snapshots (
        id TEXT PRIMARY KEY,
        region_id TEXT NOT NULL,
        region_name TEXT NOT NULL,
        computed_at INTEGER NOT NULL,
        regional_risk_level TEXT NOT NULL,
        regional_confidence REAL NOT NULL,
        weighted_regional_score REAL NOT NULL,
        healthy_station_count INTEGER NOT NULL,
        analyzed_station_count INTEGER NOT NULL,
        station_count_with_elevated_risk INTEGER NOT NULL,
        corroborating_healthy_station_count INTEGER NOT NULL,
        dominant_drivers_json TEXT NOT NULL,
        crw_supported INTEGER NOT NULL,
        operator_summary TEXT NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_regional_risk_snapshots_region_computed_at ON regional_risk_snapshots (region_id, computed_at)",
    ),
  );
}

export function insertRegionalRiskSnapshot(
  db: SqliteDatabaseLike,
  snapshot: Omit<RegionalRiskSnapshotRecord, "id">,
): string {
  const id = buildSnapshotId(snapshot.regionId, snapshot.computedAt);

  runStatement(
    toStatement(
      db,
      `INSERT OR REPLACE INTO regional_risk_snapshots (
        id,
        region_id,
        region_name,
        computed_at,
        regional_risk_level,
        regional_confidence,
        weighted_regional_score,
        healthy_station_count,
        analyzed_station_count,
        station_count_with_elevated_risk,
        corroborating_healthy_station_count,
        dominant_drivers_json,
        crw_supported,
        operator_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    id,
    snapshot.regionId,
    snapshot.regionName,
    toEpochMs(snapshot.computedAt),
    snapshot.regionalRiskLevel,
    snapshot.regionalConfidence,
    snapshot.weightedRegionalScore,
    snapshot.healthyStationCount,
    snapshot.analyzedStationCount,
    snapshot.stationCountWithElevatedRisk,
    snapshot.corroboratingHealthyStationCount,
    JSON.stringify(snapshot.dominantDrivers),
    snapshot.crwSupported ? 1 : 0,
    snapshot.operatorSummary,
  );

  return id;
}

export function readRegionalRiskSnapshotsFromDb(
  db: SqliteDatabaseLike,
  regionId: string,
  sinceComputedAt: number,
  limit = 100,
): RegionalRiskSnapshotRecord[] {
  const rows = toStatement(
    db,
    `SELECT id,
            region_id,
            region_name,
            computed_at,
            regional_risk_level,
            regional_confidence,
            weighted_regional_score,
            healthy_station_count,
            analyzed_station_count,
            station_count_with_elevated_risk,
            corroborating_healthy_station_count,
            dominant_drivers_json,
            crw_supported,
            operator_summary
     FROM regional_risk_snapshots
     WHERE region_id = ?
       AND computed_at >= ?
     ORDER BY computed_at DESC
     LIMIT ?`,
  ).all(regionId, sinceComputedAt, limit) as RegionalRiskSnapshotRow[];

  return rows.map(toSnapshotRecord);
}

export function persistRegionalRiskSnapshot(
  snapshot: Omit<RegionalRiskSnapshotRecord, "id">,
  dependencies: RegionalRiskSnapshotsRepositoryDependencies = {},
): string | null {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const dbPath = resolvePath();

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return null;
  }

  try {
    ensureRegionalRiskSnapshotsTable(db);
    return insertRegionalRiskSnapshot(db, snapshot);
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export function listRecentRegionalRiskSnapshots(
  regionId: string,
  sinceComputedAt: number,
  limit = 100,
  dependencies: RegionalRiskSnapshotsRepositoryDependencies = {},
): RegionalRiskSnapshotsReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
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
    ensureRegionalRiskSnapshotsTable(db);
    return {
      source: "db",
      snapshots: readRegionalRiskSnapshotsFromDb(db, regionId, sinceComputedAt, limit),
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
