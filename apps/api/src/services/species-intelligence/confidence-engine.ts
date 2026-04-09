import type { VerificationState } from "@marine/shared";

export type EvidenceSourceType =
  | "satellite"
  | "sensor"
  | "field_survey"
  | "model"
  | "manual_sighting"
  | "historical_record"
  | "unknown";

const SOURCE_ACCURACY_WEIGHTS: Record<EvidenceSourceType, number> = {
  satellite: 0.95,
  sensor: 0.9,
  field_survey: 0.85,
  model: 0.7,
  manual_sighting: 0.6,
  historical_record: 0.5,
  unknown: 0.3,
};

export interface ConfidenceInput {
  sourceType: EvidenceSourceType;
  observedAt: string;
  verificationState: VerificationState;
}

export function calculateConfidenceScore(input: ConfidenceInput): number {
  if (input.verificationState === "unknown") return 0.1;
  
  // Base score from source
  let score = SOURCE_ACCURACY_WEIGHTS[input.sourceType] || 0.3;

  // Recency penalty
  const ageMs = Date.now() - new Date(input.observedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays > 30) {
    score *= 0.4; // Sharp drop for data older than a month
  } else if (ageDays > 7) {
    score *= 0.7;
  } else if (ageDays > 1) {
    score *= 0.9;
  }

  // Verification state multipliers
  if (input.verificationState === "observed") {
    score = Math.min(1.0, score + 0.05); // Bonus for direct observation
  } else if (input.verificationState === "modeled") {
    score *= 0.8; // Penalty for purely modeled data
  } else if (input.verificationState === "estimated") {
    score *= 0.9;
  }

  return Math.round(score * 100) / 100;
}

export function calculateCoverageScore(count: number, expected: number): number {
  if (expected <= 0) return 0;
  const ratio = count / expected;
  return Math.min(1.0, Math.round(ratio * 100) / 100);
}

export function summarizeConfidence(score: number): string {
  if (score >= 80) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

export function getConfidenceLevel(score: number): string {
  const normScore = score > 1 ? score / 100 : score;
  if (normScore >= 0.9) return "Certain";
  if (normScore >= 0.7) return "High";
  if (normScore >= 0.4) return "Moderate";
  return "Low/Uncertain";
}
