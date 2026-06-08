import type {
  HarnessEventKind,
  HarnessLineageEventType,
  HarnessOutcome,
} from "@marine/shared";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import { buildHarnessEventId, stableContentHash } from "../services/environmental-harness/provenance";
import { lineageEventTypeFromKind } from "../services/environmental-harness/lineage";

export interface HarnessEventRecord {
  id: string;
  eventKind: HarnessEventKind;
  eventType: HarnessLineageEventType;
  subjectType: string;
  subjectId: string;
  parentEventId: string | null;
  rootEventId: string;
  signalId: string | null;
  alertId: string | null;
  outcome: HarnessOutcome;
  payloadJson: string;
  contentHash: string;
  createdAt: number;
}

export interface RecordHarnessEventInput {
  eventKind: HarnessEventKind;
  subjectType: string;
  subjectId: string;
  outcome: HarnessOutcome;
  payload: Record<string, unknown>;
  createdAtMs?: number;
  parentEventId?: string | null;
  rootEventId?: string | null;
  signalId?: string | null;
  alertId?: string | null;
  eventType?: HarnessLineageEventType;
}

export type HarnessEventReadResult =
  | { source: "db"; event: HarnessEventRecord }
  | { source: "unavailable"; fallbackReason: "not_found" | "db_query_failed" };

export type HarnessEventsReadResult =
  | { source: "db"; events: HarnessEventRecord[] }
  | { source: "unavailable"; fallbackReason: "not_found" | "db_query_failed" };

function mapHarnessEventRow(row: Record<string, unknown>): HarnessEventRecord {
  return {
    id: String(row.id),
    eventKind: String(row.event_kind) as HarnessEventKind,
    eventType: String(row.event_type ?? lineageEventTypeFromKind(String(row.event_kind) as HarnessEventKind)) as HarnessLineageEventType,
    subjectType: String(row.subject_type),
    subjectId: String(row.subject_id),
    parentEventId: row.parent_event_id ? String(row.parent_event_id) : null,
    rootEventId: String(row.root_event_id ?? row.id),
    signalId: row.signal_id ? String(row.signal_id) : null,
    alertId: row.alert_id ? String(row.alert_id) : null,
    outcome: String(row.outcome) as HarnessOutcome,
    payloadJson: String(row.payload_json),
    contentHash: String(row.content_hash),
    createdAt: Number(row.created_at),
  };
}

async function ensureLineageColumns(adapter: AsyncDbAdapter): Promise<void> {
  const migrations = [
    "ALTER TABLE environmental_harness_events ADD COLUMN parent_event_id TEXT",
    "ALTER TABLE environmental_harness_events ADD COLUMN root_event_id TEXT",
    "ALTER TABLE environmental_harness_events ADD COLUMN event_type TEXT",
    "ALTER TABLE environmental_harness_events ADD COLUMN signal_id TEXT",
    "ALTER TABLE environmental_harness_events ADD COLUMN alert_id TEXT",
  ];

  for (const sql of migrations) {
    try {
      await adapter.execute(sql);
    } catch {
      // Column may already exist.
    }
  }

  await adapter.execute(
    "CREATE INDEX IF NOT EXISTS idx_harness_events_root_created ON environmental_harness_events (root_event_id, created_at)",
  );
  await adapter.execute(
    "CREATE INDEX IF NOT EXISTS idx_harness_events_signal_created ON environmental_harness_events (signal_id, created_at)",
  );
  await adapter.execute(
    "CREATE INDEX IF NOT EXISTS idx_harness_events_alert_created ON environmental_harness_events (alert_id, created_at)",
  );
}

export async function ensureEnvironmentalHarnessEventsTable(adapter: AsyncDbAdapter): Promise<void> {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS environmental_harness_events (
      id TEXT PRIMARY KEY,
      event_kind TEXT NOT NULL,
      event_type TEXT,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      parent_event_id TEXT,
      root_event_id TEXT,
      signal_id TEXT,
      alert_id TEXT,
      outcome TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  );

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_harness_events_kind_created
     ON environmental_harness_events (event_kind, created_at)`,
  );

  await adapter.execute(
    `CREATE INDEX IF NOT EXISTS idx_harness_events_subject
     ON environmental_harness_events (subject_type, subject_id)`,
  );

  await ensureLineageColumns(adapter);
}

async function resolveRootEventId(
  adapter: AsyncDbAdapter,
  parentEventId: string | null | undefined,
  provisionalRootEventId: string,
): Promise<string> {
  if (!parentEventId) {
    return provisionalRootEventId;
  }

  const rows = await adapter.execute(
    `SELECT root_event_id FROM environmental_harness_events WHERE id = ? LIMIT 1`,
    [parentEventId],
  ) as Array<{ root_event_id?: string | null }>;

  return rows[0]?.root_event_id ? String(rows[0].root_event_id) : parentEventId;
}

export async function recordHarnessEvent(
  input: RecordHarnessEventInput,
  dependencies: { getAdapter?: typeof getAsyncAdapter; now?: () => number } = {},
): Promise<string> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const now = dependencies.now ?? Date.now;
  const createdAtMs = input.createdAtMs ?? now();
  const contentHash = stableContentHash(input.payload);
  const eventId = buildHarnessEventId(
    input.eventKind,
    input.subjectType,
    input.subjectId,
    contentHash,
  );
  const eventType = input.eventType ?? lineageEventTypeFromKind(input.eventKind);

  const adapter = getAdapter(false);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rootEventId = input.rootEventId
      ?? await resolveRootEventId(adapter, input.parentEventId, eventId);

    await adapter.execute(
      `INSERT OR IGNORE INTO environmental_harness_events (
        id, event_kind, event_type, subject_type, subject_id,
        parent_event_id, root_event_id, signal_id, alert_id,
        outcome, payload_json, content_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        input.eventKind,
        eventType,
        input.subjectType,
        input.subjectId,
        input.parentEventId ?? null,
        rootEventId,
        input.signalId ?? null,
        input.alertId ?? null,
        input.outcome,
        JSON.stringify(input.payload),
        contentHash,
        createdAtMs,
      ],
    );
  } finally {
    adapter.close();
  }

  return eventId;
}

export async function readHarnessEventById(
  eventId: string,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<HarnessEventReadResult> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rows = await adapter.execute(
      `SELECT id, event_kind, event_type, subject_type, subject_id, parent_event_id, root_event_id,
              signal_id, alert_id, outcome, payload_json, content_hash, created_at
       FROM environmental_harness_events
       WHERE id = ?
       LIMIT 1`,
      [eventId],
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return { source: "unavailable", fallbackReason: "not_found" };
    }

    return { source: "db", event: mapHarnessEventRow(rows[0]) };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    adapter.close();
  }
}

export async function readHarnessEventsBySignalId(
  signalId: string,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<HarnessEventsReadResult> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rows = await adapter.execute(
      `SELECT id, event_kind, event_type, subject_type, subject_id, parent_event_id, root_event_id,
              signal_id, alert_id, outcome, payload_json, content_hash, created_at
       FROM environmental_harness_events
       WHERE signal_id = ?
       ORDER BY created_at ASC, id ASC`,
      [signalId],
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return { source: "unavailable", fallbackReason: "not_found" };
    }

    return { source: "db", events: rows.map(mapHarnessEventRow) };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    adapter.close();
  }
}

export async function readHarnessEventsByAlertId(
  alertId: string,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<HarnessEventsReadResult> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rows = await adapter.execute(
      `SELECT id, event_kind, event_type, subject_type, subject_id, parent_event_id, root_event_id,
              signal_id, alert_id, outcome, payload_json, content_hash, created_at
       FROM environmental_harness_events
       WHERE alert_id = ?
          OR (subject_type = 'operational_alert' AND subject_id = ?)
       ORDER BY created_at ASC, id ASC`,
      [alertId, alertId],
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return { source: "unavailable", fallbackReason: "not_found" };
    }

    return { source: "db", events: rows.map(mapHarnessEventRow) };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    adapter.close();
  }
}

export async function readHarnessLineageChain(
  rootEventId: string,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<HarnessEventsReadResult> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rows = await adapter.execute(
      `SELECT id, event_kind, event_type, subject_type, subject_id, parent_event_id, root_event_id,
              signal_id, alert_id, outcome, payload_json, content_hash, created_at
       FROM environmental_harness_events
       WHERE root_event_id = ?
       ORDER BY created_at ASC, id ASC`,
      [rootEventId],
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return { source: "unavailable", fallbackReason: "not_found" };
    }

    return { source: "db", events: rows.map(mapHarnessEventRow) };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    adapter.close();
  }
}

export async function readLatestHarnessEventByKind(
  eventKind: HarnessEventKind,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<{ id: string; subjectId: string; outcome: string; createdAt: number } | null> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rows = await adapter.execute(
      `SELECT id, subject_id, outcome, created_at
       FROM environmental_harness_events
       WHERE event_kind = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [eventKind],
    ) as Array<{ id: string; subject_id: string; outcome: string; created_at: number | string }>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      subjectId: row.subject_id,
      outcome: row.outcome,
      createdAt: Number(row.created_at),
    };
  } catch {
    return null;
  } finally {
    adapter.close();
  }
}

export async function readRecentHarnessEventsByKind(
  eventKind: HarnessEventKind,
  limit = 20,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<HarnessEventRecord[]> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const boundedLimit = Math.min(Math.max(limit, 1), 200);
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rows = await adapter.execute(
      `SELECT id, event_kind, event_type, subject_type, subject_id, parent_event_id, root_event_id,
              signal_id, alert_id, outcome, payload_json, content_hash, created_at
       FROM environmental_harness_events
       WHERE event_kind = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [eventKind, boundedLimit],
    ) as Array<Record<string, unknown>>;

    return rows.map(mapHarnessEventRow);
  } catch {
    return [];
  } finally {
    adapter.close();
  }
}

export async function readRecentReplaySampleTargets(
  limit = 10,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<Array<{ kind: "signal" | "alert"; id: string }>> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const signalRows = await adapter.execute(
      `SELECT DISTINCT signal_id
       FROM environmental_harness_events
       WHERE signal_id IS NOT NULL AND signal_id != ''
       ORDER BY created_at DESC
       LIMIT ?`,
      [boundedLimit],
    ) as Array<{ signal_id: string }>;

    const alertRows = await adapter.execute(
      `SELECT DISTINCT alert_id
       FROM environmental_harness_events
       WHERE alert_id IS NOT NULL AND alert_id != ''
       ORDER BY created_at DESC
       LIMIT ?`,
      [boundedLimit],
    ) as Array<{ alert_id: string }>;

    const targets: Array<{ kind: "signal" | "alert"; id: string }> = [];
    for (const row of signalRows) {
      if (row.signal_id) {
        targets.push({ kind: "signal", id: row.signal_id });
      }
    }
    for (const row of alertRows) {
      if (row.alert_id) {
        targets.push({ kind: "alert", id: row.alert_id });
      }
    }

    return targets.slice(0, boundedLimit * 2);
  } catch {
    return [];
  } finally {
    adapter.close();
  }
}

export async function countRecentHarnessEventsByKind(
  eventKind: HarnessEventKind,
  sinceMs: number,
  dependencies: { getAdapter?: typeof getAsyncAdapter } = {},
): Promise<number> {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(true);

  try {
    await ensureEnvironmentalHarnessEventsTable(adapter);
    const rows = await adapter.execute(
      `SELECT COUNT(*) AS count
       FROM environmental_harness_events
       WHERE event_kind = ? AND created_at >= ?`,
      [eventKind, sinceMs],
    ) as Array<{ count: number | string }>;

    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  } finally {
    adapter.close();
  }
}
