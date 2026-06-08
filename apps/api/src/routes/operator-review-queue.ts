import type { RouteDefinition } from "../types";
import type { ReviewQueueStatus } from "@marine/shared";
import {
  applyReviewQueueAction,
  enqueueForHumanReview,
  listReviewQueue,
  type ReviewAction,
} from "../services/environmental-harness/review-queue";

interface ReviewQueueListResponse {
  generated_at: string;
  items: Awaited<ReturnType<typeof listReviewQueue>>;
}

interface ReviewQueueActionBody {
  queueItemId: string;
  action: ReviewAction;
  actor?: string | null;
  annotation?: string | null;
}

interface ReviewQueueEnqueueBody {
  subjectType: "signal" | "alert" | "risk_evaluation" | "investigation" | "anomaly";
  subjectId: string;
  signalId?: string | null;
  alertId?: string | null;
  rootEventId?: string | null;
  parentEventId?: string | null;
  annotation?: string | null;
  actor?: string | null;
}

export async function buildReviewQueueListResponse(
  query?: { status?: string; limit?: string },
): Promise<{ status: number; json: ReviewQueueListResponse }> {
  const status = query?.status as ReviewQueueStatus | undefined;
  const limit = query?.limit ? Number(query.limit) : 50;

  const items = await listReviewQueue({
    status: status && [
      "pending_review",
      "approved",
      "rejected",
      "escalated",
      "annotated",
    ].includes(status) ? status : undefined,
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return {
    status: 200,
    json: {
      generated_at: new Date().toISOString(),
      items,
    },
  };
}

export async function buildReviewQueueActionResponse(
  body: ReviewQueueActionBody,
): Promise<{ status: number; json: unknown }> {
  if (!body.queueItemId || !body.action) {
    return { status: 400, json: { message: "queueItemId and action are required" } };
  }

  const validActions: ReviewAction[] = ["approve", "reject", "escalate", "annotate"];
  if (!validActions.includes(body.action)) {
    return { status: 400, json: { message: "Invalid review action" } };
  }

  const result = await applyReviewQueueAction({
    queueItemId: body.queueItemId,
    action: body.action,
    actor: body.actor ?? null,
    annotation: body.annotation ?? null,
  });

  if (!result.ok) {
    return {
      status: result.reason === "not_found" ? 404 : 400,
      json: { message: result.reason },
    };
  }

  return {
    status: 200,
    json: {
      item: result.item,
      reviewEventId: result.reviewEventId,
    },
  };
}

export async function buildReviewQueueEnqueueResponse(
  body: ReviewQueueEnqueueBody,
): Promise<{ status: number; json: unknown }> {
  if (!body.subjectType || !body.subjectId) {
    return { status: 400, json: { message: "subjectType and subjectId are required" } };
  }

  const item = await enqueueForHumanReview(body);

  return {
    status: 201,
    json: { item },
  };
}

export const getOperatorReviewQueueRoute: RouteDefinition<ReviewQueueListResponse> = {
  method: "GET",
  path: "/internal/operator/review-queue",
  async handler(request) {
    return await buildReviewQueueListResponse(request.query as { status?: string; limit?: string });
  },
};

export const postOperatorReviewQueueActionRoute: RouteDefinition<unknown, ReviewQueueActionBody> = {
  method: "POST",
  path: "/internal/operator/review-queue/action",
  async handler(request) {
    return await buildReviewQueueActionResponse((request.body ?? {}) as ReviewQueueActionBody);
  },
};

export const postOperatorReviewQueueEnqueueRoute: RouteDefinition<unknown, ReviewQueueEnqueueBody> = {
  method: "POST",
  path: "/internal/operator/review-queue/enqueue",
  async handler(request) {
    return await buildReviewQueueEnqueueResponse((request.body ?? {}) as ReviewQueueEnqueueBody);
  },
};
