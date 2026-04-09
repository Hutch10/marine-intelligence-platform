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
import type { OntologyLinkTypeId, OntologyObjectTypeId } from "./types";
import { getLinkType } from "./links";

// ─── Output types ─────────────────────────────────────────────────────────────

export type DriverWeight = "primary" | "secondary" | "background";
export type ExplanationSourceType = "alert" | "species" | "station" | "observation";
export type ExplanationNodeType = OntologyObjectTypeId;

export interface InvestigationKeyDriver {
  label: string;
  detail: string;
  weight: DriverWeight;
  sourceType: ExplanationSourceType;
  sourceRid: string;
  timestamp: string | null;
}

export type InvestigationDriver = InvestigationKeyDriver;

export interface InvestigationAnomaly {
  label: string;
  detail: string;
  severity: OntologyAlertNode["severity"] | "info";
  sourceType: ExplanationSourceType;
  sourceRid: string;
  stationId: string | null;
  timestamp: string | null;
}

export interface InvestigationRelationship {
  linkTypeId: OntologyLinkTypeId;
  label: string;
  detail: string;
  sourceType: ExplanationNodeType;
  sourceLabel: string;
  sourceRid: string;
  targetType: ExplanationNodeType;
  targetLabel: string;
  targetRid: string;
  timestamp: string | null;
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
  confidenceScore: number;
  state: string;
  keyDrivers: InvestigationKeyDriver[];
  anomalies: InvestigationAnomaly[];
  relationships: InvestigationRelationship[];
  generatedAt: string;
  likelyDrivers: InvestigationKeyDriver[];
  keyEntities: ExplainedEntity[];
  anomalyNotes: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const AT_RISK_STATUSES = new Set([
  "critically_endangered",
  "endangered",
  "vulnerable",
]);

const IMPORTANT_ALERT_SEVERITIES = new Set<OntologyAlertNode["severity"]>([
  "critical",
  "high",
  "medium",
]);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function latestTimestamp(...timestamps: Array<string | null | undefined>): string | null {
  const valid = timestamps.filter((value): value is string => Boolean(value));

  if (valid.length === 0) {
    return null;
  }

  return valid
    .slice()
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function buildStationLookup(stations: OntologyStationNode[]): Map<string, OntologyStationNode> {
  return new Map(stations.map((station) => [station.__primaryKey, station]));
}

function summarizeObservation(obs: OntologyObservationNode): string {
  const readings: string[] = [];

  if (obs.sstC !== null) readings.push(`SST ${obs.sstC}°C`);
  if (obs.waveHeightM !== null) readings.push(`wave ${obs.waveHeightM}m`);
  if (obs.windSpeedMps !== null) readings.push(`wind ${obs.windSpeedMps}m/s`);
  if (obs.pressureHpa !== null) readings.push(`pressure ${obs.pressureHpa}hPa`);

  return readings.join(", ");
}

function buildKeyDrivers(
  alerts: OntologyAlertNode[],
  species: OntologySpeciesNode[],
  stations: OntologyStationNode[],
  observations: OntologyObservationNode[],
): InvestigationKeyDriver[] {
  const drivers: InvestigationKeyDriver[] = [];
  const stationEvidenceTimestamps = new Map<string, string[]>();

  for (const alert of alerts) {
    if (!alert.stationId) {
      continue;
    }

    const bucket = stationEvidenceTimestamps.get(alert.stationId) ?? [];
    bucket.push(alert.detectedAt);
    stationEvidenceTimestamps.set(alert.stationId, bucket);
  }

  for (const obs of observations) {
    const bucket = stationEvidenceTimestamps.get(obs.stationId) ?? [];
    bucket.push(obs.timestamp);
    stationEvidenceTimestamps.set(obs.stationId, bucket);
  }

  for (const alert of alerts) {
    if (alert.severity === "critical" || alert.severity === "high") {
      drivers.push({
        label: `Alert condition: ${alert.title}`,
        detail:
          alert.detail ??
          `Severity ${alert.severity} alert${alert.stationId ? ` at station ${alert.stationId}` : ""}.`,
        weight: "primary",
        sourceType: "alert",
        sourceRid: alert.__rid,
        timestamp: alert.detectedAt,
      });
    }
  }

  for (const alert of alerts) {
    if (alert.severity === "medium") {
      drivers.push({
        label: `Elevated alert: ${alert.title}`,
        detail: alert.detail ?? "Medium severity condition requiring continued monitoring.",
        weight: "secondary",
        sourceType: "alert",
        sourceRid: alert.__rid,
        timestamp: alert.detectedAt,
      });
    }
  }

  for (const s of species) {
    if (AT_RISK_STATUSES.has(s.conservationStatus)) {
      drivers.push({
        label: `Species stress: ${s.commonName}`,
        detail: `${s.commonName} (${s.scientificName}) — conservation status: ${s.conservationStatus.replace(/_/g, " ")}.`,
        weight: "secondary",
        sourceType: "species",
        sourceRid: s.__rid,
        timestamp: null,
      });
    }
  }

  if (stations.length > 1) {
    const evidenceTimestamps = stations.flatMap((station) => stationEvidenceTimestamps.get(station.__primaryKey) ?? []);
    drivers.push({
      label: "Multi-station involvement",
      detail: `${stations.length} monitoring stations linked: ${stations.map((s) => s.name).join(", ")}.`,
      weight: "background",
      sourceType: "station",
      sourceRid: stations[0]?.__rid ?? "Station/unknown",
      timestamp: latestTimestamp(...evidenceTimestamps),
    });
  } else if (stations.length === 1) {
    const st = stations[0];
    drivers.push({
      label: `Monitoring station: ${st.name}`,
      detail: `${st.locationLabel} — region: ${st.region}, status: ${st.status}.`,
      weight: "background",
      sourceType: "station",
      sourceRid: st.__rid,
      timestamp: null,
    });
  }

  for (const obs of observations) {
    const summary = summarizeObservation(obs);

    if (!summary) {
      continue;
    }

    drivers.push({
      label: `Observation at ${obs.stationId}`,
      detail: `${obs.timestamp} — ${summary}`,
      weight: "background",
      sourceType: "observation",
      sourceRid: obs.__rid,
      timestamp: obs.timestamp,
    });
  }

  return drivers;
}

function buildAnomalies(
  alerts: OntologyAlertNode[],
  observations: OntologyObservationNode[],
): InvestigationAnomaly[] {
  const anomalies: InvestigationAnomaly[] = [];

  for (const alert of alerts) {
    if (!IMPORTANT_ALERT_SEVERITIES.has(alert.severity)) {
      continue;
    }

    anomalies.push({
      label: alert.title,
      detail:
        alert.detail ??
        `Alert severity ${alert.severity} detected${alert.stationId ? ` at station ${alert.stationId}` : ""}.`,
      severity: alert.severity,
      sourceType: "alert",
      sourceRid: alert.__rid,
      stationId: alert.stationId,
      timestamp: alert.detectedAt,
    });
  }

  for (const obs of observations) {
    const summary = summarizeObservation(obs);

    if (!summary) {
      continue;
    }

    const severe =
      (obs.sstC !== null && obs.sstC > 30)
      || (obs.waveHeightM !== null && obs.waveHeightM > 5)
      || (obs.windSpeedMps !== null && obs.windSpeedMps > 20)
      || (obs.pressureHpa !== null && obs.pressureHpa < 960);

    anomalies.push({
      label: `Observation at ${obs.stationId}`,
      detail: `${obs.timestamp} — ${summary}`,
      severity: severe ? "high" : "info",
      sourceType: "observation",
      sourceRid: obs.__rid,
      stationId: obs.stationId,
      timestamp: obs.timestamp,
    });
  }

  return anomalies;
}

function buildRelationships(
  investigation: InvestigationOntologyNetworkContext["investigation"],
  alerts: OntologyAlertNode[],
  species: OntologySpeciesNode[],
  stations: OntologyStationNode[],
  observations: OntologyObservationNode[],
  stationLookup: Map<string, OntologyStationNode>,
): InvestigationRelationship[] {
  const relationships: InvestigationRelationship[] = [];
  const sourceLabel = investigation?.title ?? "Unnamed investigation";
  const sourceRid = investigation?.__rid ?? "Investigation/unknown";

  for (const alert of alerts) {
    relationships.push({
      linkTypeId: "Investigation_involves_MarineAlert",
      label: getLinkType("Investigation_involves_MarineAlert").displayName,
      detail: getLinkType("Investigation_involves_MarineAlert").description,
      sourceType: "Investigation",
      sourceLabel,
      sourceRid,
      targetType: "MarineAlert",
      targetLabel: alert.title,
      targetRid: alert.__rid,
      timestamp: alert.detectedAt,
    });
  }

  for (const s of species) {
    relationships.push({
      linkTypeId: "Investigation_involves_Species",
      label: getLinkType("Investigation_involves_Species").displayName,
      detail: getLinkType("Investigation_involves_Species").description,
      sourceType: "Investigation",
      sourceLabel,
      sourceRid,
      targetType: "Species",
      targetLabel: s.commonName,
      targetRid: s.__rid,
      timestamp: null,
    });
  }

  for (const st of stations) {
    relationships.push({
      linkTypeId: "Investigation_involves_Station",
      label: getLinkType("Investigation_involves_Station").displayName,
      detail: getLinkType("Investigation_involves_Station").description,
      sourceType: "Investigation",
      sourceLabel,
      sourceRid,
      targetType: "Station",
      targetLabel: st.name,
      targetRid: st.__rid,
      timestamp: null,
    });
  }

  for (const obs of observations) {
    const station = stationLookup.get(obs.stationId);

    relationships.push({
      linkTypeId: "Station_has_Observation",
      label: getLinkType("Station_has_Observation").displayName,
      detail: getLinkType("Station_has_Observation").description,
      sourceType: "Station",
      sourceLabel: station?.name ?? obs.stationId,
      sourceRid: station?.__rid ?? `Station/${obs.stationId}`,
      targetType: "Observation",
      targetLabel: obs.timestamp,
      targetRid: obs.__rid,
      timestamp: obs.timestamp,
    });
  }

  return relationships;
}

function deriveConfidenceScore(
  investigation: InvestigationOntologyNetworkContext["investigation"],
  keyDrivers: InvestigationKeyDriver[],
  anomalies: InvestigationAnomaly[],
  relationships: InvestigationRelationship[],
  alerts: OntologyAlertNode[],
  species: OntologySpeciesNode[],
  stations: OntologyStationNode[],
  observations: OntologyObservationNode[],
): number {
  const corroboratingAlerts = alerts.filter((alert) => IMPORTANT_ALERT_SEVERITIES.has(alert.severity)).length;
  const alertScore = Math.min(corroboratingAlerts, 4) * 0.14;
  const sourceKinds = [alerts.length, species.length, stations.length, observations.length].filter((count) => count > 0).length;
  const sourceScore = sourceKinds > 1 ? 0.12 + (sourceKinds - 2) * 0.08 : sourceKinds * 0.04;
  const breadthScore = Math.min(keyDrivers.length + anomalies.length + relationships.length, 12) * 0.02;
  const investigationScore = (investigation?.confidence ?? 0) / 100 * 0.1;

  return clamp01(alertScore + sourceScore + breadthScore + investigationScore);
}

function buildLikelyDriversAlias(drivers: InvestigationKeyDriver[]): InvestigationKeyDriver[] {
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

function buildAnomalyNotes(anomalies: InvestigationAnomaly[]): string[] {
  return anomalies.map((anomaly) => {
    const timestamp = anomaly.timestamp ? `${anomaly.timestamp} — ` : "";
    return `${timestamp}${anomaly.label}: ${anomaly.detail}`;
  });
}

function buildSummary(
  investigation: InvestigationOntologyNetworkContext["investigation"],
  keyDrivers: InvestigationKeyDriver[],
  anomalies: InvestigationAnomaly[],
  relationships: InvestigationRelationship[],
): string {
  const existing = investigation?.summary?.trim() ?? "";

  if (existing) {
    return existing;
  }

  const parts: string[] = [];

  if (keyDrivers.length > 0) {
    parts.push(`${keyDrivers.length} grounded drivers`);
  }

  if (anomalies.length > 0) {
    parts.push(`${anomalies.length} anomalies`);
  }

  if (relationships.length > 0) {
    parts.push(`${relationships.length} ontology links`);
  }

  return parts.length > 0
    ? `Grounded synthesis from ${parts.join(", ")}.`
    : "No summary available for this investigation.";
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
  const stationLookup = buildStationLookup(stations);
  const keyDrivers = buildKeyDrivers(alerts, species, stations, observations);
  const anomalies = buildAnomalies(alerts, observations);
  const relationships = buildRelationships(investigation, alerts, species, stations, observations, stationLookup);
  const confidenceScore = deriveConfidenceScore(
    investigation,
    keyDrivers,
    anomalies,
    relationships,
    alerts,
    species,
    stations,
    observations,
  );
  const summary = buildSummary(investigation, keyDrivers, anomalies, relationships);

  return {
    investigationId: investigation?.__primaryKey ?? null,
    title: investigation?.title ?? "Unnamed investigation",
    summary,
    confidence: investigation?.confidence ?? 0,
    confidenceScore,
    state: investigation?.state ?? "Unknown",
    keyDrivers,
    anomalies,
    relationships,
    generatedAt: new Date().toISOString(),
    likelyDrivers: buildLikelyDriversAlias(keyDrivers),
    keyEntities: buildKeyEntities(alerts, species, stations),
    anomalyNotes: buildAnomalyNotes(anomalies),
  };
}
