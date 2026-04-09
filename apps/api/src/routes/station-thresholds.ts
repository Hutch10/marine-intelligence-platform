import type {
  OceanStationAdminAuthContext,
  OceanStationAdminPermission,
  RouteDefinition,
} from "../types";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import {
  ensureStationRiskThresholdTables,
  resolveStationRiskThresholds,
  upsertStationThresholdOverrides,
  type ResolvedStationRiskThreshold,
} from "../repositories/station-risk-thresholds";

// ─── Response Types ───────────────────────────────────────────────────────────

export interface StationThresholdsResponse {
  stationId: string;
  thresholds: ResolvedStationRiskThreshold[];
}

// ─── Request Types ────────────────────────────────────────────────────────────

export interface StationThresholdsPutBody {
  id: string;
  seaSurfaceTempC?: number | null;
  waveHeightM?: number | null;
  windSpeedMps?: number | null;
  pressureHpa?: number | null;
  csrfToken?: string;
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

interface ThresholdReadDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
}

interface ThresholdWriteDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

// ─── Auth Guards ──────────────────────────────────────────────────────────────

function hasViewAdminPermission(
  auth: OceanStationAdminAuthContext | undefined,
): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes("station.view_admin" as OceanStationAdminPermission);
}

// ─── Read Path ────────────────────────────────────────────────────────────────

type GetThresholdsResult =
  | { result: "ok"; stationId: string; thresholds: ResolvedStationRiskThreshold[] }
  | { result: "forbidden" }
  | { result: "invalid_station_id" };

function readThresholdsFromDb(
  stationId: string,
  dependencies: ThresholdReadDependencies = {},
): ResolvedStationRiskThreshold[] {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return resolveStationRiskThresholds(stationId, {});
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openReadOnly(dbPath);
    return resolveStationRiskThresholds(stationId, { db });
  } catch {
    return resolveStationRiskThresholds(stationId, {});
  } finally {
    db?.close();
  }
}

export function buildGetStationThresholdsRouteResponse(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
  readResult: GetThresholdsResult = buildGetThresholdsResult(stationId, auth),
): { status: number; json: StationThresholdsResponse | { message: string } } {
  if (readResult.result === "forbidden") {
    return { status: 403, json: { message: "Forbidden" } };
  }

  if (readResult.result === "invalid_station_id") {
    return { status: 400, json: { message: "Invalid station ID" } };
  }

  return {
    status: 200,
    json: {
      stationId: readResult.stationId,
      thresholds: readResult.thresholds,
    },
  };
}

function buildGetThresholdsResult(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
  dependencies: ThresholdReadDependencies = {},
): GetThresholdsResult {
  if (!hasViewAdminPermission(auth)) {
    return { result: "forbidden" };
  }

  const normalized = stationId.trim();

  if (normalized.length === 0) {
    return { result: "invalid_station_id" };
  }

  const thresholds = readThresholdsFromDb(normalized, dependencies);
  return { result: "ok", stationId: normalized, thresholds };
}

// ─── Write Path ───────────────────────────────────────────────────────────────

type PutThresholdsResult =
  | { result: "ok"; stationId: string; thresholds: ResolvedStationRiskThreshold[] }
  | { result: "forbidden" }
  | { result: "invalid_station_id" }
  | { result: "db_unavailable" };

export function buildPutStationThresholdsRouteResponse(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
  body: Omit<StationThresholdsPutBody, "id" | "csrfToken">,
  writeResult: PutThresholdsResult = buildPutThresholdsResult(stationId, auth, body),
): { status: number; json: StationThresholdsResponse | { message: string } } {
  if (writeResult.result === "forbidden") {
    return { status: 403, json: { message: "Forbidden" } };
  }

  if (writeResult.result === "invalid_station_id") {
    return { status: 400, json: { message: "Invalid station ID" } };
  }

  if (writeResult.result === "db_unavailable") {
    return { status: 503, json: { message: "Database unavailable" } };
  }

  return {
    status: 200,
    json: {
      stationId: writeResult.stationId,
      thresholds: writeResult.thresholds,
    },
  };
}

function buildPutThresholdsResult(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
  body: Omit<StationThresholdsPutBody, "id" | "csrfToken">,
  dependencies: ThresholdWriteDependencies = {},
): PutThresholdsResult {
  if (!hasViewAdminPermission(auth)) {
    return { result: "forbidden" };
  }

  const normalized = stationId.trim();

  if (normalized.length === 0) {
    return { result: "invalid_station_id" };
  }

  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { result: "db_unavailable" };
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openWritable(dbPath);
    ensureStationRiskThresholdTables(db);
    upsertStationThresholdOverrides(db, normalized, body, now());
    const thresholds = resolveStationRiskThresholds(normalized, { db });
    return { result: "ok", stationId: normalized, thresholds };
  } catch {
    return { result: "db_unavailable" };
  } finally {
    db?.close();
  }
}

// ─── Route Definitions ────────────────────────────────────────────────────────

export const getStationThresholdsRoute: RouteDefinition<
  StationThresholdsResponse | { message: string },
  { id: string }
> = {
  method: "GET",
  path: "/stations/:id/thresholds",
  handler(request) {
    return buildGetStationThresholdsRouteResponse(request.body.id, request.auth);
  },
};

export const putStationThresholdsRoute: RouteDefinition<
  StationThresholdsResponse | { message: string },
  StationThresholdsPutBody
> = {
  method: "PUT",
  path: "/stations/:id/thresholds",
  handler(request) {
    const { id, csrfToken: _csrf, ...overrides } = request.body;
    return buildPutStationThresholdsRouteResponse(id, request.auth, overrides);
  },
};
