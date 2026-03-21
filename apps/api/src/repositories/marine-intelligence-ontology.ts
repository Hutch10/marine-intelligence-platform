import type {
  MarineOntologyEntityType,
  MarineOntologyLayer,
  MarineOntologyTerm,
} from "../marine-intelligence-types";

export interface MarineOntologyListFilters {
  layer?: MarineOntologyLayer;
  entityType?: MarineOntologyEntityType;
  tag?: string;
  parentId?: string | null;
}

const ONTOLOGY_TERMS: MarineOntologyTerm[] = [
  {
    id: "obs.sea_surface_temperature",
    label: "Sea Surface Temperature",
    layer: "observed",
    entityType: "observation",
    description: "Direct sea-surface temperature observation from source feed.",
    parentId: null,
    tags: ["temperature", "observed", "ndbc", "crw"],
    version: 1,
  },
  {
    id: "obs.dissolved_oxygen",
    label: "Dissolved Oxygen",
    layer: "observed",
    entityType: "observation",
    description: "Direct dissolved oxygen reading from station observations.",
    parentId: null,
    tags: ["oxygen", "observed", "station"],
    version: 1,
  },
  {
    id: "obs.salinity",
    label: "Salinity",
    layer: "observed",
    entityType: "observation",
    description: "Direct salinity observation from source feed.",
    parentId: null,
    tags: ["salinity", "observed", "station"],
    version: 1,
  },
  {
    id: "drv.sst_anomaly",
    label: "SST Anomaly",
    layer: "derived",
    entityType: "metric",
    description: "Derived anomaly between observed SST and reference baseline.",
    parentId: "obs.sea_surface_temperature",
    tags: ["temperature", "derived", "anomaly"],
    version: 1,
  },
  {
    id: "drv.hotspot",
    label: "HotSpot",
    layer: "derived",
    entityType: "metric",
    description: "Derived coral heat stress hotspot metric.",
    parentId: "obs.sea_surface_temperature",
    tags: ["derived", "crw", "reef"],
    version: 1,
  },
  {
    id: "drv.dhw",
    label: "Degree Heating Weeks",
    layer: "derived",
    entityType: "metric",
    description: "Derived cumulative thermal stress metric.",
    parentId: "obs.sea_surface_temperature",
    tags: ["derived", "crw", "reef", "thermal_stress"],
    version: 1,
  },
  {
    id: "mdl.threshold_alert",
    label: "Threshold Alert",
    layer: "modeled",
    entityType: "signal",
    description: "Deterministic threshold-based event classification output.",
    parentId: null,
    tags: ["model", "threshold", "event"],
    version: 1,
  },
  {
    id: "mdl.trend_signal",
    label: "Trend Signal",
    layer: "modeled",
    entityType: "signal",
    description: "Deterministic trend-based event classification output.",
    parentId: null,
    tags: ["model", "trend", "event"],
    version: 1,
  },
  {
    id: "mdl.contextual_signal",
    label: "Contextual Signal",
    layer: "modeled",
    entityType: "signal",
    description: "Contextual multi-source event signal output.",
    parentId: null,
    tags: ["model", "context", "event"],
    version: 1,
  },
  {
    id: "nrt.marine_briefing",
    label: "Marine Briefing Narrative",
    layer: "narrative",
    entityType: "briefing",
    description: "Human-facing narrative tied to observed and derived evidence.",
    parentId: null,
    tags: ["narrative", "briefing", "communication"],
    version: 1,
  },
  {
    id: "evt.reef_stress_event",
    label: "Reef Stress Event",
    layer: "narrative",
    entityType: "event",
    description: "Named marine event entity assembled from deterministic signals.",
    parentId: "nrt.marine_briefing",
    tags: ["event", "reef", "stress"],
    version: 1,
  },
  {
    id: "evt.feed_health_event",
    label: "Feed Health Event",
    layer: "narrative",
    entityType: "event",
    description: "Named ingestion/feed-health event entity.",
    parentId: "nrt.marine_briefing",
    tags: ["event", "operations", "health"],
    version: 1,
  },
];

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTag(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

function normalizeParentId(value: string | null | undefined): string | null | undefined {
  if (value === null) {
    return null;
  }

  return normalizeOptionalText(value);
}

function copyTerm(term: MarineOntologyTerm): MarineOntologyTerm {
  return {
    ...term,
    tags: [...term.tags],
  };
}

export function listMarineOntologyTerms(filters: MarineOntologyListFilters = {}): MarineOntologyTerm[] {
  const layer = filters.layer;
  const entityType = filters.entityType;
  const tag = normalizeTag(filters.tag);
  const parentId = normalizeParentId(filters.parentId);

  const filtered = ONTOLOGY_TERMS.filter((term) => {
    if (layer && term.layer !== layer) {
      return false;
    }

    if (entityType && term.entityType !== entityType) {
      return false;
    }

    if (tag && !term.tags.some((termTag) => termTag.toLowerCase() === tag)) {
      return false;
    }

    if (parentId !== undefined && term.parentId !== parentId) {
      return false;
    }

    return true;
  });

  filtered.sort((left, right) => left.id.localeCompare(right.id));

  return filtered.map(copyTerm);
}

export function getMarineOntologyTermById(termId: string): MarineOntologyTerm | null {
  const normalized = normalizeOptionalText(termId);

  if (!normalized) {
    return null;
  }

  const found = ONTOLOGY_TERMS.find((term) => term.id === normalized);
  return found ? copyTerm(found) : null;
}

export function marineOntologyTermExists(termId: string): boolean {
  return getMarineOntologyTermById(termId) !== null;
}

export function getMarineOntologyVersion(): number {
  return ONTOLOGY_TERMS.reduce((maxVersion, term) => {
    return Math.max(maxVersion, term.version);
  }, 0);
}
