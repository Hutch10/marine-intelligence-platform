import type {
  StationAdminMfaChallenge,
  StationAdminMfaChallengePurpose,
  StationAdminMfaEnrollmentState,
  OceanStationAdminPermission,
  OceanStationAdminRole,
  StationAdminRequestMetadata,
} from "@marine/shared";
import { verifyTotpToken } from "../security/totp";
import { resolveMfaSecret } from "../security/mfa-secret";
import { buildRecentStepUpQuery } from "../security/stepup-policy";
import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";

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

const writeLockByResource = new Map<string, Promise<void>>();

async function acquireWriteLock(resourceId: string): Promise<() => void> {
  let unlock: () => void;
  const lock = new Promise<void>((resolve) => {
    unlock = resolve;
  });

  const previousLock = writeLockByResource.get(resourceId) ?? Promise.resolve();
  writeLockByResource.set(resourceId, lock);

  await previousLock;
  return unlock!;
}

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

export interface StationAdminLifecycleDependencies {
  resolvePath?: () => string;
  hasPath?: (path: string) => boolean;
  getAdapter?: (readOnly: boolean) => AsyncDbAdapter;
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

async function ensureStationAdminTables(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS station_admin_credentials (
      id TEXT PRIMARY KEY,
      actor_role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      mfa_enabled INTEGER DEFAULT 0,
      mfa_secret TEXT,
      mfa_recovery_codes TEXT,
      mfa_enrolled_at TEXT,
      mfa_last_verified_at TEXT
    )`,
  );

  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS station_admin_sessions (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES station_admin_credentials(id),
      actor_role TEXT NOT NULL,
      permissions TEXT,
      csrf_token TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_active_at TEXT,
      revoked_at TEXT,
      metadata TEXT
    )`,
  );

  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS station_admin_mfa_challenges (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES station_admin_credentials(id),
      challenge_purpose TEXT NOT NULL,
      session_id TEXT REFERENCES station_admin_sessions(id),
      expires_at TEXT NOT NULL,
      attempts_remaining INTEGER NOT NULL DEFAULT 5,
      consumed_at TEXT,
      metadata TEXT
    )`,
  );

  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS station_admin_auth_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor_id TEXT REFERENCES station_admin_credentials(id),
      session_id TEXT REFERENCES station_admin_sessions(id),
      occurred_at TEXT NOT NULL,
      metadata TEXT
    )`,
  );
}

async function writeAuthEvent(
  adapter: AsyncDbAdapter,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  eventType: StationAdminAuthEventType,
  actorId: string | null,
  sessionId: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await adapter.execute(
      `INSERT INTO station_admin_auth_events (id, event_type, actor_id, session_id, occurred_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tokenFn(16),
        eventType,
        actorId,
        sessionId,
        new Date(nowMs).toISOString(),
        metadata ? JSON.stringify(metadata) : null,
      ]
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

async function issueSession(
  adapter: AsyncDbAdapter,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  actorId: string,
  role: OceanStationAdminRole,
  permissions: OceanStationAdminPermission[],
): Promise<{
  sessionId: string;
  csrfToken: string;
  expiresAt: string;
}> {
  const sessionId = tokenFn(32);
  const csrfToken = tokenFn(32);
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_DURATION_MS).toISOString();

  await adapter.execute(
    `INSERT INTO station_admin_sessions
       (id, actor_id, actor_role, permissions, csrf_token, issued_at, expires_at, last_active_at, revoked_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      sessionId,
      actorId,
      role,
      JSON.stringify(permissions),
      csrfToken,
      issuedAt,
      expiresAt,
      issuedAt,
    ]
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

async function evaluateMfaVerifyRateLimit(
  adapter: AsyncDbAdapter,
  challengeId: string,
  actorId: string,
  ip: string | null,
  nowMs: number,
  windowMs: number,
  maxPerChallenge: number,
  maxPerActor: number,
  maxPerIp: number,
): Promise<{
  limited: boolean;
  scope?: "challenge" | "actor" | "ip";
  eventCount?: number;
  threshold?: number;
}> {
  try {
    const sinceIso = new Date(nowMs - windowMs).toISOString();
    const rows = await adapter.execute(
      `SELECT actor_id, metadata
       FROM station_admin_auth_events
       WHERE event_type = 'mfa_challenge_failure'
         AND occurred_at > ?`,
      [sinceIso]
    ) as AuthEventThrottleRow[];

    let challengeFailureCount = 0;
    let actorFailureCount = 0;
    let ipFailureCount = 0;

    for (const row of rows) {
      if (row.actor_id === actorId) {
        actorFailureCount += 1;
      }

      if (!row.metadata) continue;

      let rawMetadata: Record<string, any>;
      try {
        rawMetadata = JSON.parse(row.metadata);
      } catch {
        continue;
      }

      if (ip && rawMetadata.ip === ip) {
        ipFailureCount += 1;
      }

      if (rawMetadata.challengeId === challengeId) {
        challengeFailureCount += 1;
      }
    }

    if (challengeFailureCount >= maxPerChallenge) {
      return { limited: true, scope: "challenge", eventCount: challengeFailureCount, threshold: maxPerChallenge };
    }

    if (actorFailureCount >= maxPerActor) {
      return { limited: true, scope: "actor", eventCount: actorFailureCount, threshold: maxPerActor };
    }

    if (ip && ipFailureCount >= maxPerIp) {
      return { limited: true, scope: "ip", eventCount: ipFailureCount, threshold: maxPerIp };
    }

    return { limited: false };
  } catch {
    return { limited: false };
  }
}

async function countRecentAuthEvents(
  adapter: AsyncDbAdapter,
  eventType: StationAdminAuthEventType,
  nowMs: number,
  windowMs: number,
  actorId: string | null,
  ip: string | null,
): Promise<number> {
  try {
    const sinceIso = new Date(nowMs - windowMs).toISOString();
    const rows = await adapter.execute(
      `SELECT actor_id, metadata
       FROM station_admin_auth_events
       WHERE event_type = ?
         AND occurred_at > ?`,
      [eventType, sinceIso]
    ) as AuthEventThrottleRow[];

    let count = 0;
    for (const row of rows) {
      if (actorId && row.actor_id === actorId) {
        count += 1;
        continue;
      }

      if (ip) {
        const rowMetadata = parseRequestMetadata(row.metadata);
        if (rowMetadata?.ip === ip) {
          count += 1;
        }
      }
    }

    return count;
  } catch {
    return 0;
  }
}

async function maybeWriteMfaAbuseEvent(
  adapter: AsyncDbAdapter,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  actorId: string,
  sessionId: string | null,
  requestMetadata: StationAdminRequestMetadata | undefined,
  pattern: string,
  eventCount: number,
  threshold: number,
  extra: Record<string, unknown>,
): Promise<void> {
  if (eventCount < threshold) {
    return;
  }

  if (eventCount > threshold && eventCount % threshold !== 0) {
    return;
  }

  await writeAuthEvent(
    adapter,
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

async function createMfaChallenge(
  adapter: AsyncDbAdapter,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  actorId: string,
  purpose: StationAdminMfaChallengePurpose,
  requestMetadata: StationAdminRequestMetadata | undefined,
  sessionId?: string,
): Promise<StationAdminMfaChallenge> {
  const challengeId = tokenFn(16);
  const expiresAt = new Date(nowMs + MFA_CHALLENGE_DURATION_MS).toISOString();
  const metadata = buildEventMetadata(requestMetadata, {
    purpose,
    challengeId,
  });

  await adapter.execute(
    `INSERT INTO station_admin_mfa_challenges
       (id, actor_id, challenge_purpose, session_id, expires_at, attempts_remaining, consumed_at, metadata)
     VALUES (?, ?, ?, ?, ?, 5, NULL, ?)`,
    [
      challengeId,
      actorId,
      purpose,
      sessionId ?? null,
      expiresAt,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  return {
    challengeId,
    purpose,
    expiresAt,
    recoveryCodeAllowed: true,
  };
}

async function hasRecentStepUp(
  adapter: AsyncDbAdapter,
  actorId: string,
  sessionId: string,
  purpose: StationAdminMfaChallengePurpose,
  nowMs: number,
  windowMs: number,
): Promise<boolean> {
  try {
    const { sql, params } = buildRecentStepUpQuery(actorId, sessionId, purpose, nowMs, windowMs);
    const rows = await adapter.execute(sql, params);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function loginStationAdmin(
  actorId: string,
  password: string,
  dependencies: StationAdminLifecycleDependencies = {},
): Promise<StationAdminLoginResult> {
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

  const adapter = dependencies.getAdapter ? dependencies.getAdapter(false) : getAsyncAdapter(false);
  const unlock = await acquireWriteLock(adapter.resourceId);

  try {
    await ensureStationAdminTables(adapter);
    await adapter.execute("BEGIN IMMEDIATE");

    let lockoutScope: "actor" | "ip" | null = null;
    try {
      const sinceIso = new Date(now() - lockoutWindowMs).toISOString();
      const recentFailureRows = await adapter.execute(
        `SELECT actor_id, metadata FROM station_admin_auth_events
         WHERE event_type IN ('login_failure', 'login_locked')
         AND occurred_at > ?`,
        [sinceIso]
      ) as AuthEventThrottleRow[];

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
      // Skip lockout checks if table missing
    }

    if (lockoutScope) {
      await writeAuthEvent(adapter, tokenFn, now(), "login_locked", normalizedActorId, null, buildEventMetadata(requestMetadata, { lockoutScope }));
      await adapter.execute("COMMIT");
      return { result: "locked_out" };
    }

    const credRows = await adapter.execute(
      `SELECT id, actor_role, password_hash, salt, mfa_enabled, mfa_secret, mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
       FROM station_admin_credentials
       WHERE id = ? LIMIT 1`,
      [normalizedActorId]
    ) as CredentialsRow[];
    const cred = credRows[0];

    if (!cred || !verifyPassword(password, cred.salt, cred.password_hash)) {
      await writeAuthEvent(adapter, tokenFn, now(), "login_failure", normalizedActorId, null, buildEventMetadata(requestMetadata));
      await adapter.execute("COMMIT");
      return { result: "invalid_credentials" };
    }

    const role = normalizeRole(cred.actor_role);
    if (!role) {
      await writeAuthEvent(adapter, tokenFn, now(), "login_failure", normalizedActorId, null, buildEventMetadata(requestMetadata));
      await adapter.execute("COMMIT");
      return { result: "invalid_credentials" };
    }

    const mfaState = buildMfaEnrollmentState(cred);
    if (mfaState.enabled) {
      const challenge = await createMfaChallenge(adapter, tokenFn, now(), normalizedActorId, "login", requestMetadata);
      await adapter.execute("COMMIT");
      return { result: "pending_mfa", actorId: normalizedActorId, actorRole: role, challenge, mfa: mfaState };
    }

    const issuedSession = await issueSession(adapter, tokenFn, now(), normalizedActorId, role, defaultPermissionsForRole(role));
    await writeAuthEvent(adapter, tokenFn, now(), "login_success", normalizedActorId, issuedSession.sessionId, buildEventMetadata(requestMetadata));
    await adapter.execute("COMMIT");

    return {
      result: "issued",
      sessionId: issuedSession.sessionId,
      csrfToken: issuedSession.csrfToken,
      expiresAt: issuedSession.expiresAt,
      actorId: normalizedActorId,
      actorRole: role,
      permissions: defaultPermissionsForRole(role),
      mfa: mfaState,
    };
  } catch (err) {
    await adapter.execute("ROLLBACK").catch(() => {});
    return { result: "not_available" };
  } finally {
    unlock();
    await adapter.close();
  }
}

export async function verifyStationAdminMfaChallenge(
  challengeId: string,
  code: string | undefined,
  recoveryCode: string | undefined,
  sessionId: string | undefined,
  csrfToken: string | undefined,
  dependencies: StationAdminLifecycleDependencies = {},
): Promise<StationAdminMfaVerifyResult> {
  const normalizedChallengeId = challengeId.trim();
  const normalizedCode = typeof code === "string" && code.trim() ? code.trim() : undefined;
  const normalizedRecoveryCode = typeof recoveryCode === "string" && recoveryCode.trim() ? recoveryCode.trim() : undefined;
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const mfaVerifyRateLimitWindowMs = dependencies.mfaVerifyRateLimitWindowMs ?? DEFAULT_MFA_VERIFY_RATE_LIMIT_WINDOW_MS;
  const maxMfaVerifyAttemptsPerChallenge = dependencies.maxMfaVerifyAttemptsPerChallenge ?? DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_CHALLENGE;
  const maxMfaVerifyAttemptsPerActor = dependencies.maxMfaVerifyAttemptsPerActor ?? DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_ACTOR;
  const maxMfaVerifyAttemptsPerIp = dependencies.maxMfaVerifyAttemptsPerIp ?? DEFAULT_MAX_MFA_VERIFY_ATTEMPTS_PER_IP;
  const repeatedMfaLockoutThreshold = dependencies.repeatedMfaLockoutThreshold ?? DEFAULT_REPEATED_MFA_LOCKOUT_THRESHOLD;
  const repeatedMfaExpiredThreshold = dependencies.repeatedMfaExpiredThreshold ?? DEFAULT_REPEATED_MFA_EXPIRED_THRESHOLD;
  const repeatedInvalidMfaAttemptThreshold = dependencies.repeatedInvalidMfaAttemptThreshold ?? DEFAULT_REPEATED_INVALID_MFA_ATTEMPT_THRESHOLD;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedChallengeId || (!normalizedCode && !normalizedRecoveryCode)) {
    return { result: "invalid_request" };
  }

  const adapter = dependencies.getAdapter ? dependencies.getAdapter(false) : getAsyncAdapter(false);
  const unlock = await acquireWriteLock(adapter.resourceId);

  try {
    await ensureStationAdminTables(adapter);
    await adapter.execute("BEGIN IMMEDIATE");

    const challengeRows = await adapter.execute(
      `SELECT id, actor_id, challenge_purpose, session_id, expires_at, attempts_remaining, consumed_at, metadata
       FROM station_admin_mfa_challenges WHERE id = ? LIMIT 1`,
      [normalizedChallengeId]
    ) as MfaChallengeRow[];
    const challengeRow = challengeRows[0];

    if (!challengeRow || challengeRow.consumed_at !== null) {
      await adapter.execute("ROLLBACK");
      return { result: "not_found" };
    }

    const challengePurpose = normalizeMfaChallengePurpose(challengeRow.challenge_purpose);
    if (!challengePurpose) {
      await adapter.execute("ROLLBACK");
      return { result: "not_found" };
    }

    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAtMs = new Date(challengeRow.expires_at).getTime();

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      await adapter.execute("UPDATE station_admin_mfa_challenges SET consumed_at = COALESCE(consumed_at, ?) WHERE id = ?", [nowIso, normalizedChallengeId]);
      await writeAuthEvent(adapter, tokenFn, nowMs, "mfa_challenge_expired", challengeRow.actor_id, challengeRow.session_id, buildEventMetadata(requestMetadata, { challengeId: normalizedChallengeId, challengePurpose }));
      
      const expiredEventCount = await countRecentAuthEvents(adapter, "mfa_challenge_expired", nowMs, MFA_ABUSE_EVENT_WINDOW_MS, challengeRow.actor_id, requestMetadata?.ip ?? null);
      await maybeWriteMfaAbuseEvent(adapter, tokenFn, nowMs, challengeRow.actor_id, challengeRow.session_id, requestMetadata, "repeated_expired_challenge", expiredEventCount, repeatedMfaExpiredThreshold, { challengeId: normalizedChallengeId });
      
      await adapter.execute("COMMIT");
      return { result: "expired" };
    }

    if (challengeRow.attempts_remaining <= 0) {
      await adapter.execute("UPDATE station_admin_mfa_challenges SET consumed_at = COALESCE(consumed_at, ?) WHERE id = ?", [nowIso, normalizedChallengeId]);
      await writeAuthEvent(adapter, tokenFn, nowMs, "mfa_challenge_locked", challengeRow.actor_id, challengeRow.session_id, buildEventMetadata(requestMetadata, { challengeId: normalizedChallengeId, challengePurpose, attemptsRemaining: 0, lockedOut: true }));
      
      const lockoutEventCount = await countRecentAuthEvents(adapter, "mfa_challenge_locked", nowMs, MFA_ABUSE_EVENT_WINDOW_MS, challengeRow.actor_id, requestMetadata?.ip ?? null);
      await maybeWriteMfaAbuseEvent(adapter, tokenFn, nowMs, challengeRow.actor_id, challengeRow.session_id, requestMetadata, "repeated_locked_out", lockoutEventCount, repeatedMfaLockoutThreshold, { challengeId: normalizedChallengeId });
      
      await adapter.execute("COMMIT");
      return { result: "locked_out", attemptsRemaining: 0 };
    }

    const verifyRateLimit = await evaluateMfaVerifyRateLimit(adapter, normalizedChallengeId, challengeRow.actor_id, requestMetadata?.ip ?? null, nowMs, mfaVerifyRateLimitWindowMs, maxMfaVerifyAttemptsPerChallenge, maxMfaVerifyAttemptsPerActor, maxMfaVerifyAttemptsPerIp);
    if (verifyRateLimit.limited) {
      await writeAuthEvent(adapter, tokenFn, nowMs, "mfa_verify_rate_limited", challengeRow.actor_id, challengeRow.session_id, buildEventMetadata(requestMetadata, { challengeId: normalizedChallengeId, challengePurpose, rateLimitScope: verifyRateLimit.scope, eventCount: verifyRateLimit.eventCount, threshold: verifyRateLimit.threshold, retryAfterSeconds: Math.max(1, Math.ceil(mfaVerifyRateLimitWindowMs / 1000)) }));
      await adapter.execute("COMMIT");
      return { result: "rate_limited", retryAfterSeconds: Math.max(1, Math.ceil(mfaVerifyRateLimitWindowMs / 1000)) };
    }

    const credRows = await adapter.execute(
      `SELECT id, actor_role, password_hash, salt, mfa_enabled, mfa_secret, mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
       FROM station_admin_credentials WHERE id = ? LIMIT 1`,
      [challengeRow.actor_id]
    ) as CredentialsRow[];
    const credential = credRows[0];

    if (!credential || !toBooleanFlag(credential.mfa_enabled)) {
      await adapter.execute("ROLLBACK");
      return { result: "not_found" };
    }

    const recoveryCodes = parseStoredRecoveryCodes(credential.mfa_recovery_codes);
    const recoveryAttempt = consumeRecoveryCode(normalizedRecoveryCode, recoveryCodes, nowIso);
    const codeVerified = verifyMfaCode(normalizedCode, credential.mfa_secret, nowMs);
    const recovered = !codeVerified && recoveryAttempt.consumed;

    if (!codeVerified && !recovered) {
      const nextAttemptsRemaining = Math.max(0, challengeRow.attempts_remaining - 1);
      const consumedAt = nextAttemptsRemaining === 0 ? nowIso : null;
      await adapter.execute("UPDATE station_admin_mfa_challenges SET attempts_remaining = ?, consumed_at = COALESCE(consumed_at, ?) WHERE id = ? AND consumed_at IS NULL", [nextAttemptsRemaining, consumedAt, normalizedChallengeId]);
      
      await writeAuthEvent(adapter, tokenFn, nowMs, "mfa_challenge_failure", challengeRow.actor_id, challengeRow.session_id, buildEventMetadata(requestMetadata, { challengeId: normalizedChallengeId, challengePurpose, attemptsRemaining: nextAttemptsRemaining, lockedOut: nextAttemptsRemaining === 0 }));
      
      const invalidAttemptEventCount = await countRecentAuthEvents(adapter, "mfa_challenge_failure", nowMs, MFA_ABUSE_EVENT_WINDOW_MS, challengeRow.actor_id, requestMetadata?.ip ?? null);
      await maybeWriteMfaAbuseEvent(adapter, tokenFn, nowMs, challengeRow.actor_id, challengeRow.session_id, requestMetadata, "repeated_invalid_verify_attempts", invalidAttemptEventCount, repeatedInvalidMfaAttemptThreshold, { challengeId: normalizedChallengeId, challengePurpose });
      
      await adapter.execute("COMMIT");
      return { result: "mfa_failed", attemptsRemaining: nextAttemptsRemaining, lockedOut: nextAttemptsRemaining === 0 };
    }

    if (recovered) {
      await adapter.execute("UPDATE station_admin_credentials SET mfa_recovery_codes = ? WHERE id = ?", [JSON.stringify(recoveryAttempt.updatedCodes), credential.id]);
      await writeAuthEvent(adapter, tokenFn, nowMs, "recovery_code_used", credential.id, challengeRow.session_id, buildEventMetadata(requestMetadata, { challengePurpose }));
    }

    await adapter.execute("UPDATE station_admin_mfa_challenges SET consumed_at = ?, attempts_remaining = ? WHERE id = ? AND consumed_at IS NULL", [nowIso, challengeRow.attempts_remaining, normalizedChallengeId]);
    await adapter.execute("UPDATE station_admin_credentials SET mfa_last_verified_at = ?, mfa_enrolled_at = COALESCE(mfa_enrolled_at, ?) WHERE id = ?", [nowIso, nowIso, credential.id]);
    
    await writeAuthEvent(adapter, tokenFn, nowMs, "mfa_challenge_success", credential.id, challengeRow.session_id, buildEventMetadata(requestMetadata, { challengePurpose, recoveryCodeUsed: recovered }));

    const role = normalizeRole(credential.actor_role);
    if (!role) {
      await adapter.execute("ROLLBACK");
      return { result: "not_found" };
    }

    const mfaState: StationAdminMfaEnrollmentState = {
      enabled: true,
      enrolledAt: credential.mfa_enrolled_at ?? nowIso,
      lastVerifiedAt: nowIso,
      recoveryCodesRemaining: (recovered ? recoveryAttempt.updatedCodes : recoveryCodes).filter(c => c.usedAt === null).length
    };

    if (challengePurpose === "login") {
      const permissions = defaultPermissionsForRole(role);
      const session = await issueSession(adapter, tokenFn, nowMs, credential.id, role, permissions);
      await writeAuthEvent(adapter, tokenFn, nowMs, "login_success", credential.id, session.sessionId, buildEventMetadata(requestMetadata, { challengeId: challengeRow.id }));
      await adapter.execute("COMMIT");
      return { result: "issued", sessionId: session.sessionId, csrfToken: session.csrfToken, expiresAt: session.expiresAt, actorId: credential.id, actorRole: role, permissions, mfa: mfaState };
    }

    await adapter.execute("COMMIT");
    return { result: "verified", challengePurpose, actorId: credential.id, mfa: mfaState };
  } catch (err) {
    await adapter.execute("ROLLBACK").catch(() => {});
    return { result: "not_found" };
  } finally {
    unlock();
    await adapter.close();
  }
}

export async function logoutStationAdmin(
  sessionId: string,
  csrfToken: string,
  dependencies: StationAdminLifecycleDependencies = {},
): Promise<StationAdminLogoutResult> {
  const normalizedSessionId = sessionId.trim();
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedSessionId || !csrfToken) return { result: "not_found" };

  const adapter = dependencies.getAdapter ? dependencies.getAdapter(false) : getAsyncAdapter(false);
  const unlock = await acquireWriteLock(adapter.resourceId);

  try {
    await ensureStationAdminTables(adapter);
    await adapter.execute("BEGIN IMMEDIATE");

    const rows = await adapter.execute(`SELECT id, actor_id, csrf_token, expires_at, revoked_at FROM station_admin_sessions WHERE id = ? LIMIT 1`, [normalizedSessionId]) as SessionRow[];
    const row = rows[0];

    if (!row || row.revoked_at !== null || new Date(row.expires_at).getTime() <= now()) {
      await adapter.execute("COMMIT");
      return { result: "not_found" };
    }

    if (row.csrf_token !== csrfToken) {
      await adapter.execute("COMMIT");
      return { result: "csrf_invalid" };
    }

    const revokedAt = new Date(now()).toISOString();
    await adapter.execute("UPDATE station_admin_sessions SET revoked_at = ? WHERE id = ?", [revokedAt, normalizedSessionId]);
    await writeAuthEvent(adapter, tokenFn, now(), "logout", row.actor_id, normalizedSessionId, buildEventMetadata(requestMetadata));
    
    await adapter.execute("COMMIT");
    return { result: "revoked", actorId: row.actor_id };
  } catch {
    await adapter.execute("ROLLBACK").catch(() => {});
    return { result: "not_found" };
  } finally {
    unlock();
    await adapter.close();
  }
}

export async function refreshStationAdminSession(
  sessionId: string,
  csrfToken: string,
  dependencies: StationAdminLifecycleDependencies = {},
): Promise<StationAdminRefreshResult> {
  const normalizedSessionId = sessionId.trim();
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  if (!normalizedSessionId || !csrfToken) return { result: "not_found" };

  const adapter = dependencies.getAdapter ? dependencies.getAdapter(false) : getAsyncAdapter(false);
  const unlock = await acquireWriteLock(adapter.resourceId);

  try {
    await ensureStationAdminTables(adapter);
    await adapter.execute("BEGIN IMMEDIATE");

    const rows = await adapter.execute(`SELECT id, actor_id, actor_role, permissions, csrf_token, expires_at, revoked_at FROM station_admin_sessions WHERE id = ? LIMIT 1`, [normalizedSessionId]) as SessionRow[];
    const row = rows[0];

    if (!row || row.revoked_at !== null || new Date(row.expires_at).getTime() <= now()) {
      await adapter.execute("COMMIT");
      return { result: "not_found" };
    }

    if (row.csrf_token !== csrfToken) {
      await adapter.execute("COMMIT");
      return { result: "csrf_invalid" };
    }

    const newSession = await issueSession(adapter, tokenFn, now(), row.actor_id, normalizeRole(row.actor_role)!, JSON.parse(row.permissions || "[]"));
    await adapter.execute("UPDATE station_admin_sessions SET revoked_at = ? WHERE id = ?", [new Date(now()).toISOString(), normalizedSessionId]);
    await writeAuthEvent(adapter, tokenFn, now(), "refresh", row.actor_id, newSession.sessionId, buildEventMetadata(requestMetadata));

    await adapter.execute("COMMIT");
    return { result: "refreshed", ...newSession, actorId: row.actor_id };
  } catch {
    await adapter.execute("ROLLBACK").catch(() => {});
    return { result: "not_found" };
  } finally {
    unlock();
    await adapter.close();
  }
}

export async function revokeStationAdminSession(
  adminSessionId: string,
  adminCsrfToken: string,
  targetSessionId: string,
  dependencies: StationAdminLifecycleDependencies = {},
): Promise<StationAdminRevokeResult> {
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const mfaStepUpWindowMs = dependencies.mfaStepUpWindowMs ?? DEFAULT_MFA_STEP_UP_WINDOW_MS;
  const requestMetadata = normalizeRequestMetadata(dependencies.requestMetadata);

  const adapter = dependencies.getAdapter ? dependencies.getAdapter(false) : getAsyncAdapter(false);
  const unlock = await acquireWriteLock(adapter.resourceId);

  try {
    await ensureStationAdminTables(adapter);
    await adapter.execute("BEGIN IMMEDIATE");

    const adminRows = await adapter.execute(`SELECT id, actor_id, actor_role, csrf_token, expires_at, revoked_at FROM station_admin_sessions WHERE id = ? LIMIT 1`, [adminSessionId.trim()]) as SessionRow[];
    const adminRow = adminRows[0];

    if (!adminRow || adminRow.revoked_at !== null || new Date(adminRow.expires_at).getTime() <= now()) {
      await adapter.execute("COMMIT");
      return { result: "not_found" };
    }

    if (adminRow.csrf_token !== adminCsrfToken) {
      await adapter.execute("COMMIT");
      return { result: "csrf_invalid" };
    }

    if (adminRow.actor_role !== "admin") {
      await adapter.execute("COMMIT");
      return { result: "forbidden" };
    }

    const targetRows = await adapter.execute(`SELECT id, actor_id, revoked_at FROM station_admin_sessions WHERE id = ? LIMIT 1`, [targetSessionId.trim()]) as SessionRow[];
    const targetRow = targetRows[0];

    if (!targetRow) {
      await adapter.execute("COMMIT");
      return { result: "not_found" };
    }

    const credRows = await adapter.execute(`SELECT id, mfa_enabled FROM station_admin_credentials WHERE id = ? LIMIT 1`, [adminRow.actor_id]) as CredentialsRow[];
    const adminCred = credRows[0];

    if (adminCred && toBooleanFlag(adminCred.mfa_enabled) && targetRow.actor_id !== adminRow.actor_id && !(await hasRecentStepUp(adapter, adminRow.actor_id, adminRow.id, "session_revoke", now(), mfaStepUpWindowMs))) {
      const challenge = await createMfaChallenge(adapter, tokenFn, now(), adminRow.actor_id, "session_revoke", requestMetadata, adminRow.id);
      await adapter.execute("COMMIT");
      return { result: "mfa_required", challenge };
    }

    const revokedAt = targetRow.revoked_at ?? new Date(now()).toISOString();
    if (!targetRow.revoked_at) {
      await adapter.execute("UPDATE station_admin_sessions SET revoked_at = ? WHERE id = ?", [revokedAt, targetSessionId.trim()]);
    }

    await writeAuthEvent(adapter, tokenFn, now(), "revoke", targetRow.actor_id, targetSessionId.trim(), buildEventMetadata(requestMetadata, { revokedBy: adminRow.actor_id }));
    
    await adapter.execute("COMMIT");
    return { result: "revoked", actorId: targetRow.actor_id };
  } catch {
    await adapter.execute("ROLLBACK").catch(() => {});
    return { result: "not_found" };
  } finally {
    unlock();
    await adapter.close();
  }
}
