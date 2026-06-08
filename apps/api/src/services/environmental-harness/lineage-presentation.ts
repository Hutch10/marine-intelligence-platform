import type {
  EnvironmentalSignalTrustStatus,
  LiveMarineCondition,
  PublicTrustMetadata,
  ReefStressWatchItem,
} from "@marine/shared";
import { isProductionHarnessMode } from "./freshness-policy";
import type { HarnessPresentationInput } from "./presentation-gate";
import {
  canPromoteEnvironmentalSignal,
  hasReconstructableLineage,
  resolvePublicTrustMetadata,
} from "./presentation-gate";

export function defaultRequireReplayLineage(): boolean {
  return isProductionHarnessMode();
}

export function resolveEnvironmentalSignalTrustStatus(
  input: HarnessPresentationInput,
): EnvironmentalSignalTrustStatus {
  const trust = resolvePublicTrustMetadata({
    ...input,
    requireReplayLineage: input.requireReplayLineage ?? defaultRequireReplayLineage(),
  });

  if (trust.trustedForPromotion) {
    return "trusted";
  }

  if (!hasReconstructableLineage({
    ...input,
    requireReplayLineage: true,
  })) {
    return "unverified_lineage";
  }

  if (trust.evidenceStatus === "partial") {
    return "partial";
  }

  return "withheld";
}

function annotateLineageTrust<T extends HarnessPresentationInput>(
  item: T,
  options: { requireReplayLineage?: boolean } = {},
): T & PublicTrustMetadata & {
  trustStatus: EnvironmentalSignalTrustStatus;
} {
  const requireReplayLineage = options.requireReplayLineage ?? defaultRequireReplayLineage();
  const trustMetadata = resolvePublicTrustMetadata({
    ...item,
    requireReplayLineage,
  });
  const trustStatus = resolveEnvironmentalSignalTrustStatus({
    ...item,
    requireReplayLineage,
  });

  return {
    ...item,
    ...trustMetadata,
    trustStatus,
  };
}

export function annotateLiveConditionTrust(
  condition: LiveMarineCondition,
  options: { requireReplayLineage?: boolean } = {},
): LiveMarineCondition {
  return annotateLineageTrust({
    source: condition.source,
    verificationStatus: condition.verificationStatus,
    freshnessStatus: condition.freshnessStatus,
    freshnessClassification: condition.freshnessClassification,
    provenance: condition.provenance,
    provenanceId: condition.provenanceId,
    rootEventId: condition.rootEventId,
    replayEvidenceStatus: condition.evidenceStatus,
    requireReplayLineage: options.requireReplayLineage,
    ...condition,
  });
}

export function annotateReefAlertTrust(
  alert: ReefStressWatchItem,
  options: { requireReplayLineage?: boolean } = {},
): ReefStressWatchItem {
  return annotateLineageTrust({
    source: alert.source,
    verificationStatus: alert.verificationStatus,
    freshnessStatus: alert.freshnessStatus,
    freshnessClassification: alert.freshnessStatus?.classification,
    provenance: alert.provenance,
    rootEventId: alert.rootEventId,
    replayEvidenceStatus: alert.evidenceStatus,
    requireReplayLineage: options.requireReplayLineage,
    ...alert,
  });
}

export function filterTrustedLiveConditions(
  conditions: LiveMarineCondition[],
  options: { requireReplayLineage?: boolean } = {},
): LiveMarineCondition[] {
  const requireReplayLineage = options.requireReplayLineage ?? defaultRequireReplayLineage();

  return conditions
    .map((condition) => annotateLiveConditionTrust(condition, { requireReplayLineage }))
    .filter((condition) => canPromoteEnvironmentalSignal({
      source: condition.source,
      verificationStatus: condition.verificationStatus,
      freshnessStatus: condition.freshnessStatus,
      freshnessClassification: condition.freshnessClassification,
      provenance: condition.provenance,
      provenanceId: condition.provenanceId,
      rootEventId: condition.rootEventId,
      replayEvidenceStatus: condition.evidenceStatus,
      requireReplayLineage,
    }));
}

export function filterTrustedReefAlerts(
  alerts: ReefStressWatchItem[],
  options: { requireReplayLineage?: boolean } = {},
): ReefStressWatchItem[] {
  const requireReplayLineage = options.requireReplayLineage ?? defaultRequireReplayLineage();

  return alerts
    .map((alert) => annotateReefAlertTrust(alert, { requireReplayLineage }))
    .filter((alert) => canPromoteEnvironmentalSignal({
      source: alert.source,
      verificationStatus: alert.verificationStatus,
      freshnessStatus: alert.freshnessStatus,
      freshnessClassification: alert.freshnessStatus?.classification,
      provenance: alert.provenance,
      rootEventId: alert.rootEventId,
      replayEvidenceStatus: alert.evidenceStatus,
      requireReplayLineage,
    }));
}

export function annotateUntrustedLiveConditions(
  conditions: LiveMarineCondition[],
  options: { requireReplayLineage?: boolean } = {},
): LiveMarineCondition[] {
  return conditions.map((condition) => annotateLiveConditionTrust(condition, options));
}

export function annotateUntrustedReefAlerts(
  alerts: ReefStressWatchItem[],
  options: { requireReplayLineage?: boolean } = {},
): ReefStressWatchItem[] {
  return alerts.map((alert) => annotateReefAlertTrust(alert, options));
}
