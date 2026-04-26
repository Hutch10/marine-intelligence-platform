import { IntegrityStatus, SystemIntegrityStatus } from "./types";

export const CAP_THRESHOLD = 0.7;

export type TrustMode = "SHOW" | "CAPPED" | "WITHHELD";

export interface ConfidenceResult {
  mode: TrustMode;
  value: number | null;
  label: string;
  reason: string;
  tone: "neutral" | "info" | "warning" | "critical";
}

/**
 * Advesarially Hardened Confidence Evaluator
 *
 * Rules:
 * 1. Context MUST exist (local or global).
 * 2. REJECTED / TRUST_BLOCKED -> WITHHELD (null value).
 * 3. Confidence MUST be a finite number between 0 and 1.
 * 4. UNVERIFIED / DEGRADED -> capped at 0.7.
 */
export function evaluateConfidence(
  confidence: unknown,
  localStatus: IntegrityStatus | SystemIntegrityStatus | string | undefined,
  globalStatus: SystemIntegrityStatus | string | undefined
): ConfidenceResult {
  if (!localStatus && !globalStatus) {
    return {
      mode: "WITHHELD",
      value: null,
      label: "WITHHELD",
      reason: "MISSING_CONTEXT",
      tone: "critical",
    };
  }

  const isBlocked =
    localStatus === SystemIntegrityStatus.TRUST_BLOCKED ||
    globalStatus === SystemIntegrityStatus.TRUST_BLOCKED;
  const isRejected = localStatus === IntegrityStatus.REJECTED;

  if (isBlocked || isRejected) {
    return {
      mode: "WITHHELD",
      value: null,
      label: isBlocked ? "TRUST_BLOCKED" : "REJECTED",
      reason: "INTEGRITY_FAIL",
      tone: "critical",
    };
  }

  const effectiveStatus = localStatus || globalStatus;

  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return {
      mode: "WITHHELD",
      value: null,
      label: "WITHHELD",
      reason: "INVALID_INPUT_TYPE",
      tone: "neutral",
    };
  }

  const normalizedConfidence = Math.max(0, Math.min(1, confidence));

  const isUnverified = effectiveStatus === IntegrityStatus.UNVERIFIED;
  const isDegraded = effectiveStatus === SystemIntegrityStatus.DEGRADED;

  if (isUnverified || isDegraded) {
    return {
      mode: "CAPPED",
      value: Math.min(normalizedConfidence, CAP_THRESHOLD),
      label: "(CAPPED)",
      reason: isUnverified ? "STATUS_UNVERIFIED" : "STATUS_DEGRADED",
      tone: "warning",
    };
  }

  return {
    mode: "SHOW",
    value: normalizedConfidence,
    label: "",
    reason: "VERIFIED",
    tone: "info",
  };
}

/**
 * Central authoritative logic for deriving the system-wide integrity status
 * from the calculated partition purity ratio.
 */
export const INTEGRITY_THRESHOLDS = {
  TRUST_BLOCKED: 0.7,
  DEGRADED: 0.9,
};

export function deriveSystemIntegrity(purityRatio: number): SystemIntegrityStatus {
  if (purityRatio < INTEGRITY_THRESHOLDS.TRUST_BLOCKED) {
    return SystemIntegrityStatus.TRUST_BLOCKED;
  }
  if (purityRatio < INTEGRITY_THRESHOLDS.DEGRADED) {
    return SystemIntegrityStatus.DEGRADED;
  }
  return SystemIntegrityStatus.NORMAL;
}

/**
 * Derives a status from local context.
 */
export function deriveIntegrityStatus(
  context?: {
    status?: IntegrityStatus | SystemIntegrityStatus | string;
    purity?: number;
    exclusionCount?: number;
  },
  globalFallback?: SystemIntegrityStatus
): SystemIntegrityStatus | IntegrityStatus | string | undefined {
  if (context?.status) return context.status;

  if (typeof context?.purity !== "number" || !Number.isFinite(context.purity)) {
    return globalFallback;
  }

  if (context.purity < 0.7 || (context.exclusionCount && context.exclusionCount > 25)) {
    return SystemIntegrityStatus.TRUST_BLOCKED;
  }

  if (context.purity < 0.95 || (context.exclusionCount && context.exclusionCount > 5)) {
    return SystemIntegrityStatus.DEGRADED;
  }

  return IntegrityStatus.VERIFIED;
}
