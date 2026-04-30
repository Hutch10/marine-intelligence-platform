import test from "node:test";
import assert from "node:assert/strict";
import {
  getStationAdminSecurityAlerts,
  getStationAdminSecuritySummary,
  listStationAdminSessions,
} from "./station-admin-security";
import type { SqliteDatabaseLike } from "../db/client";

interface SessionRow {
  id: string;
  actor_id: string;
  actor_role: string;
  issued_at: string;
  expires_at: string;
  last_active_at: string | null;
}

interface EventRow {
  event_type: string;
  actor_id: string | null;
  occurred_at: string;
  metadata: string | null;
}

function createDatabase(
  sessions: SessionRow[],
  eventsBySession: Record<string, string | null>,
  summaryEvents: EventRow[],
  options?: { throwOnQuery?: boolean; activeSessionCount?: number },
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (options?.throwOnQuery) {
            throw new Error("query failed");
          }

          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM station_admin_sessions")) {
            return [{ total: options?.activeSessionCount ?? sessions.length }];
          }

          if (sql.includes("FROM station_admin_sessions") && sql.includes("COALESCE(last_active_at, issued_at)")) {
            const limit = Number(params[1] ?? sessions.length);
            return sessions.slice(0, limit);
          }

          if (sql.includes("FROM station_admin_auth_events") && sql.includes("WHERE session_id = ?")) {
            const sessionId = String(params[0] ?? "");
            return [{ metadata: eventsBySession[sessionId] ?? null }];
          }

          if (sql.includes("FROM station_admin_auth_events") && sql.includes("WHERE occurred_at >= ?")) {
            return summaryEvents;
          }

          return [];
        },
      };
    },
    close() {},
  };
}

const NOW = Date.parse("2026-03-16T12:00:00.000Z");

const SESSION_ROWS: SessionRow[] = [
  {
    id: "sess-admin-001",
    actor_id: "ops.lead@marine.local",
    actor_role: "admin",
    issued_at: "2026-03-16T08:00:00.000Z",
    expires_at: "2026-03-16T16:00:00.000Z",
    last_active_at: "2026-03-16T11:40:00.000Z",
  },
  {
    id: "sess-viewer-002",
    actor_id: "observer.ops@marine.local",
    actor_role: "viewer",
    issued_at: "2026-03-16T09:00:00.000Z",
    expires_at: "2026-03-16T17:00:00.000Z",
    last_active_at: null,
  },
];

const EVENTS_BY_SESSION = {
  "sess-admin-001": JSON.stringify({
    ip: "203.0.113.42",
    userAgent: "Ops Browser",
    source: "POST /api/station-admin/login",
  }),
  "sess-viewer-002": JSON.stringify({
    ip: "198.51.100.9",
    userAgent: "Viewer Browser",
    source: "POST /api/station-admin/login",
  }),
};

const SUMMARY_EVENTS: EventRow[] = [
  {
    event_type: "revoke",
    actor_id: "ops.lead@marine.local",
    occurred_at: "2026-03-16T11:55:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.42" }),
  },
  {
    event_type: "login_locked",
    actor_id: "observer.ops@marine.local",
    occurred_at: "2026-03-16T10:00:00.000Z",
    metadata: JSON.stringify({ ip: "198.51.100.9" }),
  },
  {
    event_type: "login_failure",
    actor_id: "observer.ops@marine.local",
    occurred_at: "2026-03-16T09:30:00.000Z",
    metadata: JSON.stringify({ ip: "198.51.100.9" }),
  },
  {
    event_type: "login_success",
    actor_id: "ops.lead@marine.local",
    occurred_at: "2026-03-16T08:00:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.42" }),
  },
];

const ALERT_EVENTS: EventRow[] = [
  {
    event_type: "login_failure",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:59:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.50" }),
  },
  {
    event_type: "login_failure",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:58:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.50" }),
  },
  {
    event_type: "login_failure",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:57:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.50" }),
  },
  {
    event_type: "login_failure",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:56:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.50" }),
  },
  {
    event_type: "login_failure",
    actor_id: "pilot.two@marine.local",
    occurred_at: "2026-03-16T11:55:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.50" }),
  },
  {
    event_type: "login_success",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:54:00.000Z",
    metadata: JSON.stringify({ ip: "198.51.100.1" }),
  },
  {
    event_type: "login_success",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:53:00.000Z",
    metadata: JSON.stringify({ ip: "198.51.100.2" }),
  },
  {
    event_type: "login_success",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:52:00.000Z",
    metadata: JSON.stringify({ ip: "198.51.100.3" }),
  },
  {
    event_type: "login_locked",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:51:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.50" }),
  },
  {
    event_type: "login_locked",
    actor_id: "pilot.one@marine.local",
    occurred_at: "2026-03-16T11:50:00.000Z",
    metadata: JSON.stringify({ ip: "203.0.113.50" }),
  },
];

test("station admin security repository lists active sessions with latest metadata", () => {
  const result = listStationAdminSessions(
    { limit: 2 },
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => createDatabase(SESSION_ROWS, EVENTS_BY_SESSION, SUMMARY_EVENTS),
      now: () => NOW,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.sessions.length, 2);
    assert.deepEqual(result.sessions[0], {
      id: "sess-admin-001",
      actorId: "ops.lead@marine.local",
      actorRole: "admin",
      issuedAt: "2026-03-16T08:00:00.000Z",
      expiresAt: "2026-03-16T16:00:00.000Z",
      lastActiveAt: "2026-03-16T11:40:00.000Z",
      ip: "203.0.113.42",
      userAgent: "Ops Browser",
      source: "POST /api/station-admin/login",
      amr: ["pwd"],
      acr: null,
    });
  }
});

test("station admin security repository computes summary metrics from auth events", () => {
  const result = getStationAdminSecuritySummary({
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => createDatabase(SESSION_ROWS, EVENTS_BY_SESSION, SUMMARY_EVENTS, { activeSessionCount: 2 }),
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.summary, {
      activeSessionCount: 2,
      loginSuccessCount24h: 1,
      loginFailureCount24h: 1,
      lockoutCount24h: 1,
      revokeCount24h: 1,
      uniqueIpCount24h: 2,
      lastEventAt: "2026-03-16T11:55:00.000Z",
    });
  }
});

test("station admin security repository falls back when queries fail", () => {
  const sessionsResult = listStationAdminSessions(
    { limit: 3 },
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => createDatabase(SESSION_ROWS, EVENTS_BY_SESSION, SUMMARY_EVENTS, { throwOnQuery: true }),
      now: () => NOW,
    },
  );
  const summaryResult = getStationAdminSecuritySummary({
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => createDatabase(SESSION_ROWS, EVENTS_BY_SESSION, SUMMARY_EVENTS, { throwOnQuery: true }),
    now: () => NOW,
  });

  assert.deepEqual(sessionsResult, {
    source: "mock",
    fallbackReason: "db_query_failed",
    filters: {
      limit: 3,
    },
  });
  assert.deepEqual(summaryResult, {
    source: "mock",
    fallbackReason: "db_query_failed",
    summary: {
      activeSessionCount: 0,
      loginSuccessCount24h: 0,
      loginFailureCount24h: 0,
      lockoutCount24h: 0,
      revokeCount24h: 0,
      uniqueIpCount24h: 0,
      lastEventAt: null,
    },
  });
});

test("station admin security repository emits alert heuristics from recent auth events", () => {
  const result = getStationAdminSecurityAlerts({
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => createDatabase(SESSION_ROWS, EVENTS_BY_SESSION, ALERT_EVENTS),
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.alerts.length >= 4);

    const sameIpFailures = result.alerts.find((alert) => alert.alertType === "repeated_login_failures_same_ip");
    assert.equal(sameIpFailures?.ip, "203.0.113.50");
    assert.equal(sameIpFailures?.eventCount, 5);

    const actorIpFailures = result.alerts.find((alert) => alert.alertType === "many_actor_login_failures_one_ip");
    assert.equal(actorIpFailures?.actorId, "pilot.one@marine.local");
    assert.equal(actorIpFailures?.ip, "203.0.113.50");
    assert.equal(actorIpFailures?.eventCount, 4);

    const manyIps = result.alerts.find((alert) => alert.alertType === "actor_login_many_ips");
    assert.equal(manyIps?.actorId, "pilot.one@marine.local");
    assert.equal(manyIps?.eventCount, 4);

    const repeatedLockouts = result.alerts.find((alert) => alert.alertType === "repeated_lockouts" && alert.actorId === "pilot.one@marine.local");
    assert.equal(repeatedLockouts?.eventCount, 2);
  }
});
