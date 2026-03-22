import type { DashboardActivityItem, DashboardSpeciesActivity, SpeciesMovementType } from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { DashboardFallbackReason } from "../types";
import { buildEcologicalCorrelationReasons } from "./ecological-correlation";

interface CountRow {
  total: number;
}

interface AlertActivityRow {
  id: string;
  title: string;
  detected_at: string | null;
}

interface ReportActivityRow {
  id: string;
  title: string;
  published_at: string | null;
}

interface TopMovementTypeRow {
  movement_type: string;
  signal_count: number;
}

interface TopSpeciesRow {
  species_id: string;
  common_name: string;
  sighting_count: number;
}

interface MovementStatsRow {
  total_count: number;
  max_confidence: number;
}

export interface DashboardCounts {
  openAlertCount: number;
  totalDatasets: number;
  totalInvestigations: number;
}

export type DashboardReadResult =
  | { source: "db"; counts: DashboardCounts; activity: DashboardActivityItem[]; speciesActivity?: DashboardSpeciesActivity | null }
  | { source: "mock"; fallbackReason: DashboardFallbackReason };

interface DashboardRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  now?: () => number;
}

const ACTIVITY_LIMIT = 6;

function formatRelativeTime(isoString: string | null, now: number): string {
  if (!isoString) {
    return "Unknown";
  }

  const ts = new Date(isoString);

  if (Number.isNaN(ts.getTime())) {
    return "Unknown";
  }

  const diffMs = Math.max(0, now - ts.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function queryCounts(db: SqliteDatabaseLike): DashboardCounts {
  const openAlertCount =
    (
      db
        .prepare("SELECT COUNT(*) AS total FROM alerts WHERE status = 'Open'")
        .all()[0] as CountRow | undefined
    )?.total ?? 0;

  const totalDatasets =
    (
      db
        .prepare("SELECT COUNT(*) AS total FROM datasets")
        .all()[0] as CountRow | undefined
    )?.total ?? 0;

  const totalInvestigations =
    (
      db
        .prepare("SELECT COUNT(*) AS total FROM investigations")
        .all()[0] as CountRow | undefined
    )?.total ?? 0;

  return { openAlertCount, totalDatasets, totalInvestigations };
}

function queryActivity(db: SqliteDatabaseLike, now: number): DashboardActivityItem[] {
  const alertRows = db
    .prepare(
      `SELECT id, title, detected_at
       FROM alerts
       WHERE detected_at IS NOT NULL
       ORDER BY detected_at DESC
       LIMIT ?`,
    )
    .all(ACTIVITY_LIMIT) as AlertActivityRow[];

  const reportRows = db
    .prepare(
      `SELECT id, title, published_at
       FROM reports
       WHERE published_at IS NOT NULL
       ORDER BY published_at DESC
       LIMIT ?`,
    )
    .all(ACTIVITY_LIMIT) as ReportActivityRow[];

  const merged: Array<{ item: DashboardActivityItem; ts: number }> = [
    ...alertRows.map((row) => ({
      item: {
        type: "alert" as const,
        text: row.title,
        time: formatRelativeTime(row.detected_at, now),
      },
      ts: row.detected_at ? new Date(row.detected_at).getTime() : 0,
    })),
    ...reportRows.map((row) => ({
      item: {
        type: "report" as const,
        text: row.title,
        time: formatRelativeTime(row.published_at, now),
      },
      ts: row.published_at ? new Date(row.published_at).getTime() : 0,
    })),
  ];

  merged.sort((a, b) => b.ts - a.ts);

  return merged.slice(0, ACTIVITY_LIMIT).map((m) => m.item);
}

const SPECIES_ACTIVITY_WINDOW_DAYS = 14;

const VALID_MOVEMENT_TYPES = new Set<SpeciesMovementType>([
  "route_deviation",
  "aggregation_shift",
  "habitat_exit",
  "unusual_presence",
  "seasonal_mismatch",
]);

function querySpeciesActivity(
  db: SqliteDatabaseLike,
  now: number,
): DashboardSpeciesActivity | null {
  try {
    const windowMs = SPECIES_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const windowStart = now - windowMs;

    const recentSightingCount =
      (db
        .prepare("SELECT COUNT(*) AS total FROM species_sightings WHERE created_at >= ?")
        .all(windowStart)[0] as CountRow | undefined)?.total ?? 0;

    const movementStats = db
      .prepare(
        "SELECT COUNT(*) AS total_count, MAX(confidence) AS max_confidence" +
          " FROM species_movement_signals WHERE created_at >= ?",
      )
      .all(windowStart)[0] as MovementStatsRow | undefined;

    const recentMovementSignalCount = movementStats?.total_count ?? 0;
    const maxMovementConfidence = movementStats?.max_confidence ?? 0;

    const topMovementTypeRows = db
      .prepare(
        "SELECT movement_type, COUNT(*) AS signal_count" +
          " FROM species_movement_signals WHERE created_at >= ?" +
          " GROUP BY movement_type ORDER BY signal_count DESC LIMIT 3",
      )
      .all(windowStart) as TopMovementTypeRow[];

    const topMovementTypes = topMovementTypeRows
      .map((r) => r.movement_type)
      .filter((t): t is SpeciesMovementType => VALID_MOVEMENT_TYPES.has(t as SpeciesMovementType));

    const topSpeciesRows = db
      .prepare(
        "SELECT ss.species_id, s.common_name, COUNT(*) AS sighting_count" +
          " FROM species_sightings ss JOIN species s ON ss.species_id = s.id" +
          " WHERE ss.created_at >= ?" +
          " GROUP BY ss.species_id, s.common_name" +
          " ORDER BY sighting_count DESC LIMIT 5",
      )
      .all(windowStart) as TopSpeciesRow[];

    const topActiveSpecies = topSpeciesRows.map((r) => ({
      speciesId: r.species_id,
      commonName: r.common_name,
      sightingCount: r.sighting_count,
    }));

    const ecologicalReasons = buildEcologicalCorrelationReasons({
      recentSightingCount,
      recentMovementSignalCount,
      topMovementTypes,
      maxMovementConfidence,
      windowDays: SPECIES_ACTIVITY_WINDOW_DAYS,
    });

    return {
      recentSightingCount,
      recentMovementSignalCount,
      topMovementTypes,
      topActiveSpecies,
      ecologicalReasons,
      windowDays: SPECIES_ACTIVITY_WINDOW_DAYS,
      generatedAt: new Date(now).toISOString(),
    };
  } catch {
    return null;
  }
}

export function getDashboardSummary(
  dependencies: DashboardRepositoryDependencies = {},
): DashboardReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const counts = queryCounts(db);
    const activity = queryActivity(db, now());
    const speciesActivity = querySpeciesActivity(db, now());
    return { source: "db", counts, activity, speciesActivity };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
