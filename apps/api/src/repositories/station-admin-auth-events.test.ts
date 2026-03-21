import test from "node:test";
import assert from "node:assert/strict";
import {
  exportStationAdminAuthEvents,
  listStationAdminAuthEvents,
  normalizeStationAdminAuthEventFilters,
} from "./station-admin-auth-events";
import type { SqliteDatabaseLike } from "../db/client";

interface AuthEventRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  session_id: string | null;
  occurred_at: string;
  metadata: string | null;
}

function createDatabase(
  rows: AuthEventRow[],
  options?: { throwOnQuery?: boolean },
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (options?.throwOnQuery) {
            throw new Error("query failed");
          }

          const hasEventType = sql.includes("event_type = ?");
          const hasActor = sql.includes("actor_id = ?");
          const hasIp = sql.includes("metadata LIKE ? ESCAPE");
          const hasSince = sql.includes("occurred_at >= ?");
          const hasUntil = sql.includes("occurred_at <= ?");
          const hasCursor = sql.includes("(occurred_at < ? OR (occurred_at = ? AND id < ?))");

          let paramIndex = 0;
          const eventType = hasEventType ? String(params[paramIndex++] ?? "") : undefined;
          const actor = hasActor ? String(params[paramIndex++] ?? "") : undefined;
          const ipPattern = hasIp ? String(params[paramIndex++] ?? "") : undefined;

          if (hasIp) {
            paramIndex += 1;
          }

          const since = hasSince ? String(params[paramIndex++] ?? "") : undefined;
          const until = hasUntil ? String(params[paramIndex++] ?? "") : undefined;
          const cursorOccurredAt = hasCursor ? String(params[paramIndex++] ?? "") : undefined;
          const cursorOccurredAtDuplicate = hasCursor ? String(params[paramIndex++] ?? "") : undefined;
          const cursorId = hasCursor ? String(params[paramIndex++] ?? "") : undefined;
          const limit = Number(params[paramIndex] ?? rows.length);

          const ip = ipPattern?.match(/\d{1,3}(?:\.\d{1,3}){3}/)?.[0];

          const filtered = rows
            .filter((row) => !eventType || row.event_type === eventType)
            .filter((row) => !actor || row.actor_id === actor)
            .filter((row) => {
              if (!ip) {
                return true;
              }

              try {
                const parsed = JSON.parse(row.metadata ?? "{}") as Record<string, unknown>;
                return typeof parsed.ip === "string" && parsed.ip === ip;
              } catch {
                return false;
              }
            })
            .filter((row) => !since || row.occurred_at >= since)
            .filter((row) => !until || row.occurred_at <= until)
            .filter((row) => {
              if (!cursorOccurredAt || !cursorOccurredAtDuplicate || !cursorId) {
                return true;
              }

              return (
                row.occurred_at < cursorOccurredAt
                || (row.occurred_at === cursorOccurredAtDuplicate && row.id < cursorId)
              );
            })
            .sort((left, right) => {
              const timeSort = right.occurred_at.localeCompare(left.occurred_at);
              if (timeSort !== 0) {
                return timeSort;
              }

              return right.id.localeCompare(left.id);
            });

          return filtered.slice(0, limit);
        },
      };
    },
    close() {},
  };
}

const AUTH_EVENT_ROWS: AuthEventRow[] = [
  {
    id: "EVT-004",
    event_type: "login_failure",
    actor_id: "analyst@marine.local",
    session_id: null,
    occurred_at: "2026-03-16T09:00:00.000Z",
    metadata: JSON.stringify({
      ip: "198.51.100.7",
      userAgent: "Unknown Browser",
      source: "POST /api/station-admin/login",
    }),
  },
  {
    id: "EVT-003",
    event_type: "revoke",
    actor_id: "ops.lead@marine.local",
    session_id: "sess-target-003",
    occurred_at: "2026-03-16T09:00:00.000Z",
    metadata: JSON.stringify({
      ip: "203.0.113.42",
      userAgent: "Ops Browser",
      source: "POST /api/station-admin/session/revoke",
    }),
  },
  {
    id: "EVT-002",
    event_type: "login_failure",
    actor_id: "ops.lead@marine.local",
    session_id: null,
    occurred_at: "2026-03-16T08:30:00.000Z",
    metadata: JSON.stringify({
      ip: "198.51.100.7",
      userAgent: "Unknown Browser",
      source: "POST /api/station-admin/login",
    }),
  },
  {
    id: "EVT-001",
    event_type: "login_success",
    actor_id: "ops.lead@marine.local",
    session_id: "sess-admin-001",
    occurred_at: "2026-03-16T08:00:00.000Z",
    metadata: JSON.stringify({
      ip: "203.0.113.42",
      userAgent: "Ops Browser",
      source: "POST /api/station-admin/login",
    }),
  },
];

test("normalizeStationAdminAuthEventFilters clamps limit and keeps valid filters", () => {
  const filters = normalizeStationAdminAuthEventFilters({
    eventType: "login_success",
    actor: "ops.lead@marine.local",
    ip: "203.0.113.42",
    since: "2026-03-16T08:00:00.000Z",
    until: "2026-03-16T09:00:00.000Z",
    limit: 500,
    cursor: "2026-03-16T09:00:00.000Z|EVT-003",
  });

  assert.deepEqual(filters, {
    eventType: "login_success",
    actor: "ops.lead@marine.local",
    ip: "203.0.113.42",
    since: "2026-03-16T08:00:00.000Z",
    until: "2026-03-16T09:00:00.000Z",
    limit: 100,
    cursor: "2026-03-16T09:00:00.000Z|EVT-003",
  });
});

test("station admin auth events repository returns parsed metadata", () => {
  const result = listStationAdminAuthEvents(
    { limit: 10 },
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => createDatabase(AUTH_EVENT_ROWS),
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.events.length, 4);
    assert.equal(result.nextCursor, null);
    assert.equal(result.events[0].eventType, "login_failure");
    assert.equal(result.events[0].ip, "198.51.100.7");
    assert.equal(result.events[0].userAgent, "Unknown Browser");
    assert.equal(result.events[0].source, "POST /api/station-admin/login");
  }
});

test("station admin auth events repository applies actor ip and cursor filters", () => {
  const result = listStationAdminAuthEvents(
    {
      eventType: "login_failure",
      actor: "ops.lead@marine.local",
      ip: "198.51.100.7",
      since: "2026-03-16T08:00:00.000Z",
      until: "2026-03-16T09:30:00.000Z",
      cursor: "2026-03-16T09:00:00.000Z|EVT-004",
      limit: 1,
    },
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => createDatabase(AUTH_EVENT_ROWS),
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].id, "EVT-002");
    assert.equal(result.events[0].eventType, "login_failure");
    assert.equal(result.nextCursor, "2026-03-16T08:30:00.000Z|EVT-002");
  }
});

test("station admin auth events export returns JSON payload with filtered events", () => {
  const result = exportStationAdminAuthEvents(
    {
      actor: "ops.lead@marine.local",
      eventType: "login_failure",
      ip: "198.51.100.7",
      since: "2026-03-16T08:00:00.000Z",
      until: "2026-03-16T08:45:00.000Z",
    },
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => createDatabase(AUTH_EVENT_ROWS),
    },
  );

  assert.equal(result.source, "db");
  assert.equal(result.export.format, "json");
  assert.equal(result.export.events.length, 1);
  assert.equal(result.export.events[0].id, "EVT-002");
});

test("station admin auth events repository falls back when query fails", () => {
  const result = listStationAdminAuthEvents(
    { limit: 10 },
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => createDatabase(AUTH_EVENT_ROWS, { throwOnQuery: true }),
    },
  );

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_query_failed",
    filters: {
      actor: undefined,
      eventType: undefined,
      ip: undefined,
      limit: 10,
      since: undefined,
      until: undefined,
      cursor: undefined,
    },
    nextCursor: null,
  });
});
