import type {
  InvestigationSpeciesCorrelationReason,
  InvestigationSpeciesResponseTier,
  InvestigationSpeciesSummaryEntry,
  SpeciesMovementType,
} from "@marine/shared";

interface SpeciesCorrelationInput {
  speciesId: string;
  commonName: string;
  scientificName: string;
  movementSignalCount: number;
  verifiedSightingCount: number;
  pendingVerificationCount: number;
  matchedStationCount: number;
  lastObservedAt: string | null;
  maxMovementConfidence: number;
  movementTypes: SpeciesMovementType[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMovementType(value: SpeciesMovementType): string {
  return value.replace(/_/g, " ");
}

function formatObservedAt(value: string | null): string {
  if (!value) {
    return "No recent observation timestamp available.";
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return "Recent observation timestamp is unavailable.";
  }

  return `Most recent observation at ${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")} UTC.`;
}

export function calculateInvestigationSpeciesRelevance(input: Omit<SpeciesCorrelationInput, "speciesId" | "commonName" | "scientificName">): number {
  const movementSignalScore = input.movementSignalCount * 18;
  const confidenceScore = Math.round(input.maxMovementConfidence * 0.35);
  const verifiedScore = input.verifiedSightingCount * 16;
  const pendingScore = input.pendingVerificationCount * 7;
  const stationOverlapScore = input.matchedStationCount * 12;

  return clamp(
    movementSignalScore + confidenceScore + verifiedScore + pendingScore + stationOverlapScore,
    0,
    100,
  );
}

export function deriveInvestigationSpeciesResponseTier(
  relevanceScore: number,
): InvestigationSpeciesResponseTier {
  if (relevanceScore >= 75) {
    return "priority";
  }

  if (relevanceScore >= 45) {
    return "elevated";
  }

  return "watch";
}

export function buildInvestigationSpeciesReasonTrail(
  input: Omit<SpeciesCorrelationInput, "speciesId" | "commonName" | "scientificName">,
): InvestigationSpeciesCorrelationReason[] {
  const reasons: InvestigationSpeciesCorrelationReason[] = [];

  if (input.movementSignalCount > 0) {
    const movementLabel = input.movementTypes.length > 0
      ? formatMovementType(input.movementTypes[0])
      : "movement activity";

    reasons.push({
      kind: "linked_movement_signal",
      label: `${input.movementSignalCount} linked movement signal${input.movementSignalCount === 1 ? "" : "s"}`,
      detail: `Primary movement pattern: ${movementLabel}. Max confidence ${input.maxMovementConfidence}%.`,
    });
  }

  if (input.verifiedSightingCount > 0) {
    reasons.push({
      kind: "verified_sighting",
      label: `${input.verifiedSightingCount} verified sighting${input.verifiedSightingCount === 1 ? "" : "s"}`,
      detail: "Verified field observations align this species with the active investigation context.",
    });
  }

  if (input.pendingVerificationCount > 0) {
    reasons.push({
      kind: "pending_verification",
      label: `${input.pendingVerificationCount} pending verification`,
      detail: "New ecological observations are waiting for review before they are promoted into the evidence trail.",
    });
  }

  if (input.matchedStationCount > 0) {
    reasons.push({
      kind: "station_overlap",
      label: `${input.matchedStationCount} station overlap${input.matchedStationCount === 1 ? "" : "s"}`,
      detail: "Species sightings share stations with signals already linked to this investigation.",
    });
  }

  reasons.push({
    kind: "recent_observation",
    label: input.lastObservedAt ? "Recent observation window" : "Observation gap",
    detail: formatObservedAt(input.lastObservedAt),
  });

  return reasons;
}

export function createInvestigationSpeciesSummaryEntry(
  input: SpeciesCorrelationInput,
): InvestigationSpeciesSummaryEntry {
  const relevanceScore = calculateInvestigationSpeciesRelevance(input);

  return {
    speciesId: input.speciesId,
    commonName: input.commonName,
    scientificName: input.scientificName,
    movementSignalCount: input.movementSignalCount,
    verifiedSightingCount: input.verifiedSightingCount,
    pendingVerificationCount: input.pendingVerificationCount,
    matchedStationCount: input.matchedStationCount,
    lastObservedAt: input.lastObservedAt,
    maxMovementConfidence: input.maxMovementConfidence,
    relevanceScore,
    responseTier: deriveInvestigationSpeciesResponseTier(relevanceScore),
    reasonTrail: buildInvestigationSpeciesReasonTrail(input),
  };
}
