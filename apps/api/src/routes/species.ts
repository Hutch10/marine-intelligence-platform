import { apiMockData } from "../data";
import type {
  RouteDefinition,
  SpeciesDetailResponse,
  SpeciesDetailTelemetry,
  SpeciesListQuery,
  SpeciesListResponse,
  SpeciesListTelemetry,
  SpeciesMovementSignalsQuery,
  SpeciesMovementSignalsResponse,
  SpeciesMovementSignalsTelemetry,
  SpeciesSightingCreateRequest,
  SpeciesSightingCreateResponse,
  SpeciesSightingCreateTelemetry,
  SpeciesSightingsQuery,
  SpeciesSightingsResponse,
  SpeciesSightingsTelemetry,
} from "../types";
import type {
  OceanStationAdminAuthContext,
  SpeciesConservationStatus,
  SpeciesMovementSignalFilters,
  SpeciesMovementSignal,
  SpeciesMovementType,
  SpeciesSighting,
  SpeciesSightingVerificationStatus,
} from "@marine/shared";
import type {
  SpeciesByIdSightingsResult,
  SpeciesDetailResult,
  SpeciesListFilters,
  SpeciesListResult,
  SpeciesMovementSignalsResult,
  SpeciesSightingCreateResult,
} from "../repositories/species";

const VALID_CONSERVATION_STATUSES = new Set<SpeciesConservationStatus>([
  "least_concern",
  "near_threatened",
  "vulnerable",
  "endangered",
  "critically_endangered",
  "data_deficient",
]);

const VALID_SIGHTING_VERIFICATION_STATUSES = new Set<SpeciesSightingVerificationStatus>([
  "pending",
  "verified",
  "rejected",
]);

const VALID_MOVEMENT_TYPES = new Set<SpeciesMovementType>([
  "route_deviation",
  "aggregation_shift",
  "habitat_exit",
  "unusual_presence",
  "seasonal_mismatch",
]);

type SpeciesFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
type SpeciesListReadResult = SpeciesListResult | { source: "mock"; fallbackReason: SpeciesFallbackReason };
type SpeciesDetailReadResult = SpeciesDetailResult | { source: "mock"; fallbackReason: SpeciesFallbackReason };
type SpeciesSightingsReadResult = SpeciesByIdSightingsResult | { source: "mock"; fallbackReason: SpeciesFallbackReason };
type SpeciesSightingCreateReadResult = SpeciesSightingCreateResult | { source: "mock"; fallbackReason: SpeciesFallbackReason };
type SpeciesMovementSignalsReadResult = SpeciesMovementSignalsResult | { source: "mock"; fallbackReason: SpeciesFallbackReason };

function normalizeLimit(rawLimit: number | string | undefined): number {
  if (rawLimit === undefined) {
    return 50;
  }

  const parsed = typeof rawLimit === "string" ? Number(rawLimit) : rawLimit;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 200);
}

function normalizeSpeciesFilters(query: SpeciesListQuery | undefined): SpeciesListFilters {
  return {
    region: query?.region,
    conservationStatus: query?.conservationStatus,
    limit: query?.limit,
  };
}

function normalizeMovementSignalFilters(
  query: SpeciesMovementSignalsQuery | undefined,
): SpeciesMovementSignalFilters {
  if (!query) {
    return {};
  }

  return {
    movementType: query.movementType,
    minConfidence:
      query.minConfidence === undefined
        ? undefined
        : typeof query.minConfidence === "string"
          ? Number(query.minConfidence)
          : query.minConfidence,
    startDate: query.startDate,
    endDate: query.endDate,
    region: query.region,
    stationId: query.stationId,
    investigationId: query.investigationId,
    limit:
      query.limit === undefined
        ? undefined
        : typeof query.limit === "string"
          ? Number(query.limit)
          : query.limit,
  };
}

async function readSpecies(filters: SpeciesListFilters): Promise<SpeciesListReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/species") as {
      listSpecies: (filters: SpeciesListFilters) => Promise<SpeciesListResult>;
    };

    return await repository.listSpecies(filters);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readSpeciesById(speciesId: string): Promise<SpeciesDetailReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/species") as {
      getSpeciesById: (speciesId: string) => Promise<SpeciesDetailResult>;
    };

    return await repository.getSpeciesById(speciesId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readSpeciesSightingsBySpecies(
  speciesId: string,
  query: SpeciesSightingsQuery = {},
): Promise<SpeciesSightingsReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/species") as {
      getSpeciesSightingsBySpecies: (
        speciesId: string,
        dependencies: undefined,
        filters: SpeciesSightingsQuery,
      ) => Promise<SpeciesByIdSightingsResult>;
    };

    return await repository.getSpeciesSightingsBySpecies(speciesId, undefined, query);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function createSighting(
  input: SpeciesSightingCreateRequest,
  actorId: string | null,
): Promise<SpeciesSightingCreateReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/species") as {
      createSpeciesSighting: (
        input: SpeciesSightingCreateRequest,
        dependencies: undefined,
        actorId: string | null,
      ) => Promise<SpeciesSightingCreateResult>;
    };

    return await repository.createSpeciesSighting(input, undefined, actorId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readSpeciesMovementSignals(
  speciesId: string,
  query: SpeciesMovementSignalsQuery = {},
): Promise<SpeciesMovementSignalsReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/species") as {
      listSpeciesMovementSignals: (
        speciesId: string,
        dependencies: undefined,
        filters: SpeciesMovementSignalFilters,
      ) => Promise<SpeciesMovementSignalsResult>;
    };

    return await repository.listSpeciesMovementSignals(
      speciesId,
      undefined,
      normalizeMovementSignalFilters(query),
    );
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function listFiltersApplied(query: SpeciesListQuery | undefined): boolean {
  if (!query) {
    return false;
  }

  return Boolean(query.region || query.conservationStatus || query.limit);
}

function sightingsFiltersApplied(query: SpeciesSightingsQuery | undefined): boolean {
  if (!query) {
    return false;
  }

  return Boolean(query.speciesId || query.region || query.stationId || query.verificationStatus || query.limit);
}

function movementSignalsFiltersApplied(query: SpeciesMovementSignalsQuery | undefined): boolean {
  if (!query) {
    return false;
  }

  return Boolean(
    query.movementType
      || query.minConfidence !== undefined
      || query.startDate
      || query.endDate
      || query.region
      || query.stationId
      || query.investigationId
      || query.limit,
  );
}

function hasPermission(
  auth: OceanStationAdminAuthContext | undefined,
  permission: "station.edit_content" | "station.publish",
): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes(permission);
}

function hasValidCsrfToken(
  auth: OceanStationAdminAuthContext | undefined,
  submittedCsrfToken: string | undefined,
): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  const normalized = (submittedCsrfToken ?? "").trim();

  if (!normalized) {
    return false;
  }

  return normalized === auth.csrfToken;
}

/**
 * Can submit any sighting (pending|verified|rejected input).
 * Accepts species.submit_sighting (new) or station.edit_content (legacy compat).
 */
function canSubmitSighting(
  auth: OceanStationAdminAuthContext | undefined,
): auth is OceanStationAdminAuthContext {
  if (!auth) return false;
  return (
    auth.permissions.includes("species.submit_sighting")
    || auth.permissions.includes("station.edit_content")
  );
}

/**
 * Can set verificationStatus to verified or rejected.
 * Accepts species.verify_sighting (new) or station.publish (legacy compat).
 */
function canVerifySighting(
  auth: OceanStationAdminAuthContext | undefined,
): auth is OceanStationAdminAuthContext {
  if (!auth) return false;
  return (
    auth.permissions.includes("species.verify_sighting")
    || auth.permissions.includes("station.publish")
  );
}

function filterMockSpecies(query: SpeciesListQuery = {}) {
  const filtered = apiMockData.speciesFallbackData
    .filter((species) => {
      if (query.region && species.habitatRegion.toLowerCase() !== query.region.trim().toLowerCase()) {
        return false;
      }

      if (query.conservationStatus && species.conservationStatus !== query.conservationStatus) {
        return false;
      }

      return true;
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  return filtered.slice(0, normalizeLimit(query.limit));
}

function filterMockSightings(query: SpeciesSightingsQuery = {}): SpeciesSighting[] {
  const filtered = apiMockData.speciesSightingsFallbackData
    .filter((sighting) => {
      if (query.speciesId && sighting.speciesId !== query.speciesId) {
        return false;
      }

      if (query.region && sighting.region.toLowerCase() !== query.region.trim().toLowerCase()) {
        return false;
      }

      if (query.stationId && sighting.stationId !== query.stationId) {
        return false;
      }

      if (query.verificationStatus && sighting.verificationStatus !== query.verificationStatus) {
        return false;
      }

      return true;
    })
    .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime());

  return filtered.slice(0, normalizeLimit(query.limit));
}

function filterMockMovementSignals(
  speciesId: string,
  query: SpeciesMovementSignalsQuery = {},
): SpeciesMovementSignal[] {
  const minConfidence =
    query.minConfidence === undefined ? null : Number(query.minConfidence);

  return apiMockData.speciesMovementSignalsFallbackData
    .filter((signal) => {
      if (signal.speciesId !== speciesId) {
        return false;
      }

      if (query.movementType && signal.movementType !== query.movementType) {
        return false;
      }

      if (minConfidence !== null && Number.isFinite(minConfidence) && signal.confidence < minConfidence) {
        return false;
      }

      if (query.investigationId && signal.investigationId !== query.investigationId) {
        return false;
      }

      const createdAtMs = Date.parse(signal.createdAt);

      if (query.startDate) {
        const startDateMs = Date.parse(query.startDate);
        if (Number.isFinite(startDateMs) && createdAtMs < startDateMs) {
          return false;
        }
      }

      if (query.endDate) {
        const endDateMs = Date.parse(query.endDate);
        if (Number.isFinite(endDateMs) && createdAtMs > endDateMs) {
          return false;
        }
      }

      if (query.region || query.stationId) {
        const linkedSignal = apiMockData.signalDetectionsFallbackData.find((entry) => entry.id === signal.signalId);

        if (query.region && linkedSignal?.region.toLowerCase() !== query.region.trim().toLowerCase()) {
          return false;
        }

        if (query.stationId && linkedSignal?.stationId !== query.stationId) {
          return false;
        }
      }

      return true;
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function buildSpeciesListRouteResponse(
  query: SpeciesListQuery = {},
  readResult?: SpeciesListReadResult,
): Promise<{
  status: number;
  json: SpeciesListResponse | { message: string };
  telemetry: SpeciesListTelemetry;
}> {
  const finalReadResult = readResult ?? (await readSpecies(normalizeSpeciesFilters(query)));

  if (query.conservationStatus && !VALID_CONSERVATION_STATUSES.has(query.conservationStatus)) {
    return {
      status: 400,
      json: { message: "Invalid conservation status" },
      telemetry: {
        route: "GET /species",
        source: "db",
        speciesCount: 0,
        filtersApplied: listFiltersApplied(query),
      },
    };
  }

  if (finalReadResult.source === "db") {
    return {
      status: 200,
      json: { species: finalReadResult.species },
      telemetry: {
        route: "GET /species",
        source: "db",
        speciesCount: finalReadResult.species.length,
        filtersApplied: listFiltersApplied(query),
      },
    };
  }

  const fallbackSpecies = filterMockSpecies(query);

  return {
    status: 200,
    json: { species: fallbackSpecies },
    telemetry: {
      route: "GET /species",
      source: "mock",
      speciesCount: fallbackSpecies.length,
      filtersApplied: listFiltersApplied(query),
      fallbackReason: finalReadResult.fallbackReason,
    },
  };
}

export async function buildSpeciesDetailRouteResponse(
  speciesId: string,
  readResult?: SpeciesDetailReadResult,
): Promise<{
  status: number;
  json: SpeciesDetailResponse | { message: string };
  telemetry: SpeciesDetailTelemetry;
}> {
  const finalReadResult = readResult ?? (await readSpeciesById(speciesId));

  if (finalReadResult.source === "db" && finalReadResult.result === "found") {
    return {
      status: 200,
      json: { species: finalReadResult.species },
      telemetry: {
        route: "GET /species/:id",
        source: "db",
        speciesId,
        result: "found",
      },
    };
  }

  if (finalReadResult.source === "db") {
    return {
      status: 404,
      json: { message: "Species not found" },
      telemetry: {
        route: "GET /species/:id",
        source: "db",
        speciesId,
        result: "not_found",
      },
    };
  }

  const fallbackSpecies = apiMockData.speciesFallbackData.find((item) => item.id === speciesId);

  if (fallbackSpecies) {
    return {
      status: 200,
      json: { species: fallbackSpecies },
      telemetry: {
        route: "GET /species/:id",
        source: "mock",
        speciesId,
        result: "found",
        fallbackReason: finalReadResult.fallbackReason,
      },
    };
  }

  return {
    status: 404,
    json: { message: "Species not found" },
    telemetry: {
      route: "GET /species/:id",
      source: "mock",
      speciesId,
      result: "not_found",
      fallbackReason: finalReadResult.fallbackReason,
    },
  };
}

export async function buildSpeciesSightingsRouteResponse(
  speciesId: string,
  query: SpeciesSightingsQuery = {},
  readResult?: SpeciesSightingsReadResult,
): Promise<{
  status: number;
  json: SpeciesSightingsResponse | { message: string };
  telemetry: SpeciesSightingsTelemetry;
}> {
  if (query.speciesId && query.speciesId !== speciesId) {
    return {
      status: 400,
      json: { message: "Species ID mismatch between path and query" },
      telemetry: {
        route: "GET /species/:id/sightings",
        source: "db",
        speciesId,
        sightingCount: 0,
        filtersApplied: true,
        result: "not_found",
      },
    };
  }

  const finalReadResult = readResult ?? (await readSpeciesSightingsBySpecies(speciesId, query));

  if (finalReadResult.source === "db") {
    if (finalReadResult.result === "not_found") {
      return {
        status: 404,
        json: { message: "Species not found" },
        telemetry: {
          route: "GET /species/:id/sightings",
          source: "db",
          speciesId,
          sightingCount: 0,
          filtersApplied: sightingsFiltersApplied(query),
          result: "not_found",
        },
      };
    }

    return {
      status: 200,
      json: { sightings: finalReadResult.sightings },
      telemetry: {
        route: "GET /species/:id/sightings",
        source: "db",
        speciesId,
        sightingCount: finalReadResult.sightings.length,
        filtersApplied: sightingsFiltersApplied(query),
        result: "found",
      },
    };
  }

  const fallbackSightings = filterMockSightings({ ...query, speciesId });

  return {
    status: 200,
    json: { sightings: fallbackSightings },
    telemetry: {
      route: "GET /species/:id/sightings",
      source: "mock",
      speciesId,
      sightingCount: fallbackSightings.length,
      filtersApplied: sightingsFiltersApplied(query),
      result: "found",
      fallbackReason: finalReadResult.fallbackReason,
    },
  };
}

export async function buildSpeciesMovementSignalsRouteResponse(
  speciesId: string,
  query: SpeciesMovementSignalsQuery = {},
  readResult?: SpeciesMovementSignalsReadResult,
): Promise<{
  status: number;
  json: SpeciesMovementSignalsResponse | { message: string };
  telemetry: SpeciesMovementSignalsTelemetry;
}> {
  if (query.movementType && !VALID_MOVEMENT_TYPES.has(query.movementType)) {
    return {
      status: 400,
      json: { message: "Invalid movementType" },
      telemetry: {
        route: "GET /species/:id/movement-signals",
        source: "db",
        speciesId,
        signalCount: 0,
        filtersApplied: true,
        result: "not_found",
      },
    };
  }

  const finalReadResult = readResult ?? (await readSpeciesMovementSignals(speciesId, query));

  if (finalReadResult.source === "db") {
    if (finalReadResult.result === "not_found") {
      return {
        status: 404,
        json: { message: "Species not found" },
        telemetry: {
          route: "GET /species/:id/movement-signals",
          source: "db",
          speciesId,
          signalCount: 0,
          filtersApplied: movementSignalsFiltersApplied(query),
          result: "not_found",
        },
      };
    }

    return {
      status: 200,
      json: { movementSignals: finalReadResult.movementSignals },
      telemetry: {
        route: "GET /species/:id/movement-signals",
        source: "db",
        speciesId,
        signalCount: finalReadResult.movementSignals.length,
        filtersApplied: movementSignalsFiltersApplied(query),
        result: "found",
      },
    };
  }

  const fallbackSignals = filterMockMovementSignals(speciesId, query);
  const speciesExists = apiMockData.speciesFallbackData.some((item) => item.id === speciesId);

  if (!speciesExists) {
    return {
      status: 404,
      json: { message: "Species not found" },
      telemetry: {
        route: "GET /species/:id/movement-signals",
        source: "mock",
        speciesId,
        signalCount: 0,
        filtersApplied: movementSignalsFiltersApplied(query),
        result: "not_found",
        fallbackReason: finalReadResult.fallbackReason,
      },
    };
  }

  return {
    status: 200,
    json: { movementSignals: fallbackSignals },
    telemetry: {
      route: "GET /species/:id/movement-signals",
      source: "mock",
      speciesId,
      signalCount: fallbackSignals.length,
      filtersApplied: movementSignalsFiltersApplied(query),
      result: "found",
      fallbackReason: finalReadResult.fallbackReason,
    },
  };
}

export async function buildSpeciesSightingCreateRouteResponse(
  body: SpeciesSightingCreateRequest,
  auth: OceanStationAdminAuthContext | undefined,
  createResult?: SpeciesSightingCreateReadResult,
  submittedCsrfToken = body.csrfToken,
): Promise<{
  status: number;
  json: SpeciesSightingCreateResponse | { message: string };
  telemetry: SpeciesSightingCreateTelemetry;
}> {
  const speciesId = body.speciesId?.trim();
  const stationId = body.stationId?.trim();
  const region = body.region?.trim();
  const source = body.source?.trim();
  const summary = body.summary?.trim();
  const verificationStatus = body.verificationStatus ?? "pending";

  if (!auth) {
    return {
      status: 401,
      json: { message: "Authentication required" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "unauthenticated",
      },
    };
  }

  if (!hasValidCsrfToken(auth, submittedCsrfToken)) {
    return {
      status: 403,
      json: { message: "CSRF token invalid or missing" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "forbidden",
      },
    };
  }

  if (!canSubmitSighting(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: species.submit_sighting" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "forbidden",
      },
    };
  }

  if (!speciesId) {
    return {
      status: 400,
      json: { message: "speciesId is required" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "missing_species_id",
      },
    };
  }

  if (!region) {
    return {
      status: 400,
      json: { message: "region is required" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "missing_region",
      },
    };
  }

  if (!Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90) {
    return {
      status: 400,
      json: { message: "latitude must be a number between -90 and 90" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "invalid_latitude",
      },
    };
  }

  if (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180) {
    return {
      status: 400,
      json: { message: "longitude must be a number between -180 and 180" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "invalid_longitude",
      },
    };
  }

  if (!Number.isInteger(body.count) || body.count <= 0) {
    return {
      status: 400,
      json: { message: "count must be a positive integer" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "invalid_count",
      },
    };
  }

  if (!source) {
    return {
      status: 400,
      json: { message: "source is required" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "missing_source",
      },
    };
  }

  if (!summary) {
    return {
      status: 400,
      json: { message: "summary is required" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "missing_summary",
      },
    };
  }

  if (!VALID_SIGHTING_VERIFICATION_STATUSES.has(verificationStatus)) {
    return {
      status: 400,
      json: { message: "verificationStatus must be pending, verified, or rejected" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "invalid",
        validationError: "invalid_verification_status",
      },
    };
  }

  if (verificationStatus !== "pending" && !canVerifySighting(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: species.verify_sighting" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "forbidden",
      },
    };
  }

  if (body.observedAt !== undefined) {
    const parsedObservedAt = Date.parse(body.observedAt);

    if (!Number.isFinite(parsedObservedAt)) {
      return {
        status: 400,
        json: { message: "observedAt must be a valid ISO timestamp" },
        telemetry: {
          route: "POST /species/sightings",
          source: "db",
          result: "invalid",
          validationError: "invalid_observed_at",
        },
      };
    }
  }

  const finalResult = createResult ?? (await createSighting({
    speciesId,
    stationId: stationId || undefined,
    region,
    observedAt: body.observedAt,
    latitude: body.latitude,
    longitude: body.longitude,
    count: body.count,
    source,
    summary,
    verificationStatus,
  }, auth.actorId));

  if (finalResult.source === "mock") {
    return {
      status: 503,
      json: { message: "Species sightings unavailable" },
      telemetry: {
        route: "POST /species/sightings",
        source: "mock",
        result: "not_found",
        fallbackReason: finalResult.fallbackReason,
      },
    };
  }

  if (finalResult.result === "not_found") {
    return {
      status: 404,
      json: { message: "Species not found" },
      telemetry: {
        route: "POST /species/sightings",
        source: "db",
        result: "not_found",
      },
    };
  }

  return {
    status: 201,
    json: { sighting: finalResult.sighting },
    telemetry: {
      route: "POST /species/sightings",
      source: "db",
      result: "created",
      verificationStatus,
      actorId: auth.actorId,
    },
  };
}

export const getSpeciesRoute: RouteDefinition<SpeciesListResponse | { message: string }, undefined, SpeciesListQuery> = {
  method: "GET",
  path: "/species",
  async handler(request) {
    return await buildSpeciesListRouteResponse(request.query ?? {});
  },
};

export const getSpeciesByIdRoute: RouteDefinition<SpeciesDetailResponse | { message: string }, { id: string }> = {
  method: "GET",
  path: "/species/:id",
  async handler(request) {
    return await buildSpeciesDetailRouteResponse(request.body.id);
  },
};

export const getSpeciesSightingsRoute: RouteDefinition<SpeciesSightingsResponse | { message: string }, { id: string }, SpeciesSightingsQuery> = {
  method: "GET",
  path: "/species/:id/sightings",
  async handler(request) {
    return await buildSpeciesSightingsRouteResponse(request.body.id, request.query ?? {});
  },
};

// Backward-compatible alias used by existing web client imports.
export const getAllSpeciesSightingsRoute = getSpeciesSightingsRoute;

export const getSpeciesMovementSignalsRoute: RouteDefinition<
  SpeciesMovementSignalsResponse | { message: string },
  { id: string },
  SpeciesMovementSignalsQuery
> = {
  method: "GET",
  path: "/species/:id/movement-signals",
  async handler(request) {
    return await buildSpeciesMovementSignalsRouteResponse(request.body.id, request.query ?? {});
  },
};

export const getInvestigationSpeciesSummaryRoute: RouteDefinition<
  { summary: import("@marine/shared").InvestigationSpeciesSummary | null } | { message: string },
  { id: string }
> = {
  method: "GET",
  path: "/investigations/:id/species-summary",
  async handler(request) {
    try {
      const runtimeRequire = eval("require") as NodeRequire;
      const repository = runtimeRequire("../repositories/species") as {
        getInvestigationSpeciesSummary: (investigationId: string) =>
          Promise<
          | { source: "db"; result: "found"; summary: import("@marine/shared").InvestigationSpeciesSummary }
          | { source: "db"; result: "not_found" }
          | { source: "mock"; fallbackReason: string }
          >;
      };

      const result = await repository.getInvestigationSpeciesSummary(request.body.id);

      if (result.source === "db" && result.result === "found") {
        return { status: 200, json: { summary: result.summary } };
      }

      if (result.source === "db") {
        return { status: 404, json: { message: "Investigation not found" } };
      }

      return {
        status: 200,
        json: {
          summary: apiMockData.investigationsWorkspaceData.speciesSummary,
        },
      };
    } catch {
      return {
        status: 200,
        json: {
          summary: apiMockData.investigationsWorkspaceData.speciesSummary,
        },
      };
    }
  },
};

export const postSpeciesSightingRoute: RouteDefinition<SpeciesSightingCreateResponse | { message: string }, SpeciesSightingCreateRequest> = {
  method: "POST",
  path: "/species/sightings",
  async handler(request) {
    return await buildSpeciesSightingCreateRouteResponse(request.body, request.auth);
  },
};
