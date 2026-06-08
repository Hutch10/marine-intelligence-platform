import type {
  AlertValidationEvent,
  VerificationStatus,
} from "@marine/shared";
import type { LiveIngestionSourceHealthStatus } from "../../repositories/live-ingestion-reports";
import { auditAlertValidation } from "./audit";
import { stableContentHash } from "./provenance";
import { buildHarnessEventId } from "./provenance";

export interface AlertPublishVerificationContext {
  feedHealthGeneratedAt?: string | null;
  sourceStatus?: LiveIngestionSourceHealthStatus | null;
}

export function buildAlertVerificationMetadata(
  context: AlertPublishVerificationContext,
): { verificationStatus: VerificationStatus; harnessVerification: Record<string, unknown> } {
  const sourceStatus = context.sourceStatus;
  let verificationStatus: VerificationStatus = "verified";

  if (!sourceStatus) {
    verificationStatus = "unverified";
  } else if (sourceStatus.status === "failed" || sourceStatus.workerStatus === "failed") {
    verificationStatus = "withheld";
  } else if (sourceStatus.isStale) {
    verificationStatus = "failed";
  }

  return {
    verificationStatus,
    harnessVerification: {
      verifiedAt: new Date().toISOString(),
      feedHealthGeneratedAt: context.feedHealthGeneratedAt ?? null,
      source: sourceStatus?.source ?? null,
      sourceStatus: sourceStatus?.status ?? null,
      workerStatus: sourceStatus?.workerStatus ?? null,
      isStale: sourceStatus?.isStale ?? null,
      verificationStatus,
      contentHash: stableContentHash({
        feedHealthGeneratedAt: context.feedHealthGeneratedAt ?? null,
        source: sourceStatus?.source ?? null,
        status: sourceStatus?.status ?? null,
        isStale: sourceStatus?.isStale ?? null,
      }),
    },
  };
}

export async function gateAlertPublish(input: {
  alertKey: string;
  alertId?: string;
  source: string;
  ruleType: string;
  signalId?: string | null;
  context: AlertPublishVerificationContext;
  lineage?: {
    parentEventId?: string | null;
    rootEventId?: string | null;
  };
}): Promise<{ allowed: boolean; metadata: Record<string, unknown>; validationEventId: string | null }> {
  const { verificationStatus, harnessVerification } = buildAlertVerificationMetadata(input.context);
  const allowed = verificationStatus === "verified";

  const validationEvent: AlertValidationEvent = {
    eventId: buildHarnessEventId(
      "alert_validation",
      "operational_alert",
      input.alertKey,
      stableContentHash({
        alertKey: input.alertKey,
        source: input.source,
        ruleType: input.ruleType,
        verificationStatus,
      }),
    ),
    alertKey: input.alertKey,
    source: input.source,
    ruleType: input.ruleType,
    lifecycleStatus: allowed ? "published" : "rejected",
    verificationStatus,
    feedHealthGeneratedAt: input.context.feedHealthGeneratedAt ?? null,
    outcome: allowed ? "published" : "rejected",
    evaluatedAt: new Date().toISOString(),
  };

  let validationEventId: string | null = null;

  try {
    validationEventId = await auditAlertValidation(validationEvent, {
      parentEventId: input.lineage?.parentEventId ?? null,
      rootEventId: input.lineage?.rootEventId ?? undefined,
      signalId: input.signalId ?? null,
      alertId: input.alertId ?? null,
    });
  } catch {
    // Harness audit is best-effort when storage is unavailable.
  }

  return {
    allowed,
    validationEventId,
    metadata: {
      harnessVerification,
      verificationStatus,
    },
  };
}
