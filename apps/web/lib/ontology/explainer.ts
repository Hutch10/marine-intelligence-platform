/**
 * Investigation Explainer
 *
 * Pure, deterministic function that takes an InvestigationOntologyNetworkContext
 * and produces a structured InvestigationExplanation payload.
 *
 * Rules:
 *  - No DB access, no side effects, no async.
 *  - Null-safe: handles missing investigation and empty arrays gracefully.
 *  - Deterministic: given identical input, always produces identical output.
 */

import type {
  InvestigationOntologyNetworkContext,
  OntologyAlertNode,
  OntologyObservationNode,
  OntologySpeciesNode,
  OntologyStationNode,
} from "@marine/shared";

// ─── Output types ─────────────────────────────────────────────────────────────

export type DriverWeight = "primary" | "secondary" | "background";

export interface InvestigationDriver {
  label: string;
  detail: string;
  weight: DriverWeight;
}

export interface ExplainedEntity {
  type: "Station" | "Species" | "MarineAlert";
  label: string;
  detail: string;
  rid: string;
}

export interface InvestigationExplanation {
  investigationId: string | null;
  title: string;
  summary: string;
  confidence: number;
  state: string;
  likelyDrivers: InvestigationDriver[];
  keyEntities: ExplainedEntity[];
  anomalyNotes: string[];
  generatedAt: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const AT_RISK_STATUSES = new Set([
  "critically_endangered",
  "endangered",
  "vulnerable",
]);

function deriveDrivers(
  alerts: OntologyAlertNode[],
  species: OntologySpeciesNode[],
  stations: OntologyStationNode[],
): InvestigationDriver[] {
  const drivers: InvestigationDriver[] = [];

  // Critical / high alerts → primary drivers
  for (const alert of alerts) {
    if (alert.severity === "critical" || alert.severity === "high") {
      drivers.push({
        label: `Alert condition: ${alert.title}`,
        detail:
          alert.detail ??
          `Severity ${alert.severity} alert${alert.stationId ? ` at station ${alert.stationId}` : ""}.`,
        weight: "primary",
      });
    }
  }

  // Medium alerts → secondary drivers
  for (const alert of alerts) {
    if (alert.severity === "medium") {
      drivers.push({
        label: `Elevated alert: ${alert.title}`,
        detail: alert.detail ?? "Medium severity condition requiring continued monitoring.",
        weight: "secondary",
      });
    }
  }

  // At-risk species → secondary drivers
  for (const s of species) {
    if (AT_RISK_STATUSES.has(s.conservationStatus)) {
      drivers.push({
        label: `Species stress: ${s.commonName}`,
        detail: `${s.commonName} (${s.scientificName}) — conservation status: ${s.conservationStatus.replace(/_/g, " ")}.`,
        weight: "secondary",
      });
    }
  }

  // Station involvement → background driver
  if (stations.length > 1) {
    drivers.push({
      label: "Multi-station involvement",
      detail: `${stations.length} monitoring stations linked: ${stations.map((s) => s.name).join(", ")}.`,
      weight: "background",
    });
  } else if (stations.length === 1) {
    const st = stations[0];
    drivers.push({
      label: `Monitoring station: ${st.name}`,
      detail: `${st.locationLabel} — region: ${st.region}, status: ${st.status}.`,
      weight: "background",
    });
  }

  return drivers;
}

function buildKeyEntities(
  alerts: OntologyAlertNode[],
  species: OntologySpeciesNode[],
  stations: OntologyStationNode[],
): ExplainedEntity[] {
  const entities: ExplainedEntity[] = [];

  for (const s of species) {
    entities.push({
      type: "Species",
      label: s.commonName,
      detail: s.summary,
      rid: s.__rid,
    });
  }

  for (const st of stations) {
    entities.push({
      type: "Station",
      label: st.name,
      detail: `${st.region} — ${st.status}`,
      rid: st.__rid,
    });
  }

  // Only include critical and high severity alerts in key entities
  for (const alert of alerts) {
    if (alert.severity === "critical" || alert.severity === "high") {
      entities.push({
        type: "MarineAlert",
        label: alert.title,
        detail: alert.detail ?? `${alert.severity} severity, status: ${alert.status}`,
        rid: alert.__rid,
      });
    }
  }

  return entities;
}

function buildAnomalyNotes(observations: OntologyObservationNode[]): string[] {
  const notes: string[] = [];

  for (const obs of observations) {
    const readings: string[] = [];

    if (obs.sstC !== null) readings.push(`SST ${obs.sstC}°C`);
    if (obs.waveHeightM !== null) readings.push(`wave ${obs.waveHeightM}m`);
    if (obs.windSpeedMps !== null) readings.push(`wind ${obs.windSpeedMps}m/s`);
    if (obs.pressureHpa !== null) readings.push(`pressure ${obs.pressureHpa}hPa`);

    if (readings.length > 0) {
      notes.push(`Station ${obs.stationId} at ${obs.timestamp}: ${readings.join(", ")}`);
    }
  }

  return notes;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a structured explanation for an investigation from its resolved
 * ontology network context.
 *
 * Always returns a complete InvestigationExplanation even when the network
 * is empty or the investigation node is null.
 */
export function explainInvestigation(
  network: InvestigationOntologyNetworkContext,
): InvestigationExplanation {
  const { investigation, species, stations, observations, alerts } = network;

  return {
    investigationId: investigation?.__primaryKey ?? null,
    title: investigation?.title ?? "Unnamed investigation",
    summary: investigation?.summary ?? "No summary available for this investigation.",
    confidence: investigation?.confidence ?? 0,
    state: investigation?.state ?? "Unknown",
    likelyDrivers: deriveDrivers(alerts, species, stations),
    keyEntities: buildKeyEntities(alerts, species, stations),
    anomalyNotes: buildAnomalyNotes(observations),
    generatedAt: new Date().toISOString(),
  };
}
