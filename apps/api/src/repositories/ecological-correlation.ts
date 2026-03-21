/**
 * Deterministic, fact-based, auditable dashboard ecological correlation utility.
 *
 * Generates "why this matters" reasons from aggregated species activity data.
 * Each rule fires independently based on observable thresholds — no shared
 * state, no probabilistic inference. Reusable by both the dashboard and
 * investigations contexts.
 */
import type {
  EcologicalCorrelationReason,
  SpeciesMovementType,
} from "../../../web/lib/api/types";

export interface EcologicalCorrelationInput {
  recentSightingCount: number;
  recentMovementSignalCount: number;
  topMovementTypes: SpeciesMovementType[];
  maxMovementConfidence: number;
  windowDays: number;
}

/**
 * Rule 1 — Increased sighting rate.
 * Fires when 3 or more sightings are recorded in the observation window.
 */
function ruleIncreasedSightingRate(
  input: EcologicalCorrelationInput,
): EcologicalCorrelationReason | null {
  if (input.recentSightingCount < 3) {
    return null;
  }

  return {
    kind: "increased_sighting_rate",
    label: `${input.recentSightingCount} sightings in last ${input.windowDays} days`,
    detail: `Sighting frequency exceeds baseline threshold. ${input.recentSightingCount} recorded observations indicate elevated species presence in the monitored window.`,
  };
}

/**
 * Rule 2 — Feeding aggregation.
 * Fires when "aggregation_shift" is present in the top movement types.
 */
function ruleFeedingAggregation(
  input: EcologicalCorrelationInput,
): EcologicalCorrelationReason | null {
  if (!input.topMovementTypes.includes("aggregation_shift")) {
    return null;
  }

  return {
    kind: "feeding_aggregation_detected",
    label: "Aggregation shift pattern detected",
    detail:
      "Aggregation shift signals indicate potential feeding concentration or habitat pressure. This movement pattern correlates with food source proximity.",
  };
}

/**
 * Rule 3 — Migration shift.
 * Fires when "route_deviation" or "seasonal_mismatch" appears in top movement types.
 */
function ruleMigrationShift(
  input: EcologicalCorrelationInput,
): EcologicalCorrelationReason | null {
  const hasRouteDeviation = input.topMovementTypes.includes("route_deviation");
  const hasSeasonalMismatch = input.topMovementTypes.includes("seasonal_mismatch");

  if (!hasRouteDeviation && !hasSeasonalMismatch) {
    return null;
  }

  const triggeredType = hasRouteDeviation ? "route deviation" : "seasonal mismatch";

  return {
    kind: "migration_shift_detected",
    label: `Migration shift: ${triggeredType}`,
    detail: `Detected ${triggeredType} in recent movement signals. This may indicate environmental pressure, route disruption, or seasonal phenology shift.`,
  };
}

/**
 * Rule 4 — Species anomaly window overlap.
 * Fires when 2 or more movement signals fall within the active window.
 */
function ruleAnomalyWindowOverlap(
  input: EcologicalCorrelationInput,
): EcologicalCorrelationReason | null {
  if (input.recentMovementSignalCount < 2) {
    return null;
  }

  return {
    kind: "species_anomaly_window_overlap",
    label: `${input.recentMovementSignalCount} movement signals in anomaly window`,
    detail: `Multiple movement signals recorded within the active window. Co-occurrence with current anomaly monitoring period increases ecological significance.`,
  };
}

/**
 * Rule 5 — Elevated movement confidence.
 * Fires when at least one signal reaches 70% confidence or above.
 */
function ruleElevatedConfidence(
  input: EcologicalCorrelationInput,
): EcologicalCorrelationReason | null {
  if (input.maxMovementConfidence < 70) {
    return null;
  }

  return {
    kind: "elevated_movement_confidence",
    label: `High-confidence movement signal (${input.maxMovementConfidence}%)`,
    detail: `At least one movement signal reaches ${input.maxMovementConfidence}% confidence, crossing the threshold for high-reliability ecological evidence.`,
  };
}

/**
 * Evaluates all ecological correlation rules against the provided input and
 * returns an ordered list of triggered reasons. Rules are applied in a fixed,
 * auditable sequence. Each rule is independent — the output of one rule does
 * not influence whether another rule fires.
 */
export function buildEcologicalCorrelationReasons(
  input: EcologicalCorrelationInput,
): EcologicalCorrelationReason[] {
  const rules = [
    ruleIncreasedSightingRate,
    ruleFeedingAggregation,
    ruleMigrationShift,
    ruleAnomalyWindowOverlap,
    ruleElevatedConfidence,
  ];

  return rules
    .map((rule) => rule(input))
    .filter((reason): reason is EcologicalCorrelationReason => reason !== null);
}
