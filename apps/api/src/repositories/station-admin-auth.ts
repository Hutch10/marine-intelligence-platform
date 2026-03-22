import type {
  OceanStationAdminAuthContext,
  OceanStationAdminPermission,
  OceanStationAdminRole,
} from "@marine/shared";
import {
  hasDatabasePath,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { OceanStationsFallbackReason } from "../types";

interface StationAdminSessionRow {
  id: string;
  actor_id: string;
  actor_role: string;
  permissions: string | null;
  metadata: string | null;
  csrf_token: string;
  issued_at: string;
  expires_at: string;
  last_active_at: string | null;
  revoked_at: string | null;
}

interface StationAdminCredentialMfaRow {
  mfa_enabled: number | boolean | null;
  mfa_enrolled_at: string | null;
  mfa_last_verified_at: string | null;
  mfa_recovery_codes: string | null;
}

interface StationAdminAuthRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openWritableDatabase;
  now?: () => number;
  sessionIdleTimeoutMs?: number;
}

export type StationAdminSessionReadResult =
  | {
      source: "db";
      result: "found";
      auth: OceanStationAdminAuthContext;
    }
  | {
      source: "db";
      result: "not_found";
    }
  | {
      source: "mock";
      fallbackReason: OceanStationsFallbackReason;
    };

function normalizeRole(value: string): OceanStationAdminAuthContext["role"] | null {
  if (value === "admin" || value === "viewer") {
    return value;
  }

  return null;
}

const STATION_ADMIN_PERMISSION_SET = new Set<OceanStationAdminPermission>([
  "station.view_admin",
  "station.edit_branding",
  "station.edit_content",
  "station.view_audit",
  "station.publish",
]);

function defaultPermissionsForRole(role: OceanStationAdminRole): OceanStationAdminPermission[] {
  if (role === "admin") {
    return [...STATION_ADMIN_PERMISSION_SET];
  }

  return ["station.view_admin"];
}

function parsePermissionsFromJson(value: string | null): OceanStationAdminPermission[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    const permissions = parsed.filter((item): item is OceanStationAdminPermission => (
      typeof item === "string" && STATION_ADMIN_PERMISSION_SET.has(item as OceanStationAdminPermission)
    ));

    return [...new Set(permissions)];
  } catch {
    return [];
  }
}

function parsePermissionsFromMetadata(value: string | null): OceanStationAdminPermission[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || !("permissions" in parsed)) {
      return [];
    }

    const permissions = (parsed as { permissions?: unknown }).permissions;

    if (!Array.isArray(permissions)) {
      return [];
    }

    const normalized = permissions.filter((item): item is OceanStationAdminPermission => (
      typeof item === "string" && STATION_ADMIN_PERMISSION_SET.has(item as OceanStationAdminPermission)
    ));

    return [...new Set(normalized)];
  } catch {
    return [];
  }
}

function resolveSessionPermissions(
  row: StationAdminSessionRow,
  role: OceanStationAdminRole,
): OceanStationAdminPermission[] {
  const explicitPermissions = parsePermissionsFromJson(row.permissions);

  if (explicitPermissions.length > 0) {
    return explicitPermissions;
  }

  const metadataPermissions = parsePermissionsFromMetadata(row.metadata);

  if (metadataPermissions.length > 0) {
    return metadataPermissions;
  }

  return defaultPermissionsForRole(role);
}

function parseRecoveryCodesRemaining(value: string | null): number {
  if (!value) {
    return 0;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return 0;
    }

    return parsed.filter((code) => {
      if (typeof code === "string") {
        return true;
      }

      if (!code || typeof code !== "object") {
        return false;
      }

      return (code as { usedAt?: unknown }).usedAt == null;
    }).length;
  } catch {
    return 0;
  }
}

function readMfaEnrollmentState(
  db: SqliteDatabaseLike,
  actorId: string,
): OceanStationAdminAuthContext["mfa"] {
  try {
    const rows = db
      .prepare(
        `SELECT mfa_enabled, mfa_enrolled_at, mfa_last_verified_at, mfa_recovery_codes
         FROM station_admin_credentials
         WHERE id = ?
         LIMIT 1`,
      )
      .all(actorId) as StationAdminCredentialMfaRow[];
    const row = rows[0];

    if (!row) {
      return undefined;
    }

    const enabled = typeof row.mfa_enabled === "boolean" ? row.mfa_enabled : row.mfa_enabled === 1;

    return {
      enabled,
      enrolledAt: row.mfa_enrolled_at ?? null,
      lastVerifiedAt: row.mfa_last_verified_at ?? null,
      recoveryCodesRemaining: parseRecoveryCodesRemaining(row.mfa_recovery_codes),
    };
  } catch {
    return undefined;
  }
}

const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export function getStationAdminSessionAuth(
  sessionId: string,
  dependencies: StationAdminAuthRepositoryDependencies = {},
): StationAdminSessionReadResult {
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    return {
      source: "db",
      result: "not_found",
    };
  }

  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const sessionIdleTimeoutMs = dependencies.sessionIdleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "mock",
      fallbackReason: "db_path_missing",
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_open_failed",
    };
  }

  try {
    const rows = db
      .prepare(
        `SELECT id, actor_id, actor_role, permissions, metadata, csrf_token, issued_at, expires_at, last_active_at, revoked_at
         FROM station_admin_sessions
         WHERE id = ?
         LIMIT 1`,
      )
      .all(normalizedSessionId) as StationAdminSessionRow[];
    const row = rows[0];

    if (!row || row.revoked_at !== null) {
      return {
        source: "db",
        result: "not_found",
      };
    }

    const role = normalizeRole(row.actor_role);

    if (!role || !row.actor_id.trim()) {
      return {
        source: "db",
        result: "not_found",
      };
    }

    const expiresAtMs = new Date(row.expires_at).getTime();

    const nowMs = now();

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      const updateStatement = db.prepare("UPDATE station_admin_sessions SET revoked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL");

      if (updateStatement.run) {
        updateStatement.run(new Date(nowMs).toISOString(), normalizedSessionId);
      }

      return {
        source: "db",
        result: "not_found",
      };
    }

    if (row.last_active_at !== null) {
      const lastActiveMs = new Date(row.last_active_at).getTime();

      if (Number.isFinite(lastActiveMs) && nowMs - lastActiveMs > sessionIdleTimeoutMs) {
        const updateStatement = db.prepare("UPDATE station_admin_sessions SET revoked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL");

        if (updateStatement.run) {
          updateStatement.run(new Date(nowMs).toISOString(), normalizedSessionId);
        }

        return {
          source: "db",
          result: "not_found",
        };
      }
    }

    const touchStatement = db.prepare("UPDATE station_admin_sessions SET last_active_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    if (touchStatement.run) {
      touchStatement.run(new Date(nowMs).toISOString(), normalizedSessionId);
    }

    return {
      source: "db",
      result: "found",
      auth: {
        actorId: row.actor_id,
        role,
        permissions: resolveSessionPermissions(row, role),
        csrfToken: row.csrf_token,
        mfa: readMfaEnrollmentState(db, row.actor_id),
      },
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
    };
  } finally {
    db.close();
  }
}
