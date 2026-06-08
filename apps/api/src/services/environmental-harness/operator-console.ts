import type {
  AlertValidationEvent,
  IngestionEvent,
  OperatorConsoleHarnessSection,
  OperatorHumanReviewItem,
  OperatorPublicationDecisionItem,
  OperatorReplayCompletenessItem,
  PublicationHarnessEvent,
} from "@marine/shared";
import type { AsyncDbAdapter } from "../../db/async-client";
import {
  readRecentHarnessEventsByKind,
  readLatestHarnessEventByKind,
  countRecentHarnessEventsByKind,
  type HarnessEventRecord,
} from "../../repositories/environmental-harness-events";
import { readReviewQueueItems, toReviewQueueItem } from "../../repositories/environmental-review-queue";
import { buildOperationalAlertsRouteResponse } from "../../routes/operational-alerts";
import {
  generateReplayPacketForAlertId,
  generateReplayPacketForSignalId,
} from "./replay";
import { runReplayValidationJob } from "./replay-validation";

export interface OperatorConsoleDependencies {
  getAdapter?: () => AsyncDbAdapter;
  replaySampleLimit?: number;
}

function parsePayload<T>(event: HarnessEventRecord): T | null {
  try {
    return JSON.parse(event.payloadJson) as T;
  } catch {
    return null;
  }
}

function mapIngestionRun(event: HarnessEventRecord): OperatorConsoleHarnessSection["latestIngestionRuns"][number] {
  const payload = parsePayload<IngestionEvent & { signalId?: string }>(event);

  return {
    eventId: event.id,
    source: payload?.source ?? event.subjectId,
    outcome: event.outcome,
    completedAt: payload?.completedAt ?? new Date(event.createdAt).toISOString(),
    signalId: event.signalId,
    rootEventId: event.rootEventId,
  };
}

function mapPublicationDecision(event: HarnessEventRecord): OperatorPublicationDecisionItem {
  const payload = parsePayload<PublicationHarnessEvent>(event);
  const publicationReconstructable = event.rootEventId.length > 0 && event.outcome === "published";

  return {
    alertId: payload?.alertId ?? event.alertId ?? event.subjectId,
    signalId: payload?.signalId ?? event.signalId,
    rootEventId: event.rootEventId,
    lifecycleStatus: payload?.lifecycleStatus ?? "withheld",
    outcome: event.outcome,
    evaluatedAt: payload?.evaluatedAt ?? new Date(event.createdAt).toISOString(),
    publicationReconstructable,
  };
}

function mapHumanReview(event: HarnessEventRecord): OperatorHumanReviewItem {
  const payload = parsePayload<{ action?: string; evaluatedAt?: string }>(event);

  return {
    eventId: event.id,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    action: payload?.action ?? "unknown",
    outcome: event.outcome,
    evaluatedAt: payload?.evaluatedAt ?? new Date(event.createdAt).toISOString(),
    rootEventId: event.rootEventId,
  };
}

function mapSuppressedAlert(event: HarnessEventRecord): OperatorConsoleHarnessSection["alerts"]["suppressed"][number] {
  const payload = parsePayload<AlertValidationEvent>(event);

  return {
    alertKey: payload?.alertKey ?? event.subjectId,
    source: payload?.source ?? "unknown",
    ruleType: payload?.ruleType ?? "unknown",
    reason: payload?.lifecycleStatus ?? event.outcome,
    evaluatedAt: payload?.evaluatedAt ?? new Date(event.createdAt).toISOString(),
  };
}

async function buildReplayCompleteness(
  signalIds: string[],
  alertIds: string[],
  dependencies: OperatorConsoleDependencies,
): Promise<OperatorReplayCompletenessItem[]> {
  const replayDeps = dependencies.getAdapter ? { getAdapter: dependencies.getAdapter } : {};
  const items: OperatorReplayCompletenessItem[] = [];

  for (const signalId of signalIds) {
    const replay = await generateReplayPacketForSignalId(signalId, replayDeps);
    if (replay.status !== "available") {
      items.push({
        targetKind: "signal",
        targetId: signalId,
        rootEventId: null,
        evidenceStatus: "unavailable",
        withheldSections: [],
        packetId: null,
        replayAvailable: false,
      });
      continue;
    }

    items.push({
      targetKind: "signal",
      targetId: signalId,
      rootEventId: replay.packet.lineage[0]?.rootEventId ?? null,
      evidenceStatus: replay.packet.evidenceStatus,
      withheldSections: replay.packet.withheldSections,
      packetId: replay.packet.packetId,
      replayAvailable: true,
    });
  }

  for (const alertId of alertIds) {
    const replay = await generateReplayPacketForAlertId(alertId, replayDeps);
    if (replay.status !== "available") {
      items.push({
        targetKind: "alert",
        targetId: alertId,
        rootEventId: null,
        evidenceStatus: "unavailable",
        withheldSections: [],
        packetId: null,
        replayAvailable: false,
      });
      continue;
    }

    items.push({
      targetKind: "alert",
      targetId: alertId,
      rootEventId: replay.packet.lineage[0]?.rootEventId ?? null,
      evidenceStatus: replay.packet.evidenceStatus,
      withheldSections: replay.packet.withheldSections,
      packetId: replay.packet.packetId,
      replayAvailable: true,
    });
  }

  return items;
}

function buildEmptyOperatorConsoleHarnessSection(): OperatorConsoleHarnessSection {
  const generatedAt = new Date().toISOString();

  return {
    latestIngestionRuns: [],
    verificationStatus: {
      latestOutcome: null,
      latestEvaluatedAt: null,
      recentCount: 0,
    },
    replayCompleteness: [],
    replayValidation: {
      generatedAt,
      sampleCount: 0,
      passedCount: 0,
      failedCount: 0,
      overallPass: false,
      samples: [],
    },
    publicationDecisions: [],
    humanReviewActions: [],
    reviewQueue: { pendingCount: 0, items: [] },
    alerts: {
      activeCount: 0,
      suppressedCount: 0,
      active: [],
      suppressed: [],
    },
  };
}

export async function buildOperatorConsoleHarnessSection(
  dependencies: OperatorConsoleDependencies = {},
): Promise<OperatorConsoleHarnessSection> {
  try {
    return await buildOperatorConsoleHarnessSectionInner(dependencies);
  } catch {
    return buildEmptyOperatorConsoleHarnessSection();
  }
}

async function buildOperatorConsoleHarnessSectionInner(
  dependencies: OperatorConsoleDependencies = {},
): Promise<OperatorConsoleHarnessSection> {
  const adapterDeps = dependencies.getAdapter ? { getAdapter: dependencies.getAdapter } : {};
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const [
    ingestionEvents,
    verificationLatest,
    verificationCount,
    publicationEvents,
    reviewEvents,
    suppressedEvents,
    pendingReview,
    alertsResponse,
    replayValidation,
  ] = await Promise.all([
    readRecentHarnessEventsByKind("ingestion", 12, adapterDeps),
    readLatestHarnessEventByKind("verification", adapterDeps),
    countRecentHarnessEventsByKind("verification", sinceMs, adapterDeps),
    readRecentHarnessEventsByKind("publication", 12, adapterDeps),
    readRecentHarnessEventsByKind("human_review", 12, adapterDeps),
    readRecentHarnessEventsByKind("alert_validation", 20, adapterDeps),
    readReviewQueueItems({ status: "pending_review", limit: 25 }, adapterDeps),
    buildOperationalAlertsRouteResponse(undefined, { limit: 40 }),
    runReplayValidationJob({
      getAdapter: dependencies.getAdapter,
      sampleLimit: dependencies.replaySampleLimit ?? 6,
    }),
  ]);

  const suppressed = suppressedEvents
    .filter((event) => event.outcome === "rejected" || event.outcome === "withheld")
    .slice(0, 12)
    .map(mapSuppressedAlert);

  const signalIds = [...new Set(
    ingestionEvents.map((event) => event.signalId).filter((id): id is string => Boolean(id)),
  )].slice(0, 6);

  const alertIds = [...new Set(
    publicationEvents.map((event) => event.alertId).filter((id): id is string => Boolean(id)),
  )].slice(0, 6);

  const replayCompleteness = await buildReplayCompleteness(signalIds, alertIds, dependencies);

  const activeAlerts = (alertsResponse.json.active_alerts ?? []).map((alert) => ({
    id: alert.id,
    source: alert.source,
    ruleType: alert.rule_type,
    severity: alert.severity,
    title: alert.title,
  }));

  return {
    latestIngestionRuns: ingestionEvents.map(mapIngestionRun),
    verificationStatus: {
      latestOutcome: verificationLatest?.outcome ?? null,
      latestEvaluatedAt: verificationLatest
        ? new Date(verificationLatest.createdAt).toISOString()
        : null,
      recentCount: verificationCount,
    },
    replayCompleteness,
    replayValidation,
    publicationDecisions: publicationEvents.map(mapPublicationDecision),
    humanReviewActions: reviewEvents.map(mapHumanReview),
    reviewQueue: {
      pendingCount: pendingReview.length,
      items: pendingReview.map(toReviewQueueItem),
    },
    alerts: {
      activeCount: activeAlerts.length,
      suppressedCount: suppressed.length,
      active: activeAlerts,
      suppressed,
    },
  };
}
