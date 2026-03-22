/**
 * Link type registry.
 *
 * Defines all typed, directional relationships between object types.
 * Link IDs follow the convention: "<SourceType>_<verb>_<TargetType>".
 */

import type { OntologyLinkTypeId, OntologyObjectTypeId } from "./types";

export interface OntologyLinkTypeMetadata {
  id: OntologyLinkTypeId;
  sourceType: OntologyObjectTypeId;
  targetType: OntologyObjectTypeId;
  displayName: string;
  description: string;
  cardinality: "one-to-many" | "many-to-many" | "many-to-one";
}

const REGISTRY: Record<OntologyLinkTypeId, OntologyLinkTypeMetadata> = {
  Station_has_MarineAlert: {
    id: "Station_has_MarineAlert",
    sourceType: "Station",
    targetType: "MarineAlert",
    displayName: "Has Alert",
    description: "Alerts triggered by or associated with this station.",
    cardinality: "one-to-many",
  },
  Station_has_Observation: {
    id: "Station_has_Observation",
    sourceType: "Station",
    targetType: "Observation",
    displayName: "Has Observation",
    description: "Sensor readings recorded at this station.",
    cardinality: "one-to-many",
  },
  Species_observedAt_Observation: {
    id: "Species_observedAt_Observation",
    sourceType: "Species",
    targetType: "Observation",
    displayName: "Observed At",
    description: "Sensor observations from stations where this species was sighted.",
    cardinality: "many-to-many",
  },
  Investigation_involves_MarineAlert: {
    id: "Investigation_involves_MarineAlert",
    sourceType: "Investigation",
    targetType: "MarineAlert",
    displayName: "Involves Alert",
    description: "Alerts linked to this investigation.",
    cardinality: "one-to-many",
  },
  Investigation_involves_Species: {
    id: "Investigation_involves_Species",
    sourceType: "Investigation",
    targetType: "Species",
    displayName: "Involves Species",
    description: "Species implicated in or correlated with this investigation.",
    cardinality: "many-to-many",
  },
  Investigation_involves_Station: {
    id: "Investigation_involves_Station",
    sourceType: "Investigation",
    targetType: "Station",
    displayName: "Involves Station",
    description: "Stations where investigation evidence was collected.",
    cardinality: "many-to-many",
  },
};

export function getLinkType(id: OntologyLinkTypeId): OntologyLinkTypeMetadata {
  return REGISTRY[id];
}

export function listLinkTypes(): OntologyLinkTypeMetadata[] {
  return Object.values(REGISTRY);
}

/** All link types that originate from a given source type. */
export function linksFromSource(sourceType: OntologyObjectTypeId): OntologyLinkTypeMetadata[] {
  return Object.values(REGISTRY).filter((l) => l.sourceType === sourceType);
}

/** All link types that point to a given target type. */
export function linksToTarget(targetType: OntologyObjectTypeId): OntologyLinkTypeMetadata[] {
  return Object.values(REGISTRY).filter((l) => l.targetType === targetType);
}
