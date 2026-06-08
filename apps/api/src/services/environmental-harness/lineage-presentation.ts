import type {
  EnvironmentalSignalTrustStatus,
  LiveMarineCondition,
  PublicTrustMetadata,
  ReefStressWatchItem,
} from "@marine/shared";
import { isProductionHarnessMode } from "./freshness-policy";
import type { HarnessPresentationInput } from "./presentation-gate";
import {
  hasReconstructableLineage,
  inferReplayEvidenceFromPersistedLineage,
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

  if (trust.evidenceStatus === "partial" && input.promotionKind === "observation") {
    return "partial";
  }

  if (trust.evidenceStatus === "partial") {
    return "partial";
  }

  return "withheld";
}

function annotateLineageTrust<T extends HarnessPresentationInput>(
  item: T,
  options: { requireReplayLineage?: boolean; promotionKind?: "observation" | "alert" } = {},
): T & PublicTrustMetadata & {
  trustStatus: EnvironmentalSignalTrustStatus;
} {
  const requireReplayLineage = options.requireReplayLineage ?? defaultRequireReplayLineage();
  const trustMetadata = resolvePublicTrustMetadata({
    ...item,
    requireReplayLineage,
    promotionKind: options.promotionKind ?? item.promotionKind,
    replayEvidenceStatus: item.replayEvidenceStatus
      ?? inferReplayEvidenceFromPersistedLineage(item),
  });
  const trustStatus = resolveEnvironmentalSignalTrustStatus({
    ...item,
    requireReplayLineage,
    promotionKind: options.promotionKind ?? item.promotionKind,
    replayEvidenceStatus: trustMetadata.evidenceStatus,
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
    ...condition,
    freshnessClassification: condition.freshnessClassification,
    replayEvidenceStatus: condition.evidenceStatus,
    requireReplayLineage: options.requireReplayLineage,
    promotionKind: "observation",
  }) as LiveMarineCondition;
}

export function annotateReefAlertTrust(
  alert: ReefStressWatchItem,
  options: { requireReplayLineage?: boolean } = {},
): ReefStressWatchItem {
  return annotateLineageTrust({
    ...alert,
    freshnessClassification: alert.freshnessStatus?.classification,
    replayEvidenceStatus: alert.evidenceStatus,
    requireReplayLineage: options.requireReplayLineage,
    promotionKind: "observation",
  }) as ReefStressWatchItem;
}

export function filterTrustedLiveConditions(
  conditions: LiveMarineCondition[],
  options: { requireReplayLineage?: boolean } = {},
): LiveMarineCondition[] {
  const requireReplayLineage = options.requireReplayLineage ?? defaultRequireReplayLineage();

  return conditions
    .map((condition) => annotateLiveConditionTrust(condition, { requireReplayLineage }))
    .filter((condition) => condition.trustedForPromotion === true);
}

export function filterTrustedReefAlerts(
  alerts: ReefStressWatchItem[],
  options: { requireReplayLineage?: boolean } = {},
): ReefStressWatchItem[] {
  const requireReplayLineage = options.requireReplayLineage ?? defaultRequireReplayLineage();

  return alerts
    .map((alert) => annotateReefAlertTrust(alert, { requireReplayLineage }))
    .filter((alert) => alert.trustedForPromotion === true);
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
