import type {
  StationAdminSecurityAlert,
  StationAdminSecuritySummary,
  StationAdminSessionSummary,
  StationAdminSessionsQuery,
} from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import { parseStationAdminEventMetadata } from "./station-admin-auth-events";
import type { OceanStationsFallbackReason } from "../types";

interface StationAdminSessionRow {
  id: string;
  actor_id: string;
  actor_role: string;
  issued_at: string;
  expires_at: string;
  last_active_at: string | null;
}

interface StationAdminAuthEventSummaryRow {
  event_type: string;
  actor_id: string | null;
  occurred_at: string;
  metadata: string | null;
}

interface StationAdminSecurityDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  now?: () => number;
}

export interface NormalizedStationAdminSessionsQuery {
  limit: number;
}

export type StationAdminSessionsReadResult =
  | {
      source: "db";
      sessions: StationAdminSessionSummary[];
      filters: NormalizedStationAdminSessionsQuery;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
      filters: NormalizedStationAdminSessionsQuery;
    };

export type StationAdminSecuritySummaryReadResult =
  | {
      source: "db";
      summary: StationAdminSecuritySummary;
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
      summary: StationAdminSecuritySummary;
    };

export type StationAdminSecurityAlertsReadResult =
  | {
      source: "db";
      alerts: StationAdminSecurityAlert[];
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
      alerts: StationAdminSecurityAlert[];
    };

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) {
    return 25;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function normalizeRole(value: string): StationAdminSessionSummary["actorRole"] {
  return value === "viewer" ? "viewer" : "admin";
}

export function normalizeStationAdminSessionsQuery(
  query: StationAdminSessionsQuery = {},
): NormalizedStationAdminSessionsQuery {
  return {
    limit: clampLimit(query.limit),
  };
}

function defaultSecuritySummary(): StationAdminSecuritySummary {
  return {
    activeSessionCount: 0,
    loginSuccessCount24h: 0,
    loginFailureCount24h: 0,
    lockoutCount24h: 0,
    revokeCount24h: 0,
    uniqueIpCount24h: 0,
    lastEventAt: null,
  };
}

function openDb(
  dependencies: StationAdminSecurityDependencies = {},
): { db: SqliteDatabaseLike; close: () => void } | { fallbackReason: OceanStationsFallbackReason } {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { fallbackReason: "db_path_missing" };
  }

  try {
    const db = openDatabase(databasePath);
    return { db, close: () => db.close() };
  } catch {
    return { fallbackReason: "db_open_failed" };
  }
}

function readLatestSessionMetadata(
  db: SqliteDatabaseLike,
  sessionId: string,
): ReturnType<typeof parseStationAdminEventMetadata> | undefined {
  const rows = db.prepare(
    `SELECT metadata
     FROM station_admin_auth_events
     WHERE session_id = ?
     ORDER BY occurred_at DESC
     LIMIT 1`,
  ).all(sessionId) as Array<{ metadata: string | null }>;

  const metadata = parseStationAdminEventMetadata(rows[0]?.metadata ?? null);

  if (!metadata.ip && !metadata.userAgent && !metadata.source) {
    return undefined;
  }

  return metadata;
}

export function listStationAdminSessions(
  query: StationAdminSessionsQuery = {},
  dependencies: StationAdminSecurityDependencies = {},
): StationAdminSessionsReadResult {
  const normalizedQuery = normalizeStationAdminSessionsQuery(query);
  const handle = openDb(dependencies);
  const now = dependencies.now ?? Date.now;

  if ("fallbackReason" in handle) {
    return {
      source: "mock",
      fallbackReason: handle.fallbackReason,
      filters: normalizedQuery,
    };
  }

  const { db, close } = handle;

  try {
    const rows = db.prepare(
      `SELECT id, actor_id, actor_role, issued_at, expires_at, last_active_at
       FROM station_admin_sessions
       WHERE revoked_at IS NULL AND expires_at > ?
       ORDER BY COALESCE(last_active_at, issued_at) DESC
       LIMIT ?`,
    ).all(new Date(now()).toISOString(), normalizedQuery.limit) as StationAdminSessionRow[];

    return {
      source: "db",
      filters: normalizedQuery,
      sessions: rows.map((row) => {
        const metadata = readLatestSessionMetadata(db, row.id);
        return {
          id: row.id,
          actorId: row.actor_id,
          actorRole: normalizeRole(row.actor_role),
          issuedAt: row.issued_at,
          expiresAt: row.expires_at,
          lastActiveAt: row.last_active_at,
          ip: metadata?.ip ?? null,
          userAgent: metadata?.userAgent ?? null,
          source: metadata?.source ?? null,
          amr: ["pwd"],
          acr: null,
        } satisfies StationAdminSessionSummary;
      }),
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: normalizedQuery,
    };
  } finally {
    close();
  }
}

export function getStationAdminSecuritySummary(
  dependencies: StationAdminSecurityDependencies = {},
): StationAdminSecuritySummaryReadResult {
  const handle = openDb(dependencies);
  const now = dependencies.now ?? Date.now;

  if ("fallbackReason" in handle) {
    return {
      source: "mock",
      fallbackReason: handle.fallbackReason,
      summary: defaultSecuritySummary(),
    };
  }

  const { db, close } = handle;

  try {
    const activeSessionRows = db.prepare(
      `SELECT COUNT(*) AS total
       FROM station_admin_sessions
       WHERE revoked_at IS NULL AND expires_at > ?`,
    ).all(new Date(now()).toISOString()) as Array<{ total: number }>;
    const sinceIso = new Date(now() - 24 * 60 * 60 * 1000).toISOString();
    const eventRows = db.prepare(
      `SELECT event_type, actor_id, occurred_at, metadata
       FROM station_admin_auth_events
       WHERE occurred_at >= ?
       ORDER BY occurred_at DESC`,
    ).all(sinceIso) as StationAdminAuthEventSummaryRow[];

    const uniqueIps = new Set<string>();
    let loginSuccessCount24h = 0;
    let loginFailureCount24h = 0;
    let lockoutCount24h = 0;
    let revokeCount24h = 0;

    for (const row of eventRows) {
      if (row.event_type === "login_success") {
        loginSuccessCount24h += 1;
      }
      if (row.event_type === "login_failure") {
        loginFailureCount24h += 1;
      }
      if (row.event_type === "login_locked") {
        lockoutCount24h += 1;
      }
      if (row.event_type === "revoke") {
        revokeCount24h += 1;
      }

      const metadata = parseStationAdminEventMetadata(row.metadata);
      if (metadata.ip) {
        uniqueIps.add(metadata.ip);
      }
    }

    return {
      source: "db",
      summary: {
        activeSessionCount: activeSessionRows[0]?.total ?? 0,
        loginSuccessCount24h,
        loginFailureCount24h,
        lockoutCount24h,
        revokeCount24h,
        uniqueIpCount24h: uniqueIps.size,
        lastEventAt: eventRows[0]?.occurred_at ?? null,
      },
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      summary: defaultSecuritySummary(),
    };
  } finally {
    close();
  }
}

const ALERT_TIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const ALERT_TIME_WINDOW_LABEL = "24h";
const LOGIN_FAILURE_SAME_IP_THRESHOLD = 5;
const LOGIN_FAILURE_ACTOR_IP_THRESHOLD = 4;
const LOGIN_ATTEMPTS_MANY_IPS_THRESHOLD = 4;
const REPEATED_LOCKOUT_THRESHOLD = 2;

function severityForCount(
  eventCount: number,
  mediumThreshold: number,
  highThreshold: number,
): StationAdminSecurityAlert["severity"] {
  if (eventCount >= highThreshold) {
    return "high";
  }

  if (eventCount >= mediumThreshold) {
    return "medium";
  }

  return "low";
}

function compareSeverity(
  left: StationAdminSecurityAlert["severity"],
  right: StationAdminSecurityAlert["severity"],
): number {
  const rank = {
    high: 3,
    medium: 2,
    low: 1,
  } as const;

  return rank[right] - rank[left];
}

function pushAlert(
  alerts: StationAdminSecurityAlert[],
  alert: StationAdminSecurityAlert,
): void {
  if (alert.eventCount <= 0) {
    return;
  }

  alerts.push(alert);
}

export function getStationAdminSecurityAlerts(
  dependencies: StationAdminSecurityDependencies = {},
): StationAdminSecurityAlertsReadResult {
  const handle = openDb(dependencies);
  const now = dependencies.now ?? Date.now;

  if ("fallbackReason" in handle) {
    return {
      source: "mock",
      fallbackReason: handle.fallbackReason,
      alerts: [],
    };
  }

  const { db, close } = handle;

  try {
    const sinceIso = new Date(now() - ALERT_TIME_WINDOW_MS).toISOString();
    const eventRows = db.prepare(
      `SELECT event_type, actor_id, occurred_at, metadata
       FROM station_admin_auth_events
       WHERE occurred_at >= ?
         AND event_type IN ('login_success', 'login_failure', 'login_locked')
       ORDER BY occurred_at DESC`,
    ).all(sinceIso) as StationAdminAuthEventSummaryRow[];

    const failuresByIp = new Map<string, number>();
    const actorFailuresByIp = new Map<string, number>();
    const actorIpSet = new Map<string, Set<string>>();
    const lockoutsByActor = new Map<string, number>();
    const lockoutsByIp = new Map<string, number>();

    for (const row of eventRows) {
      const metadata = parseStationAdminEventMetadata(row.metadata);
      const actorId = row.actor_id?.trim() || null;
      const ip = metadata.ip?.trim() || null;

      if (row.event_type === "login_failure") {
        if (ip) {
          failuresByIp.set(ip, (failuresByIp.get(ip) ?? 0) + 1);
        }

        if (actorId && ip) {
          const actorIpKey = `${actorId}|${ip}`;
          actorFailuresByIp.set(actorIpKey, (actorFailuresByIp.get(actorIpKey) ?? 0) + 1);
        }
      }

      if ((row.event_type === "login_success" || row.event_type === "login_failure" || row.event_type === "login_locked") && actorId && ip) {
        const existing = actorIpSet.get(actorId) ?? new Set<string>();
        existing.add(ip);
        actorIpSet.set(actorId, existing);
      }

      if (row.event_type === "login_locked") {
        if (actorId) {
          lockoutsByActor.set(actorId, (lockoutsByActor.get(actorId) ?? 0) + 1);
        }
        if (ip) {
          lockoutsByIp.set(ip, (lockoutsByIp.get(ip) ?? 0) + 1);
        }
      }
    }

    const alerts: StationAdminSecurityAlert[] = [];

    for (const [ip, eventCount] of failuresByIp) {
      if (eventCount < LOGIN_FAILURE_SAME_IP_THRESHOLD) {
        continue;
      }

      pushAlert(alerts, {
        alertType: "repeated_login_failures_same_ip",
        severity: severityForCount(eventCount, LOGIN_FAILURE_SAME_IP_THRESHOLD, 10),
        actorId: null,
        ip,
        eventCount,
        timeWindow: ALERT_TIME_WINDOW_LABEL,
      });
    }

    for (const [actorIp, eventCount] of actorFailuresByIp) {
      if (eventCount < LOGIN_FAILURE_ACTOR_IP_THRESHOLD) {
        continue;
      }

      const separatorIndex = actorIp.indexOf("|");
      const actorId = separatorIndex > 0 ? actorIp.slice(0, separatorIndex) : null;
      const ip = separatorIndex > 0 ? actorIp.slice(separatorIndex + 1) : null;

      pushAlert(alerts, {
        alertType: "many_actor_login_failures_one_ip",
        severity: severityForCount(eventCount, LOGIN_FAILURE_ACTOR_IP_THRESHOLD, 7),
        actorId,
        ip,
        eventCount,
        timeWindow: ALERT_TIME_WINDOW_LABEL,
      });
    }

    for (const [actorId, ips] of actorIpSet) {
      if (ips.size < LOGIN_ATTEMPTS_MANY_IPS_THRESHOLD) {
        continue;
      }

      pushAlert(alerts, {
        alertType: "actor_login_many_ips",
        severity: severityForCount(ips.size, LOGIN_ATTEMPTS_MANY_IPS_THRESHOLD, 6),
        actorId,
        ip: null,
        eventCount: ips.size,
        timeWindow: ALERT_TIME_WINDOW_LABEL,
      });
    }

    for (const [actorId, eventCount] of lockoutsByActor) {
      if (eventCount < REPEATED_LOCKOUT_THRESHOLD) {
        continue;
      }

      pushAlert(alerts, {
        alertType: "repeated_lockouts",
        severity: severityForCount(eventCount, REPEATED_LOCKOUT_THRESHOLD, 4),
        actorId,
        ip: null,
        eventCount,
        timeWindow: ALERT_TIME_WINDOW_LABEL,
      });
    }

    for (const [ip, eventCount] of lockoutsByIp) {
      if (eventCount < REPEATED_LOCKOUT_THRESHOLD) {
        continue;
      }

      pushAlert(alerts, {
        alertType: "repeated_lockouts",
        severity: severityForCount(eventCount, REPEATED_LOCKOUT_THRESHOLD, 4),
        actorId: null,
        ip,
        eventCount,
        timeWindow: ALERT_TIME_WINDOW_LABEL,
      });
    }

    alerts.sort((left, right) => {
      const severityOrder = compareSeverity(left.severity, right.severity);

      if (severityOrder !== 0) {
        return severityOrder;
      }

      return right.eventCount - left.eventCount;
    });

    return {
      source: "db",
      alerts,
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      alerts: [],
    };
  } finally {
    close();
  }
}
