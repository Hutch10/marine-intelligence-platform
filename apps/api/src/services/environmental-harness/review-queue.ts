import type {
  HumanReviewEvent,
  ReviewQueueStatus,
} from "@marine/shared";
import type { AsyncDbAdapter } from "../../db/async-client";
import {
  enqueueReviewItem,
  readReviewQueueItemById,
  readReviewQueueItems,
  toReviewQueueItem,
  updateReviewQueueItem,
  type ReviewQueueRecord,
} from "../../repositories/environmental-review-queue";
import { auditHumanReview } from "./audit";
import { buildHarnessEventId, stableContentHash } from "./provenance";

export type ReviewAction = "approve" | "reject" | "escalate" | "annotate";

const ACTION_TO_STATUS: Record<ReviewAction, ReviewQueueStatus> = {
  approve: "approved",
  reject: "rejected",
  escalate: "escalated",
  annotate: "annotated",
};

const ACTION_TO_HARNESS: Record<ReviewAction, { action: string; outcome: HumanReviewEvent["outcome"] }> = {
  approve: { action: "approve", outcome: "pass" },
  reject: { action: "reject", outcome: "rejected" },
  escalate: { action: "escalate", outcome: "warn" },
  annotate: { action: "annotate", outcome: "pass" },
};

export interface ApplyReviewActionInput {
  queueItemId: string;
  action: ReviewAction;
  actor?: string | null;
  annotation?: string | null;
}

export interface ReviewQueueDependencies {
  getAdapter?: () => AsyncDbAdapter;
  now?: () => number;
}

function mapSubjectType(record: ReviewQueueRecord): HumanReviewEvent["subjectType"] {
  if (
    record.subjectType === "risk_evaluation"
    || record.subjectType === "investigation"
    || record.subjectType === "anomaly"
  ) {
    return record.subjectType;
  }

  return "anomaly";
}

export async function listReviewQueue(
  options: { status?: ReviewQueueStatus; limit?: number } = {},
  dependencies: ReviewQueueDependencies = {},
) {
  const getAdapter = dependencies.getAdapter;
  const records = await readReviewQueueItems(options, getAdapter ? { getAdapter } : {});
  return records.map(toReviewQueueItem);
}

export async function enqueueForHumanReview(
  input: {
    subjectType: ReviewQueueRecord["subjectType"];
    subjectId: string;
    signalId?: string | null;
    alertId?: string | null;
    rootEventId?: string | null;
    parentEventId?: string | null;
    annotation?: string | null;
    actor?: string | null;
  },
  dependencies: ReviewQueueDependencies = {},
) {
  const getAdapter = dependencies.getAdapter;
  const record = await enqueueReviewItem(input, {
    getAdapter,
    now: dependencies.now,
  });

  return toReviewQueueItem(record);
}

export async function applyReviewQueueAction(
  input: ApplyReviewActionInput,
  dependencies: ReviewQueueDependencies = {},
) {
  const getAdapter = dependencies.getAdapter;
  const adapterDeps = getAdapter ? { getAdapter } : {};
  const existing = await readReviewQueueItemById(input.queueItemId, adapterDeps);

  if (!existing) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const harnessMapping = ACTION_TO_HARNESS[input.action];
  const reviewEvent: HumanReviewEvent = {
    eventId: buildHarnessEventId(
      "human_review",
      mapSubjectType(existing),
      existing.subjectId,
      stableContentHash({
        queueItemId: existing.id,
        action: harnessMapping.action,
        annotation: input.annotation ?? existing.annotation ?? null,
      }),
    ),
    subjectType: mapSubjectType(existing),
    subjectId: existing.subjectId,
    action: harnessMapping.action,
    actor: input.actor ?? null,
    outcome: harnessMapping.outcome,
    evaluatedAt: new Date((dependencies.now ?? Date.now)()).toISOString(),
    detail: input.annotation ?? existing.annotation ?? null,
  };

  const reviewEventId = await auditHumanReview(reviewEvent, {
    parentEventId: existing.parentEventId,
    rootEventId: existing.rootEventId ?? undefined,
    signalId: existing.signalId,
    alertId: existing.alertId,
  }, { getAdapter, now: dependencies.now });

  const updated = await updateReviewQueueItem(
    existing.id,
    {
      queueStatus: ACTION_TO_STATUS[input.action],
      annotation: input.annotation ?? existing.annotation,
      actor: input.actor ?? existing.actor,
      reviewEventId,
    },
    { getAdapter, now: dependencies.now },
  );

  if (!updated) {
    return { ok: false as const, reason: "update_failed" as const };
  }

  return {
    ok: true as const,
    item: toReviewQueueItem(updated),
    reviewEventId,
  };
}
