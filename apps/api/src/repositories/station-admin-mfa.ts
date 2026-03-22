/**
 * MFA enrollment lifecycle repository.
 *
 * Handles the full MFA enrollment lifecycle:
 *   - Start enrollment: generate TOTP secret, store as pending
 *   - Verify enrollment: confirm TOTP code, enable MFA, generate recovery codes
 *   - Regenerate recovery codes: with step-up enforcement
 *   - Disable MFA: with step-up and TOTP confirmation
 *
 * These operations are intentionally separate from station-admin-lifecycle.ts
 * to keep the login/session lifecycle focused. Wire these routes into
 * the route index when the enrollment UI is ready.
 *
 * NOTE: verifyTotpToken is imported but TOTP verification is scaffolded.
 * The `verifyMfaCode` stub in station-admin-lifecycle.ts must also be
 * replaced with verifyTotpToken before production deployment.
 * See SECURITY_AUDIT.md → CRITICAL-2.
 */

import type {
  StationAdminMfaEnrollmentState,
  StationAdminMfaChallenge,
  StationAdminRequestMetadata,
} from "@marine/shared";
import {
  hasDatabasePath,
  openWritableDatabase,
  resolveDatabasePath,
} from "../db/client";
import { generateTotpSecret, generateQrCodeUri, verifyTotpToken } from "../security/totp";
import { storeMfaSecret, resolveMfaSecret } from "../security/mfa-secret";
import {
  evaluateStepUpPolicy,
  buildRecentStepUpQuery,
  PERMISSION_MUTATION_POLICY,
  type StepUpChallenge,
} from "../security/stepup-policy";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTP_ISSUER = "Marine Admin";
const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_LENGTH = 8; // chars per segment
const RECOVERY_CODE_SEGMENTS = 2; // XXXX-XXXX format
const MFA_CHALLENGE_DURATION_MS = 10 * 60 * 1000;
const MFA_PENDING_TTL_MS = 60 * 60 * 1000; // 1 hour to complete enrollment

// ---------------------------------------------------------------------------
// Local interfaces
// ---------------------------------------------------------------------------

interface WritableStmtLike {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes?: number };
}

interface WritableDbLike {
  prepare(sql: string): WritableStmtLike;
  close(): void;
}

interface CredentialsRow {
  id: string;
  actor_role: string;
  mfa_enabled: number | boolean | null;
  mfa_secret: string | null;
  mfa_pending_secret: string | null;
  mfa_pending_since: string | null;
  mfa_recovery_codes: string | null;
  mfa_enrolled_at: string | null;
  mfa_last_verified_at: string | null;
}

interface SessionRow {
  id: string;
  actor_id: string;
  csrf_token: string;
  expires_at: string;
  revoked_at: string | null;
}

interface StoredRecoveryCode {
  codeHash: string;
  usedAt: string | null;
}

export interface StationAdminMfaDependencies {
  resolvePath?: () => string;
  hasPath?: (path: string) => boolean;
  openDatabase?: (path: string) => WritableDbLike;
  now?: () => number;
  generateToken?: (bytes?: number) => string;
  requestMetadata?: StationAdminRequestMetadata;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type MfaEnrollStartResult =
  | {
      result: "started";
      qrCodeUri: string;
      secret: string; // Base32 — shown once during enrollment
    }
  | { result: "already_enrolled" }
  | { result: "not_found" }
  | { result: "not_available" };

export type MfaEnrollVerifyResult =
  | {
      result: "enrolled";
      mfa: StationAdminMfaEnrollmentState;
      /** Plain-text recovery codes — shown ONCE; never returned again */
      recoveryCodes: string[];
    }
  | { result: "invalid_code" }
  | { result: "enrollment_expired" }
  | { result: "not_found" }
  | { result: "not_available" };

export type RecoveryRegenerateResult =
  | {
      result: "regenerated";
      mfa: StationAdminMfaEnrollmentState;
      /** Plain-text recovery codes — shown ONCE; never returned again */
      recoveryCodes: string[];
    }
  | { result: "mfa_required"; challenge: StepUpChallenge }
  | { result: "mfa_not_enrolled" }
  | { result: "csrf_invalid" }
  | { result: "not_found" }
  | { result: "not_available" };

export type MfaDisableResult =
  | { result: "disabled"; actorId: string }
  | { result: "invalid_code" }
  | { result: "mfa_required"; challenge: StepUpChallenge }
  | { result: "mfa_not_enrolled" }
  | { result: "csrf_invalid" }
  | { result: "not_found" }
  | { result: "not_available" };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateToken(bytes = 32): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomBytes } = runtimeRequire("node:crypto") as {
    randomBytes: (size: number) => Buffer;
  };
  return randomBytes(bytes).toString("hex");
}

function hashRecoveryCode(value: string): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createHash } = runtimeRequire("node:crypto") as {
    createHash: (alg: string) => { update: (v: string) => { digest: (enc: "hex") => string } };
  };
  const normalized = value.trim().replace(/[\-\s]/g, "").toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function generateRecoveryCodes(count: number): string[] {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomBytes } = runtimeRequire("node:crypto") as {
    randomBytes: (size: number) => Buffer;
  };

  const codes: string[] = [];
  const charset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // Unambiguous chars

  for (let i = 0; i < count; i++) {
    const segments: string[] = [];
    for (let s = 0; s < RECOVERY_CODE_SEGMENTS; s++) {
      const raw = randomBytes(RECOVERY_CODE_LENGTH);
      let segment = "";
      for (let c = 0; c < RECOVERY_CODE_LENGTH; c++) {
        segment += charset[raw[c] % charset.length];
      }
      segments.push(segment);
    }
    codes.push(segments.join("-"));
  }

  return codes;
}

function toBooleanFlag(value: number | boolean | null): boolean {
  return typeof value === "boolean" ? value : value === 1;
}

function parseStoredRecoveryCodes(value: string | null): StoredRecoveryCode[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredRecoveryCode =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as StoredRecoveryCode).codeHash === "string",
    );
  } catch {
    return [];
  }
}

function buildMfaEnrollmentState(
  cred: CredentialsRow,
  overrideRecoveryCodes?: StoredRecoveryCode[],
): StationAdminMfaEnrollmentState {
  const codes = overrideRecoveryCodes ?? parseStoredRecoveryCodes(cred.mfa_recovery_codes);
  return {
    enabled: toBooleanFlag(cred.mfa_enabled),
    enrolledAt: cred.mfa_enrolled_at ?? null,
    lastVerifiedAt: cred.mfa_last_verified_at ?? null,
    recoveryCodesRemaining: codes.filter((c) => c.usedAt === null).length,
  };
}

function openDb(deps: StationAdminMfaDependencies): { db: WritableDbLike; close: () => void } | null {
  const resolvePath = deps.resolvePath ?? resolveDatabasePath;
  const hasPath = deps.hasPath ?? hasDatabasePath;
  const open =
    deps.openDatabase ?? (openWritableDatabase as unknown as (path: string) => WritableDbLike);
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) return null;

  try {
    const db = open(dbPath);
    return { db, close: () => db.close() };
  } catch {
    return null;
  }
}

function validateSession(
  db: WritableDbLike,
  sessionId: string,
  csrfToken: string,
  nowMs: number,
): SessionRow | "not_found" | "csrf_invalid" | "expired" {
  const rows = db
    .prepare(
      `SELECT id, actor_id, csrf_token, expires_at, revoked_at
       FROM station_admin_sessions WHERE id = ? LIMIT 1`,
    )
    .all(sessionId) as SessionRow[];
  const row = rows[0];

  if (!row || row.revoked_at !== null) return "not_found";

  const expiresMs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return "not_found";
  if (row.csrf_token !== csrfToken) return "csrf_invalid";

  return row;
}

function createMfaChallengeRow(
  db: WritableDbLike,
  tokenFn: (bytes?: number) => string,
  nowMs: number,
  actorId: string,
  purpose: StationAdminMfaChallenge["purpose"],
  sessionId: string,
): StepUpChallenge {
  const challengeId = tokenFn(16);
  const expiresAt = new Date(nowMs + MFA_CHALLENGE_DURATION_MS).toISOString();

  db.prepare(
    `INSERT INTO station_admin_mfa_challenges
       (id, actor_id, challenge_purpose, session_id, expires_at, attempts_remaining, consumed_at, metadata)
     VALUES (?, ?, ?, ?, ?, 5, NULL, NULL)`,
  ).run(challengeId, actorId, purpose, sessionId, expiresAt);

  return {
    challengeId,
    purpose,
    expiresAt,
    recoveryCodeAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * POST /station-admin/mfa/enroll/start
 *
 * Generate a new TOTP secret for the actor and store it as pending.
 * The secret and QR code URI are returned once — the actor must verify
 * a TOTP code before MFA is actually enabled.
 *
 * Requires: valid session + CSRF token.
 * Guards: actor must not already have MFA enabled.
 */
export function startMfaEnrollment(
  sessionId: string,
  csrfToken: string,
  dependencies: StationAdminMfaDependencies = {},
): MfaEnrollStartResult {
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const handle = openDb(dependencies);
  if (!handle) return { result: "not_available" };
  const { db, close } = handle;

  try {
    const nowMs = now();
    const sessionValidation = validateSession(db, sessionId, csrfToken, nowMs);
    if (sessionValidation === "not_found") return { result: "not_found" };
    if (sessionValidation === "csrf_invalid") return { result: "not_found" };

    const actorId = (sessionValidation as SessionRow).actor_id;

    const credRows = db
      .prepare(
        `SELECT id, actor_role, mfa_enabled, mfa_secret, mfa_pending_secret, mfa_pending_since,
                mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
         FROM station_admin_credentials WHERE id = ? LIMIT 1`,
      )
      .all(actorId) as CredentialsRow[];
    const cred = credRows[0];
    if (!cred) return { result: "not_found" };

    if (toBooleanFlag(cred.mfa_enabled)) {
      return { result: "already_enrolled" };
    }

    const { secret } = generateTotpSecret();
    const qrCodeUri = generateQrCodeUri(secret, actorId, TOTP_ISSUER);
    const nowIso = new Date(nowMs).toISOString();

    // Store as pending (encrypted if key is configured).
    // Requires schema migration M-2 (mfa_pending_secret column).
    // If column does not exist yet, this will throw and fall through to not_available.
    db.prepare(
      `UPDATE station_admin_credentials
       SET mfa_pending_secret = ?, mfa_pending_since = ?, updated_at = ?
       WHERE id = ?`,
    ).run(storeMfaSecret(secret), nowIso, nowIso, actorId);

    void tokenFn; // Will be used for audit events when wired in

    return { result: "started", qrCodeUri, secret };
  } catch {
    return { result: "not_available" };
  } finally {
    close();
  }
}

/**
 * POST /station-admin/mfa/enroll/verify
 *
 * Verify the TOTP code against the pending secret.
 * On success: enables MFA, generates recovery codes, clears the pending secret.
 *
 * Requires: valid session + CSRF token + valid TOTP code.
 */
export function verifyMfaEnrollment(
  sessionId: string,
  csrfToken: string,
  totpCode: string,
  dependencies: StationAdminMfaDependencies = {},
): MfaEnrollVerifyResult {
  const now = dependencies.now ?? Date.now;
  const handle = openDb(dependencies);
  if (!handle) return { result: "not_available" };
  const { db, close } = handle;

  try {
    const nowMs = now();
    const sessionValidation = validateSession(db, sessionId, csrfToken, nowMs);
    if (sessionValidation === "not_found") return { result: "not_found" };
    if (sessionValidation === "csrf_invalid") return { result: "not_found" };

    const actorId = (sessionValidation as SessionRow).actor_id;

    const credRows = db
      .prepare(
        `SELECT id, actor_role, mfa_enabled, mfa_secret, mfa_pending_secret, mfa_pending_since,
                mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
         FROM station_admin_credentials WHERE id = ? LIMIT 1`,
      )
      .all(actorId) as CredentialsRow[];
    const cred = credRows[0];
    if (!cred) return { result: "not_found" };

    // Decrypt the pending secret (transparent plaintext pass-through if key not configured).
    const pendingSecret = resolveMfaSecret(cred.mfa_pending_secret);
    const pendingSince = cred.mfa_pending_since ? new Date(cred.mfa_pending_since).getTime() : 0;

    if (!pendingSecret) return { result: "not_found" };

    // Check that the pending enrollment has not expired
    if (nowMs - pendingSince > MFA_PENDING_TTL_MS) {
      db.prepare(
        `UPDATE station_admin_credentials SET mfa_pending_secret = NULL, mfa_pending_since = NULL, updated_at = ? WHERE id = ?`,
      ).run(new Date(nowMs).toISOString(), actorId);
      return { result: "enrollment_expired" };
    }

    // Verify the TOTP code against the resolved (plaintext) pending secret
    const { valid } = verifyTotpToken(totpCode, pendingSecret, nowMs);
    if (!valid) return { result: "invalid_code" };

    // Generate recovery codes
    const plainCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const storedCodes: StoredRecoveryCode[] = plainCodes.map((code) => ({
      codeHash: hashRecoveryCode(code),
      usedAt: null,
    }));
    const nowIso = new Date(nowMs).toISOString();

    // Enable MFA: move pending secret to active (encrypting if key is configured), clear pending state
    db.prepare(
      `UPDATE station_admin_credentials
       SET mfa_enabled = 1,
           mfa_secret = ?,
           mfa_pending_secret = NULL,
           mfa_pending_since = NULL,
           mfa_recovery_codes = ?,
           mfa_enrolled_at = COALESCE(mfa_enrolled_at, ?),
           mfa_last_verified_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      storeMfaSecret(pendingSecret),
      JSON.stringify(storedCodes),
      nowIso,
      nowIso,
      nowIso,
      actorId,
    );

    const mfa: StationAdminMfaEnrollmentState = {
      enabled: true,
      enrolledAt: nowIso,
      lastVerifiedAt: nowIso,
      recoveryCodesRemaining: RECOVERY_CODE_COUNT,
    };

    return { result: "enrolled", mfa, recoveryCodes: plainCodes };
  } catch {
    return { result: "not_available" };
  } finally {
    close();
  }
}

/**
 * POST /station-admin/mfa/recovery/regenerate
 *
 * Regenerate recovery codes. Requires a completed MFA step-up within the
 * last 5 minutes (permission_mutation purpose).
 *
 * Requires: valid session + CSRF token + recent MFA step-up.
 */
export function regenerateRecoveryCodes(
  sessionId: string,
  csrfToken: string,
  dependencies: StationAdminMfaDependencies = {},
): RecoveryRegenerateResult {
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const handle = openDb(dependencies);
  if (!handle) return { result: "not_available" };
  const { db, close } = handle;

  try {
    const nowMs = now();
    const sessionValidation = validateSession(db, sessionId, csrfToken, nowMs);
    if (sessionValidation === "csrf_invalid") return { result: "csrf_invalid" };
    if (sessionValidation === "not_found") return { result: "not_found" };

    const session = sessionValidation as SessionRow;
    const actorId = session.actor_id;

    const credRows = db
      .prepare(
        `SELECT id, actor_role, mfa_enabled, mfa_secret, mfa_pending_secret, mfa_pending_since,
                mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
         FROM station_admin_credentials WHERE id = ? LIMIT 1`,
      )
      .all(actorId) as CredentialsRow[];
    const cred = credRows[0];
    if (!cred) return { result: "not_found" };

    if (!toBooleanFlag(cred.mfa_enabled)) {
      return { result: "mfa_not_enrolled" };
    }

    // Evaluate step-up policy
    const stepUpResult = evaluateStepUpPolicy(
      PERMISSION_MUTATION_POLICY,
      {
        actorId,
        sessionId: session.id,
        mfaEnabled: true,
        hasRecentStepUp: (purpose, windowMs) => {
          const query = buildRecentStepUpQuery(actorId, session.id, purpose, nowMs, windowMs);
          const rows = db.prepare(query.sql).all(...query.params);
          return rows.length > 0;
        },
      },
      (purpose) =>
        createMfaChallengeRow(db, tokenFn, nowMs, actorId, purpose, session.id),
    );

    if (!stepUpResult.satisfied) {
      return { result: "mfa_required", challenge: stepUpResult.challenge };
    }

    // Generate new recovery codes
    const plainCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const storedCodes: StoredRecoveryCode[] = plainCodes.map((code) => ({
      codeHash: hashRecoveryCode(code),
      usedAt: null,
    }));
    const nowIso = new Date(nowMs).toISOString();

    db.prepare(
      `UPDATE station_admin_credentials SET mfa_recovery_codes = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(storedCodes), nowIso, actorId);

    const updatedCred: CredentialsRow = { ...cred, mfa_recovery_codes: JSON.stringify(storedCodes) };
    const mfa = buildMfaEnrollmentState(updatedCred, storedCodes);

    return { result: "regenerated", mfa, recoveryCodes: plainCodes };
  } catch {
    return { result: "not_available" };
  } finally {
    close();
  }
}

/**
 * POST /station-admin/mfa/disable
 *
 * Disable MFA for the actor. Requires:
 *   - Valid session + CSRF token
 *   - A valid current TOTP code
 *   - A recent MFA step-up (permission_mutation)
 *
 * This is a destructive, hard-to-reverse action.
 */
export function disableMfa(
  sessionId: string,
  csrfToken: string,
  totpCode: string,
  dependencies: StationAdminMfaDependencies = {},
): MfaDisableResult {
  const now = dependencies.now ?? Date.now;
  const tokenFn = dependencies.generateToken ?? generateToken;
  const handle = openDb(dependencies);
  if (!handle) return { result: "not_available" };
  const { db, close } = handle;

  try {
    const nowMs = now();
    const sessionValidation = validateSession(db, sessionId, csrfToken, nowMs);
    if (sessionValidation === "csrf_invalid") return { result: "csrf_invalid" };
    if (sessionValidation === "not_found") return { result: "not_found" };

    const session = sessionValidation as SessionRow;
    const actorId = session.actor_id;

    const credRows = db
      .prepare(
        `SELECT id, actor_role, mfa_enabled, mfa_secret, mfa_pending_secret, mfa_pending_since,
                mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at
         FROM station_admin_credentials WHERE id = ? LIMIT 1`,
      )
      .all(actorId) as CredentialsRow[];
    const cred = credRows[0];
    if (!cred) return { result: "not_found" };

    if (!toBooleanFlag(cred.mfa_enabled) || !cred.mfa_secret) {
      return { result: "mfa_not_enrolled" };
    }

    // Decrypt if the stored secret is an AES-256-GCM envelope.
    const resolvedSecret = resolveMfaSecret(cred.mfa_secret);
    if (!resolvedSecret) {
      return { result: "mfa_not_enrolled" };
    }

    // Require a valid TOTP code to disable MFA
    const { valid } = verifyTotpToken(totpCode, resolvedSecret, nowMs);
    if (!valid) return { result: "invalid_code" };

    // Also require a recent step-up
    const stepUpResult = evaluateStepUpPolicy(
      PERMISSION_MUTATION_POLICY,
      {
        actorId,
        sessionId: session.id,
        mfaEnabled: true,
        hasRecentStepUp: (purpose, windowMs) => {
          const query = buildRecentStepUpQuery(actorId, session.id, purpose, nowMs, windowMs);
          const rows = db.prepare(query.sql).all(...query.params);
          return rows.length > 0;
        },
      },
      (purpose) =>
        createMfaChallengeRow(db, tokenFn, nowMs, actorId, purpose, session.id),
    );

    if (!stepUpResult.satisfied) {
      return { result: "mfa_required", challenge: stepUpResult.challenge };
    }

    // Disable MFA — clear all MFA fields
    const nowIso = new Date(nowMs).toISOString();
    db.prepare(
      `UPDATE station_admin_credentials
       SET mfa_enabled = 0,
           mfa_secret = NULL,
           mfa_pending_secret = NULL,
           mfa_pending_since = NULL,
           mfa_recovery_codes = NULL,
           mfa_enrolled_at = NULL,
           mfa_last_verified_at = NULL,
           updated_at = ?
       WHERE id = ?`,
    ).run(nowIso, actorId);

    return { result: "disabled", actorId };
  } catch {
    return { result: "not_available" };
  } finally {
    close();
  }
}
