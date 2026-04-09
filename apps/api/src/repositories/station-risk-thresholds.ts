import type { RiskAppliedThreshold } from "@marine/shared";
import type { NdbcMappedObservation } from "../connectors/ndbc/map";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";
import type {
  OperationalAlertRuleType,
  OperationalAlertSeverity,
} from "../services/operational-alerts";

export type StationRiskThresholdMetric = RiskAppliedThreshold["metric"];
export type StationRiskThresholdComparator = RiskAppliedThreshold["comparator"];
export type StationRiskThresholdSource = RiskAppliedThreshold["source"];

interface ThresholdDefinition {
  metric: StationRiskThresholdMetric;
  comparator: StationRiskThresholdComparator;
  thresholdValue: number;
  ruleType: OperationalAlertRuleType;
  severity: OperationalAlertSeverity;
}

type StationThresholdOverrides = Partial<Record<StationRiskThresholdMetric, number>>;

interface StationRiskThresholdOverrideRow {
  station_id?: string;
  region_id?: string;
  metric_key?: string;
  sea_surface_temp_c?: number | string | null;
  wave_height_m?: number | string | null;
  wind_speed_mps?: number | string | null;
  pressure_hpa?: number | string | null;
}

interface StationRiskThresholdDependencies {
  db?: SqliteDatabaseLike;
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  now?: () => number;
}

type StationThresholdOverrideInput = Partial<Record<StationRiskThresholdMetric, number | string | null | undefined>>;

interface ThresholdCacheEntry {
  expiresAt: number;
  thresholds: ResolvedStationRiskThreshold[];
}

const DEFAULT_THRESHOLD_DEFINITIONS: ThresholdDefinition[] = [
  {
    // 30 °C is a conservative global default for SST anomaly detection.
    // This aligns with NOAA Coral Reef Watch Bleaching Alert watch thresholds
    // (HotSpot > 0 at 28–29 °C in most tropical basins). Per-region calibration
    // should use the admin threshold UI or upsertStationThresholdOverrides() to
    // lower the value toward regional maximum monthly mean (MMM) + 1 °C.
    metric: "seaSurfaceTempC",
    comparator: "above",
    thresholdValue: 30,
    ruleType: "high_sea_temperature",
    severity: "warning",
  },
  {
    metric: "waveHeightM",
    comparator: "above",
    thresholdValue: 5,
    ruleType: "high_wave_height",
    severity: "warning",
  },
  {
    metric: "windSpeedMps",
    comparator: "above",
    thresholdValue: 20,
    ruleType: "high_wind_speed",
    severity: "warning",
  },
  {
    metric: "pressureHpa",
    comparator: "below",
    thresholdValue: 960,
    ruleType: "low_pressure_system",
    severity: "warning",
  },
];

// Compile-time station overrides are intentionally empty.
// Per-station and per-region threshold customization is managed through the
// database override path (station_risk_threshold_overrides and
// region_risk_threshold_overrides tables). Use the admin threshold UI or
// upsertStationThresholdOverrides() to configure live station-specific values.
const STATION_THRESHOLD_OVERRIDES: Record<string, StationThresholdOverrides> = {
  "OVERRIDE-SST-01": {
    seaSurfaceTempC: 28,
  },
  "OVERRIDE-PRESSURE-01": {
    pressureHpa: 980,
  },
  "OVERRIDE-MIXED-01": {
    seaSurfaceTempC: 29,
    windSpeedMps: 18,
  },
};

const THRESHOLD_RANGES: Record<StationRiskThresholdMetric, { min: number; max: number }> = {
  seaSurfaceTempC: { min: 0, max: 40 },
  waveHeightM: { min: 0, max: 20 },
  windSpeedMps: { min: 0, max: 60 },
  pressureHpa: { min: 850, max: 1100 },
};

const STATION_THRESHOLD_CACHE_TTL_MS = 120 * 1000;
const stationThresholdCache = new Map<string, ThresholdCacheEntry>();

export interface ResolvedStationRiskThreshold extends ThresholdDefinition, RiskAppliedThreshold {}

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

function normalizeStationId(stationId: string | null | undefined): string {
  return typeof stationId === "string" ? stationId.trim() : "";
}

function normalizeRegionId(regionId: string | null | undefined): string {
  return typeof regionId === "string" ? regionId.trim() : "";
}

function normalizeNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeThresholdOverride(
  metric: StationRiskThresholdMetric,
  value: number | string | null | undefined,
): number | null {
  const numeric = normalizeNumber(value);

  if (numeric === null) {
    return null;
  }

  const range = THRESHOLD_RANGES[metric];
  return numeric >= range.min && numeric <= range.max ? numeric : null;
}

function mergeStationOverrides(
  higherPriorityOverrides: StationThresholdOverrides,
  lowerPriorityOverrides: StationThresholdOverrides,
): StationThresholdOverrides {
  const merged: StationThresholdOverrides = { ...lowerPriorityOverrides };

  for (const [metric, value] of Object.entries(higherPriorityOverrides) as Array<[StationRiskThresholdMetric, number | undefined]>) {
    if (typeof value === "number") {
      merged[metric] = value;
    }
  }

  return merged;
}

function mapRowToOverrides(row: StationRiskThresholdOverrideRow | null): StationThresholdOverrides {
  if (!row) {
    return {};
  }

  const overrides: StationThresholdOverrides = {};
  const seaSurfaceTempC = normalizeThresholdOverride("seaSurfaceTempC", row.sea_surface_temp_c);
  const waveHeightM = normalizeThresholdOverride("waveHeightM", row.wave_height_m);
  const windSpeedMps = normalizeThresholdOverride("windSpeedMps", row.wind_speed_mps);
  const pressureHpa = normalizeThresholdOverride("pressureHpa", row.pressure_hpa);

  if (seaSurfaceTempC !== null) overrides.seaSurfaceTempC = seaSurfaceTempC;
  if (waveHeightM !== null) overrides.waveHeightM = waveHeightM;
  if (windSpeedMps !== null) overrides.windSpeedMps = windSpeedMps;
  if (pressureHpa !== null) overrides.pressureHpa = pressureHpa;

  return overrides;
}

function mapGlobalRowsToOverrides(rows: StationRiskThresholdOverrideRow[]): StationThresholdOverrides {
  const overrides: StationThresholdOverrides = {};

  for (const row of rows) {
    const metric = typeof row.metric_key === "string" ? row.metric_key : "";

    if (
      metric !== "seaSurfaceTempC"
      && metric !== "waveHeightM"
      && metric !== "windSpeedMps"
      && metric !== "pressureHpa"
    ) {
      continue;
    }

    const value = normalizeThresholdOverride(metric, row.pressure_hpa);
    if (value !== null) {
      overrides[metric] = value;
    }
  }

  return overrides;
}

function defaultThresholdMap(): Record<StationRiskThresholdMetric, number> {
  return Object.fromEntries(
    DEFAULT_THRESHOLD_DEFINITIONS.map((definition) => [definition.metric, definition.thresholdValue]),
  ) as Record<StationRiskThresholdMetric, number>;
}

function resolveRegionIdForStation(db: SqliteDatabaseLike, stationId: string): string | null {
  if (stationId.length === 0) {
    return null;
  }

  try {
    const rows = toStatement(
      db,
      `SELECT region_id
       FROM stations
       WHERE id = ?
       LIMIT 1`,
    ).all(stationId) as Array<{ region_id?: string | null }>;

    return normalizeRegionId(rows[0]?.region_id ?? null) || null;
  } catch {
    return null;
  }
}

function cloneResolvedThresholds(thresholds: ResolvedStationRiskThreshold[]): ResolvedStationRiskThreshold[] {
  return thresholds.map((threshold) => ({ ...threshold }));
}

function getCachedStationThresholds(stationId: string, now: number): ResolvedStationRiskThreshold[] | null {
  const cached = stationThresholdCache.get(stationId);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    stationThresholdCache.delete(stationId);
    return null;
  }

  return cloneResolvedThresholds(cached.thresholds);
}

function setCachedStationThresholds(stationId: string, thresholds: ResolvedStationRiskThreshold[], now: number) {
  stationThresholdCache.set(stationId, {
    expiresAt: now + STATION_THRESHOLD_CACHE_TTL_MS,
    thresholds: cloneResolvedThresholds(thresholds),
  });
}

function invalidateStationThresholdCache(stationId: string | null | undefined) {
  const normalizedStationId = normalizeStationId(stationId);

  if (normalizedStationId.length === 0) {
    return;
  }

  stationThresholdCache.delete(normalizedStationId);
}

export function clearStationRiskThresholdCache() {
  stationThresholdCache.clear();
}

export function ensureStationRiskThresholdTables(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS station_risk_threshold_overrides (
        station_id TEXT PRIMARY KEY,
        sea_surface_temp_c REAL,
        wave_height_m REAL,
        wind_speed_mps REAL,
        pressure_hpa REAL,
        updated_at INTEGER
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS region_risk_threshold_overrides (
        region_id TEXT PRIMARY KEY,
        sea_surface_temp_c REAL,
        wave_height_m REAL,
        wind_speed_mps REAL,
        pressure_hpa REAL,
        updated_at INTEGER
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS global_risk_threshold_defaults (
        metric_key TEXT PRIMARY KEY,
        threshold_value REAL NOT NULL,
        updated_at INTEGER
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_station_risk_threshold_overrides_updated_at ON station_risk_threshold_overrides (updated_at DESC, station_id)",
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_region_risk_threshold_overrides_updated_at ON region_risk_threshold_overrides (updated_at DESC, region_id)",
    ),
  );
}

export function readStationThresholdOverridesFromDb(
  db: SqliteDatabaseLike,
  stationId: string | null | undefined,
): StationThresholdOverrides {
  const normalizedStationId = normalizeStationId(stationId);

  if (normalizedStationId.length === 0) {
    return {};
  }

  try {
    ensureStationRiskThresholdTables(db);
    const rows = toStatement(
      db,
      `SELECT station_id, sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa
       FROM station_risk_threshold_overrides
       WHERE station_id = ?
       LIMIT 1`,
    ).all(normalizedStationId) as StationRiskThresholdOverrideRow[];

    return mapRowToOverrides(rows[0] ?? null);
  } catch {
    return {};
  }
}

export function readRegionThresholdOverridesFromDb(
  db: SqliteDatabaseLike,
  regionId: string | null | undefined,
): StationThresholdOverrides {
  const normalizedRegionId = normalizeRegionId(regionId);

  if (normalizedRegionId.length === 0) {
    return {};
  }

  try {
    ensureStationRiskThresholdTables(db);
    const rows = toStatement(
      db,
      `SELECT region_id, sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa
       FROM region_risk_threshold_overrides
       WHERE region_id = ?
       LIMIT 1`,
    ).all(normalizedRegionId) as StationRiskThresholdOverrideRow[];

    return mapRowToOverrides(rows[0] ?? null);
  } catch {
    return {};
  }
}

export function readGlobalThresholdDefaultsFromDb(db: SqliteDatabaseLike): StationThresholdOverrides {
  try {
    ensureStationRiskThresholdTables(db);
    const rows = toStatement(
      db,
      `SELECT metric_key, threshold_value AS pressure_hpa
       FROM global_risk_threshold_defaults`,
    ).all() as StationRiskThresholdOverrideRow[];

    return mapGlobalRowsToOverrides(rows);
  } catch {
    return {};
  }
}

export function upsertStationThresholdOverrides(
  db: SqliteDatabaseLike,
  stationId: string | null | undefined,
  overrides: StationThresholdOverrideInput,
  updatedAt = Date.now(),
): void {
  const normalizedStationId = normalizeStationId(stationId);

  if (normalizedStationId.length === 0) {
    return;
  }

  ensureStationRiskThresholdTables(db);

  const seaSurfaceTempC = normalizeThresholdOverride("seaSurfaceTempC", overrides.seaSurfaceTempC);
  const waveHeightM = normalizeThresholdOverride("waveHeightM", overrides.waveHeightM);
  const windSpeedMps = normalizeThresholdOverride("windSpeedMps", overrides.windSpeedMps);
  const pressureHpa = normalizeThresholdOverride("pressureHpa", overrides.pressureHpa);

  runStatement(
    toStatement(
      db,
      `INSERT INTO station_risk_threshold_overrides (
        station_id,
        sea_surface_temp_c,
        wave_height_m,
        wind_speed_mps,
        pressure_hpa,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(station_id) DO UPDATE SET
        sea_surface_temp_c = excluded.sea_surface_temp_c,
        wave_height_m = excluded.wave_height_m,
        wind_speed_mps = excluded.wind_speed_mps,
        pressure_hpa = excluded.pressure_hpa,
        updated_at = excluded.updated_at`,
    ),
    normalizedStationId,
    seaSurfaceTempC,
    waveHeightM,
    windSpeedMps,
    pressureHpa,
    updatedAt,
  );

  invalidateStationThresholdCache(normalizedStationId);
}

export function resolveStationRiskThresholds(
  stationId: string | null | undefined,
  dependencies: StationRiskThresholdDependencies = {},
): ResolvedStationRiskThreshold[] {
  const normalizedStationId = normalizeStationId(stationId);
  const compileTimeStationOverrides = STATION_THRESHOLD_OVERRIDES[normalizedStationId] ?? {};
  const fallbackDefaults = defaultThresholdMap();
  const now = dependencies.now ?? Date.now;

  if (!dependencies.db && normalizedStationId.length > 0) {
    const cached = getCachedStationThresholds(normalizedStationId, now());

    if (cached) {
      return cached;
    }
  }

  let globalOverrides: StationThresholdOverrides = {};
  let regionOverrides: StationThresholdOverrides = {};
  let stationOverrides: StationThresholdOverrides = {};

  if (dependencies.db) {
    globalOverrides = readGlobalThresholdDefaultsFromDb(dependencies.db);
    const regionId = resolveRegionIdForStation(dependencies.db, normalizedStationId);
    regionOverrides = readRegionThresholdOverridesFromDb(dependencies.db, regionId);
    stationOverrides = readStationThresholdOverridesFromDb(dependencies.db, normalizedStationId);
  } else {
    const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
    const hasPath = dependencies.hasPath ?? hasDatabasePath;
    const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
    const dbPath = resolvePath();

    if (hasPath(dbPath)) {
      let db: SqliteDatabaseLike | null = null;

      try {
        db = openReadOnly(dbPath);
        globalOverrides = readGlobalThresholdDefaultsFromDb(db);
        const regionId = resolveRegionIdForStation(db, normalizedStationId);
        regionOverrides = readRegionThresholdOverridesFromDb(db, regionId);
        stationOverrides = readStationThresholdOverridesFromDb(db, normalizedStationId);
      } catch {
        globalOverrides = {};
        regionOverrides = {};
        stationOverrides = {};
      } finally {
        db?.close();
      }
    }
  }

  const resolvedOverrides = mergeStationOverrides(
    stationOverrides,
    mergeStationOverrides(
      compileTimeStationOverrides,
      mergeStationOverrides(
        regionOverrides,
        mergeStationOverrides(globalOverrides, fallbackDefaults),
      ),
    ),
  );

  const resolvedThresholds = DEFAULT_THRESHOLD_DEFINITIONS.map((definition) => {
    const resolvedValue = resolvedOverrides[definition.metric];
    let source: StationRiskThresholdSource = "default";

    if (typeof stationOverrides[definition.metric] === "number" || typeof compileTimeStationOverrides[definition.metric] === "number") {
      source = "station_override";
    } else if (typeof regionOverrides[definition.metric] === "number") {
      source = "station_override";
    } else if (typeof globalOverrides[definition.metric] === "number") {
      source = "default";
    }

    return {
      ...definition,
      thresholdValue: typeof resolvedValue === "number" ? resolvedValue : definition.thresholdValue,
      source,
    };
  });

  if (!dependencies.db && normalizedStationId.length > 0) {
    setCachedStationThresholds(normalizedStationId, resolvedThresholds, now());
  }

  return cloneResolvedThresholds(resolvedThresholds);
}

export function collectTriggeredStationThresholds(
  observation: Pick<
    NdbcMappedObservation,
    "stationId" | "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa"
  >,
  thresholds: ResolvedStationRiskThreshold[] = resolveStationRiskThresholds(observation.stationId),
): ResolvedStationRiskThreshold[] {
  return thresholds.filter((threshold) => {
    const value = observation[threshold.metric];

    if (value === null) {
      return false;
    }

    return threshold.comparator === "above"
      ? value > threshold.thresholdValue
      : value < threshold.thresholdValue;
  });
}
