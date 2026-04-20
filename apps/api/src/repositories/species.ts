import type {
  CreateSpeciesSightingInput,
  InvestigationSpeciesSummary,
  SpeciesConservationStatus,
  SpeciesMovementSignalFilters,
  SpeciesMovementSignal,
  SpeciesMovementType,
  SpeciesProfile,
  SpeciesSighting,
  SpeciesSightingVerificationStatus,
} from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";
import type { SpeciesFallbackReason } from "../types";
import { createInvestigationSpeciesSummaryEntry } from "./species-correlation";

interface SpeciesRow {
  id: string;
  common_name: string;
  scientific_name: string;
  conservation_status: string;
  habitat_region: string;
  summary: string;
  source: string;
  source_url: string | null;
  method: string;
  observed_at: number | string;
  ingested_at: number | string;
  updated_at: number | string;
  confidence_score: number | string;
  coverage_score: number | string;
  verification_state: string;
}

interface SpeciesSightingRow {
  id: string;
  species_id: string;
  station_id: string | null;
  region: string;
  observed_at: number | string;
  latitude: number | string;
  longitude: number | string;
  count: number | string;
  source: string;
  source_url: string | null;
  method: string;
  summary: string;
  verification_status: string;
  verified_at: number | string | null;
  verified_by: string | null;
  ingested_at: number | string;
  updated_at: number | string;
  confidence_score: number | string;
  coverage_score: number | string;
  verification_state: string;
  created_at: number | string;
}

interface SpeciesMovementSignalRow {
  id: string;
  species_id: string;
  signal_id: string | null;
  investigation_id: string | null;
  movement_type: string;
  confidence: number | string;
  summary: string;
  created_at: number | string;
}

interface SpeciesSummaryMovementRow {
  species_id: string;
  common_name: string;
  scientific_name: string;
  movement_signal_count: number | string;
  max_movement_confidence: number | string;
}

interface SpeciesSummaryMovementTypeRow {
  species_id: string;
  movement_type: string;
}

interface SpeciesSummarySightingRow {
  species_id: string;
  verified_sighting_count: number | string;
  pending_verification_count: number | string;
  matched_station_count: number | string;
  last_observed_at: number | string | null;
}

interface InvestigationLookupRow {
  id: string;
}

const VALID_CONSERVATION_STATUSES = new Set<SpeciesConservationStatus>([
  "least_concern",
  "near_threatened",
  "vulnerable",
  "endangered",
  "critically_endangered",
  "data_deficient",
]);

const VALID_MOVEMENT_TYPES = new Set<SpeciesMovementType>([
  "route_deviation",
  "aggregation_shift",
  "habitat_exit",
  "unusual_presence",
  "seasonal_mismatch",
]);

const VALID_SIGHTING_VERIFICATION_STATUSES = new Set<SpeciesSightingVerificationStatus>([
  "pending",
  "verified",
  "rejected",
]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_MOVEMENT_LIMIT = 100;

export interface SpeciesListFilters {
  region?: string;
  conservationStatus?: SpeciesConservationStatus;
  limit?: number | string;
}

export interface SpeciesSightingListFilters {
  speciesId?: string;
  region?: string;
  stationId?: string;
  verificationStatus?: SpeciesSightingVerificationStatus;
  limit?: number | string;
}

export type SpeciesListResult = { source: "db"; species: SpeciesProfile[] };

export type SpeciesDetailResult =
  | { source: "db"; result: "found"; species: SpeciesProfile }
  | { source: "db"; result: "not_found" };

export type SpeciesSightingsResult = { source: "db"; sightings: SpeciesSighting[] };

export type SpeciesByIdSightingsResult =
  | { source: "db"; result: "found"; sightings: SpeciesSighting[] }
  | { source: "db"; result: "not_found" };

export type SpeciesSightingCreateResult =
  | { source: "db"; result: "created"; sighting: SpeciesSighting }
  | { source: "db"; result: "not_found" };

export type SpeciesMovementSignalsResult =
  | { source: "db"; result: "found"; movementSignals: SpeciesMovementSignal[] }
  | { source: "db"; result: "not_found" };

export type InvestigationSpeciesSummaryResult =
  | { source: "db"; result: "found"; summary: InvestigationSpeciesSummary }
  | { source: "db"; result: "not_found" };

interface SpeciesRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

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


function normalizeTimestamp(value: number | string, now: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return now;
}

function normalizeInteger(value: number | string, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(parsed);
}

function normalizeFloat(value: number | string, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function normalizeConservationStatus(value: string): SpeciesConservationStatus {
  if (VALID_CONSERVATION_STATUSES.has(value as SpeciesConservationStatus)) {
    return value as SpeciesConservationStatus;
  }

  return "data_deficient";
}

function normalizeMovementType(value: string): SpeciesMovementType {
  if (VALID_MOVEMENT_TYPES.has(value as SpeciesMovementType)) {
    return value as SpeciesMovementType;
  }

  return "unusual_presence";
}

function normalizeVerificationStatus(value: string | null): SpeciesSightingVerificationStatus {
  if (value && VALID_SIGHTING_VERIFICATION_STATUSES.has(value as SpeciesSightingVerificationStatus)) {
    return value as SpeciesSightingVerificationStatus;
  }

  return "pending";
}
function toSpecies(row: SpeciesRow, now: number): SpeciesProfile {
  return {
    id: row.id,
    commonName: row.common_name,
    scientificName: row.scientific_name,
    conservationStatus: normalizeConservationStatus(row.conservation_status),
    habitatRegion: row.habitat_region,
    summary: row.summary,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    method: row.method,
    observedAt: new Date(normalizeTimestamp(row.observed_at, now)).toISOString(),
    ingestedAt: new Date(normalizeTimestamp(row.ingested_at, now)).toISOString(),
    updatedAt: new Date(normalizeTimestamp(row.updated_at, now)).toISOString(),
    confidenceScore: normalizeFloat(row.confidence_score),
    coverageScore: normalizeFloat(row.coverage_score),
    verificationState: (row.verification_state as any) || "unknown",
  };
}
function toSpeciesSighting(row: SpeciesSightingRow, now: number): SpeciesSighting {
  return {
    id: row.id,
    speciesId: row.species_id,
    stationId: row.station_id ?? null,
    region: row.region,
    observedAt: new Date(normalizeTimestamp(row.observed_at, now)).toISOString(),
    latitude: normalizeFloat(row.latitude),
    longitude: normalizeFloat(row.longitude),
    count: normalizeInteger(row.count),
    summary: row.summary,
    verificationStatus: normalizeVerificationStatus(row.verification_status),
    verifiedAt: row.verified_at
      ? new Date(normalizeTimestamp(row.verified_at, now)).toISOString()
      : null,
    verifiedBy: row.verified_by ?? null,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    method: row.method,
    observedAt: new Date(normalizeTimestamp(row.observed_at, now)).toISOString(),
    ingestedAt: new Date(normalizeTimestamp(row.ingested_at, now)).toISOString(),
    updatedAt: new Date(normalizeTimestamp(row.updated_at, now)).toISOString(),
    confidenceScore: normalizeFloat(row.confidence_score),
    coverageScore: normalizeFloat(row.coverage_score),
    verificationState: (row.verification_state as any) || "unknown",
  };
}

function toSpeciesMovementSignal(
  row: SpeciesMovementSignalRow,
  now: number,
): SpeciesMovementSignal {
  return {
    id: row.id,
    speciesId: row.species_id,
    signalId: row.signal_id,
    investigationId: row.investigation_id,
    movementType: normalizeMovementType(row.movement_type),
    confidence: Math.min(100, Math.max(0, normalizeInteger(row.confidence))),
    summary: row.summary,
    createdAt: new Date(normalizeTimestamp(row.created_at, now)).toISOString(),
  };
}

function normalizeLimit(rawLimit: number | string | undefined, fallback = DEFAULT_LIMIT): number {
  if (rawLimit === undefined) {
    return fallback;
  }

  const parsed = typeof rawLimit === "string" ? Number(rawLimit) : rawLimit;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeMinConfidence(rawValue: number | string | undefined): number | null {
  if (rawValue === undefined) {
    return null;
  }

  const parsed = typeof rawValue === "string" ? Number(rawValue) : rawValue;

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clampNumber(Math.floor(parsed), 0, 100);
}

function normalizeDateFilter(rawValue: string | undefined): number | null {
  if (!rawValue?.trim()) {
    return null;
  }

  const parsed = Date.parse(rawValue);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function speciesExists(db: SqliteDatabaseLike, speciesId: string): boolean {
  const rows = toStatement(
    db,
    "SELECT id FROM species WHERE id = ? LIMIT 1",
  ).all(speciesId) as Array<{ id: string }>;

  return rows.length > 0;
}

function findSightingById(db: SqliteDatabaseLike, sightingId: string): SpeciesSightingRow | null {
  const row = toStatement(
    db,
    `SELECT id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at
     FROM species_sightings
     WHERE id = ?
     LIMIT 1`,
  ).all(sightingId)[0] as SpeciesSightingRow | undefined;

  return row ?? null;
}

function createSightingId(now: number): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomUUID } = runtimeRequire("node:crypto") as { randomUUID: () => string };
  return `SIGHT-${now}-${randomUUID()}`;
}

export function listSpecies(
  filters: SpeciesListFilters = {},
  dependencies: SpeciesRepositoryDependencies = {},
): SpeciesListResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    throw new Error(`[species] Critical Failure: Database missing at ${databasePath}`);
  }

  const db = openReadOnly(databasePath);

  try {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (filters.region?.trim()) {
      whereClauses.push("LOWER(habitat_region) = ?");
      params.push(filters.region.trim().toLowerCase());
    }

    if (filters.conservationStatus) {
      whereClauses.push("conservation_status = ?");
      params.push(filters.conservationStatus);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const rows = toStatement(
      db,
      `SELECT id, common_name, scientific_name, conservation_status, habitat_region, summary, created_at, updated_at
       FROM species
       ${whereSql}
       ORDER BY updated_at DESC, id ASC
       LIMIT ?`,
    ).all(...params, normalizeLimit(filters.limit)) as SpeciesRow[];

    return {
      source: "db",
      species: rows.map((row) => toSpecies(row, now())),
    };
  } catch (e) {
    console.error("[species] species list query failed:", e);
    throw e;
  } finally {
    db.close();
  }
}

export function getSpeciesById(
  speciesId: string,
  dependencies: SpeciesRepositoryDependencies = {},
): SpeciesDetailResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    throw new Error(`[species] Critical Failure: Database missing at ${databasePath}`);
  }

  const db = openReadOnly(databasePath);

  try {
    const row = toStatement(
      db,
      `SELECT id, common_name, scientific_name, conservation_status, habitat_region, summary, created_at, updated_at
       FROM species
       WHERE id = ?
       LIMIT 1`,
    ).all(speciesId)[0] as SpeciesRow | undefined;

    if (!row) {
      return { source: "db", result: "not_found" };
    }

    return {
      source: "db",
      result: "found",
      species: toSpecies(row, now()),
    };
  } catch (e) {
    console.error("[species] get species failed:", e);
    throw e;
  } finally {
    db.close();
  }
}

export function listSpeciesSightings(
  filters: SpeciesSightingListFilters = {},
  dependencies: SpeciesRepositoryDependencies = {},
): SpeciesSightingsResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    throw new Error(`[species] Critical Failure: Database missing at ${databasePath}`);
  }

  const db = openReadOnly(databasePath);

  try {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (filters.speciesId?.trim()) {
      whereClauses.push("species_id = ?");
      params.push(filters.speciesId.trim());
    }

    if (filters.region?.trim()) {
      whereClauses.push("LOWER(region) = ?");
      params.push(filters.region.trim().toLowerCase());
    }

    if (filters.stationId?.trim()) {
      whereClauses.push("station_id = ?");
      params.push(filters.stationId.trim());
    }

    if (filters.verificationStatus) {
      whereClauses.push("verification_status = ?");
      params.push(filters.verificationStatus);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const rows = toStatement(
      db,
      `SELECT id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at
       FROM species_sightings
       ${whereSql}
       ORDER BY observed_at DESC, created_at DESC, id DESC
       LIMIT ?`,
    ).all(...params, normalizeLimit(filters.limit)) as SpeciesSightingRow[];

    return {
      source: "db",
      sightings: rows.map((row) => toSpeciesSighting(row, now())),
    };
  } catch (e) {
    console.error("[species] list sightings failed:", e);
    throw e;
  } finally {
    db.close();
  }
}

export function getSpeciesSightingsBySpecies(
  speciesId: string,
  dependencies: SpeciesRepositoryDependencies = {},
  filters: Omit<SpeciesSightingListFilters, "speciesId"> = {},
): SpeciesByIdSightingsResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    throw new Error(`[species] Critical Failure: Database missing at ${databasePath}`);
  }

  const db = openReadOnly(databasePath);

  try {
    if (!speciesExists(db, speciesId)) {
      return { source: "db", result: "not_found" };
    }

    const whereClauses = ["species_id = ?"];
    const params: unknown[] = [speciesId];

    if (filters.region?.trim()) {
      whereClauses.push("LOWER(region) = ?");
      params.push(filters.region.trim().toLowerCase());
    }

    if (filters.stationId?.trim()) {
      whereClauses.push("station_id = ?");
      params.push(filters.stationId.trim());
    }

    if (filters.verificationStatus) {
      whereClauses.push("verification_status = ?");
      params.push(filters.verificationStatus);
    }

    const rows = toStatement(
      db,
      `SELECT id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at
       FROM species_sightings
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY observed_at DESC, created_at DESC, id DESC
       LIMIT ?`,
    ).all(...params, normalizeLimit(filters.limit)) as SpeciesSightingRow[];

    return {
      source: "db",
      result: "found",
      sightings: rows.map((row) => toSpeciesSighting(row, now())),
    };
  } catch (e) {
    console.error("[species] list sightings by species failed:", e);
    throw e;
  } finally {
    db.close();
  }
}

export function createSpeciesSighting(
  input: CreateSpeciesSightingInput,
  dependencies: SpeciesRepositoryDependencies = {},
  actorId: string | null = null,
): SpeciesSightingCreateResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    throw new Error(`[species] Critical Failure: Database missing at ${databasePath}`);
  }

  const db = openWritable(databasePath);

  try {
    if (!speciesExists(db, input.speciesId)) {
      return { source: "db", result: "not_found" };
    }

    const createdAt = now();
    const observedAt = input.observedAt ? Date.parse(input.observedAt) : createdAt;
    const normalizedObservedAt = Number.isFinite(observedAt) ? observedAt : createdAt;
    const id = createSightingId(createdAt);
    const verificationStatus = normalizeVerificationStatus(input.verificationStatus ?? null);
    const isResolved = verificationStatus === "verified" || verificationStatus === "rejected";
    const verifiedAt = isResolved ? createdAt : null;
    const verifiedBy = isResolved ? actorId : null;

    runStatement(
      toStatement(
        db,
        `INSERT INTO species_sightings
          (id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      id,
      input.speciesId,
      input.stationId?.trim() ? input.stationId.trim() : null,
      input.region,
      normalizedObservedAt,
      input.latitude,
      input.longitude,
      input.count,
      input.source,
      input.summary,
      verificationStatus,
      verifiedAt,
      verifiedBy,
      createdAt,
    );

    const row = findSightingById(db, id);

    if (!row) {
      throw new Error(`[species] Sighting created but could not be retrieved (ID: ${id})`);
    }

    return {
      source: "db",
      result: "created",
      sighting: toSpeciesSighting(row, now()),
    };
  } catch (e) {
    console.error("[species] create sighting failed:", e);
    throw e;
  } finally {
    db.close();
  }
}

export function listSpeciesMovementSignals(
  speciesId: string,
  dependencies: SpeciesRepositoryDependencies = {},
  filters: SpeciesMovementSignalFilters = {},
): SpeciesMovementSignalsResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    throw new Error(`[species] Critical Failure: Database missing at ${databasePath}`);
  }

  const db = openReadOnly(databasePath);

  try {
    if (!speciesExists(db, speciesId)) {
      return { source: "db", result: "not_found" };
    }

    const whereClauses = ["sms.species_id = ?"];
    const params: unknown[] = [speciesId];

    if (filters.movementType) {
      whereClauses.push("sms.movement_type = ?");
      params.push(filters.movementType);
    }

    const minConfidence = normalizeMinConfidence(filters.minConfidence);
    if (minConfidence !== null) {
      whereClauses.push("sms.confidence >= ?");
      params.push(minConfidence);
    }

    const startDate = normalizeDateFilter(filters.startDate);
    if (startDate !== null) {
      whereClauses.push("sms.created_at >= ?");
      params.push(startDate);
    }

    const endDate = normalizeDateFilter(filters.endDate);
    if (endDate !== null) {
      whereClauses.push("sms.created_at <= ?");
      params.push(endDate);
    }

    if (filters.investigationId?.trim()) {
      whereClauses.push("sms.investigation_id = ?");
      params.push(filters.investigationId.trim());
    }

    if (filters.stationId?.trim()) {
      whereClauses.push("sd.station_id = ?");
      params.push(filters.stationId.trim());
    }

    if (filters.region?.trim()) {
      whereClauses.push("LOWER(sd.region) = ?");
      params.push(filters.region.trim().toLowerCase());
    }

    const rows = toStatement(
      db,
      `SELECT sms.id, sms.species_id, sms.signal_id, sms.investigation_id, sms.movement_type, sms.confidence, sms.summary, sms.created_at
       FROM species_movement_signals sms
       LEFT JOIN signal_detections sd ON sd.id = sms.signal_id
       WHERE ${whereClauses.join(" AND ")} AND (sd.truth_partition IS NULL OR sd.truth_partition = 'FIELD_TRUTH')
       ORDER BY sms.created_at DESC, sms.id DESC
       LIMIT ?`,

    ).all(...params, normalizeLimit(filters.limit, DEFAULT_MOVEMENT_LIMIT)) as SpeciesMovementSignalRow[];

    return {
      source: "db",
      result: "found",
      movementSignals: rows.map((row) => toSpeciesMovementSignal(row, now())),
    };
  } catch (e) {
    console.error("[species] list movement signals failed:", e);
    throw e;
  } finally {
    db.close();
  }
}

export function getInvestigationSpeciesSummary(
  investigationId: string,
  dependencies: SpeciesRepositoryDependencies = {},
): InvestigationSpeciesSummaryResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    throw new Error(`[species] Critical Failure: Database missing at ${databasePath}`);
  }

  const db = openReadOnly(databasePath);

  try {
    const investigationRow = toStatement(
      db,
      "SELECT id FROM investigations WHERE id = ? LIMIT 1",
    ).all(investigationId)[0] as InvestigationLookupRow | undefined;

    if (!investigationRow) {
      return { source: "db", result: "not_found" };
    }

    const movementRows = toStatement(
      db,
      `SELECT sp.id AS species_id,
              sp.common_name,
              sp.scientific_name,
              COUNT(sms.id) AS movement_signal_count,
              MAX(sms.confidence) AS max_movement_confidence
       FROM species_movement_signals sms
       INNER JOIN species sp ON sp.id = sms.species_id
       WHERE sms.investigation_id = ?
       GROUP BY sp.id, sp.common_name, sp.scientific_name
       ORDER BY max_movement_confidence DESC, movement_signal_count DESC, sp.common_name ASC`,
    ).all(investigationId) as SpeciesSummaryMovementRow[];

    if (movementRows.length === 0) {
      return {
        source: "db",
        result: "found",
        summary: {
          investigationId,
          generatedAt: new Date(now()).toISOString(),
          speciesCount: 0,
          linkedMovementSignalCount: 0,
          verifiedSightingCount: 0,
          pendingVerificationCount: 0,
          entries: [],
          explainabilityNote:
            "No investigation-linked species movement signals are available yet. Summary remains deterministic when ecological links appear.",
        },
      };
    }

    const movementTypeRows = toStatement(
      db,
      `SELECT species_id, movement_type
       FROM species_movement_signals
       WHERE investigation_id = ?
       ORDER BY created_at DESC, id DESC`,
    ).all(investigationId) as SpeciesSummaryMovementTypeRow[];

    const linkedStationIds = toStatement(
      db,
      `SELECT DISTINCT station_id
       FROM signal_detections
       WHERE linked_investigation_id = ? AND station_id IS NOT NULL
       AND (truth_partition IS NULL OR truth_partition = 'FIELD_TRUTH')`,
    ).all(investigationId) as Array<{ station_id?: unknown }>;


    const stationIds = linkedStationIds
      .map((row) => (typeof row.station_id === "string" ? row.station_id : null))
      .filter((value): value is string => value !== null);

    const speciesIds = movementRows.map((row) => row.species_id);
    const placeholders = speciesIds.map(() => "?").join(", ");
    const sightingParams: unknown[] = [];
    let matchedStationSql = "0";

    if (stationIds.length > 0) {
      matchedStationSql = `COUNT(DISTINCT CASE WHEN station_id IN (${stationIds.map(() => "?").join(", ")}) THEN station_id END)`;
      sightingParams.push(...stationIds);
    }

    sightingParams.push(...speciesIds);

    const sightingRows = toStatement(
      db,
      `SELECT species_id,
              SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) AS verified_sighting_count,
              SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END) AS pending_verification_count,
              ${matchedStationSql} AS matched_station_count,
              MAX(observed_at) AS last_observed_at
       FROM species_sightings
       WHERE species_id IN (${placeholders})
       GROUP BY species_id`,
    ).all(...sightingParams) as SpeciesSummarySightingRow[];

    const movementTypesBySpecies = new Map<string, SpeciesMovementType[]>();
    for (const row of movementTypeRows) {
      const next = movementTypesBySpecies.get(row.species_id) ?? [];
      next.push(normalizeMovementType(row.movement_type));
      movementTypesBySpecies.set(row.species_id, next);
    }

    const sightingsBySpecies = new Map<string, SpeciesSummarySightingRow>();
    for (const row of sightingRows) {
      sightingsBySpecies.set(row.species_id, row);
    }

    const entries = movementRows
      .map((row) => {
        const sighting = sightingsBySpecies.get(row.species_id);
        const lastObservedAt = sighting?.last_observed_at == null
          ? null
          : new Date(normalizeTimestamp(sighting.last_observed_at, now())).toISOString();

        return createInvestigationSpeciesSummaryEntry({
          speciesId: row.species_id,
          commonName: row.common_name,
          scientificName: row.scientific_name,
          movementSignalCount: Math.max(0, normalizeInteger(row.movement_signal_count)),
          verifiedSightingCount: Math.max(0, normalizeInteger(sighting?.verified_sighting_count ?? 0)),
          pendingVerificationCount: Math.max(0, normalizeInteger(sighting?.pending_verification_count ?? 0)),
          matchedStationCount: Math.max(0, normalizeInteger(sighting?.matched_station_count ?? 0)),
          lastObservedAt,
          maxMovementConfidence: clampNumber(normalizeInteger(row.max_movement_confidence), 0, 100),
          movementTypes: movementTypesBySpecies.get(row.species_id) ?? [],
        });
      })
      .sort((left, right) => right.relevanceScore - left.relevanceScore || left.commonName.localeCompare(right.commonName));

    return {
      source: "db",
      result: "found",
      summary: {
        investigationId,
        generatedAt: new Date(now()).toISOString(),
        speciesCount: entries.length,
        linkedMovementSignalCount: entries.reduce((total, entry) => total + entry.movementSignalCount, 0),
        verifiedSightingCount: entries.reduce((total, entry) => total + entry.verifiedSightingCount, 0),
        pendingVerificationCount: entries.reduce((total, entry) => total + entry.pendingVerificationCount, 0),
        entries,
        explainabilityNote:
          "Correlation scores are deterministic and derived from linked movement signals, verification-aware sightings, and station overlap already present in the investigation context.",
      },
    };
  } catch (e) {
    console.error("[species] investigation summary query failed:", e);
    throw e;
  } finally {
    db.close();
  }
}

export type SpeciesRepository = {
  list: typeof listSpecies;
  get: typeof getSpeciesById;
  createSighting: typeof createSpeciesSighting;
};
