/**
 * Object type registry.
 *
 * Maps each OntologyObjectTypeId to display metadata. This acts as the
 * platform's catalog of known entity classes — analogous to Foundry's
 * Object Type definitions.
 */

import type { OntologyObjectTypeId } from "./types";

export interface OntologyObjectTypeMetadata {
  id: OntologyObjectTypeId;
  displayName: string;
  description: string;
  primaryKeyField: string;
}

const REGISTRY: Record<OntologyObjectTypeId, OntologyObjectTypeMetadata> = {
  Species: {
    id: "Species",
    displayName: "Species",
    description: "A marine species tracked by the platform.",
    primaryKeyField: "id",
  },
  Station: {
    id: "Station",
    displayName: "Ocean Station",
    description: "A fixed monitoring station producing sensor readings.",
    primaryKeyField: "id",
  },
  MarineAlert: {
    id: "MarineAlert",
    displayName: "Marine Alert",
    description: "An alert triggered by a station anomaly, signal, or system rule.",
    primaryKeyField: "id",
  },
  Investigation: {
    id: "Investigation",
    displayName: "Investigation",
    description: "An active analysis track for a correlated marine event.",
    primaryKeyField: "id",
  },
  Observation: {
    id: "Observation",
    displayName: "Observation",
    description: "A timestamped sensor reading from a monitoring station.",
    primaryKeyField: "stationId_timestamp",
  },
};

export function getObjectType(id: OntologyObjectTypeId): OntologyObjectTypeMetadata {
  return REGISTRY[id];
}

export function listObjectTypes(): OntologyObjectTypeMetadata[] {
  return Object.values(REGISTRY);
}

export function hasObjectType(id: string): id is OntologyObjectTypeId {
  return id in REGISTRY;
}
