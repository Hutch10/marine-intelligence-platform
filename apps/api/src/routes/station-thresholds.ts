import type {
  OceanStationAdminAuthContext,
  OceanStationAdminPermission,
  RouteDefinition,
} from "../types";
import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import {
  getAsyncAdapter,
  type AsyncDbAdapter,
} from "../db/async-client";
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
  getAdapter?: (readOnly: boolean) => AsyncDbAdapter;
}

interface ThresholdWriteDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  getAdapter?: (readOnly: boolean) => AsyncDbAdapter;
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

async function readThresholdsFromDb(
  stationId: string,
  dependencies: ThresholdReadDependencies = {},
): Promise<ResolvedStationRiskThreshold[]> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return await resolveStationRiskThresholds(stationId, {});
  }

  const adapter = getAdapter(true);

  try {
    return await resolveStationRiskThresholds(stationId, { adapter });
  } catch {
    return await resolveStationRiskThresholds(stationId, {});
  } finally {
    adapter.close();
  }
}

export async function buildGetStationThresholdsRouteResponse(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
): Promise<{ status: number; json: StationThresholdsResponse | { message: string } }> {
  const readResult = await buildGetThresholdsResult(stationId, auth);

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

async function buildGetThresholdsResult(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
  dependencies: ThresholdReadDependencies = {},
): Promise<GetThresholdsResult> {
  if (!hasViewAdminPermission(auth)) {
    return { result: "forbidden" };
  }

  const normalized = stationId.trim();

  if (normalized.length === 0) {
    return { result: "invalid_station_id" };
  }

  const thresholds = await readThresholdsFromDb(normalized, dependencies);
  return { result: "ok", stationId: normalized, thresholds };
}

// ─── Write Path ───────────────────────────────────────────────────────────────

type PutThresholdsResult =
  | { result: "ok"; stationId: string; thresholds: ResolvedStationRiskThreshold[] }
  | { result: "forbidden" }
  | { result: "invalid_station_id" }
  | { result: "db_unavailable" };

export async function buildPutStationThresholdsRouteResponse(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
  body: Omit<StationThresholdsPutBody, "id" | "csrfToken">,
): Promise<{ status: number; json: StationThresholdsResponse | { message: string } }> {
  const writeResult = await buildPutThresholdsResult(stationId, auth, body);

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

async function buildPutThresholdsResult(
  stationId: string,
  auth: OceanStationAdminAuthContext | undefined,
  body: Omit<StationThresholdsPutBody, "id" | "csrfToken">,
  dependencies: ThresholdWriteDependencies = {},
): Promise<PutThresholdsResult> {
  if (!hasViewAdminPermission(auth)) {
    return { result: "forbidden" };
  }

  const normalized = stationId.trim();

  if (normalized.length === 0) {
    return { result: "invalid_station_id" };
  }

  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { result: "db_unavailable" };
  }

  const adapter = getAdapter(false);

  try {
    await ensureStationRiskThresholdTables(adapter);
    await upsertStationThresholdOverrides(adapter, normalized, body, now());
    const thresholds = await resolveStationRiskThresholds(normalized, { adapter });
    return { result: "ok", stationId: normalized, thresholds };
  } catch {
    return { result: "db_unavailable" };
  } finally {
    adapter.close();
  }
}

// ─── Route Definitions ────────────────────────────────────────────────────────

export const getStationThresholdsRoute: RouteDefinition<
  StationThresholdsResponse | { message: string },
  { id: string }
> = {
  method: "GET",
  path: "/stations/:id/thresholds",
  async handler(request) {
    return await buildGetStationThresholdsRouteResponse(request.body.id, request.auth);
  },
};

export const putStationThresholdsRoute: RouteDefinition<
  StationThresholdsResponse | { message: string },
  StationThresholdsPutBody
> = {
  method: "PUT",
  path: "/stations/:id/thresholds",
  async handler(request) {
    const { id, csrfToken: _csrf, ...overrides } = request.body;
    return await buildPutStationThresholdsRouteResponse(id, request.auth, overrides);
  },
};
