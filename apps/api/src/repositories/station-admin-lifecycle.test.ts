import test from "node:test";
import assert from "node:assert/strict";
import { createHash, scryptSync } from "node:crypto";
import {
  loginStationAdmin,
  logoutStationAdmin,
  refreshStationAdminSession,
  revokeStationAdminSession,
  verifyStationAdminMfaChallenge,
} from "./station-admin-lifecycle";
import { generateCurrentTotpCode } from "../security/totp";

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

interface InsertCapture {
  sql: string;
  params: unknown[];
}

interface MockSessionRow {
  id: string;
  actor_id: string;
  actor_role: string;
  permissions: string | null;
  csrf_token: string;
  last_active_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}

interface MockCredentialRow {
  id: string;
  actor_role: string;
  password_hash: string;
  salt: string;
  mfa_enabled?: number | boolean | null;
  mfa_secret?: string | null;
  mfa_recovery_codes?: string | null;
  mfa_enrolled_at?: string | null;
  mfa_last_verified_at?: string | null;
}

interface MockMfaChallengeRow {
  id: string;
  actor_id: string;
  challenge_purpose: "login" | "session_revoke" | "permission_mutation";
  session_id: string | null;
  expires_at: string;
  attempts_remaining: number;
  consumed_at: string | null;
  metadata: string | null;
}

interface MockDbOptions {
  recentFailureRows?: Array<{ actor_id: string | null; metadata: string | null }>;
  authEventRows?: Array<Record<string, unknown>>;
  authEventRowsBySqlIncludes?: Record<string, Array<Record<string, unknown>>>;
  authEventRowsByEventType?: Record<string, Array<Record<string, unknown>>>;
  credentialRow?: MockCredentialRow | null;
  credentialRowsByActorId?: Record<string, MockCredentialRow>;
  sessionRow?: MockSessionRow | null;
  sessionRowsById?: Record<string, MockSessionRow>;
  targetSessionRow?: Pick<MockSessionRow, "id" | "actor_id" | "revoked_at"> | null;
  challengeRow?: MockMfaChallengeRow | null;
  challengeRowsById?: Record<string, MockMfaChallengeRow>;
  throwOnSqlIncludes?: string[];
  runResultBySqlIncludes?: Record<string, unknown>;
  inserts?: InsertCapture[];
}

function createMockDb(options: MockDbOptions) {
  const {
    recentFailureRows = [],
    authEventRows,
    credentialRow = null,
    sessionRow = null,
    challengeRow = null,
  } = options;

  function shouldThrow(sql: string): boolean {
    return (options.throwOnSqlIncludes ?? []).some((snippet) => sql.includes(snippet));
  }

  function pickRunResult(sql: string): unknown {
    for (const [snippet, result] of Object.entries(options.runResultBySqlIncludes ?? {})) {
      if (sql.includes(snippet)) {
        return result;
      }
    }

    return {};
  }

  return {
    exec(sql: string) {
      if (shouldThrow(sql)) {
        throw new Error(`mock exec throw for SQL: ${sql}`);
      }

      options.inserts?.push({ sql, params: [] });
    },
    prepare(sql: string) {
      return {
        all(...params: unknown[]): unknown[] {
          if (shouldThrow(sql)) {
            throw new Error(`mock all throw for SQL: ${sql}`);
          }

          if (sql.includes("FROM station_admin_auth_events")) {
            for (const [snippet, rows] of Object.entries(options.authEventRowsBySqlIncludes ?? {})) {
              if (sql.includes(snippet)) {
                return rows;
              }
            }

            if (sql.includes("event_type = ?")) {
              const eventType = typeof params[0] === "string" ? params[0] : "";
              if (eventType && options.authEventRowsByEventType?.[eventType]) {
                return options.authEventRowsByEventType[eventType];
              }
            }

            if (authEventRows) {
              return authEventRows;
            }

            return recentFailureRows;
          }

          if (sql.includes("FROM station_admin_credentials")) {
            const credentialId = typeof params[0] === "string" ? params[0] : "";
            const mapped = credentialId && options.credentialRowsByActorId
              ? options.credentialRowsByActorId[credentialId]
              : undefined;

            if (mapped) {
              return [mapped];
            }

            return credentialRow ? [credentialRow] : [];
          }

          if (sql.includes("FROM station_admin_mfa_challenges")) {
            const challengeId = typeof params[0] === "string" ? params[0] : "";
            const mapped = challengeId && options.challengeRowsById
              ? options.challengeRowsById[challengeId]
              : undefined;

            if (mapped) {
              return [mapped];
            }

            return challengeRow ? [challengeRow] : [];
          }

          if (sql.includes("FROM station_admin_sessions")) {
            // The revoke admin-session query selects actor_role and csrf_token;
            // the target-session query does not — differentiate by sessionId param.
            if (options.targetSessionRow && params[0] === options.targetSessionRow.id) {
              return [options.targetSessionRow];
            }

            const sessionId = typeof params[0] === "string" ? params[0] : "";
            const mapped = sessionId && options.sessionRowsById
              ? options.sessionRowsById[sessionId]
              : undefined;

            if (mapped) {
              return [mapped];
            }

            return sessionRow ? [sessionRow] : [];
          }

          return [];
        },
        run(...params: unknown[]): unknown {
          if (shouldThrow(sql)) {
            throw new Error(`mock run throw for SQL: ${sql}`);
          }

          options.inserts?.push({ sql, params });
          return pickRunResult(sql);
        },
      };
    },
    close() {},
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW = 1_742_119_200_000; // 2026-03-16T10:00:00.000Z

// Pre-compute a stable scrypt hash for a known test password so that the
// loginStationAdmin success-path can be exercised without a real DB.
const TEST_SALT_BYTES = Buffer.from("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "hex");
const TEST_SALT = TEST_SALT_BYTES.toString("hex");
const TEST_PASSWORD = "repo-test-pw-auth-event";
const TEST_HASH = scryptSync(TEST_PASSWORD, TEST_SALT_BYTES, 64).toString("hex");

const VALID_CREDENTIAL: MockCredentialRow = {
  id: "auth-test-actor@marine.local",
  actor_role: "admin",
  password_hash: TEST_HASH,
  salt: TEST_SALT,
  mfa_enabled: 0,
  mfa_secret: null,
  mfa_recovery_codes: null,
  mfa_enrolled_at: null,
  mfa_last_verified_at: null,
};

// Valid base32 TOTP secret (well-known test vector — "Hello!" in base32)
const MFA_TEST_SECRET = "JBSWY3DPEHPK3PXP";
// TOTP code generated at NOW using the above secret (current step, delta=0)
const MFA_TEST_CODE = generateCurrentTotpCode(MFA_TEST_SECRET, NOW)!;
const MFA_TEST_RECOVERY_CODE = "RECOVERY-OPS-001";

function hashRecoveryCodeForTest(code: string): string {
  return createHash("sha256").update(code.trim().replace(/[\-\s]/g, "").toUpperCase()).digest("hex");
}

const FUTURE_EXPIRES_AT = new Date(NOW + 8 * 60 * 60 * 1000).toISOString();

const VALID_SESSION: MockSessionRow = {
  id: "sess-auth-test-001",
  actor_id: "auth-test-actor@marine.local",
  actor_role: "admin",
  permissions: null,
  csrf_token: "csrf-auth-test-valid",
  last_active_at: null,
  expires_at: FUTURE_EXPIRES_AT,
  revoked_at: null,
};

function buildFailureRows(
  count: number,
  actorId: string,
  metadata?: Record<string, unknown>,
): Array<{ actor_id: string | null; metadata: string | null }> {
  return Array.from({ length: count }, () => ({
    actor_id: actorId,
    metadata: metadata ? JSON.stringify(metadata) : null,
  }));
}

// ---------------------------------------------------------------------------
// Login – lockout tests
// ---------------------------------------------------------------------------

test("loginStationAdmin returns locked_out when failure count meets threshold", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({ recentFailureRows: buildFailureRows(5, "actor@marine.local"), inserts });

  const result = loginStationAdmin("actor@marine.local", "any-password", {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
    maxLoginAttempts: 5,
    lockoutWindowMs: 900_000,
  });

  assert.equal(result.result, "locked_out");
});

test("loginStationAdmin returns locked_out even with correct credentials when locked", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    recentFailureRows: buildFailureRows(5, VALID_CREDENTIAL.id),
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  const result = loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
    maxLoginAttempts: 5,
    lockoutWindowMs: 900_000,
  });

  assert.equal(result.result, "locked_out");
});

test("loginStationAdmin allows login when failure count is below threshold", () => {
  const inserts: InsertCapture[] = [];
  // 4 failures — one below threshold of 5
  const db = createMockDb({
    recentFailureRows: buildFailureRows(4, VALID_CREDENTIAL.id),
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  const result = loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
    maxLoginAttempts: 5,
    lockoutWindowMs: 900_000,
  });

  assert.equal(result.result, "issued");
});

test("loginStationAdmin requires MFA challenge before issuing a session when MFA is enabled", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    recentFailureRows: [],
    credentialRow: {
      ...VALID_CREDENTIAL,
      mfa_enabled: 1,
      mfa_secret: MFA_TEST_SECRET,
      mfa_recovery_codes: JSON.stringify([
        { codeHash: hashRecoveryCodeForTest(MFA_TEST_RECOVERY_CODE), usedAt: null },
      ]),
      mfa_enrolled_at: "2026-03-10T09:00:00.000Z",
      mfa_last_verified_at: "2026-03-15T12:00:00.000Z",
    },
    inserts,
  });

  const result = loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
  });

  assert.equal(result.result, "pending_mfa");

  const mfaChallengeInsert = inserts.find((capture) => capture.sql.includes("station_admin_mfa_challenges"));
  assert.ok(mfaChallengeInsert, "should insert MFA challenge record");

  const sessionInsert = inserts.find((capture) => capture.sql.includes("INSERT INTO station_admin_sessions"));
  assert.equal(sessionInsert, undefined, "should not issue session until MFA is verified");
});

test("verifyStationAdminMfaChallenge issues session for valid login challenge code", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-001";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
        mfa_recovery_codes: JSON.stringify([
          { codeHash: hashRecoveryCodeForTest(MFA_TEST_RECOVERY_CODE), usedAt: null },
        ]),
        mfa_enrolled_at: "2026-03-10T09:00:00.000Z",
        mfa_last_verified_at: "2026-03-15T12:00:00.000Z",
      },
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
    },
  );

  assert.equal(result.result, "issued");

  const beginTxn = inserts.find((capture) => capture.sql.includes("BEGIN IMMEDIATE"));
  const commitTxn = inserts.find((capture) => capture.sql.includes("COMMIT"));
  assert.ok(beginTxn, "should start a transaction for verify");
  assert.ok(commitTxn, "should commit transaction after successful verify");

  const sessionInsert = inserts.find((capture) => capture.sql.includes("INSERT INTO station_admin_sessions"));
  assert.ok(sessionInsert, "should issue a session after successful MFA verification");
});

test("verifyStationAdminMfaChallenge blocks invalid code and decrements attempts", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-002";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 3,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
        mfa_recovery_codes: JSON.stringify([
          { codeHash: hashRecoveryCodeForTest(MFA_TEST_RECOVERY_CODE), usedAt: null },
        ]),
      },
    },
    authEventRowsByEventType: {
      mfa_challenge_failure: [
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "198.51.100.9" }) },
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "198.51.100.9" }) },
      ],
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    "wrong-code",
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      requestMetadata: {
        ip: "198.51.100.9",
      },
      repeatedInvalidMfaAttemptThreshold: 2,
    },
  );

  assert.equal(result.result, "mfa_failed");
  if (result.result === "mfa_failed") {
    assert.equal(result.attemptsRemaining, 2);
    assert.equal(result.lockedOut, false);
  }

  const commitTxn = inserts.find((capture) => capture.sql.includes("COMMIT"));
  assert.ok(commitTxn, "should commit transaction after handled MFA failure");

  const sessionInsert = inserts.find((capture) => capture.sql.includes("INSERT INTO station_admin_sessions"));
  assert.equal(sessionInsert, undefined, "should not issue a session on MFA failure");

  const failureEvent = inserts.find((capture) => capture.params.includes("mfa_challenge_failure"));
  assert.ok(failureEvent, "should log MFA challenge failure event");

  const abuseEvent = inserts.find((capture) => capture.params.includes("mfa_abuse_detected"));
  assert.ok(abuseEvent, "should emit abuse-detected event for repeated invalid verify attempts");
});

test("verifyStationAdminMfaChallenge coalesces abuse events between threshold boundaries", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-002b";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 3,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    authEventRowsByEventType: {
      mfa_challenge_failure: [
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "198.51.100.10" }) },
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "198.51.100.10" }) },
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "198.51.100.10" }) },
      ],
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    "wrong-code",
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      requestMetadata: {
        ip: "198.51.100.10",
      },
      repeatedInvalidMfaAttemptThreshold: 2,
      maxMfaVerifyAttemptsPerChallenge: 100,
      maxMfaVerifyAttemptsPerActor: 100,
      maxMfaVerifyAttemptsPerIp: 100,
    },
  );

  assert.equal(result.result, "mfa_failed");

  const abuseEvent = inserts.find((capture) => capture.params.includes("mfa_abuse_detected"));
  assert.equal(abuseEvent, undefined, "should suppress abuse event noise for non-boundary counts");
});

test("verifyStationAdminMfaChallenge rolls back transaction on repository error", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-rollback-001";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    throwOnSqlIncludes: ["FROM station_admin_credentials"],
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
    },
  );

  assert.equal(result.result, "not_found");

  const beginTxn = inserts.find((capture) => capture.sql.includes("BEGIN IMMEDIATE"));
  const rollbackTxn = inserts.find((capture) => capture.sql.includes("ROLLBACK"));
  assert.ok(beginTxn, "should begin transaction before verify operations");
  assert.ok(rollbackTxn, "should rollback transaction on verify failure path");
});

test("verifyStationAdminMfaChallenge returns not_found when challenge is consumed concurrently", () => {
  const challengeId = "mfa-challenge-race-001";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    runResultBySqlIncludes: {
      "UPDATE station_admin_mfa_challenges SET consumed_at = ?, attempts_remaining = ?": { changes: 0 },
    },
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      repeatedMfaExpiredThreshold: 2,
    },
  );

  assert.equal(result.result, "not_found");
});

test("verifyStationAdminMfaChallenge rate limits by challengeId bucket", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-rate-challenge-001";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    authEventRowsBySqlIncludes: {
      "event_type = 'mfa_challenge_failure'": [
        {
          actor_id: VALID_CREDENTIAL.id,
          metadata: JSON.stringify({ challengeId, ip: "198.51.100.10" }),
        },
        {
          actor_id: VALID_CREDENTIAL.id,
          metadata: JSON.stringify({ challengeId, ip: "198.51.100.10" }),
        },
      ],
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      maxMfaVerifyAttemptsPerChallenge: 2,
      maxMfaVerifyAttemptsPerActor: 100,
      maxMfaVerifyAttemptsPerIp: 100,
    },
  );

  assert.equal(result.result, "rate_limited");

  const rateLimitEvent = inserts.find((capture) => capture.params.includes("mfa_verify_rate_limited"));
  assert.ok(rateLimitEvent, "should emit mfa_verify_rate_limited event");
});

test("verifyStationAdminMfaChallenge rate limits by actor bucket", () => {
  const challengeId = "mfa-challenge-rate-actor-001";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    authEventRowsBySqlIncludes: {
      "event_type = 'mfa_challenge_failure'": [
        {
          actor_id: VALID_CREDENTIAL.id,
          metadata: JSON.stringify({ challengeId: "other-1", ip: "198.51.100.11" }),
        },
        {
          actor_id: VALID_CREDENTIAL.id,
          metadata: JSON.stringify({ challengeId: "other-2", ip: "198.51.100.12" }),
        },
      ],
    },
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      maxMfaVerifyAttemptsPerChallenge: 100,
      maxMfaVerifyAttemptsPerActor: 2,
      maxMfaVerifyAttemptsPerIp: 100,
    },
  );

  assert.equal(result.result, "rate_limited");
});

test("verifyStationAdminMfaChallenge rate limits by IP bucket when metadata IP is present", () => {
  const challengeId = "mfa-challenge-rate-ip-001";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    authEventRowsBySqlIncludes: {
      "event_type = 'mfa_challenge_failure'": [
        {
          actor_id: "other.actor@marine.local",
          metadata: JSON.stringify({ challengeId: "other-1", ip: "203.0.113.77" }),
        },
        {
          actor_id: "other.actor@marine.local",
          metadata: JSON.stringify({ challengeId: "other-2", ip: "203.0.113.77" }),
        },
      ],
    },
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      requestMetadata: {
        ip: "203.0.113.77",
      },
      maxMfaVerifyAttemptsPerChallenge: 100,
      maxMfaVerifyAttemptsPerActor: 100,
      maxMfaVerifyAttemptsPerIp: 2,
    },
  );

  assert.equal(result.result, "rate_limited");
});

test("verifyStationAdminMfaChallenge returns expired for stale challenge", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-expired";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW - 60_000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    authEventRowsBySqlIncludes: {
      "event_type = ?": [
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "203.0.113.42" }) },
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "203.0.113.42" }) },
      ],
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      repeatedMfaExpiredThreshold: 2,
    },
  );

  assert.equal(result.result, "expired");

  const expiredEvent = inserts.find((capture) => capture.params.includes("mfa_challenge_expired"));
  const abuseEvent = inserts.find((capture) => capture.params.includes("mfa_abuse_detected"));
  assert.ok(expiredEvent, "should emit expired MFA challenge event");
  assert.ok(abuseEvent, "should emit abuse-detected event for repeated expired challenges");
});

test("verifyStationAdminMfaChallenge returns locked_out when no attempts remain", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-locked";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 0,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    authEventRowsBySqlIncludes: {
      "event_type = ?": [
        { actor_id: VALID_CREDENTIAL.id, metadata: JSON.stringify({ ip: "203.0.113.52" }) },
      ],
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      repeatedMfaLockoutThreshold: 1,
    },
  );

  assert.equal(result.result, "locked_out");
  if (result.result === "locked_out") {
    assert.equal(result.attemptsRemaining, 0);
  }

  const lockEvent = inserts.find((capture) => capture.params.includes("mfa_challenge_locked"));
  const abuseEvent = inserts.find((capture) => capture.params.includes("mfa_abuse_detected"));
  assert.ok(lockEvent, "should emit mfa_challenge_locked event");
  assert.ok(abuseEvent, "should emit abuse-detected event for repeated lockouts");
});

test("verifyStationAdminMfaChallenge enforces session binding for session_revoke challenges", () => {
  const challengeId = "mfa-challenge-revoke-bound";
  const boundSessionId = "sess-bound-admin";
  const wrongSessionId = "sess-wrong-admin";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "session_revoke",
        session_id: boundSessionId,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    sessionRowsById: {
      [wrongSessionId]: {
        ...VALID_SESSION,
        id: wrongSessionId,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET,
    undefined,
    wrongSessionId,
    VALID_SESSION.csrf_token,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
    },
  );

  assert.equal(result.result, "invalid_request");
});

test("verifyStationAdminMfaChallenge accepts valid recovery code and records usage", () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-003";
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
        mfa_recovery_codes: JSON.stringify([
          { codeHash: hashRecoveryCodeForTest(MFA_TEST_RECOVERY_CODE), usedAt: null },
        ]),
      },
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    undefined,
    MFA_TEST_RECOVERY_CODE,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
    },
  );

  assert.equal(result.result, "issued");

  const recoveryUsedEvent = inserts.find((capture) => capture.params.includes("recovery_code_used"));
  assert.ok(recoveryUsedEvent, "should log recovery code usage event");
});

// ---------------------------------------------------------------------------
// Login – auth event tests
// ---------------------------------------------------------------------------

test("loginStationAdmin writes login_locked event on lockout", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    recentFailureRows: buildFailureRows(5, "actor@marine.local"),
    inserts,
  });

  loginStationAdmin("actor@marine.local", "wrong", {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
    maxLoginAttempts: 5,
    lockoutWindowMs: 900_000,
  });

  const lockedEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("login_locked"),
  );
  assert.ok(lockedEvent, "should emit login_locked auth event");
  assert.equal(lockedEvent.params[2], "actor@marine.local");
});

test("loginStationAdmin writes login_failure event on wrong credentials", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    recentFailureRows: [],
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  loginStationAdmin(VALID_CREDENTIAL.id, "wrong-password", {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
  });

  const failEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("login_failure"),
  );
  assert.ok(failEvent, "should emit login_failure auth event");
  assert.equal(failEvent.params[2], VALID_CREDENTIAL.id);
});

test("loginStationAdmin writes login_success event on valid credentials", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    recentFailureRows: [],
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  const result = loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
  });

  assert.equal(result.result, "issued");

  const successEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("login_success"),
  );
  assert.ok(successEvent, "should emit login_success auth event");
  assert.equal(successEvent.params[2], VALID_CREDENTIAL.id);

  if (result.result === "issued") {
    assert.equal(successEvent.params[3], result.sessionId);
  }
});

test("loginStationAdmin persists request metadata on login events", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    recentFailureRows: [],
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
    requestMetadata: {
      ip: "203.0.113.42",
      userAgent: "Vitest Browser",
      source: "POST /api/station-admin/login",
    },
  });

  const successEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("login_success"),
  );
  assert.ok(successEvent, "should emit login_success auth event");

  const metadata = JSON.parse(String(successEvent.params[5])) as {
    ip: string;
    userAgent: string;
    source: string;
  };
  assert.equal(metadata.ip, "203.0.113.42");
  assert.equal(metadata.userAgent, "Vitest Browser");
  assert.equal(metadata.source, "POST /api/station-admin/login");
});

test("loginStationAdmin applies stronger lockout for repeated failures from the same IP", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    recentFailureRows: buildFailureRows(3, "other.actor@marine.local", { ip: "198.51.100.7" }),
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  const result = loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
    maxLoginAttempts: 5,
    maxIpLoginAttempts: 3,
    requestMetadata: {
      ip: "198.51.100.7",
      userAgent: "Vitest Browser",
      source: "POST /api/station-admin/login",
    },
  });

  assert.equal(result.result, "locked_out");

  const lockedEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("login_locked"),
  );
  assert.ok(lockedEvent, "should emit login_locked auth event");

  const metadata = JSON.parse(String(lockedEvent.params[5])) as {
    ip: string;
    lockoutScope: string;
  };
  assert.equal(metadata.ip, "198.51.100.7");
  assert.equal(metadata.lockoutScope, "ip");
});

// ---------------------------------------------------------------------------
// Logout – auth event tests
// ---------------------------------------------------------------------------

test("logoutStationAdmin writes logout auth event on success", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({ sessionRow: VALID_SESSION, inserts });

  const result = logoutStationAdmin(VALID_SESSION.id, VALID_SESSION.csrf_token, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
  });

  assert.equal(result.result, "revoked");

  const logoutEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("logout"),
  );
  assert.ok(logoutEvent, "should emit logout auth event");
  assert.equal(logoutEvent.params[2], VALID_SESSION.actor_id);
  assert.equal(logoutEvent.params[3], VALID_SESSION.id);
});

// ---------------------------------------------------------------------------
// Refresh – auth event tests
// ---------------------------------------------------------------------------

test("refreshStationAdminSession writes refresh auth event on success", () => {
  const inserts: InsertCapture[] = [];
  const db = createMockDb({ sessionRow: VALID_SESSION, inserts });

  const result = refreshStationAdminSession(VALID_SESSION.id, VALID_SESSION.csrf_token, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    openDatabase: () => db,
    now: () => NOW,
  });

  assert.equal(result.result, "refreshed");

  const refreshEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("refresh"),
  );
  assert.ok(refreshEvent, "should emit refresh auth event");
  assert.equal(refreshEvent.params[2], VALID_SESSION.actor_id);

  if (result.result === "refreshed") {
    assert.equal(refreshEvent.params[3], result.sessionId);
  }
});

// ---------------------------------------------------------------------------
// Revoke – auth event tests
// ---------------------------------------------------------------------------

test("revokeStationAdminSession writes revoke auth event on success", () => {
  const inserts: InsertCapture[] = [];
  const targetSession = {
    id: "sess-target-revoke-001",
    actor_id: "target-actor@marine.local",
    revoked_at: null,
  };
  const db = createMockDb({
    sessionRow: VALID_SESSION,
    targetSessionRow: targetSession,
    inserts,
  });

  const result = revokeStationAdminSession(
    VALID_SESSION.id,
    VALID_SESSION.csrf_token,
    targetSession.id,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
    },
  );

  assert.equal(result.result, "revoked");

  const revokeEvent = inserts.find(
    (i) => i.sql.includes("station_admin_auth_events") && i.params.includes("revoke"),
  );
  assert.ok(revokeEvent, "should emit revoke auth event");
  assert.equal(revokeEvent.params[2], targetSession.actor_id);
  assert.equal(revokeEvent.params[3], targetSession.id);

  // Metadata should record who performed the revocation
  const metadata = revokeEvent.params[5] as string;
  const parsed = JSON.parse(metadata) as { revokedBy: string };
  assert.equal(parsed.revokedBy, VALID_SESSION.actor_id);
});

test("revokeStationAdminSession does not accept recent failed step-up as verified step-up", () => {
  const adminSession = {
    ...VALID_SESSION,
    id: "sess-admin-stepup-guard",
  };
  const targetSession = {
    id: "sess-target-stepup-guard",
    actor_id: "target-actor@marine.local",
    revoked_at: null,
  };
  const db = createMockDb({
    sessionRowsById: {
      [adminSession.id]: adminSession,
    },
    targetSessionRow: targetSession,
    credentialRowsByActorId: {
      [adminSession.actor_id]: {
        ...VALID_CREDENTIAL,
        id: adminSession.actor_id,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    authEventRows: [
      {
        event_type: "mfa_challenge_failure",
        occurred_at: new Date(NOW - 60_000).toISOString(),
        metadata: JSON.stringify({ challengePurpose: "session_revoke" }),
      },
    ],
  });

  const result = revokeStationAdminSession(
    adminSession.id,
    adminSession.csrf_token,
    targetSession.id,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      mfaStepUpWindowMs: 5 * 60 * 1000,
    },
  );

  assert.equal(result.result, "mfa_required");
});

test("revokeStationAdminSession accepts recent successful step-up event for same session", () => {
  const adminSession = {
    ...VALID_SESSION,
    id: "sess-admin-stepup-success",
  };
  const targetSession = {
    id: "sess-target-stepup-success",
    actor_id: "target-actor@marine.local",
    revoked_at: null,
  };
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    sessionRowsById: {
      [adminSession.id]: adminSession,
    },
    targetSessionRow: targetSession,
    credentialRowsByActorId: {
      [adminSession.actor_id]: {
        ...VALID_CREDENTIAL,
        id: adminSession.actor_id,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    authEventRows: [
      {
        event_type: "mfa_challenge_success",
        occurred_at: new Date(NOW - 30_000).toISOString(),
        metadata: JSON.stringify({ challengePurpose: "session_revoke" }),
      },
    ],
    inserts,
  });

  const result = revokeStationAdminSession(
    adminSession.id,
    adminSession.csrf_token,
    targetSession.id,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      openDatabase: () => db,
      now: () => NOW,
      mfaStepUpWindowMs: 5 * 60 * 1000,
    },
  );

  assert.equal(result.result, "revoked");

  const challengeInsert = inserts.find((capture) => capture.sql.includes("station_admin_mfa_challenges"));
  assert.equal(challengeInsert, undefined, "should not issue a new challenge within verified step-up window");
});

// ---------------------------------------------------------------------------
// TOTP verification — productionization regression tests
// ---------------------------------------------------------------------------

function makeTotpChallengeDb(challengeId: string, code?: string) {
  return createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
        mfa_recovery_codes: JSON.stringify([
          { codeHash: hashRecoveryCodeForTest(MFA_TEST_RECOVERY_CODE), usedAt: null },
        ]),
        mfa_enrolled_at: "2026-03-10T09:00:00.000Z",
        mfa_last_verified_at: "2026-03-15T12:00:00.000Z",
      },
    },
  });
}

test("verifyStationAdminMfaChallenge succeeds with correct TOTP code at current step", () => {
  const challengeId = "totp-test-valid-001";
  const db = makeTotpChallengeDb(challengeId);

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  assert.equal(result.result, "issued");
});

test("verifyStationAdminMfaChallenge fails when raw secret string is used as code (regression guard)", () => {
  const challengeId = "totp-test-raw-secret-001";
  const db = makeTotpChallengeDb(challengeId);

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_SECRET, // raw secret — must NOT verify as a TOTP code
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  assert.equal(result.result, "mfa_failed", "raw secret string must not authenticate as a TOTP code");
});

test("verifyStationAdminMfaChallenge fails with an invalid 6-digit code", () => {
  const challengeId = "totp-test-invalid-001";
  const db = makeTotpChallengeDb(challengeId);

  // Compute a code that is one more than correct (wrapping mod 1000000)
  const wrongCode = String((Number(MFA_TEST_CODE) + 1) % 1_000_000).padStart(6, "0");

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    wrongCode,
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  assert.equal(result.result, "mfa_failed");
  if (result.result === "mfa_failed") {
    assert.equal(result.attemptsRemaining, 4);
    assert.equal(result.lockedOut, false);
  }
});

test("verifyStationAdminMfaChallenge accepts code from previous TOTP step (clock skew -30s)", () => {
  const challengeId = "totp-test-skew-prev-001";
  const prevStepCode = generateCurrentTotpCode(MFA_TEST_SECRET, NOW - 30_000)!;
  const db = makeTotpChallengeDb(challengeId);

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    prevStepCode,
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  assert.equal(result.result, "issued", "code from previous TOTP step (delta=-1) must be accepted");
});

test("verifyStationAdminMfaChallenge accepts code from next TOTP step (clock skew +30s)", () => {
  const challengeId = "totp-test-skew-next-001";
  const nextStepCode = generateCurrentTotpCode(MFA_TEST_SECRET, NOW + 30_000)!;
  const db = makeTotpChallengeDb(challengeId);

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    nextStepCode,
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  assert.equal(result.result, "issued", "code from next TOTP step (delta=+1) must be accepted");
});

test("verifyStationAdminMfaChallenge rejects code that is two steps old (>60s skew)", () => {
  const challengeId = "totp-test-skew-old-001";
  // Code from 90s ago — step delta = -3, outside ±1 window
  const twoStepsOldCode = generateCurrentTotpCode(MFA_TEST_SECRET, NOW - 90_000)!;
  const db = makeTotpChallengeDb(challengeId);

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    twoStepsOldCode,
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  assert.equal(result.result, "mfa_failed", "code from 90s ago must be rejected (outside ±1 step window)");
});

// ---------------------------------------------------------------------------
// Transaction atomicity — no partial writes on verify failure
// ---------------------------------------------------------------------------

test("verifyStationAdminMfaChallenge: no session or auth event written when failure-path UPDATE returns 0 changes", () => {
  // Simulates a race: the challenge was consumed by another request between our
  // initial SELECT (consumed_at IS NULL) and the failure-path UPDATE
  // (WHERE consumed_at IS NULL). The UPDATE returns 0 changes → rollback.
  const challengeId = "totp-txn-race-failure-001";
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 3,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    // Force the failure-path UPDATE to return 0 changes (concurrent consume)
    runResultBySqlIncludes: {
      "UPDATE station_admin_mfa_challenges SET attempts_remaining": { changes: 0 },
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    "000000", // clearly wrong code — triggers failure path
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  // Should return not_found (concurrent consume detected)
  assert.equal(result.result, "not_found");

  // Verify the transaction was rolled back — no partial state persisted
  const rollbackTxn = inserts.find((c) => c.sql.includes("ROLLBACK"));
  assert.ok(rollbackTxn, "transaction must be rolled back on concurrent failure-path consume");

  // No auth events must be written (they would have been rolled back anyway,
  // but the rollback path returns before writing them at all)
  const authEventInsert = inserts.find((c) => c.sql.includes("station_admin_auth_events") && c.sql.includes("INSERT"));
  assert.equal(authEventInsert, undefined, "no auth events must be persisted when failure-path UPDATE returns 0 changes");

  // No session must be issued
  const sessionInsert = inserts.find((c) => c.sql.includes("INSERT INTO station_admin_sessions"));
  assert.equal(sessionInsert, undefined, "no session must be issued when failure-path UPDATE returns 0 changes");
});

test("verifyStationAdminMfaChallenge: no session or credential update written when success-path UPDATE returns 0 changes", () => {
  // Simulates a race: challenge consumed concurrently between our
  // credential read and the success-path consumed_at UPDATE.
  const challengeId = "totp-txn-race-success-001";
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    // Force success-path consumed_at UPDATE to return 0 changes (concurrent win)
    runResultBySqlIncludes: {
      "UPDATE station_admin_mfa_challenges SET consumed_at = ?, attempts_remaining = ?": { changes: 0 },
    },
    inserts,
  });

  const result = verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  assert.equal(result.result, "not_found");

  const rollbackTxn = inserts.find((c) => c.sql.includes("ROLLBACK"));
  assert.ok(rollbackTxn, "transaction must be rolled back when success-path consumed_at UPDATE returns 0 changes");

  const sessionInsert = inserts.find((c) => c.sql.includes("INSERT INTO station_admin_sessions"));
  assert.equal(sessionInsert, undefined, "no session must be issued when consumed_at UPDATE returns 0 changes");
});

test("verifyStationAdminMfaChallenge: BEGIN IMMEDIATE is the first SQL statement after DB open", () => {
  // Ensures no reads or writes happen outside the transaction boundary.
  const challengeId = "totp-txn-order-001";
  const inserts: InsertCapture[] = [];
  const db = createMockDb({
    challengeRowsById: {
      [challengeId]: {
        id: challengeId,
        actor_id: VALID_CREDENTIAL.id,
        challenge_purpose: "login",
        session_id: null,
        expires_at: new Date(NOW + 5 * 60 * 1000).toISOString(),
        attempts_remaining: 5,
        consumed_at: null,
        metadata: null,
      },
    },
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
        mfa_secret: MFA_TEST_SECRET,
      },
    },
    inserts,
  });

  verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    { resolvePath: () => "test.db", hasPath: () => true, openDatabase: () => db, now: () => NOW },
  );

  // The very first SQL statement must be BEGIN IMMEDIATE
  const firstSql = inserts[0]?.sql ?? "";
  assert.ok(
    firstSql.includes("BEGIN IMMEDIATE"),
    `first SQL must be BEGIN IMMEDIATE, got: ${firstSql}`,
  );
});
