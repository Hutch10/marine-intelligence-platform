import type {
  AlertValidationEvent,
  FreshnessStatus,
  HumanReviewEvent,
  IngestionEvent,
  PublicationHarnessEvent,
  SchedulerExecutionEvent,
  VerificationEvent,
} from "@marine/shared";
import type { LiveFeedIngestionReport } from "../../workers/ingest-live-feeds";
import type { LiveIngestionPersistResult } from "../../repositories/live-ingestion-reports";
import { recordHarnessEvent } from "../../repositories/environmental-harness-events";
import { buildHarnessEventId, stableContentHash } from "./provenance";
import { buildSourceScopeSignalId } from "./lineage";

async function safeRecordHarnessEvent(
  input: Parameters<typeof recordHarnessEvent>[0],
  dependencies: { getAdapter?: Parameters<typeof recordHarnessEvent>[1]["getAdapter"]; now?: () => number } = {},
): Promise<string | null> {
  try {
    return await recordHarnessEvent(input, dependencies);
  } catch {
    return null;
  }
}

export async function auditIngestionReport(
  report: LiveFeedIngestionReport,
  persistResult?: LiveIngestionPersistResult,
): Promise<void> {
  for (const run of report.runs) {
    const signalId = buildSourceScopeSignalId(run.source, run.run_id, run.started_at);
    const payload: IngestionEvent = {
      eventId: buildHarnessEventId(
        "ingestion",
        "source",
        run.source,
        stableContentHash({
          source: run.source,
          status: run.status,
          started_at: run.started_at,
          inserted_count: run.inserted_count,
          rejected_count: run.rejected_count,
        }),
      ),
      source: run.source,
      runId: run.run_id,
      status: run.status === "success" ? "success" : run.status === "failed" ? "failed" : "degraded",
      insertedCount: run.inserted_count,
      rejectedCount: run.rejected_count,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      outcome: run.status === "failed" ? "fail" : run.status === "partial" ? "warn" : "pass",
    };

    const ingestionEventId = await safeRecordHarnessEvent({
      eventKind: "ingestion",
      eventType: "ingestion",
      subjectType: "source",
      subjectId: run.source,
      signalId,
      outcome: payload.outcome,
      payload: {
        ...payload,
        signalId,
      } as unknown as Record<string, unknown>,
    });

    if (ingestionEventId) {
      await auditVerificationForIngestion({
        parentEventId: ingestionEventId,
        rootEventId: ingestionEventId,
        signalId,
        source: run.source,
        runId: run.run_id,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        outcome: payload.outcome,
      });
    }
  }

  if (persistResult?.workerRunId) {
    const schedulerPayload: SchedulerExecutionEvent = {
      eventId: buildHarnessEventId(
        "scheduler_execution",
        "worker_run",
        persistResult.workerRunId,
        stableContentHash({
          workerRunId: persistResult.workerRunId,
          status: report.status,
          started_at: report.started_at,
          completed_at: report.completed_at,
        }),
      ),
      workerRunId: persistResult.workerRunId,
      trigger: process.env.GITHUB_ACTIONS ? "github_actions" : "in_process_scheduler",
      status: report.status === "success" ? "success" : report.status === "failed" ? "failed" : "degraded",
      startedAt: report.started_at,
      completedAt: report.completed_at,
      sourceCount: report.runs.length,
      outcome: report.status === "failed" ? "fail" : report.status === "partial" ? "warn" : "pass",
    };

    await safeRecordHarnessEvent({
      eventKind: "scheduler_execution",
      eventType: "ingestion",
      subjectType: "worker_run",
      subjectId: persistResult.workerRunId,
      outcome: schedulerPayload.outcome,
      payload: schedulerPayload as unknown as Record<string, unknown>,
    });
  }
}

export async function auditVerificationForIngestion(
  input: {
    parentEventId: string;
    rootEventId: string;
    signalId: string;
    source: string;
    runId: string | null;
    startedAt: string;
    completedAt: string;
    outcome: VerificationEvent["outcome"];
  },
  dependencies: { getAdapter?: Parameters<typeof recordHarnessEvent>[1]["getAdapter"] } = {},
): Promise<string | null> {
  const payload: VerificationEvent = {
    eventId: buildHarnessEventId(
      "verification",
      "signal",
      input.signalId,
      stableContentHash({
        signalId: input.signalId,
        source: input.source,
        runId: input.runId,
        outcome: input.outcome,
      }),
    ),
    subject: input.signalId,
    check: "ingestion_verification",
    outcome: input.outcome,
    detail: `source=${input.source}; runId=${input.runId ?? "null"}`,
    evaluatedAt: input.completedAt,
  };

  return safeRecordHarnessEvent({
    eventKind: "verification",
    eventType: "verification",
    subjectType: "signal",
    subjectId: input.signalId,
    parentEventId: input.parentEventId,
    rootEventId: input.rootEventId,
    signalId: input.signalId,
    outcome: input.outcome,
    payload: payload as unknown as Record<string, unknown>,
  }, dependencies);
}

export async function auditFreshnessEvaluation(input: {
  parentEventId: string;
  rootEventId: string;
  signalId: string;
  evaluation: FreshnessStatus;
}): Promise<string | null> {
  return safeRecordHarnessEvent({
    eventKind: "freshness",
    eventType: "verification",
    subjectType: "signal",
    subjectId: input.signalId,
    parentEventId: input.parentEventId,
    rootEventId: input.rootEventId,
    signalId: input.signalId,
    outcome: input.evaluation.policyBand === "fail"
      ? "fail"
      : input.evaluation.policyBand === "warn"
        ? "warn"
        : "pass",
    payload: {
      signalId: input.signalId,
      evaluation: input.evaluation,
    },
  });
}

export async function auditVerificationCheck(input: {
  subject: string;
  check: string;
  outcome: VerificationEvent["outcome"];
  detail?: string | null;
  parentEventId?: string | null;
  rootEventId?: string | null;
  signalId?: string | null;
}): Promise<string | null> {
  const evaluatedAt = new Date().toISOString();
  const payload: VerificationEvent = {
    eventId: buildHarnessEventId(
      "verification",
      "endpoint",
      input.subject,
      stableContentHash({ subject: input.subject, check: input.check, outcome: input.outcome }),
    ),
    subject: input.subject,
    check: input.check,
    outcome: input.outcome,
    detail: input.detail ?? null,
    evaluatedAt,
  };

  return safeRecordHarnessEvent({
    eventKind: "verification",
    eventType: "verification",
    subjectType: "endpoint",
    subjectId: input.subject,
    parentEventId: input.parentEventId ?? null,
    rootEventId: input.rootEventId ?? input.parentEventId ?? undefined,
    signalId: input.signalId ?? null,
    outcome: input.outcome,
    payload: payload as unknown as Record<string, unknown>,
  });
}

export async function auditAlertValidation(
  input: AlertValidationEvent,
  lineage?: {
    parentEventId?: string | null;
    rootEventId?: string | null;
    signalId?: string | null;
    alertId?: string | null;
  },
): Promise<string | null> {
  return safeRecordHarnessEvent({
    eventKind: "alert_validation",
    eventType: "alert",
    subjectType: "operational_alert",
    subjectId: input.alertKey,
    parentEventId: lineage?.parentEventId ?? null,
    rootEventId: lineage?.rootEventId ?? undefined,
    signalId: lineage?.signalId ?? null,
    alertId: lineage?.alertId ?? null,
    outcome: input.outcome,
    payload: input as unknown as Record<string, unknown>,
  });
}

export async function auditPublication(input: PublicationHarnessEvent & {
  parentEventId?: string | null;
  rootEventId?: string | null;
}): Promise<string | null> {
  return safeRecordHarnessEvent({
    eventKind: "publication",
    eventType: "publication",
    subjectType: "operational_alert",
    subjectId: input.alertId,
    parentEventId: input.parentEventId ?? null,
    rootEventId: input.rootEventId ?? undefined,
    signalId: input.signalId ?? null,
    alertId: input.alertId,
    outcome: input.outcome,
    payload: input as unknown as Record<string, unknown>,
  });
}

export async function auditHumanReview(
  input: HumanReviewEvent,
  lineage?: {
    parentEventId?: string | null;
    rootEventId?: string | null;
    signalId?: string | null;
    alertId?: string | null;
  },
  dependencies: { getAdapter?: Parameters<typeof recordHarnessEvent>[1]["getAdapter"]; now?: () => number } = {},
): Promise<string | null> {
  return safeRecordHarnessEvent({
    eventKind: "human_review",
    eventType: "review",
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    parentEventId: lineage?.parentEventId ?? null,
    rootEventId: lineage?.rootEventId ?? undefined,
    signalId: lineage?.signalId ?? null,
    alertId: lineage?.alertId ?? null,
    outcome: input.outcome,
    payload: input as unknown as Record<string, unknown>,
  }, dependencies);
}
