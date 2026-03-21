import type {
  StationAdminMfaChallenge,
  StationAdminMfaChallengePurpose,
  StationAdminMfaEnrollmentState,
  OceanStationAdminPermission,
  OceanStationAdminRole,
  StationAdminRequestMetadata,
} from "../../../web/lib/api/types";
import { verifyTotpToken } from "../security/totp";
import { resolveMfaSecret } from "../security/mfa-secret";
import {
  hasDatabasePath,
  openWritableDatabase,
  resolveDatabasePath,
} from "../db/client";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const MFA_CHALLENGE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MFA_STEP_UP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_MAX_IP_LOGIN_ATTEMPTS = 10;
const DEFAULT_LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MFA_VERIFY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_CHALLENGE = 5;
const DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_ACTOR = 12;
const DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_IP = 20;
const DEFAULT_REPEATED_MFA_LOCKOUT_THRESHOLD = 2;
const DEFAULT_REPEATED_MFA_EXPIRED_THRESHOLD = 3;
const DEFAULT_REPEATED_INVALID_MFA_ATTEMPT_THRESHOLD = 6;
const MFA_ABUSE_EVENT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const ALL_PERMISSIONS: OceanStationAdminPermission[] = [
  "station.view_admin",
  "station.edit_branding",
  "station.edit_content",
  "station.view_audit",
  "station.publish",
];

interface CredentialsRow {
  id: string;
  actor_role: string;
  password_hash: string;
  salt: string;
  mfa_enabled: number | boolean | null;
  mfa_secret: string | null;
  mfa_recovery_codes: string | null;
  mfa_enrolled_at: string | null;
  mfa_last_verified_at: string | null;
}

interface MfaChallengeRow {
  id: string;
  actor_id: string;
  challenge_purpose: string;
  session_id: string | null;
  expires_at: string;
  attempts_remaining: number;
  consumed_at: string | null;
  metadata: string | null;
}

interface SessionRow {
  id: string;
  actor_id: string;
  actor_role: string;
  permissions: string | null;
  csrf_token: string;
  last_active_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}

interface AuthEventThrottleRow {
  actor_id: string | null;
  metadata: string | null;
}

interface WritableStmtLike {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

interface WritableDbLike {
  prepare(sql: string): WritableStmtLike;
  exec?: (sql: string) => void;
  close(): void;
}

export interface StationAdminLifecycleDependencies {
  resolvePath?: () => string;
  hasPath?: (path: string) => boolean;
  openDatabase?: (path: string) => WritableDbLike;
  now?: () => number;
  generateToken?: (bytes?: number) => string;
  maxLoginAttempts?: number;
  maxIpLoginAttempts?: number;
  lockoutWindowMs?: number;
  mfaStepUpWindowMs?: number;
  mfaVerifyRateLimitWindowMs?: number;
  maxMfaVerifyAttemptsPerChallenge?: number;
  maxMfaVerifyAttemptsPerActor?: number;
  maxMfaVerifyAttemptsPerIp?: number;
  repeatedMfaLockoutThreshold?: number;
  repeatedMfaExpiredThreshold?: number;
  repeatedInvalidMfaAttemptThreshold?: number;
  requestMetadata?: StationAdminRequestMetadata;
}

export type StationAdminLoginResult =
  | {
      result: "issued";
      sessionId: string;
      csrfToken: string;
      expiresAt: string;
      actorId: string;
      actorRole: OceanStationAdminRole;
      permissions: OceanStationAdminPermission[];
      mfa: StationAdminMfaEnrollmentState;
    }
  | {
      result: "pending_mfa";
      actorId: string;
      actorRole: OceanStationAdminRole;
      challenge: StationAdminMfaChallenge;
      mfa: StationAdminMfaEnrollmentState;
    }
  | { result: "invalid_credentials" }
  | { result: "locked_out" }
  | { result: "not_available" };

export type StationAdminMfaVerifyResult =
  | {
      result: "issued";
      sessionId: string;
      csrfToken: string;
      expiresAt: string;
      actorId: string;
      actorRole: OceanStationAdminRole;
      permissions: OceanStationAdminPermission[];
      mfa: StationAdminMfaEnrollmentState;
    }
  | {
      result: "verified";
      challengePurpose: StationAdminMfaChallengePurpose;
      actorId: string;
      mfa: StationAdminMfaEnrollmentState;
    }
  | { result: "mfa_failed"; attemptsRemaining: number; lockedOut: boolean }
  | { result: "locked_out"; attemptsRemaining: 0 }
  | { result: "rate_limited"; retryAfterSeconds: number }
  | { result: "expired" }
  | { result: "not_found" }
  | { result: "invalid_request" };

export type StationAdminLogoutResult =
  | { result: "revoked"; actorId: string }
  | { result: "not_found" }
  | { result: "csrf_invalid" };

export type StationAdminRefreshResult =
  | {
      result: "refreshed";
      sessionId: string;
      csrfToken: string;
      expiresAt: string;
      actorId: string;
    }
  | { result: "not_found" }
  | { result: "csrf_invalid" };

export type StationAdminRevokeResult =
  | { result: "revoked"; actorId: string }
  | { result: "not_found" }
  | { result: "csrf_invalid" }
  | { result: "forbidden" }
  | { result: "mfa_required"; challenge: StationAdminMfaChallenge };

export type StationAdminAuthEventType =
  | "login_success"
  | "login_failure"
  | "login_locked"
  | "mfa_enrollment"
  | "mfa_challenge_success"
  | "mfa_challenge_failure"
  | "mfa_challenge_locked"
  | "mfa_challenge_expired"
  | "mfa_verify_rate_limited"
  | "mfa_abuse_detected"
  | "recovery_code_used"
  | "logout"
  | "refresh"
  | "revoke";

interface StoredRecoveryCode {
  codeHash: string;
  usedAt: string | null;
}

function writeAuthEvent(
  db: WritableDbLike,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  eventType: StationAdminAuthEventType,
  actorId: string | null,
  sessionId: string | null,
  metadata?: Record<string, unknown> | null,
): void {
  try {
    db.prepare(
      `INSERT INTO station_admin_auth_events (id, event_type, actor_id, session_id, occurred_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      tokenFn(16),
      eventType,
      actorId,
      sessionId,
      new Date(nowMs).toISOString(),
      metadata ? JSON.stringify(metadata) : null,
    );
  } catch {
    // Auth event writes are non-fatal
  }
}

function normalizeRequestMetadata(
  metadata: StationAdminRequestMetadata | undefined,
): StationAdminRequestMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const ip = typeof metadata.ip === "string" && metadata.ip.trim() ? metadata.ip.trim() : null;
  const userAgent = typeof metadata.userAgent === "string" && metadata.userAgent.trim()
    ? metadata.userAgent.trim()
    : null;
  const source = typeof metadata.source === "string" && metadata.source.trim()
    ? metadata.source.trim()
    : null;

  if (!ip && !userAgent && !source) {
    return undefined;
  }

  return {
    ip,
    userAgent,
    source,
  };
}

function parseRequestMetadata(value: string | null): StationAdminRequestMetadata | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeRequestMetadata(JSON.parse(value) as StationAdminRequestMetadata);
  } catch {
    return undefined;
  }
}

function buildEventMetadata(
  requestMetadata: StationAdminRequestMetadata | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = { ...extra };

  if (requestMetadata?.ip) {
    metadata.ip = requestMetadata.ip;
  }

  if (requestMetadata?.userAgent) {
    metadata.userAgent = requestMetadata.userAgent;
  }

  if (requestMetadata?.source) {
    metadata.source = requestMetadata.source;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function generateToken(bytes = 32): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomBytes } = runtimeRequire("node:crypto") as {
    randomBytes: (size: number) => Buffer;
  };
  return randomBytes(bytes).toString("hex");
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const runtimeRequire = eval("require") as NodeRequire;
  const { scryptSync, timingSafeEqual } = runtimeRequire("node:crypto") as {
    scryptSync: (password: string, salt: Buffer, keylen: number) => Buffer;
    timingSafeEqual: (a: Buffer, b: Buffer) => boolean;
  };

  try {
    const saltBuffer = Buffer.from(salt, "hex");
    const derived = scryptSync(password, saltBuffer, 64);
    const stored = Buffer.from(storedHash, "hex");

    if (derived.length !== stored.length) {
      return false;
    }

    return timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

function normalizeRole(value: string): OceanStationAdminRole | null {
  if (value === "admin" || value === "viewer") {
    return value;
  }

  return null;
}

function defaultPermissionsForRole(role: OceanStationAdminRole): OceanStationAdminPermission[] {
  return role === "admin" ? [...ALL_PERMISSIONS] : ["station.view_admin"];
}

function issueSession(
  db: WritableDbLike,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  actorId: string,
  role: OceanStationAdminRole,
  permissions: OceanStationAdminPermission[],
): {
  sessionId: string;
  csrfToken: string;
  expiresAt: string;
} {
  const sessionId = tokenFn(32);
  const csrfToken = tokenFn(32);
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_DURATION_MS).toISOString();

  db.prepare(
    `INSERT INTO station_admin_sessions
       (id, actor_id, actor_role, permissions, csrf_token, issued_at, expires_at, last_active_at, revoked_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
  ).run(
    sessionId,
    actorId,
    role,
    JSON.stringify(permissions),
    csrfToken,
    issuedAt,
    expiresAt,
    issuedAt,
  );

  return {
    sessionId,
    csrfToken,
    expiresAt,
  };
}

function normalizeMfaChallengePurpose(value: string): StationAdminMfaChallengePurpose | null {
  if (value === "login" || value === "session_revoke" || value === "permission_mutation") {
    return value;
  }

  return null;
}

function toBooleanFlag(value: number | boolean | null): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return value === 1;
}

function normalizeRecoveryCodeInput(value: string): string {
  return value.trim().replace(/[\-\s]/g, "").toUpperCase();
}

function hashRecoveryCode(value: string): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createHash, createHmac } = runtimeRequire("node:crypto") as {
    createHash: (algorithm: string) => { update: (data: string) => { digest: (encoding: "hex") => string } };
    createHmac: (algorithm: string, key: string) => {
      update: (data: string) => { digest: (encoding: "hex") => string };
    };
  };
  const normalized = normalizeRecoveryCodeInput(value);
  const pepper = process.env.STATION_ADMIN_RECOVERY_CODE_PEPPER;

  if (typeof pepper === "string" && pepper.trim().length > 0) {
    return createHmac("sha256", pepper).update(normalized).digest("hex");
  }

  return createHash("sha256").update(normalized).digest("hex");
}

function hashRecoveryCodeLegacy(value: string): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createHash } = runtimeRequire("node:crypto") as {
    createHash: (algorithm: string) => { update: (data: string) => { digest: (encoding: "hex") => string } };
  };
  return createHash("sha256").update(normalizeRecoveryCodeInput(value)).digest("hex");
}

function parseStoredRecoveryCodes(value: string | null): StoredRecoveryCode[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    const codes: StoredRecoveryCode[] = [];

    for (const item of parsed) {
      if (typeof item === "string") {
        codes.push({ codeHash: hashRecoveryCode(item), usedAt: null });
        continue;
      }

      if (!item || typeof item !== "object") {
        continue;
      }

      const maybeHash = (item as { codeHash?: unknown }).codeHash;
      const maybeUsedAt = (item as { usedAt?: unknown }).usedAt;

      if (typeof maybeHash !== "string" || !maybeHash.trim()) {
        continue;
      }

      codes.push({
        codeHash: maybeHash,
        usedAt: typeof maybeUsedAt === "string" ? maybeUsedAt : null,
      });
    }

    return codes;
  } catch {
    return [];
  }
}

function buildMfaEnrollmentState(credential: CredentialsRow): StationAdminMfaEnrollmentState {
  const recoveryCodes = parseStoredRecoveryCodes(credential.mfa_recovery_codes);
  const recoveryCodesRemaining = recoveryCodes.filter((code) => code.usedAt === null).length;

  return {
    enabled: toBooleanFlag(credential.mfa_enabled),
    enrolledAt: credential.mfa_enrolled_at ?? null,
    lastVerifiedAt: credential.mfa_last_verified_at ?? null,
    recoveryCodesRemaining,
  };
}

function verifyMfaCode(code: string | undefined, secret: string | null, nowMs?: number): boolean {
  if (!code || !secret) {
    return false;
  }

  // Decrypt if the stored value is an AES-256-GCM envelope; pass through
  // plaintext values for backward compatibility during migration.
  const resolvedSecret = resolveMfaSecret(secret);
  if (!resolvedSecret) {
    return false;
  }

  return verifyTotpToken(code, resolvedSecret, nowMs).valid;
}

function consumeRecoveryCode(
  code: string | undefined,
  storedCodes: StoredRecoveryCode[],
  consumedAt: string,
): { consumed: boolean; updatedCodes: StoredRecoveryCode[] } {
  if (!code) {
    return { consumed: false, updatedCodes: storedCodes };
  }

  const normalizedHash = hashRecoveryCode(code);
  const legacyHash = hashRecoveryCodeLegacy(code);
  let consumed = false;

  const updatedCodes = storedCodes.map((stored) => {
    if (consumed) {
      return stored;
    }

    if (stored.usedAt !== null || (stored.codeHash !== normalizedHash && stored.codeHash !== legacyHash)) {
      return stored;
    }

    consumed = true;
    return {
      ...stored,
      usedAt: consumedAt,
    };
  });

  return { consumed, updatedCodes };
}

function parseMetadataObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readStringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRunChanges(result: unknown): number | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const maybeChanges = (result as { changes?: unknown }).changes;
  return typeof maybeChanges === "number" ? maybeChanges : undefined;
}

function executeSql(db: WritableDbLike, sql: string): void {
  if (typeof db.exec === "function") {
    db.exec(sql);
    return;
  }

  db.prepare(sql).run();
}

function beginTransaction(db: WritableDbLike): void {
  executeSql(db, "BEGIN IMMEDIATE");
}

function commitTransaction(db: WritableDbLike): void {
  executeSql(db, "COMMIT");
}

function rollbackTransaction(db: WritableDbLike): void {
  executeSql(db, "ROLLBACK");
}

interface MfaRateLimitDecision {
  limited: boolean;
  scope?: "challenge" | "actor" | "ip";
  eventCount?: number;
  threshold?: number;
}

function evaluateMfaVerifyRateLimit(
  db: WritableDbLike,
  challengeId: string,
  actorId: string,
  ip: string | null,
  nowMs: number,
  windowMs: number,
  maxPerChallenge: number,
  maxPerActor: number,
  maxPerIp: number,
): MfaRateLimitDecision {
  try {
    const sinceIso = new Date(nowMs - windowMs).toISOString();
    const rows = db.prepare(
      `SELECT actor_id, metadata
       FROM station_admin_auth_events
       WHERE event_type = 'mfa_challenge_failure'
         AND occurred_at > ?`,
    ).all(sinceIso) as AuthEventThrottleRow[];

    let challengeFailureCount = 0;
    let actorFailureCount = 0;
    let ipFailureCount = 0;

    for (const row of rows) {
      if (row.actor_id === actorId) {
        actorFailureCount += 1;
      }

      const metadata = parseMetadataObject(row.metadata);
      const rowChallengeId = readStringMetadata(metadata, "challengeId");
      const rowIp = readStringMetadata(metadata, "ip");

      if (rowChallengeId === challengeId) {
        challengeFailureCount += 1;
      }

      if (ip && rowIp === ip) {
        ipFailureCount += 1;
      }
    }

    if (challengeFailureCount >= maxPerChallenge) {
      return {
        limited: true,
        scope: "challenge",
        eventCount: challengeFailureCount,
        threshold: maxPerChallenge,
      };
    }

    if (actorFailureCount >= maxPerActor) {
      return {
        limited: true,
        scope: "actor",
        eventCount: actorFailureCount,
        threshold: maxPerActor,
      };
    }

    if (ip && ipFailureCount >= maxPerIp) {
      return {
        limited: true,
        scope: "ip",
        eventCount: ipFailureCount,
        threshold: maxPerIp,
      };
    }
  } catch {
    // If auth event reads fail, preserve availability by skipping rate limits.
  }

  return { limited: false };
}

function countRecentAuthEvents(
  db: WritableDbLike,
  eventType: StationAdminAuthEventType,
  nowMs: number,
  windowMs: number,
  actorId: string | null,
  ip: string | null,
): number {
  try {
    const sinceIso = new Date(nowMs - windowMs).toISOString();
    const rows = db.prepare(
      `SELECT actor_id, metadata
       FROM station_admin_auth_events
       WHERE event_type = ?
         AND occurred_at > ?`,
    ).all(eventType, sinceIso) as AuthEventThrottleRow[];

    let count = 0;

    for (const row of rows) {
      if (actorId && row.actor_id !== actorId) {
        continue;
      }

      if (ip) {
        const metadata = parseMetadataObject(row.metadata);
        const rowIp = readStringMetadata(metadata, "ip");
        if (rowIp !== ip) {
          continue;
        }
      }

      count += 1;
    }

    return count;
  } catch {
    return 0;
  }
}

function maybeWriteMfaAbuseEvent(
  db: WritableDbLike,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  actorId: string,
  sessionId: string | null,
  requestMetadata: StationAdminRequestMetadata | undefined,
  pattern: "repeated_locked_out" | "repeated_expired_challenge" | "repeated_invalid_verify_attempts",
  eventCount: number,
  threshold: number,
  extra: Record<string, unknown>,
): void {
  if (eventCount < threshold) {
    return;
  }

  // Coalesce repeated abuse signals: emit on first threshold breach and each threshold multiple.
  if (eventCount > threshold && eventCount % threshold !== 0) {
    return;
  }

  writeAuthEvent(
    db,
    tokenFn,
    nowMs,
    "mfa_abuse_detected",
    actorId,
    sessionId,
    buildEventMetadata(requestMetadata, {
      pattern,
      eventCount,
      threshold,
      ...extra,
    }),
  );
}

function toMfaChallenge(row: MfaChallengeRow): StationAdminMfaChallenge | null {
  const purpose = normalizeMfaChallengePurpose(row.challenge_purpose);

  if (!purpose) {
    return null;
  }

  return {
    challengeId: row.id,
    purpose,
    expiresAt: row.expires_at,
    recoveryCodeAllowed: true,
  };
}

function createMfaChallenge(
  db: WritableDbLike,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  actorId: string,
  purpose: StationAdminMfaChallengePurpose,
  requestMetadata: StationAdminRequestMetadata | undefined,
  sessionId?: string,
): StationAdminMfaChallenge {
  const challengeId = tokenFn(16);
  const expiresAt = new Date(nowMs + MFA_CHALLENGE_DURATION_MS).toISOString();
  const metadata = buildEventMetadata(requestMetadata, {
    purpose,
  });

  db.prepare(
    `INSERT INTO station_admin_mfa_challenges
       (id, actor_id, challenge_purpose, session_id, expires_at, attempts_remaining, consumed_at, metadata)
     VALUES (?, ?, ?, ?, ?, 5, NULL, ?)`,
  ).run(
    challengeId,
    actorId,
    purpose,
    sessionId ?? null,
    expiresAt,
    metadata ? JSON.stringify(metadata) : null,
  );

  return {
    challengeId,
    purpose,
    expiresAt,
    recoveryCodeAllowed: true,
  };
}

function hasRecentStepUp(
  db: WritableDbLike,
  actorId: string,
  sessionId: string,
  nowMs: number,
  windowMs: number,
): boolean {
  try {
    const sinceIso = new Date(nowMs - windowMs).toISOString();
    const rows = db
      .prepare(
        `SELECT event_type, occurred_at, metadata
         FROM station_admin_auth_events
         WHERE actor_id = ?
         AND session_id = ?
         AND event_type = 'mfa_challenge_success'
         AND occurred_at > ?
         ORDER BY occurred_at DESC
         LIMIT 10`,
      )
      .all(actorId, sessionId, sinceIso) as Array<{
        event_type: string;
        occurred_at: string | null;
        metadata: string | null;
      }>;

    for (const row of rows) {
      if (row.event_type !== "mfa_challenge_success") {
        continue;
      }

      const occurredAtMs = row.occurred_at ? new Date(row.occurred_at).getTime() : Number.NaN;

      if (!Number.isFinite(occurredAtMs) || nowMs - occurredAtMs > windowMs) {
        continue;
      }

      const metadata = parseMetadataObject(row.metadata);
      if (metadata?.challengePurpose === "session_revoke") {
        return true;
      }
    }

    return false;
  } catch {
    // Default to requiring step-up MFA if auth event lookup is unavailable.
    return false;
  }
}

function openDb(
  deps: StationAdminLifecycleDependencies,
): { db: WritableDbLike; close: () => void } | null {
  const resolvePath = deps.resolvePath ?? resolveDatabasePath;
  const hasPath = deps.hasPath ?? hasDatabasePath;
  const open = deps.openDatabase ?? (openWritableDatabase as unknown as (path: string) => WritableDbLike);
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return null;
  }

  try {
    const db = open(dbPath);
    return { db, close: () => db.close() };
  } catch {
    return null;
  }
}

export function loginStationAdmin(
  actorId: string,
  password: string,
  dependencies: StationAdminLifecycleDependencies = {},
): StationAdminLoginResult {
  const normalizedActorId = actorId.trim();
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const maxLoginAttempts = dependencies.maxLoginAttempts ?? DEFAULT_MAX_LOGIN_ATTEMPTS;
  const maxIpLoginAttempts = dependencies.maxIpLoginAttempts ?? DEFAULT_MAX_IP_LOGIN_ATTEMPTS;
  const lockoutWindowMs = dependencies.lockoutWindowMs ?? DEFAULT_LOCKOUT_WINDOW_MS;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedActorId || !password) {
    return { result: "invalid_credentials" };
  }

  const handle = openDb(dependencies);

  if (!handle) {
    return { result: "not_available" };
  }

  const { db, close } = handle;

  try {
    let lockoutScope: "actor" | "ip" | null = null;
    try {
      const sinceIso = new Date(now() - lockoutWindowMs).toISOString();
      const recentFailureRows = db
        .prepare(
          `SELECT actor_id, metadata FROM station_admin_auth_events
           WHERE event_type IN ('login_failure', 'login_locked')
           AND occurred_at > ?`,
        )
        .all(sinceIso) as AuthEventThrottleRow[];

      let actorFailureCount = 0;
      let ipFailureCount = 0;

      for (const row of recentFailureRows) {
        if (row.actor_id === normalizedActorId) {
          actorFailureCount += 1;
        }

        if (requestMetadata?.ip) {
          const rowMetadata = parseRequestMetadata(row.metadata);
          if (rowMetadata?.ip === requestMetadata.ip) {
            ipFailureCount += 1;
          }
        }
      }

      if (actorFailureCount >= maxLoginAttempts) {
        lockoutScope = "actor";
      } else if (requestMetadata?.ip && ipFailureCount >= maxIpLoginAttempts) {
        lockoutScope = "ip";
      }
    } catch {
      // If auth_events table is not yet available, skip lockout checks.
    }

    if (lockoutScope) {
      writeAuthEvent(
        db,
        tokenFn,
        now(),
        "login_locked",
        normalizedActorId,
        null,
        buildEventMetadata(requestMetadata, { lockoutScope }),
      );
      return { result: "locked_out" };
    }

    const credRows = db
      .prepare(
        `SELECT id, actor_role, password_hash, salt, mfa_enabled, mfa_secret, mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
         FROM station_admin_credentials
         WHERE id = ?
         LIMIT 1`,
      )
      .all(normalizedActorId) as CredentialsRow[];
    const cred = credRows[0];

    if (!cred) {
      writeAuthEvent(
        db,
        tokenFn,
        now(),
        "login_failure",
        normalizedActorId,
        null,
        buildEventMetadata(requestMetadata),
      );
      return { result: "invalid_credentials" };
    }

    const passwordValid = verifyPassword(password, cred.salt, cred.password_hash);

    if (!passwordValid) {
      writeAuthEvent(
        db,
        tokenFn,
        now(),
        "login_failure",
        normalizedActorId,
        null,
        buildEventMetadata(requestMetadata),
      );
      return { result: "invalid_credentials" };
    }

    const role = normalizeRole(cred.actor_role);

    if (!role) {
      writeAuthEvent(
        db,
        tokenFn,
        now(),
        "login_failure",
        normalizedActorId,
        null,
        buildEventMetadata(requestMetadata),
      );
      return { result: "invalid_credentials" };
    }

    const mfaState = buildMfaEnrollmentState(cred);

    if (mfaState.enabled) {
      const challenge = createMfaChallenge(
        db,
        tokenFn,
        now(),
        normalizedActorId,
        "login",
        requestMetadata,
      );

      return {
        result: "pending_mfa",
        actorId: normalizedActorId,
        actorRole: role,
        challenge,
        mfa: mfaState,
      };
    }
    const nowMs = now();
    const permissions = defaultPermissionsForRole(role);
    const issuedSession = issueSession(db, tokenFn, nowMs, normalizedActorId, role, permissions);

    writeAuthEvent(
      db,
      tokenFn,
      nowMs,
      "login_success",
      normalizedActorId,
      issuedSession.sessionId,
      buildEventMetadata(requestMetadata),
    );

    return {
      result: "issued",
      sessionId: issuedSession.sessionId,
      csrfToken: issuedSession.csrfToken,
      expiresAt: issuedSession.expiresAt,
      actorId: normalizedActorId,
      actorRole: role,
      permissions,
      mfa: mfaState,
    };
  } catch {
    return { result: "not_available" };
  } finally {
    close();
  }
}

export function verifyStationAdminMfaChallenge(
  challengeId: string,
  code: string | undefined,
  recoveryCode: string | undefined,
  sessionId: string | undefined,
  csrfToken: string | undefined,
  dependencies: StationAdminLifecycleDependencies = {},
): StationAdminMfaVerifyResult {
  const normalizedChallengeId = challengeId.trim();
  const normalizedCode = typeof code === "string" && code.trim() ? code.trim() : undefined;
  const normalizedRecoveryCode = typeof recoveryCode === "string" && recoveryCode.trim() ? recoveryCode.trim() : undefined;
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  const normalizedCsrfToken = typeof csrfToken === "string" ? csrfToken.trim() : "";
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const mfaVerifyRateLimitWindowMs = dependencies.mfaVerifyRateLimitWindowMs ?? DEFAULT_MFA_VERIFY_RATE_LIMIT_WINDOW_MS;
  const maxMfaVerifyAttemptsPerChallenge = dependencies.maxMfaVerifyAttemptsPerChallenge
    ?? DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_CHALLENGE;
  const maxMfaVerifyAttemptsPerActor = dependencies.maxMfaVerifyAttemptsPerActor
    ?? DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_ACTOR;
  const maxMfaVerifyAttemptsPerIp = dependencies.maxMfaVerifyAttemptsPerIp
    ?? DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_IP;
  const repeatedMfaLockoutThreshold = dependencies.repeatedMfaLockoutThreshold
    ?? DEFAULT_REPEATED_MFA_LOCKOUT_THRESHOLD;
  const repeatedMfaExpiredThreshold = dependencies.repeatedMfaExpiredThreshold
    ?? DEFAULT_REPEATED_MFA_EXPIRED_THRESHOLD;
  const repeatedInvalidMfaAttemptThreshold = dependencies.repeatedInvalidMfaAttemptThreshold
    ?? DEFAULT_REPEATED_INVALID_MFA_ATTEMPT_THRESHOLD;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedChallengeId || (!normalizedCode && !normalizedRecoveryCode)) {
    return { result: "invalid_request" };
  }

  const handle = openDb(dependencies);

  if (!handle) {
    return { result: "not_found" };
  }

  const { db, close } = handle;
  let transactionOpen = false;

  try {
    beginTransaction(db);
    transactionOpen = true;
    const rollbackAndReturn = (result: StationAdminMfaVerifyResult): StationAdminMfaVerifyResult => {
      if (transactionOpen) {
        try {
          rollbackTransaction(db);
        } catch {
          // Ignore rollback failures to preserve previous error contract behavior.
        }
        transactionOpen = false;
      }

      return result;
    };

    // Single commit point: commit the transaction and return the result atomically.
    // Using a helper prevents accidental code insertion between COMMIT and return.
    const commitAndReturn = (result: StationAdminMfaVerifyResult): StationAdminMfaVerifyResult => {
      commitTransaction(db);
      transactionOpen = false;
      return result;
    };

    const challengeRows = db
      .prepare(
        `SELECT id, actor_id, challenge_purpose, session_id, expires_at, attempts_remaining, consumed_at, metadata
         FROM station_admin_mfa_challenges
         WHERE id = ?
         LIMIT 1`,
      )
      .all(normalizedChallengeId) as MfaChallengeRow[];
    const challengeRow = challengeRows[0];

    if (!challengeRow || challengeRow.consumed_at !== null) {
      return rollbackAndReturn({ result: "not_found" });
    }

    const challengePurpose = normalizeMfaChallengePurpose(challengeRow.challenge_purpose);

    if (!challengePurpose) {
      return rollbackAndReturn({ result: "not_found" });
    }

    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAtMs = new Date(challengeRow.expires_at).getTime();

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      db.prepare("UPDATE station_admin_mfa_challenges SET consumed_at = COALESCE(consumed_at, ?) WHERE id = ?").run(
        nowIso,
        normalizedChallengeId,
      );
      writeAuthEvent(
        db,
        tokenFn,
        nowMs,
        "mfa_challenge_expired",
        challengeRow.actor_id,
        challengeRow.session_id,
        buildEventMetadata(requestMetadata, {
          challengeId: normalizedChallengeId,
          challengePurpose,
        }),
      );

      const expiredEventCount = countRecentAuthEvents(
        db,
        "mfa_challenge_expired",
        nowMs,
        MFA_ABUSE_EVENT_WINDOW_MS,
        challengeRow.actor_id,
        requestMetadata?.ip ?? null,
      );

      maybeWriteMfaAbuseEvent(
        db,
        tokenFn,
        nowMs,
        challengeRow.actor_id,
        challengeRow.session_id,
        requestMetadata,
        "repeated_expired_challenge",
        expiredEventCount,
        repeatedMfaExpiredThreshold,
        {
          challengeId: normalizedChallengeId,
        },
      );

      return commitAndReturn({ result: "expired" });
    }

    if (challengeRow.attempts_remaining <= 0) {
      db.prepare("UPDATE station_admin_mfa_challenges SET consumed_at = COALESCE(consumed_at, ?) WHERE id = ?").run(
        nowIso,
        normalizedChallengeId,
      );

      writeAuthEvent(
        db,
        tokenFn,
        nowMs,
        "mfa_challenge_locked",
        challengeRow.actor_id,
        challengeRow.session_id,
        buildEventMetadata(requestMetadata, {
          challengeId: normalizedChallengeId,
          challengePurpose,
          attemptsRemaining: 0,
          lockedOut: true,
        }),
      );

      const lockoutEventCount = countRecentAuthEvents(
        db,
        "mfa_challenge_locked",
        nowMs,
        MFA_ABUSE_EVENT_WINDOW_MS,
        challengeRow.actor_id,
        requestMetadata?.ip ?? null,
      );

      maybeWriteMfaAbuseEvent(
        db,
        tokenFn,
        nowMs,
        challengeRow.actor_id,
        challengeRow.session_id,
        requestMetadata,
        "repeated_locked_out",
        lockoutEventCount,
        repeatedMfaLockoutThreshold,
        {
          challengeId: normalizedChallengeId,
        },
      );

      return commitAndReturn({ result: "locked_out", attemptsRemaining: 0 });
    }

    const verifyRateLimit = evaluateMfaVerifyRateLimit(
      db,
      normalizedChallengeId,
      challengeRow.actor_id,
      requestMetadata?.ip ?? null,
      nowMs,
      mfaVerifyRateLimitWindowMs,
      maxMfaVerifyAttemptsPerChallenge,
      maxMfaVerifyAttemptsPerActor,
      maxMfaVerifyAttemptsPerIp,
    );

    if (verifyRateLimit.limited) {
      writeAuthEvent(
        db,
        tokenFn,
        nowMs,
        "mfa_verify_rate_limited",
        challengeRow.actor_id,
        challengeRow.session_id,
        buildEventMetadata(requestMetadata, {
          challengeId: normalizedChallengeId,
          challengePurpose,
          rateLimitScope: verifyRateLimit.scope,
          eventCount: verifyRateLimit.eventCount,
          threshold: verifyRateLimit.threshold,
          retryAfterSeconds: Math.max(1, Math.ceil(mfaVerifyRateLimitWindowMs / 1000)),
        }),
      );

      return commitAndReturn({
        result: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil(mfaVerifyRateLimitWindowMs / 1000)),
      });
    }

    if (challengePurpose === "session_revoke") {
      if (!normalizedSessionId || !normalizedCsrfToken) {
        return rollbackAndReturn({ result: "invalid_request" });
      }

      if (!challengeRow.session_id || challengeRow.session_id !== normalizedSessionId) {
        return rollbackAndReturn({ result: "invalid_request" });
      }

      const sessionRows = db
        .prepare(
          `SELECT id, actor_id, csrf_token, expires_at, revoked_at
           FROM station_admin_sessions
           WHERE id = ?
           LIMIT 1`,
        )
        .all(normalizedSessionId) as Array<Pick<SessionRow, "id" | "actor_id" | "csrf_token" | "expires_at" | "revoked_at">>;
      const sessionRow = sessionRows[0];

      if (!sessionRow || sessionRow.revoked_at !== null || sessionRow.actor_id !== challengeRow.actor_id) {
        return rollbackAndReturn({ result: "invalid_request" });
      }

      if (sessionRow.csrf_token !== normalizedCsrfToken) {
        return rollbackAndReturn({ result: "invalid_request" });
      }

      const sessionExpiresMs = new Date(sessionRow.expires_at).getTime();
      if (!Number.isFinite(sessionExpiresMs) || sessionExpiresMs <= nowMs) {
        return rollbackAndReturn({ result: "invalid_request" });
      }
    }

    const credentialRows = db
      .prepare(
        `SELECT id, actor_role, password_hash, salt, mfa_enabled, mfa_secret, mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
         FROM station_admin_credentials
         WHERE id = ?
         LIMIT 1`,
      )
      .all(challengeRow.actor_id) as CredentialsRow[];
    const credential = credentialRows[0];

    if (!credential || !toBooleanFlag(credential.mfa_enabled)) {
      return rollbackAndReturn({ result: "not_found" });
    }

    const recoveryCodes = parseStoredRecoveryCodes(credential.mfa_recovery_codes);
    const recoveryAttempt = consumeRecoveryCode(normalizedRecoveryCode, recoveryCodes, nowIso);
    const codeVerified = verifyMfaCode(normalizedCode, credential.mfa_secret, nowMs);
    const recovered = !codeVerified && recoveryAttempt.consumed;

    if (!codeVerified && !recovered) {
      const nextAttemptsRemaining = Math.max(0, challengeRow.attempts_remaining - 1);
      const consumedAt = nextAttemptsRemaining === 0 ? nowIso : null;

      const failedAttemptWrite = db.prepare(
        "UPDATE station_admin_mfa_challenges SET attempts_remaining = ?, consumed_at = COALESCE(consumed_at, ?) WHERE id = ? AND consumed_at IS NULL",
      ).run(nextAttemptsRemaining, consumedAt, normalizedChallengeId);

      if (getRunChanges(failedAttemptWrite) === 0) {
        return rollbackAndReturn({ result: "not_found" });
      }

      writeAuthEvent(
        db,
        tokenFn,
        nowMs,
        "mfa_challenge_failure",
        challengeRow.actor_id,
        challengeRow.session_id,
        buildEventMetadata(requestMetadata, {
          challengeId: normalizedChallengeId,
          challengePurpose,
          attemptsRemaining: nextAttemptsRemaining,
          lockedOut: nextAttemptsRemaining === 0,
        }),
      );

      if (nextAttemptsRemaining === 0) {
        writeAuthEvent(
          db,
          tokenFn,
          nowMs,
          "mfa_challenge_locked",
          challengeRow.actor_id,
          challengeRow.session_id,
          buildEventMetadata(requestMetadata, {
            challengeId: normalizedChallengeId,
            challengePurpose,
            attemptsRemaining: 0,
            lockedOut: true,
          }),
        );

        const lockoutEventCount = countRecentAuthEvents(
          db,
          "mfa_challenge_locked",
          nowMs,
          MFA_ABUSE_EVENT_WINDOW_MS,
          challengeRow.actor_id,
          requestMetadata?.ip ?? null,
        );

        maybeWriteMfaAbuseEvent(
          db,
          tokenFn,
          nowMs,
          challengeRow.actor_id,
          challengeRow.session_id,
          requestMetadata,
          "repeated_locked_out",
          lockoutEventCount,
          repeatedMfaLockoutThreshold,
          {
            challengeId: normalizedChallengeId,
          },
        );
      }

      const invalidAttemptEventCount = countRecentAuthEvents(
        db,
        "mfa_challenge_failure",
        nowMs,
        MFA_ABUSE_EVENT_WINDOW_MS,
        challengeRow.actor_id,
        requestMetadata?.ip ?? null,
      );

      maybeWriteMfaAbuseEvent(
        db,
        tokenFn,
        nowMs,
        challengeRow.actor_id,
        challengeRow.session_id,
        requestMetadata,
        "repeated_invalid_verify_attempts",
        invalidAttemptEventCount,
        repeatedInvalidMfaAttemptThreshold,
        {
          challengeId: normalizedChallengeId,
          challengePurpose,
        },
      );

      return commitAndReturn({
        result: "mfa_failed",
        attemptsRemaining: nextAttemptsRemaining,
        lockedOut: nextAttemptsRemaining === 0,
      });
    }

    if (recovered) {
      db.prepare("UPDATE station_admin_credentials SET mfa_recovery_codes = ? WHERE id = ?").run(
        JSON.stringify(recoveryAttempt.updatedCodes),
        credential.id,
      );

      writeAuthEvent(
        db,
        tokenFn,
        nowMs,
        "recovery_code_used",
        credential.id,
        challengeRow.session_id,
        buildEventMetadata(requestMetadata, {
          challengePurpose,
        }),
      );
    }

    const consumeChallengeWrite = db.prepare(
      "UPDATE station_admin_mfa_challenges SET consumed_at = ?, attempts_remaining = ? WHERE id = ? AND consumed_at IS NULL",
    ).run(nowIso, challengeRow.attempts_remaining, normalizedChallengeId);

    if (getRunChanges(consumeChallengeWrite) === 0) {
      return rollbackAndReturn({ result: "not_found" });
    }

    db.prepare(
      "UPDATE station_admin_credentials SET mfa_last_verified_at = ?, mfa_enrolled_at = COALESCE(mfa_enrolled_at, ?) WHERE id = ?",
    ).run(nowIso, nowIso, credential.id);

    writeAuthEvent(
      db,
      tokenFn,
      nowMs,
      "mfa_challenge_success",
      credential.id,
      challengeRow.session_id,
      buildEventMetadata(requestMetadata, {
        challengePurpose,
        recoveryCodeUsed: recovered,
      }),
    );

    const role = normalizeRole(credential.actor_role);

    if (!role) {
      return rollbackAndReturn({ result: "not_found" });
    }

    const mfaState: StationAdminMfaEnrollmentState = {
      enabled: true,
      enrolledAt: credential.mfa_enrolled_at ?? nowIso,
      lastVerifiedAt: nowIso,
      recoveryCodesRemaining: (recovered ? recoveryAttempt.updatedCodes : recoveryCodes)
        .filter((storedCode) => storedCode.usedAt === null)
        .length,
    };

    if (challengePurpose === "login") {
      const permissions = defaultPermissionsForRole(role);
      const issuedSession = issueSession(db, tokenFn, nowMs, credential.id, role, permissions);

      writeAuthEvent(
        db,
        tokenFn,
        nowMs,
        "login_success",
        credential.id,
        issuedSession.sessionId,
        buildEventMetadata(requestMetadata, {
          challengeId: challengeRow.id,
        }),
      );

      return commitAndReturn({
        result: "issued",
        sessionId: issuedSession.sessionId,
        csrfToken: issuedSession.csrfToken,
        expiresAt: issuedSession.expiresAt,
        actorId: credential.id,
        actorRole: role,
        permissions,
        mfa: mfaState,
      });
    }

    return commitAndReturn({
      result: "verified",
      challengePurpose,
      actorId: credential.id,
      mfa: mfaState,
    });
  } catch {
    if (transactionOpen) {
      try {
        rollbackTransaction(db);
      } catch {
        // Preserve historical not_found catch contract.
      }
      transactionOpen = false;
    }

    return { result: "not_found" };
  } finally {
    if (transactionOpen) {
      try {
        rollbackTransaction(db);
      } catch {
        // Ignore rollback failures during final cleanup.
      }
    }

    close();
  }
}

export function logoutStationAdmin(
  sessionId: string,
  csrfToken: string,
  dependencies: StationAdminLifecycleDependencies = {},
): StationAdminLogoutResult {
  const normalizedSessionId = sessionId.trim();
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedSessionId || !csrfToken) {
    return { result: "not_found" };
  }

  const handle = openDb(dependencies);

  if (!handle) {
    return { result: "not_found" };
  }

  const { db, close } = handle;

  try {
    const rows = db
      .prepare(
        `SELECT id, actor_id, actor_role, csrf_token, expires_at, revoked_at
         FROM station_admin_sessions WHERE id = ? LIMIT 1`,
      )
      .all(normalizedSessionId) as SessionRow[];
    const row = rows[0];

    if (!row || row.revoked_at !== null) {
      return { result: "not_found" };
    }

    const expiresAtMs = new Date(row.expires_at).getTime();

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
      return { result: "not_found" };
    }

    if (row.csrf_token !== csrfToken) {
      return { result: "csrf_invalid" };
    }

    const nowMs = now();
    const revokedAt = new Date(nowMs).toISOString();
    db.prepare("UPDATE station_admin_sessions SET revoked_at = ? WHERE id = ?").run(revokedAt, normalizedSessionId);

    writeAuthEvent(
      db,
      tokenFn,
      nowMs,
      "logout",
      row.actor_id,
      normalizedSessionId,
      buildEventMetadata(requestMetadata),
    );

    return { result: "revoked", actorId: row.actor_id };
  } catch {
    return { result: "not_found" };
  } finally {
    close();
  }
}

export function refreshStationAdminSession(
  sessionId: string,
  csrfToken: string,
  dependencies: StationAdminLifecycleDependencies = {},
): StationAdminRefreshResult {
  const normalizedSessionId = sessionId.trim();
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedSessionId || !csrfToken) {
    return { result: "not_found" };
  }

  const handle = openDb(dependencies);

  if (!handle) {
    return { result: "not_found" };
  }

  const { db, close } = handle;

  try {
    const rows = db
      .prepare(
        `SELECT id, actor_id, actor_role, permissions, csrf_token, expires_at, revoked_at
         FROM station_admin_sessions WHERE id = ? LIMIT 1`,
      )
      .all(normalizedSessionId) as SessionRow[];
    const row = rows[0];

    if (!row || row.revoked_at !== null) {
      return { result: "not_found" };
    }

    const expiresAtMs = new Date(row.expires_at).getTime();

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
      return { result: "not_found" };
    }

    if (row.csrf_token !== csrfToken) {
      return { result: "csrf_invalid" };
    }

    const newSessionId = tokenFn(32);
    const newCsrfToken = tokenFn(32);
    const nowMs = now();
    const issuedAt = new Date(nowMs).toISOString();
    const newExpiresAt = new Date(nowMs + SESSION_DURATION_MS).toISOString();
    const revokedAt = issuedAt;

    db.prepare(
      `INSERT INTO station_admin_sessions
         (id, actor_id, actor_role, permissions, csrf_token, issued_at, expires_at, last_active_at, revoked_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(
      newSessionId,
      row.actor_id,
      row.actor_role,
      row.permissions,
      newCsrfToken,
      issuedAt,
      newExpiresAt,
      issuedAt,
    );

    db.prepare("UPDATE station_admin_sessions SET revoked_at = ? WHERE id = ?").run(revokedAt, normalizedSessionId);

    writeAuthEvent(
      db,
      tokenFn,
      nowMs,
      "refresh",
      row.actor_id,
      newSessionId,
      buildEventMetadata(requestMetadata),
    );

    return {
      result: "refreshed",
      sessionId: newSessionId,
      csrfToken: newCsrfToken,
      expiresAt: newExpiresAt,
      actorId: row.actor_id,
    };
  } catch {
    return { result: "not_found" };
  } finally {
    close();
  }
}

export function revokeStationAdminSession(
  adminSessionId: string,
  adminCsrfToken: string,
  targetSessionId: string,
  dependencies: StationAdminLifecycleDependencies = {},
): StationAdminRevokeResult {
  const normalizedAdminSessionId = adminSessionId.trim();
  const normalizedTargetSessionId = targetSessionId.trim();
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const mfaStepUpWindowMs = dependencies.mfaStepUpWindowMs ?? DEFAULT_MFA_STEP_UP_WINDOW_MS;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedAdminSessionId || !adminCsrfToken || !normalizedTargetSessionId) {
    return { result: "not_found" };
  }

  const handle = openDb(dependencies);

  if (!handle) {
    return { result: "not_found" };
  }

  const { db, close } = handle;

  try {
    // Validate the admin's own session
    const adminRows = db
      .prepare(
        `SELECT id, actor_id, actor_role, csrf_token, expires_at, revoked_at
         FROM station_admin_sessions WHERE id = ? LIMIT 1`,
      )
      .all(normalizedAdminSessionId) as SessionRow[];
    const adminRow = adminRows[0];

    if (!adminRow || adminRow.revoked_at !== null) {
      return { result: "not_found" };
    }

    const expiresAtMs = new Date(adminRow.expires_at).getTime();

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
      return { result: "not_found" };
    }

    if (adminRow.csrf_token !== adminCsrfToken) {
      return { result: "csrf_invalid" };
    }

    if (adminRow.actor_role !== "admin") {
      return { result: "forbidden" };
    }

    const adminCredentialRows = db
      .prepare(
        `SELECT id, actor_role, password_hash, salt, mfa_enabled, mfa_secret, mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
         FROM station_admin_credentials
         WHERE id = ?
         LIMIT 1`,
      )
      .all(adminRow.actor_id) as CredentialsRow[];
    const adminCredential = adminCredentialRows[0];

    // Find the target session
    const targetRows = db
      .prepare("SELECT id, actor_id, revoked_at FROM station_admin_sessions WHERE id = ? LIMIT 1")
      .all(normalizedTargetSessionId) as SessionRow[];
    const targetRow = targetRows[0];

    if (!targetRow) {
      return { result: "not_found" };
    }

    if (
      adminCredential
      && toBooleanFlag(adminCredential.mfa_enabled)
      && targetRow.actor_id !== adminRow.actor_id
      && !hasRecentStepUp(db, adminRow.actor_id, adminRow.id, now(), mfaStepUpWindowMs)
    ) {
      const challenge = createMfaChallenge(
        db,
        tokenFn,
        now(),
        adminRow.actor_id,
        "session_revoke",
        requestMetadata,
        adminRow.id,
      );

      return {
        result: "mfa_required",
        challenge,
      };
    }

    // Allow revoking already-revoked sessions idempotently (return the actorId)
    const revokedAt = targetRow.revoked_at ?? new Date(now()).toISOString();

    if (!targetRow.revoked_at) {
      db.prepare("UPDATE station_admin_sessions SET revoked_at = ? WHERE id = ?").run(revokedAt, normalizedTargetSessionId);
    }

    writeAuthEvent(
      db,
      tokenFn,
      now(),
      "revoke",
      targetRow.actor_id,
      normalizedTargetSessionId,
      buildEventMetadata(requestMetadata, {
        revokedBy: adminRow.actor_id,
      }),
    );

    return { result: "revoked", actorId: targetRow.actor_id };
  } catch {
    return { result: "not_found" };
  } finally {
    close();
  }
}
