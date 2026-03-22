import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { RegionsFallbackReason } from "../types";
import type {
  OceanMapSpatialOverlays,
  SpeciesMovementType,
  SpeciesSightingVerificationStatus,
} from "@marine/shared";
import { buildOceanMapSpatialOverlays } from "./ocean-map-spatial-overlays";

interface CountRow {
  total: number;
}

interface AlertCountRow {
  region_id: string;
  total: number;
}

interface SpatialSightingRow {
  id: string;
  species_id: string;
  common_name: string;
  region: string;
  station_id: string | null;
  latitude: number | string;
  longitude: number | string;
  count: number | string;
  verification_status: string | null;
  observed_at: number | string;
  summary: string | null;
  created_at: number | string;
}

interface SpatialMovementSignalRow {
  id: string;
  species_id: string;
  common_name: string;
  region: string | null;
  station_id: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  signal_id: string | null;
  investigation_id: string | null;
  movement_type: string;
  confidence: number | string;
  summary: string | null;
  created_at: number | string;
}

export interface MapOverlayEntityRow {
  id: string;
  label: string;
  region: string;
  severity: "high" | "medium" | "low";
  status: string;
  detail: string | null;
  detectedAt: string | null;
}

interface RegionRow {
  id: string;
  name: string;
  status: string;
  summary: string;
  nearest_buoy_label: string | null;
  thermal_anomaly_label: string | null;
  current_direction_label: string | null;
}

export interface RegionSummary {
  id: string;
  name: string;
  status: string;
  summary: string;
  summaryMetrics: RegionSummaryMetricValues;
  openAlertCount: number | null;
  nearestBuoyLabel: string | null;
  thermalAnomalyLabel: string | null;
  currentDirectionLabel: string | null;
}

export interface RegionSummaryMetricValues {
  region: string | null;
  thermalAnomaly: string | null;
  currentDirection: string | null;
  nearestBuoy: string | null;
  riskStatus: string | null;
  openAlerts: number | null;
}

export interface RegionsMapStatCounts {
  activeFronts: number | null;
  driftRoutes: number | null;
  trackedBuoys: number | null;
}

export interface MapStatAggregates {
  trackedBuoys: number;
  activeFronts: number;
  driftRoutes: number;
}

export interface MapLayerRow {
  label: string;
  description: string;
  active: number; // 0 or 1
  accent: string;
}

export type RegionsReadResult =
  | {
      source: "db";
      regions: RegionSummary[];
      mapStats: MapStatAggregates | null;
      mapLayers: MapLayerRow[] | null;
      overlayEntities: MapOverlayEntityRow[] | null;
      spatialOverlays: OceanMapSpatialOverlays | null;
    }
  | { source: "mock"; fallbackReason: RegionsFallbackReason };

interface RegionsRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  now?: () => number;
}

const SPATIAL_OVERLAY_WINDOW_DAYS = 14;

const VALID_MOVEMENT_TYPES = new Set<SpeciesMovementType>([
  "route_deviation",
  "aggregation_shift",
  "habitat_exit",
  "unusual_presence",
  "seasonal_mismatch",
]);

const VALID_SIGHTING_STATUSES = new Set<SpeciesSightingVerificationStatus>([
  "pending",
  "verified",
  "rejected",
]);

function queryCount(db: SqliteDatabaseLike, sql: string): number {
  const row = db.prepare(sql).all()[0] as CountRow | undefined;
  return row?.total ?? 0;
}

function normalizeTimestamp(value: number | string, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeNumber(value: number | string | null, fallback: number | null = 0): number | null {
  if (value === null) {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function normalizeVerificationStatus(
  value: string | null,
): SpeciesSightingVerificationStatus {
  if (value && VALID_SIGHTING_STATUSES.has(value as SpeciesSightingVerificationStatus)) {
    return value as SpeciesSightingVerificationStatus;
  }

  return "pending";
}

function normalizeMovementType(value: string): SpeciesMovementType {
  if (VALID_MOVEMENT_TYPES.has(value as SpeciesMovementType)) {
    return value as SpeciesMovementType;
  }

  return "unusual_presence";
}

function queryOpenAlertCountsByRegion(
  db: SqliteDatabaseLike,
): Record<string, number> | null {
  try {
    const rows = db
      .prepare(
        `SELECT region_id, COUNT(*) AS total
         FROM alerts
         WHERE status = 'Open' AND region_id IS NOT NULL
         GROUP BY region_id`,
      )
      .all() as AlertCountRow[];
    return Object.fromEntries(rows.map((row) => [row.region_id, row.total]));
  } catch {
    return null;
  }
}

function buildRegionSummaryMetrics(
  row: RegionRow,
  alertCountsByRegion: Record<string, number> | null,
): RegionSummaryMetricValues {
  return {
    region: row.name,
    thermalAnomaly: row.thermal_anomaly_label,
    currentDirection: row.current_direction_label,
    nearestBuoy: row.nearest_buoy_label,
    riskStatus: row.status,
    openAlerts:
      alertCountsByRegion !== null ? (alertCountsByRegion[row.id] ?? 0) : null,
  };
}

function queryMapStats(db: SqliteDatabaseLike): MapStatAggregates | null {
  try {
    const trackedBuoys = queryCount(
      db,
      "SELECT COALESCE(SUM(COALESCE(buoy_count, 0)), 0) AS total FROM regions",
    );
    const activeFronts = queryCount(
      db,
      "SELECT COUNT(*) AS total FROM alerts WHERE status = 'Open'",
    );
    const driftRoutes = queryCount(db, "SELECT COUNT(*) AS total FROM investigations");
    return { trackedBuoys, activeFronts, driftRoutes };
  } catch {
    return null;
  }
}

function queryMapLayers(db: SqliteDatabaseLike): MapLayerRow[] | null {
  try {
    return db
      .prepare(
        `SELECT label, description, active, accent
         FROM map_layers
         ORDER BY sort_order ASC, label ASC`,
      )
      .all() as MapLayerRow[];
  } catch {
    return null;
  }
}

function queryOverlayEntities(db: SqliteDatabaseLike): MapOverlayEntityRow[] | null {
  try {
    return db
      .prepare(
        `SELECT alerts.id,
                alerts.title AS label,
                COALESCE(regions.name, 'Unassigned region') AS region,
                alerts.severity,
                alerts.status,
                alerts.detail,
                alerts.detected_at AS detectedAt
         FROM alerts
         LEFT JOIN regions ON regions.id = alerts.region_id
         WHERE alerts.region_id IS NOT NULL
         ORDER BY alerts.detected_at DESC, alerts.id ASC`,
      )
      .all() as MapOverlayEntityRow[];
  } catch {
    return null;
  }
}

function querySpatialOverlays(
  db: SqliteDatabaseLike,
  now: number,
): OceanMapSpatialOverlays | null {
  try {
    const windowStart = now - SPATIAL_OVERLAY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const sightingRows = db
      .prepare(
        `SELECT ss.id,
                ss.species_id,
                sp.common_name,
                ss.region,
                ss.station_id,
                ss.latitude,
                ss.longitude,
                ss.count,
                ss.verification_status,
                ss.observed_at,
                ss.summary,
                ss.created_at
         FROM species_sightings ss
         INNER JOIN species sp ON sp.id = ss.species_id
         WHERE ss.created_at >= ?
         ORDER BY ss.observed_at DESC, ss.created_at DESC, ss.id DESC
         LIMIT 150`,
      )
      .all(windowStart) as SpatialSightingRow[];

    const movementRows = db
      .prepare(
        `SELECT sms.id,
                sms.species_id,
                sp.common_name,
                COALESCE(sd.region, sp.habitat_region) AS region,
                sd.station_id,
                st.latitude,
                st.longitude,
                sms.signal_id,
                sms.investigation_id,
                sms.movement_type,
                sms.confidence,
                sms.summary,
                sms.created_at
         FROM species_movement_signals sms
         INNER JOIN species sp ON sp.id = sms.species_id
         LEFT JOIN signal_detections sd ON sd.id = sms.signal_id
         LEFT JOIN stations st ON st.id = sd.station_id
         WHERE sms.created_at >= ?
         ORDER BY sms.created_at DESC, sms.id DESC
         LIMIT 150`,
      )
      .all(windowStart) as SpatialMovementSignalRow[];

    return buildOceanMapSpatialOverlays({
      sightings: sightingRows.map((row) => ({
        id: row.id,
        speciesId: row.species_id,
        commonName: row.common_name,
        region: row.region,
        stationId: row.station_id,
        latitude: normalizeNumber(row.latitude, 0) ?? 0,
        longitude: normalizeNumber(row.longitude, 0) ?? 0,
        count: Math.max(0, Math.round(normalizeNumber(row.count, 0) ?? 0)),
        verificationStatus: normalizeVerificationStatus(row.verification_status),
        observedAt: new Date(normalizeTimestamp(row.observed_at, now)).toISOString(),
        detail: row.summary ?? "No detail available.",
      })),
      movementSignals: movementRows.map((row) => ({
        id: row.id,
        speciesId: row.species_id,
        commonName: row.common_name,
        region: row.region ?? "Unassigned region",
        stationId: row.station_id,
        latitude: normalizeNumber(row.latitude, null),
        longitude: normalizeNumber(row.longitude, null),
        locationSource:
          normalizeNumber(row.latitude, null) !== null && normalizeNumber(row.longitude, null) !== null
            ? "station"
            : "unavailable",
        signalId: row.signal_id,
        investigationId: row.investigation_id,
        movementType: normalizeMovementType(row.movement_type),
        confidence: Math.min(100, Math.max(0, Math.round(normalizeNumber(row.confidence, 0) ?? 0))),
        createdAt: new Date(normalizeTimestamp(row.created_at, now)).toISOString(),
        detail: row.summary ?? "No detail available.",
      })),
      generatedAt: new Date(now).toISOString(),
      windowDays: SPATIAL_OVERLAY_WINDOW_DAYS,
    });
  } catch {
    return null;
  }
}

function queryMapStatCounts(db: SqliteDatabaseLike): RegionsMapStatCounts {
  let activeFronts: number | null = null;
  let driftRoutes: number | null = null;
  let trackedBuoys: number | null = null;

  try {
    activeFronts = queryCount(db, "SELECT COUNT(*) AS total FROM alerts WHERE status = 'Open'");
  } catch {
    activeFronts = null;
  }

  try {
    driftRoutes = queryCount(db, "SELECT COUNT(*) AS total FROM investigations");
  } catch {
    driftRoutes = null;
  }

  try {
    trackedBuoys = queryCount(db, "SELECT COALESCE(SUM(COALESCE(buoy_count, 0)), 0) AS total FROM regions");
  } catch {
    trackedBuoys = null;
  }

  return {
    activeFronts,
    driftRoutes,
    trackedBuoys,
  };
}

export function listRegions(
  dependencies: RegionsRepositoryDependencies = {},
): RegionsReadResult {
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
    const rows = db
      .prepare(
        `SELECT id, name, status, summary, nearest_buoy_label, thermal_anomaly_label, current_direction_label
         FROM regions
         ORDER BY updated_at DESC, created_at DESC, id ASC`,
      )
      .all() as RegionRow[];

    const mapStats = queryMapStats(db);
    const alertCountsByRegion = queryOpenAlertCountsByRegion(db);
    const mapLayers = queryMapLayers(db);
    const overlayEntities = queryOverlayEntities(db);
    const spatialOverlays = querySpatialOverlays(db, now());

    return {
      source: "db",
      regions: rows.map((row) => {
        const summaryMetrics = buildRegionSummaryMetrics(row, alertCountsByRegion);

        return {
          id: row.id,
          name: row.name,
          status: row.status,
          summary: row.summary,
          summaryMetrics,
          openAlertCount: summaryMetrics.openAlerts,
          nearestBuoyLabel: row.nearest_buoy_label,
          thermalAnomalyLabel: row.thermal_anomaly_label,
          currentDirectionLabel: row.current_direction_label,
        };
      }),
      mapStats,
      mapLayers,
      overlayEntities,
      spatialOverlays,
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
