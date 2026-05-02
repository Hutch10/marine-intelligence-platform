import type { RiskScoreResponse } from "@marine/shared";

export type ContradictionSeverity = "CONFLICTING_SIGNALS" | "INSUFFICIENT_DATA" | "UNKNOWN" | "LOW_RISK";

const CONTRADICTION_PRIORITY: ContradictionSeverity[] = [
  "CONFLICTING_SIGNALS",
  "INSUFFICIENT_DATA",
  "UNKNOWN",
  "LOW_RISK",
];

export function resolveContradictionSeverity(levels: ContradictionSeverity[]): ContradictionSeverity {
  for (const priority of CONTRADICTION_PRIORITY) {
    if (levels.includes(priority)) {
      return priority;
    }
  }
  return "LOW_RISK";
}

export function toFailClosedPublicRiskLevel(
  level: RiskScoreResponse["overallRisk"],
): RiskScoreResponse["overallRisk"] {
  if (level === "conflicting_signals" || level === "insufficient_data") {
    return "unknown";
  }
  return level;
}
