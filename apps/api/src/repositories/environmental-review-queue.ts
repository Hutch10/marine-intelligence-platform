import type { ReviewQueueItem, ReviewQueueStatus, ReviewSubjectType } from "@marine/shared";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import { stableContentHash } from "../services/environmental-harness/provenance";

export interface ReviewQueueRecord {
  id: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  signalId: string | null;
  alertId: string | null;
  rootEventId: string | null;
  parentEventId: string | null;
  queueStatus: ReviewQueueStatus;
  annotation: string | null;
  actor: string | null;
  reviewEventId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface EnqueueReviewInput {
  subjectType: ReviewSubjectType;
  subjectId: string;
  signalId?: string | null;
  alertId?: string | null;
  rootEventId?: string | null;
  parentEventId?: string | null;
  annotation?: string | null;
  actor?: string | null;
}

function mapReviewQueueRow(row: Record<string, unknown>): ReviewQueueRecord {
  return {
    id: String(row.id),
    subjectType: String(row.subject_type) as ReviewSubjectType,
    subjectId: String(row.subject_id),
    signalId: row.signal_id ? String(row.signal_id) : null,
    alertId: row.alert_id ? String(row.alert_id) : null,
    rootEventId: row.root_event_id ? String(row.root_event_id) : null,
    parentEventId: row.parent_event_id ? String(row.parent_event_id) : null,
    queueStatus: String(row.queue_status) as ReviewQueueStatus,
    annotation: row.annotation ? String(row.annotation) : null,
    actor: row.actor ? String(row.actor) : null,
    reviewEventId: row.review_event_id ? String(row.review_event_id) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function toReviewQueueItem(record: ReviewQueueRecord): ReviewQueueItem {
  return {
    id: record.id,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    signalId: record.signalId,
    alertId: record.alertId,
    rootEventId: record.rootEventId,
    parentEventId: record.parentEventId,
    queueStatus: record.queueStatus,
    annotation: record.annotation,
    actor: record.actor,
    reviewEventId: record.reviewEventId,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

function buildReviewQueueId(input: EnqueueReviewInput): string {
  const digest = stableContentHash({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    signalId: input.signalId ?? null,
    alertId: input.alertId ?? null,
  });

  return `ERQ-${digest.slice(0, 16)}`;
}

export async function ensureEnvironmentalReviewQueueTable(adapter: AsyncDbAdapter): Promise<void> {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS environmental_review_queue (
      id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      signal_id TEXT,
      alert_id TEXT,
      root_event_id TEXT,
      parent_event_id TEXT,
      queue_status TEXT NOT NULL,
      annotation TEXT,
      actor TEXT,
      review_event_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  );

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_review_queue_status_updated
     ON environmental_review_queue (queue_status, updated_at DESC)`,
  );
}

export async function enqueueReviewItem(
  input: EnqueueReviewInput,
  dependencies: { getAdapter?: typeof getAsyncAdapter; now?: () => number } = {},
): Promise<ReviewQueueRecord> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;
  const createdAtMs = now();
  const id = buildReviewQueueId(input);
  const adapter = getAdapter(false);

  try {
    await ensureEnvironmentalReviewQueueTable(adapter);
    await adapter.execute(
      `INSERT OR IGNORE INTO environmental_review_queue (
        id, subject_type, subject_id, signal_id, alert_id,
        root_event_id, parent_event_id, queue_status, annotation, actor,
        review_event_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.subjectType,
        input.subjectId,
        input.signalId ?? null,
        input.alertId ?? null,
        input.rootEventId ?? null,
        input.parentEventId ?? null,
        "pending_review",
        input.annotation ?? null,
        input.actor ?? null,
        null,
        createdAtMs,
        createdAtMs,
      ],
    );

    const rows = await adapter.execute(
      `SELECT id, subject_type, subject_id, signal_id, alert_id, root_event_id, parent_event_id,
              queue_status, annotation, actor, review_event_id, created_at, updated_at
       FROM environmental_review_queue
       WHERE id = ?
       LIMIT 1`,
      [id],
    ) as Array<Record<string, unknown>>;

    return mapReviewQueueRow(rows[0]!);
  } finally {
    adapter.close();
  }
}

export async function updateReviewQueueItem(
  id: string,
  update: {
    queueStatus: ReviewQueueStatus;
    annotation?: string | null;
    actor?: string | null;
    reviewEventId?: string | null;
  },
  dependencies: { getAdapter?: typeof getAsyncAdapter; now?: () => number } = {},
): Promise<ReviewQueueRecord | null> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;
  const adapter = getAdapter(false);

  try {
    await ensureEnvironmentalReviewQueueTable(adapter);
    await adapter.execute(
      `UPDATE environmental_review_queue
       SET queue_status = ?, annotation = COALESCE(?, annotation), actor = COALESCE(?, actor),
           review_event_id = COALESCE(?, review_event_id), updated_at = ?
       WHERE id = ?`,
      [
        update.queueStatus,
        update.annotation ?? null,
        update.actor ?? null,
        update.reviewEventId ?? null,
        now(),
        id,
      ],
    );

    const rows = await adapter.execute(
      `SELECT id, subject_type, subject_id, signal_id, alert_id, root_event_id, parent_event_id,
              queue_status, annotation, actor, review_event_id, created_at, updated_at
       FROM environmental_review_queue
       WHERE id = ?
       LIMIT 1`,
      [id],
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return null;
    }

    return mapReviewQueueRow(rows[0]!);
  } finally {
    adapter.close();
  }
}

export async function readReviewQueueItems(
  options: { status?: ReviewQueueStatus; limit?: number } = {},
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<ReviewQueueRecord[]> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalReviewQueueTable(adapter);

    const rows = options.status
      ? await adapter.execute(
        `SELECT id, subject_type, subject_id, signal_id, alert_id, root_event_id, parent_event_id,
                queue_status, annotation, actor, review_event_id, created_at, updated_at
         FROM environmental_review_queue
         WHERE queue_status = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
        [options.status, limit],
      ) as Array<Record<string, unknown>>
      : await adapter.execute(
        `SELECT id, subject_type, subject_id, signal_id, alert_id, root_event_id, parent_event_id,
                queue_status, annotation, actor, review_event_id, created_at, updated_at
         FROM environmental_review_queue
         ORDER BY updated_at DESC
         LIMIT ?`,
        [limit],
      ) as Array<Record<string, unknown>>;

    return rows.map(mapReviewQueueRow);
  } catch {
    return [];
  } finally {
    adapter.close();
  }
}

export async function readReviewQueueItemById(
  id: string,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<ReviewQueueRecord | null> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalReviewQueueTable(adapter);
    const rows = await adapter.execute(
      `SELECT id, subject_type, subject_id, signal_id, alert_id, root_event_id, parent_event_id,
              queue_status, annotation, actor, review_event_id, created_at, updated_at
       FROM environmental_review_queue
       WHERE id = ?
       LIMIT 1`,
      [id],
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return null;
    }

    return mapReviewQueueRow(rows[0]!);
  } catch {
    return null;
  } finally {
    adapter.close();
  }
}
