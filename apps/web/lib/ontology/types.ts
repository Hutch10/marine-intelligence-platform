/**
 * Core ontology type definitions.
 *
 * Every entity in the Marine Intelligence Platform is modelled as an
 * OntologyObject with a discriminant __type, a globally unique __rid, and a
 * __primaryKey that is stable within that type.
 */

export type OntologyObjectTypeId =
  | "Species"
  | "Station"
  | "MarineAlert"
  | "Investigation"
  | "Observation";

export type OntologyLinkTypeId =
  | "Station_has_MarineAlert"
  | "Station_has_Observation"
  | "Species_observedAt_Observation"
  | "Investigation_involves_MarineAlert"
  | "Investigation_involves_Species"
  | "Investigation_involves_Station";

// ─── Base object ─────────────────────────────────────────────────────────────

/** Base shape every ontology object carries regardless of concrete type. */
export interface OntologyObject<T extends OntologyObjectTypeId> {
  /** Discriminant — always equals the registry key. */
  readonly __type: T;
  /** Globally unique resource identifier: "<TypeId>/<primaryKey>" */
  readonly __rid: string;
  /** Primary key within the type. */
  readonly __primaryKey: string;
}

// ─── Species ─────────────────────────────────────────────────────────────────

export interface SpeciesOntologyObject extends OntologyObject<"Species"> {
  commonName: string;
  scientificName: string;
  conservationStatus: string;
  habitatRegion: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Station ─────────────────────────────────────────────────────────────────

export interface StationOntologyObject extends OntologyObject<"Station"> {
  slug: string;
  name: string;
  region: string;
  status: string;
  summary: string;
  locationLabel: string;
  depthM: number | null;
}

// ─── MarineAlert ──────────────────────────────────────────────────────────────

export type MarineAlertSeverity = "critical" | "high" | "medium" | "low" | "warning" | "info";
export type MarineAlertStatus = "open" | "active" | "acknowledged" | "resolved" | "dismissed";

export interface MarineAlertOntologyObject extends OntologyObject<"MarineAlert"> {
  title: string;
  severity: MarineAlertSeverity;
  status: MarineAlertStatus;
  detail: string | null;
  stationId: string | null;
  linkedInvestigationId: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

// ─── Investigation ────────────────────────────────────────────────────────────

export type InvestigationTrackState = "Correlated" | "Watch" | "Escalated";

export interface InvestigationOntologyObject extends OntologyObject<"Investigation"> {
  title: string;
  summary: string;
  confidence: number;
  state: InvestigationTrackState;
}

// ─── Observation ──────────────────────────────────────────────────────────────

export interface ObservationOntologyObject extends OntologyObject<"Observation"> {
  stationId: string;
  timestamp: string;
  sstC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
}
