import type {
  EnvironmentalSignalProvenance,
  FreshnessClassification,
  FreshnessStatus,
  LiveMarineCondition,
  PublicTrustMetadata,
  ReefStressWatchItem,
  VerificationStatus,
} from "@marine/shared";
import { isSyntheticSource } from "./freshness-policy";

export interface HarnessPresentationInput {
  source?: string | null;
  verificationStatus?: VerificationStatus;
  freshnessStatus?: FreshnessStatus;
  freshnessClassification?: FreshnessClassification;
  provenance?: EnvironmentalSignalProvenance | null;
  provenanceId?: string | null;
  rootEventId?: string | null;
  replayEvidenceStatus?: PublicTrustMetadata["evidenceStatus"];
  requireReplayLineage?: boolean;
}

export function hasRequiredProvenance(input: HarnessPresentationInput): boolean {
  if (input.provenance?.source) {
    return true;
  }

  if (input.source && !isSyntheticSource(input.source)) {
    return !!(input.provenanceId || input.provenance?.contentHash);
  }

  return false;
}

export function hasReconstructableLineage(input: HarnessPresentationInput): boolean {
  if (!input.requireReplayLineage) {
    return true;
  }

  return Boolean(input.rootEventId && input.rootEventId.trim().length > 0);
}

export function resolvePublicTrustMetadata(input: HarnessPresentationInput): PublicTrustMetadata {
  const promotable = canPromoteEnvironmentalSignal(input);
  const lineageOk = hasReconstructableLineage(input);

  let evidenceStatus: PublicTrustMetadata["evidenceStatus"] = input.replayEvidenceStatus ?? "unavailable";

  if (evidenceStatus === "complete" && !lineageOk) {
    evidenceStatus = "partial";
  }

  if (!promotable) {
    return {
      trustedForPromotion: false,
      evidenceStatus: evidenceStatus === "complete" ? "withheld" : evidenceStatus,
      replayCompleteness: lineageOk ? "partial" : "unavailable",
    };
  }

  if (!lineageOk) {
    return {
      trustedForPromotion: false,
      evidenceStatus,
      replayCompleteness: "unavailable",
    };
  }

  if (evidenceStatus === "partial") {
    return {
      trustedForPromotion: false,
      evidenceStatus: "partial",
      replayCompleteness: "partial",
    };
  }

  if (evidenceStatus === "withheld" || evidenceStatus === "unavailable") {
    return {
      trustedForPromotion: false,
      evidenceStatus,
      replayCompleteness: "unavailable",
    };
  }

  return {
    trustedForPromotion: true,
    evidenceStatus: "complete",
    replayCompleteness: "reconstructable",
  };
}

export function canPromoteEnvironmentalSignal(input: HarnessPresentationInput): boolean {
  if (isSyntheticSource(input.source)) {
    return false;
  }

  if (!hasRequiredProvenance(input)) {
    return false;
  }

  if (
    input.verificationStatus === "withheld"
    || input.verificationStatus === "failed"
    || input.verificationStatus === "unverified"
  ) {
    return false;
  }

  if (input.freshnessClassification === "withheld") {
    return false;
  }

  if (input.freshnessStatus?.policyBand === "fail") {
    return false;
  }

  if (input.requireReplayLineage && !hasReconstructableLineage(input)) {
    return false;
  }

  return true;
}

export function filterPromotableLiveConditions(
  conditions: LiveMarineCondition[],
  options: { requireReplayLineage?: boolean } = {},
): LiveMarineCondition[] {
  return conditions.filter((condition) => canPromoteEnvironmentalSignal({
    source: condition.source,
    verificationStatus: condition.verificationStatus,
    freshnessStatus: condition.freshnessStatus,
    freshnessClassification: condition.freshnessClassification,
    provenance: condition.provenance,
    provenanceId: condition.provenanceId,
    rootEventId: (condition as LiveMarineCondition & { rootEventId?: string }).rootEventId,
    replayEvidenceStatus: (condition as LiveMarineCondition & { evidenceStatus?: PublicTrustMetadata["evidenceStatus"] }).evidenceStatus,
    requireReplayLineage: options.requireReplayLineage,
  }));
}

export function filterPromotableReefAlerts(
  alerts: ReefStressWatchItem[],
  options: { requireReplayLineage?: boolean } = {},
): ReefStressWatchItem[] {
  return alerts.filter((alert) => canPromoteEnvironmentalSignal({
    source: alert.source,
    verificationStatus: alert.verificationStatus,
    freshnessStatus: alert.freshnessStatus,
    freshnessClassification: alert.freshnessStatus?.classification,
    provenance: alert.provenance,
    rootEventId: (alert as ReefStressWatchItem & { rootEventId?: string }).rootEventId,
    replayEvidenceStatus: (alert as ReefStressWatchItem & { evidenceStatus?: PublicTrustMetadata["evidenceStatus"] }).evidenceStatus,
    requireReplayLineage: options.requireReplayLineage,
  }));
}

export function annotatePublicTrust<T extends HarnessPresentationInput>(
  item: T,
): T & PublicTrustMetadata {
  return {
    ...item,
    ...resolvePublicTrustMetadata(item),
  };
}
