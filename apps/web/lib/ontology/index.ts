/**
 * Marine Intelligence Ontology Layer — public API
 *
 * Import from this module, not from sub-modules directly.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  OntologyObjectTypeId,
  OntologyLinkTypeId,
  OntologyObject,
  SpeciesOntologyObject,
  StationOntologyObject,
  MarineAlertOntologyObject,
  MarineAlertSeverity,
  MarineAlertStatus,
  InvestigationOntologyObject,
  InvestigationTrackState,
  ObservationOntologyObject,
} from "./types";

// ─── Object Type registry ─────────────────────────────────────────────────────

export type { OntologyObjectTypeMetadata } from "./object-types";
export { getObjectType, listObjectTypes, hasObjectType } from "./object-types";

// ─── Link type registry ───────────────────────────────────────────────────────

export type { OntologyLinkTypeMetadata } from "./links";
export { getLinkType, listLinkTypes, linksFromSource, linksToTarget } from "./links";

// ─── Action type registry ─────────────────────────────────────────────────────

export type {
  OntologyActionTypeId,
  OntologyActionMetadata,
  OntologyActionContext,
  OntologyActionResult,
  AcknowledgeAlertInput,
  CloseInvestigationInput,
  AnnotateSightingInput,
  PromoteSignalToInvestigationInput,
} from "./actions";
export { listActions, getAction } from "./actions";

// ─── Object Sets ──────────────────────────────────────────────────────────────

export type {
  OntologyFilter,
  OntologyFilterOperator,
  OntologyObjectSetQuery,
  OntologyObjectSetResult,
} from "./object-sets";
export { applyFilters, buildObjectSetResult } from "./object-sets";

// ─── Resolvers ────────────────────────────────────────────────────────────────

export {
  buildRid,
  mapSpecies,
  mapStation,
  mapStationAlert,
  mapOperationalAlert,
  mapInvestigation,
  mapObservation,
  resolveStationAlerts,
  resolveStationObservations,
  resolveSpeciesObservations,
  resolveInvestigationAlerts,
  resolveInvestigationSpecies,
  resolveInvestigationStations,
} from "./resolvers";
