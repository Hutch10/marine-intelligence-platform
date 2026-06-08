import type {
  FreshnessClassification,
  FreshnessPolicyBand,
  FreshnessStatus,
  VerificationStatus,
} from "@marine/shared";

export const NDBC_API_STALE_MS = 6 * 60 * 60 * 1000;
export const CRW_WARN_MS = 48 * 60 * 60 * 1000;
export const CRW_FAIL_MS = 72 * 60 * 60 * 1000;

export function isSyntheticSource(source: string | null | undefined): boolean {
  if (!source) {
    return false;
  }

  const normalized = source.trim().toLowerCase();
  return normalized.startsWith("synthetic") || normalized === "mock";
}

export function classifyNdbcFreshness(
  observedAtMs: number,
  nowMs = Date.now(),
  source = "noaa_ndbc",
): FreshnessStatus {
  const ageMs = Math.max(0, nowMs - observedAtMs);
  let classification: FreshnessClassification = "live";
  let policyBand: FreshnessPolicyBand = "pass";

  if (isSyntheticSource(source)) {
    classification = "withheld";
    policyBand = "fail";
  } else if (ageMs > NDBC_API_STALE_MS) {
    classification = "stale";
    policyBand = "fail";
  }

  return {
    classification,
    ageMs,
    thresholdMs: NDBC_API_STALE_MS,
    policyBand,
    evaluatedAt: new Date(nowMs).toISOString(),
    source,
  };
}

export function classifyCrwFreshness(
  productDateMs: number,
  nowMs = Date.now(),
  source = "noaa_crw",
): FreshnessStatus {
  const ageMs = Math.max(0, nowMs - productDateMs);
  let classification: FreshnessClassification = "live";
  let policyBand: FreshnessPolicyBand = "pass";

  if (isSyntheticSource(source)) {
    classification = "withheld";
    policyBand = "fail";
  } else if (ageMs > CRW_FAIL_MS) {
    classification = "withheld";
    policyBand = "fail";
  } else if (ageMs > CRW_WARN_MS) {
    classification = "stale";
    policyBand = "warn";
  }

  return {
    classification,
    ageMs,
    thresholdMs: CRW_FAIL_MS,
    policyBand,
    evaluatedAt: new Date(nowMs).toISOString(),
    source,
  };
}

export function verificationStatusFromFreshness(
  freshness: FreshnessStatus,
): VerificationStatus {
  if (isSyntheticSource(freshness.source)) {
    return "withheld";
  }

  if (freshness.policyBand === "fail") {
    return freshness.classification === "withheld" ? "withheld" : "failed";
  }

  if (freshness.classification === "unknown") {
    return "unverified";
  }

  return "verified";
}

export function isProductionHarnessMode(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL;
}
