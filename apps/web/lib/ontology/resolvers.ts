/**
 * Read-only resolvers.
 *
 * Two concerns:
 *  1. Mappers — convert existing domain types to OntologyObjects.
 *  2. Link resolvers — given a source object's primary key and a collection of
 *     target objects, return the matching targets.
 *
 * All functions are pure: no DB access, no side effects, deterministic output.
 */

import type {
  SpeciesOntologyObject,
  StationOntologyObject,
  MarineAlertOntologyObject,
  MarineAlertSeverity,
  MarineAlertStatus,
  InvestigationOntologyObject,
  ObservationOntologyObject,
} from "./types";
import type {
  SpeciesProfile,
  OceanStationSummary,
  OceanStationAlert,
  InvestigationAnalysisTrack,
  LiveMarineCondition,
  OperationalAlertItem,
} from "../api/types";

// ─── RID helper ───────────────────────────────────────────────────────────────

/** Build a globally unique resource identifier: "<TypeId>/<primaryKey>" */
export function buildRid(typeId: string, primaryKey: string): string {
  return `${typeId}/${primaryKey}`;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapSpecies(species: SpeciesProfile): SpeciesOntologyObject {
  return {
    __type: "Species",
    __rid: buildRid("Species", species.id),
    __primaryKey: species.id,
    commonName: species.commonName,
    scientificName: species.scientificName,
    conservationStatus: species.conservationStatus,
    habitatRegion: species.habitatRegion,
    summary: species.summary,
    createdAt: species.createdAt,
    updatedAt: species.updatedAt,
  };
}

export function mapStation(station: OceanStationSummary): StationOntologyObject {
  return {
    __type: "Station",
    __rid: buildRid("Station", station.id),
    __primaryKey: station.id,
    slug: station.slug,
    name: station.name,
    region: station.region,
    status: station.status,
    summary: station.summary,
    locationLabel: station.locationLabel,
    depthM: station.depthM,
  };
}

function normalizeAlertSeverity(raw: string): MarineAlertSeverity {
  const valid = new Set<string>(["critical", "high", "medium", "low", "warning", "info"]);
  return valid.has(raw) ? (raw as MarineAlertSeverity) : "low";
}

function normalizeAlertStatus(raw: string): MarineAlertStatus {
  const valid = new Set<string>(["open", "active", "acknowledged", "resolved", "dismissed"]);
  return valid.has(raw) ? (raw as MarineAlertStatus) : "open";
}

/** Map an OceanStationAlert (station-scoped) to a MarineAlertOntologyObject. */
export function mapStationAlert(
  alert: OceanStationAlert,
  stationId: string,
): MarineAlertOntologyObject {
  return {
    __type: "MarineAlert",
    __rid: buildRid("MarineAlert", alert.id),
    __primaryKey: alert.id,
    title: alert.title,
    severity: normalizeAlertSeverity(alert.severity),
    status: normalizeAlertStatus(alert.status),
    detail: alert.detail,
    stationId,
    linkedInvestigationId: null,
    detectedAt: alert.detectedAt,
    acknowledgedAt: alert.acknowledgedAt,
    acknowledgedBy: alert.acknowledgedBy,
  };
}

/** Map an OperationalAlertItem (system-level) to a MarineAlertOntologyObject. */
export function mapOperationalAlert(alert: OperationalAlertItem): MarineAlertOntologyObject {
  return {
    __type: "MarineAlert",
    __rid: buildRid("MarineAlert", alert.id),
    __primaryKey: alert.id,
    title: alert.title,
    severity: normalizeAlertSeverity(alert.severity),
    status: normalizeAlertStatus(alert.status),
    detail: alert.detail,
    stationId: null,
    linkedInvestigationId: null,
    detectedAt: String(alert.detectedAt),
    acknowledgedAt: null,
    acknowledgedBy: null,
  };
}

export function mapInvestigation(track: InvestigationAnalysisTrack): InvestigationOntologyObject {
  return {
    __type: "Investigation",
    __rid: buildRid("Investigation", track.id),
    __primaryKey: track.id,
    title: track.title,
    summary: track.summary,
    confidence: track.confidence,
    state: track.state,
  };
}

/**
 * Map a LiveMarineCondition to an ObservationOntologyObject.
 * Primary key is "<stationId>__<timestamp>" since observations have no
 * standalone ID in the source schema.
 */
export function mapObservation(condition: LiveMarineCondition): ObservationOntologyObject {
  const primaryKey = `${condition.stationId}__${condition.timestamp}`;
  return {
    __type: "Observation",
    __rid: buildRid("Observation", primaryKey),
    __primaryKey: primaryKey,
    stationId: condition.stationId,
    timestamp: condition.timestamp,
    sstC: condition.sstC,
    waveHeightM: condition.waveHeightM,
    windSpeedMps: condition.windSpeedMps,
    pressureHpa: condition.pressureHpa,
  };
}

// ─── Link resolvers ───────────────────────────────────────────────────────────

/**
 * Station → MarineAlert
 * Returns all alerts whose stationId matches the given station primary key.
 */
export function resolveStationAlerts(
  stationId: string,
  alerts: MarineAlertOntologyObject[],
): MarineAlertOntologyObject[] {
  return alerts.filter((a) => a.stationId === stationId);
}

/**
 * Station → Observation
 * Returns all observations whose stationId matches the given station primary key.
 */
export function resolveStationObservations(
  stationId: string,
  observations: ObservationOntologyObject[],
): ObservationOntologyObject[] {
  return observations.filter((o) => o.stationId === stationId);
}

/**
 * Species → Observation
 * Returns observations from stations where the species was sighted.
 * The caller supplies the set of stationIds derived from species sightings.
 */
export function resolveSpeciesObservations(
  sightingStationIds: string[],
  observations: ObservationOntologyObject[],
): ObservationOntologyObject[] {
  if (sightingStationIds.length === 0) return [];
  const stationSet = new Set(sightingStationIds);
  return observations.filter((o) => stationSet.has(o.stationId));
}

/**
 * Investigation → MarineAlert
 * Returns alerts whose linkedInvestigationId matches the given investigation.
 */
export function resolveInvestigationAlerts(
  investigationId: string,
  alerts: MarineAlertOntologyObject[],
): MarineAlertOntologyObject[] {
  return alerts.filter((a) => a.linkedInvestigationId === investigationId);
}

/**
 * Investigation → Species
 * Returns species whose primary keys are in the provided correlated ID set.
 * The caller supplies speciesIds from movement signals or species summaries.
 */
export function resolveInvestigationSpecies(
  correlatedSpeciesIds: string[],
  species: SpeciesOntologyObject[],
): SpeciesOntologyObject[] {
  if (correlatedSpeciesIds.length === 0) return [];
  const idSet = new Set(correlatedSpeciesIds);
  return species.filter((s) => idSet.has(s.__primaryKey));
}

/**
 * Investigation → Station
 * Returns stations whose primary keys are in the provided linked station ID set.
 * The caller supplies stationIds from linked signals or evidence records.
 */
export function resolveInvestigationStations(
  linkedStationIds: string[],
  stations: StationOntologyObject[],
): StationOntologyObject[] {
  if (linkedStationIds.length === 0) return [];
  const idSet = new Set(linkedStationIds);
  return stations.filter((s) => idSet.has(s.__primaryKey));
}
