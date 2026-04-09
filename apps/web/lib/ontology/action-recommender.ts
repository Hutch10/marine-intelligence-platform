import type {
  InvestigationOntologyNetworkContext,
  LiveMarineCondition,
  ReefStressWatchItem,
  RiskRecommendation,
  RiskRecommendationSignal,
  SimilarInvestigation,
} from "@marine/shared";
import type { InvestigationExplanation } from "./explainer";

export type RecommendedActionUrgency = "low" | "medium" | "high";

export type ActionSupportingSignalKind = "observation" | "alert" | "explanation";

export type ActionSupportingSignal = RiskRecommendationSignal;

export interface BaselineAnomalySignal {
  strength?: number | null;
  zScore?: number | null;
}

export type RecommendedAction = RiskRecommendation;

export interface ActionRecommendationContext extends InvestigationOntologyNetworkContext {
  stationId?: string | null;
  liveConditions?: LiveMarineCondition[] | null;
  reefWatch?: ReefStressWatchItem[] | null;
  // Integration seam: upstream can pass baseline anomaly strength or z-score here
  // once the web context is wired to the anomaly model.
  baselineAnomaly?: BaselineAnomalySignal | null;
  explanation?: Pick<
    InvestigationExplanation,
    "summary" | "likelyDrivers" | "anomalyNotes" | "generatedAt"
  > | null;
  similar?: SimilarInvestigation[] | null;
}

const HIGH_SST_C = 30;
const HIGH_WAVE_M = 3;
const HIGH_WIND_MPS = 15;
const LOW_PRESSURE_HPA = 960;

// Escalation: ≥2 similar past events with high/critical severity and similarity ≥ 0.65
const ESCALATION_SIMILAR_MIN_COUNT = 2;
const ESCALATION_SIMILAR_MIN_SCORE = 0.65;
const ESCALATION_SEVERE_SEVERITIES = new Set(["high", "critical"]);

type CandidateAction = "storm" | "delay" | "reef" | "escalate" | "monitor";

interface TriggerHit {
  action: CandidateAction;
  signal: ActionSupportingSignal;
  sortKey: number;
}

function isRelevantStation(stationId: string | null | undefined, filter: string | null | undefined): boolean {
  return !filter || stationId === filter;
}

function formatMeasurement(value: number | null, unit: string): string {
  return value === null ? `unavailable ${unit}` : `${value.toFixed(1)} ${unit}`;
}

function formatPressure(value: number | null): string {
  return value === null ? "unavailable hPa" : `${value.toFixed(0)} hPa`;
}

function makeObservationSignal(
  label: string,
  stationId: string,
  timestamp: string,
  detail: string,
): ActionSupportingSignal {
  return {
    kind: "observation",
    label,
    source: `station:${stationId}`,
    timestamp,
    detail,
  };
}

function makeAlertSignal(
  label: string,
  alert: InvestigationOntologyNetworkContext["alerts"][number],
): ActionSupportingSignal {
  return {
    kind: "alert",
    label,
    source: alert.__rid,
    timestamp: alert.detectedAt,
    detail: alert.detail ?? `${alert.severity} alert detected.`,
  };
}

function makeExplanationSignals(
  explanation: ActionRecommendationContext["explanation"],
): ActionSupportingSignal[] {
  if (!explanation) {
    return [];
  }

  const signals: ActionSupportingSignal[] = [
    {
      kind: "explanation",
      label: "Investigation summary",
      source: "investigation",
      timestamp: explanation.generatedAt,
      detail: explanation.summary,
    },
  ];

  for (const driver of explanation.likelyDrivers.slice(0, 2)) {
    signals.push({
      kind: "explanation",
      label: `Driver: ${driver.label}`,
      source: "investigation",
      timestamp: explanation.generatedAt,
      detail: driver.detail,
    });
  }

  for (const note of explanation.anomalyNotes.slice(0, 1)) {
    signals.push({
      kind: "explanation",
      label: "Anomaly note",
      source: "investigation",
      timestamp: explanation.generatedAt,
      detail: note,
    });
  }

  return signals;
}

function uniqueSignals(signals: ActionSupportingSignal[]): ActionSupportingSignal[] {
  const seen = new Set<string>();
  const unique: ActionSupportingSignal[] = [];

  for (const signal of signals) {
    const key = `${signal.kind}|${signal.label}|${signal.source}|${signal.timestamp}|${signal.detail}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(signal);
  }

  return unique;
}

function summarizeTriggeredDrivers(hits: TriggerHit[]): string[] {
  const labels: string[] = [];

  if (hits.some((hit) => hit.signal.label === "Low pressure" || hit.signal.label === "Low pressure alert")) {
    labels.push("falling pressure");
  }
  if (hits.some((hit) => hit.signal.label === "High wave height")) {
    labels.push("high waves");
  }
  if (hits.some((hit) => hit.signal.label === "High wind speed")) {
    labels.push("strong winds");
  }
  if (hits.some((hit) => hit.signal.label === "High sea surface temperature" || hit.signal.label === "Thermal alert")) {
    labels.push("elevated sea surface temperature");
  }
  if (hits.some((hit) => hit.action === "escalate")) {
    labels.push("recurrent severe pattern matches");
  }

  return labels;
}

function formatDriverList(drivers: string[]): string {
  if (drivers.length === 0) {
    return "no material environmental triggers";
  }

  if (drivers.length === 1) {
    return drivers[0];
  }

  if (drivers.length === 2) {
    return `${drivers[0]} and ${drivers[1]}`;
  }

  return `${drivers.slice(0, -1).join(", ")}, and ${drivers[drivers.length - 1]}`;
}

function buildRationale(action: CandidateAction, hits: TriggerHit[]): string {
  const drivers = summarizeTriggeredDrivers(hits);

  if (action === "monitor") {
    return "No deterministic intervention threshold has been crossed yet.";
  }

  if (action === "storm") {
    const secondary = drivers.some((driver) => driver === "elevated sea surface temperature")
      ? " Elevated SST adds secondary environmental stress."
      : "";
    return `Storm risk is being driven by ${formatDriverList(drivers.filter((driver) => driver !== "recurrent severe pattern matches"))}.${secondary}`.trim();
  }

  if (action === "delay") {
    return `Operational delay is advised because ${formatDriverList(drivers.filter((driver) => driver !== "recurrent severe pattern matches"))} are outside the preferred operating envelope.`;
  }

  if (action === "reef") {
    return `Thermal stress is the primary concern, with ${formatDriverList(drivers)} shaping the current risk picture.`;
  }

  return `Escalation is supported by ${formatDriverList(drivers)}.`;
}

function buildRationalePoints(action: CandidateAction, hits: TriggerHit[]): string[] {
  const points: string[] = [];
  const actionHits = action === "monitor" ? [] : hits.filter((h) => h.action === action);

  if (action === "storm") {
    points.push("Low atmospheric pressure below the storm-risk threshold.");
  } else if (action === "delay") {
    let hasSpecificWeatherPoint = false;
    if (actionHits.some((h) => h.signal.label === "High wave height")) {
      points.push(`Wave height exceeds the ${HIGH_WAVE_M.toFixed(1)} m operational limit.`);
      hasSpecificWeatherPoint = true;
    }
    if (actionHits.some((h) => h.signal.label === "High wind speed")) {
      points.push(`Wind speed exceeds the ${HIGH_WIND_MPS.toFixed(1)} m/s operational limit.`);
      hasSpecificWeatherPoint = true;
    }
    if (!hasSpecificWeatherPoint) {
      points.push("Weather alert indicates wave or wind conditions are outside the operating envelope.");
    }
  } else if (action === "reef") {
    points.push(`Sea surface temperature above ${HIGH_SST_C.toFixed(1)} °C — reef stress risk.`);
  } else if (action === "escalate") {
    points.push(`At least ${ESCALATION_SIMILAR_MIN_COUNT} past investigations with severity ≥ high share a similarity score above ${(ESCALATION_SIMILAR_MIN_SCORE * 100).toFixed(0)}%.`);
    points.push("Pattern recurrence suggests the anomaly may be persistent rather than isolated.");
  } else {
    points.push("No observation, alert, or similar-event threshold has been crossed.");
    points.push("Continue routine data collection and re-evaluate when new readings arrive.");
  }

  return points.slice(0, 5);
}

function urgencyFor(action: CandidateAction, corroboratingSignals: number): RecommendedActionUrgency {
  if (action === "monitor") {
    return "low";
  }

  if (action === "reef") {
    return corroboratingSignals >= 3 ? "high" : "medium";
  }

  if (action === "escalate") {
    return "medium";
  }

  return "high";
}

function computeConfidenceScore(
  hits: TriggerHit[],
  hasExplanation: boolean,
  hasSimilarCorroboration: boolean,
  hasMultiSourceCorroboration: boolean,
  baselineAnomalyBoost: number,
): number {
  if (
    hits.length === 0 &&
    !hasExplanation &&
    !hasSimilarCorroboration &&
    !hasMultiSourceCorroboration &&
    baselineAnomalyBoost === 0
  ) {
    return 0.1;
  }

  let score = 0;

  const signalKinds = new Set(hits.map((h) => h.signal.kind));
  score += Math.min(signalKinds.size, 2) * 0.2;
  score += Math.min(hits.length, 4) * 0.075;
  if (hasExplanation) score += 0.1;
  if (hasSimilarCorroboration) score += 0.1;
  if (hasMultiSourceCorroboration) score += 0.1;
  score += baselineAnomalyBoost;

  return Math.min(1, Math.round(score * 1000) / 1000);
}

function normalizeBaselineAnomalyBoost(
  baselineAnomaly: BaselineAnomalySignal | null | undefined,
): number {
  if (!baselineAnomaly) {
    return 0;
  }

  const boosts: number[] = [];

  if (typeof baselineAnomaly.strength === "number" && Number.isFinite(baselineAnomaly.strength)) {
    const normalizedStrength = Math.min(1, Math.max(0, baselineAnomaly.strength));
    boosts.push(Math.min(0.15, normalizedStrength * 0.15));
  }

  if (typeof baselineAnomaly.zScore === "number" && Number.isFinite(baselineAnomaly.zScore)) {
    const normalizedZScore = Math.min(4, Math.abs(baselineAnomaly.zScore));
    boosts.push(Math.min(0.15, (normalizedZScore / 4) * 0.15));
  }

  return boosts.length > 0 ? Math.max(...boosts) : 0;
}

function hasMultiSourceCorroboration(
  liveConditions: LiveMarineCondition[] | null | undefined,
  reefWatch: ReefStressWatchItem[] | null | undefined,
): boolean {
  const hasNdbc = (liveConditions ?? []).some((condition) => condition.source === "noaa_ndbc");
  const hasCrw = (reefWatch ?? []).some((item) => item.source === "noaa_crw");

  return hasNdbc && hasCrw;
}

function buildSiteSwitchSuggestion(
  stations: InvestigationOntologyNetworkContext["stations"],
  stationId: string | null | undefined,
): string | null {
  const alternatives = stations.filter((station) => station.__primaryKey !== stationId);

  if (alternatives.length === 0) {
    return null;
  }

  const chosen = [...alternatives].sort((left, right) => {
    const leftOperational = /active|open|operational/i.test(left.status) ? 1 : 0;
    const rightOperational = /active|open|operational/i.test(right.status) ? 1 : 0;

    if (leftOperational !== rightOperational) {
      return rightOperational - leftOperational;
    }

    const leftDepth = left.depthM ?? Number.NEGATIVE_INFINITY;
    const rightDepth = right.depthM ?? Number.NEGATIVE_INFINITY;

    if (leftDepth !== rightDepth) {
      return rightDepth - leftDepth;
    }

    return left.name.localeCompare(right.name);
  })[0];

  if (!chosen) {
    return null;
  }

  return `Switch to ${chosen.name} (${chosen.locationLabel})`;
}

function collectObservationHits(
  observations: InvestigationOntologyNetworkContext["observations"],
  stationId: string | null | undefined,
): TriggerHit[] {
  const hits: TriggerHit[] = [];

  for (const obs of observations) {
    if (!isRelevantStation(obs.stationId, stationId)) {
      continue;
    }

    if ((obs.pressureHpa ?? Number.POSITIVE_INFINITY) <= LOW_PRESSURE_HPA) {
      hits.push({
        action: "storm",
        signal: makeObservationSignal(
          "Low pressure",
          obs.stationId,
          obs.timestamp,
          `Pressure ${formatPressure(obs.pressureHpa)} crossed the ${LOW_PRESSURE_HPA} hPa threshold.`,
        ),
        sortKey: 3,
      });
    }

    if ((obs.waveHeightM ?? 0) >= HIGH_WAVE_M) {
      hits.push({
        action: "delay",
        signal: makeObservationSignal(
          "High wave height",
          obs.stationId,
          obs.timestamp,
          `Wave height ${formatMeasurement(obs.waveHeightM, "m")} crossed the ${HIGH_WAVE_M.toFixed(1)} m threshold.`,
        ),
        sortKey: 2,
      });
    }

    if ((obs.windSpeedMps ?? 0) >= HIGH_WIND_MPS) {
      hits.push({
        action: "delay",
        signal: makeObservationSignal(
          "High wind speed",
          obs.stationId,
          obs.timestamp,
          `Wind speed ${formatMeasurement(obs.windSpeedMps, "m/s")} crossed the ${HIGH_WIND_MPS.toFixed(1)} m/s threshold.`,
        ),
        sortKey: 2,
      });
    }

    if ((obs.sstC ?? 0) >= HIGH_SST_C) {
      hits.push({
        action: "reef",
        signal: makeObservationSignal(
          "High sea surface temperature",
          obs.stationId,
          obs.timestamp,
          `SST ${formatMeasurement(obs.sstC, "°C")} crossed the ${HIGH_SST_C.toFixed(1)} °C threshold.`,
        ),
        sortKey: 1,
      });
    }
  }

  return hits;
}

function collectAlertHits(
  alerts: InvestigationOntologyNetworkContext["alerts"],
  stationId: string | null | undefined,
): TriggerHit[] {
  const hits: TriggerHit[] = [];

  for (const alert of alerts) {
    if (!isRelevantStation(alert.stationId, stationId)) {
      continue;
    }

    if (alert.status === "resolved") {
      continue;
    }

    const haystack = `${alert.title} ${alert.detail ?? ""}`.toLowerCase();

    if (haystack.includes("pressure")) {
      hits.push({
        action: "storm",
        signal: makeAlertSignal("Low pressure alert", alert),
        sortKey: 3,
      });
      continue;
    }

    if (haystack.includes("wave") || haystack.includes("wind")) {
      hits.push({
        action: "delay",
        signal: makeAlertSignal("Operational weather alert", alert),
        sortKey: 2,
      });
      continue;
    }

    if (haystack.includes("temperature") || haystack.includes("thermal") || haystack.includes("sst")) {
      hits.push({
        action: "reef",
        signal: makeAlertSignal("Thermal alert", alert),
        sortKey: 1,
      });
    }
  }

  return hits;
}

function collectSimilarHits(similar: SimilarInvestigation[] | null | undefined): TriggerHit[] {
  if (!similar || similar.length === 0) return [];

  const severeSimilar = similar.filter(
    (s) =>
      s.similarity >= ESCALATION_SIMILAR_MIN_SCORE &&
      !!s.severity &&
      ESCALATION_SEVERE_SEVERITIES.has(s.severity),
  );

  if (severeSimilar.length < ESCALATION_SIMILAR_MIN_COUNT) return [];

  return severeSimilar.map((s) => ({
    action: "escalate" as CandidateAction,
    signal: {
      kind: "explanation" as ActionSupportingSignalKind,
      label: `Similar severe event: ${s.title}`,
      source: `investigation:${s.investigationId}`,
      timestamp: s.indexedAt,
      detail: `Similarity score ${(s.similarity * 100).toFixed(0)}% — ${s.summary.slice(0, 200)}`,
    },
    sortKey: 0,
  }));
}

function buildActionPayload(
  action: CandidateAction,
  hits: TriggerHit[],
  explanationSignals: ActionSupportingSignal[],
  siteSwitchSuggestion: string | null,
  confidenceScore: number,
): RecommendedAction {
  const actionHits = hits.filter((hit) => hit.action === action);
  const contributingSignals =
    action === "monitor"
      ? []
      : uniqueSignals([
          ...hits.sort((a, b) => b.sortKey - a.sortKey).map((hit) => hit.signal),
          ...explanationSignals,
        ]).slice(0, 6);
  const supportingSignals = contributingSignals.slice(0, 5);

  return {
    action:
      action === "storm"
        ? "Storm risk advisory"
        : action === "delay"
          ? "Delay operations"
          : action === "reef"
            ? "Avoid shallow reef exposure"
            : action === "escalate"
              ? "Escalate to incident response"
              : "Continue monitoring",
    rationale: buildRationale(action, hits),
    rationalePoints: buildRationalePoints(action, hits),
    urgency: urgencyFor(action, actionHits.length),
    confidenceScore,
    siteSwitchSuggestion,
    supportingSignals,
    contributingSignals,
    generatedAt: new Date().toISOString(),
  };
}

export function recommendAction(context: ActionRecommendationContext): RecommendedAction {
  const observationHits = collectObservationHits(context.observations ?? [], context.stationId);
  const alertHits = collectAlertHits(context.alerts ?? [], context.stationId);
  const similarHits = collectSimilarHits(context.similar);
  const hits = [...observationHits, ...alertHits, ...similarHits];

  const hasExplanation = !!context.explanation;
  const hasSimilar = (context.similar?.length ?? 0) > 0;
  const hasMultiSource = hasMultiSourceCorroboration(context.liveConditions, context.reefWatch);
  const baselineAnomalyBoost = normalizeBaselineAnomalyBoost(context.baselineAnomaly);
  const explanationSignals = makeExplanationSignals(context.explanation);
  const siteSwitchSuggestion =
    hits.length > 0 ? buildSiteSwitchSuggestion(context.stations, context.stationId) : null;
  const confidenceScore = computeConfidenceScore(
    hits,
    hasExplanation,
    hasSimilar,
    hasMultiSource,
    baselineAnomalyBoost,
  );

  const priority: CandidateAction[] = ["storm", "delay", "reef", "escalate"];
  for (const action of priority) {
    if (hits.some((hit) => hit.action === action)) {
      return buildActionPayload(
        action,
        hits,
        explanationSignals,
        siteSwitchSuggestion,
        confidenceScore,
      );
    }
  }

  return buildActionPayload(
    "monitor",
    hits,
    explanationSignals,
    null,
    confidenceScore,
  );
}

export const recommendInvestigationAction = recommendAction;

export type InvestigationActionRecommendation = RecommendedAction;
export type RecommendationUrgency = RecommendedActionUrgency;
