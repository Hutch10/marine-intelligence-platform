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
import type { AsyncDbAdapter } from "../db/async-client";

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
  challenge_purpose: string;
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

function createMockAdapter(options: MockDbOptions): AsyncDbAdapter {
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

  function pickRunResult(sql: string): any {
    for (const [snippet, result] of Object.entries(options.runResultBySqlIncludes ?? {})) {
      if (sql.includes(snippet)) {
        return result;
      }
    }

    return [];
  }

  return {
    resourceId: "mock-admin",
    async execute(sql: string, params: unknown[] = []) {
      if (shouldThrow(sql)) {
        throw new Error(`mock execute throw for SQL: ${sql}`);
      }

      const sqlUpper = sql.toUpperCase();

      if (sqlUpper.startsWith("SELECT")) {
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
          const actorId = typeof params[0] === "string" ? params[0] : "";
          const mapped = actorId && options.credentialRowsByActorId
            ? options.credentialRowsByActorId[actorId]
            : undefined;

          if (mapped) {
            return [mapped];
          }

          return credentialRow ? [credentialRow] : [];
        }

        if (sql.includes("FROM station_admin_mfa_challenges")) {
          if (sql.includes("challenge_purpose = ?")) {
            const actorId = typeof params[0] === "string" ? params[0] : "";
            const sessionId = typeof params[1] === "string" ? params[1] : "";
            const purpose = typeof params[2] === "string" ? params[2] : "";

            if (challengeRow && challengeRow.actor_id === actorId && challengeRow.session_id === sessionId && challengeRow.challenge_purpose === purpose) {
              return [challengeRow];
            }
            return [];
          }

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
      } else {
        options.inserts?.push({ sql, params });
        return pickRunResult(sql);
      }
    },
    async close() {},
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW = 1_742_119_200_000; // 2026-03-16T10:00:00.000Z

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

const MFA_TEST_SECRET = "JBSWY3DPEHPK3PXP";
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

test("loginStationAdmin returns locked_out when failure count meets threshold", async () => {
  const inserts: InsertCapture[] = [];
  const adapter = createMockAdapter({ recentFailureRows: buildFailureRows(5, "actor@marine.local"), inserts });

  const result = await loginStationAdmin("actor@marine.local", "any-password", {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
    maxLoginAttempts: 5,
    lockoutWindowMs: 900_000,
  });

  assert.equal(result.result, "locked_out");
});

test("loginStationAdmin returns locked_out even with correct credentials when locked", async () => {
  const inserts: InsertCapture[] = [];
  const adapter = createMockAdapter({
    recentFailureRows: buildFailureRows(5, VALID_CREDENTIAL.id),
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  const result = await loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
    maxLoginAttempts: 5,
    lockoutWindowMs: 900_000,
  });

  assert.equal(result.result, "locked_out");
});

test("loginStationAdmin allows login when failure count is below threshold", async () => {
  const inserts: InsertCapture[] = [];
  const adapter = createMockAdapter({
    recentFailureRows: buildFailureRows(4, VALID_CREDENTIAL.id),
    credentialRow: VALID_CREDENTIAL,
    inserts,
  });

  const result = await loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
    maxLoginAttempts: 5,
    lockoutWindowMs: 900_000,
  });

  assert.equal(result.result, "issued");
});

test("loginStationAdmin requires MFA challenge before issuing a session when MFA is enabled", async () => {
  const inserts: InsertCapture[] = [];
  const adapter = createMockAdapter({
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

  const result = await loginStationAdmin(VALID_CREDENTIAL.id, TEST_PASSWORD, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.equal(result.result, "pending_mfa");

  const mfaChallengeInsert = inserts.find((capture) => capture.sql.includes("station_admin_mfa_challenges"));
  assert.ok(mfaChallengeInsert, "should insert MFA challenge record");

  const sessionInsert = inserts.find((capture) => capture.sql.includes("INSERT INTO station_admin_sessions"));
  assert.equal(sessionInsert, undefined, "should not issue session until MFA is verified");
});

test("verifyStationAdminMfaChallenge issues session for valid login challenge code", async () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-001";
  const adapter = createMockAdapter({
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

  const result = await verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      getAdapter: () => adapter,
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

test("verifyStationAdminMfaChallenge blocks invalid code and decrements attempts", async () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-002";
  const adapter = createMockAdapter({
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

  const result = await verifyStationAdminMfaChallenge(
    challengeId,
    "wrong-code",
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      getAdapter: () => adapter,
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

test("verifyStationAdminMfaChallenge coalesces abuse events between threshold boundaries", async () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-002b";
  const adapter = createMockAdapter({
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

  const result = await verifyStationAdminMfaChallenge(
    challengeId,
    "wrong-code",
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      getAdapter: () => adapter,
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

test("verifyStationAdminMfaChallenge rolls back transaction on repository error", async () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-rollback-001";
  const adapter = createMockAdapter({
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

  const result = await verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      getAdapter: () => adapter,
      now: () => NOW,
    },
  );

  assert.equal(result.result, "not_found");

  const beginTxn = inserts.find((capture) => capture.sql.includes("BEGIN IMMEDIATE"));
  const rollbackTxn = inserts.find((capture) => capture.sql.includes("ROLLBACK"));
  assert.ok(beginTxn, "should begin transaction before verify operations");
  assert.ok(rollbackTxn, "should rollback transaction on verify failure path");
});

test("verifyStationAdminMfaChallenge rate limits by challengeId bucket", async () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-rate-challenge-001";
  const adapter = createMockAdapter({
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
      "FROM station_admin_auth_events": [
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
    credentialRowsByActorId: {
      [VALID_CREDENTIAL.id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
      },
    },
    inserts,
  });

  const result = await verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      getAdapter: () => adapter,
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

test("verifyStationAdminMfaChallenge returns expired for stale challenge", async () => {
  const inserts: InsertCapture[] = [];
  const challengeId = "mfa-challenge-login-expired";
  const adapter = createMockAdapter({
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
    inserts,
  });

  const result = await verifyStationAdminMfaChallenge(
    challengeId,
    MFA_TEST_CODE,
    undefined,
    undefined,
    undefined,
    {
      resolvePath: () => "test.db",
      hasPath: () => true,
      getAdapter: () => adapter,
      now: () => NOW,
    },
  );

  assert.equal(result.result, "expired");

  const expiredEvent = inserts.find((capture) => capture.params.includes("mfa_challenge_expired"));
  assert.ok(expiredEvent, "should log mfa_challenge_expired event");
});

test("logoutStationAdmin revokes session with valid CSRF", async () => {
  const inserts: InsertCapture[] = [];
  const adapter = createMockAdapter({
    sessionRow: VALID_SESSION,
    inserts,
  });

  const result = await logoutStationAdmin(VALID_SESSION.id, VALID_SESSION.csrf_token, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.equal(result.result, "revoked");
  assert.equal(result.actorId, VALID_SESSION.actor_id);

  const revokeUpdate = inserts.find((capture) => capture.sql.includes("UPDATE station_admin_sessions SET revoked_at = ?"));
  assert.ok(revokeUpdate, "should update revoked_at in DB");

  const logoutEvent = inserts.find((capture) => capture.params.includes("logout"));
  assert.ok(logoutEvent, "should log logout event");
});

test("logoutStationAdmin rejects session with invalid CSRF", async () => {
  const inserts: InsertCapture[] = [];
  const adapter = createMockAdapter({
    sessionRow: VALID_SESSION,
    inserts,
  });

  const result = await logoutStationAdmin(VALID_SESSION.id, "wrong-csrf", {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.equal(result.result, "csrf_invalid");

  const logoutEvent = inserts.find((capture) => capture.params.includes("logout"));
  assert.equal(logoutEvent, undefined, "should not log logout event on CSRF failure");
});

test("refreshStationAdminSession extends session and rotates CSRF", async () => {
  const inserts: InsertCapture[] = [];
  const adapter = createMockAdapter({
    sessionRow: VALID_SESSION,
    inserts,
  });

  const result = await refreshStationAdminSession(VALID_SESSION.id, VALID_SESSION.csrf_token, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
    generateToken: (len) => `refreshed-token-${len}`,
  });

  assert.equal(result.result, "refreshed");
  assert.equal(result.sessionId, "refreshed-token-32");
  assert.equal(result.csrfToken, "refreshed-token-32");

  const refreshUpdate = inserts.find((capture) => capture.sql.includes("UPDATE station_admin_sessions SET csrf_token = ?, expires_at = ?, last_active_at = ?"));
  // Note: in the actual implementation, it revokes the old session and issues a NEW one.
  assert.ok(inserts.find(i => i.sql.includes("UPDATE station_admin_sessions SET revoked_at = ?")), "should revoke old session");
  assert.ok(inserts.find(i => i.sql.includes("INSERT INTO station_admin_sessions")), "should issue new session");
});

test("revokeStationAdminSession revokes target session without MFA when actor is the same", async () => {
  const inserts: InsertCapture[] = [];
  const targetSessionId = "sess-target-001";
  const adapter = createMockAdapter({
    sessionRowsById: {
      [VALID_SESSION.id]: VALID_SESSION,
      [targetSessionId]: {
        ...VALID_SESSION,
        id: targetSessionId,
      },
    },
    inserts,
  });

  const result = await revokeStationAdminSession(VALID_SESSION.id, VALID_SESSION.csrf_token, targetSessionId, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.equal(result.result, "revoked");

  const revokeUpdate = inserts.find((capture) => capture.sql.includes("UPDATE station_admin_sessions SET revoked_at = ? WHERE id = ?"));
  assert.ok(revokeUpdate, "should revoke target session");
  assert.ok(revokeUpdate.params.includes(targetSessionId));
});

test("revokeStationAdminSession requires MFA when revoking other actor's session", async () => {
  const inserts: InsertCapture[] = [];
  const targetSessionId = "sess-target-other-001";
  const adapter = createMockAdapter({
    sessionRowsById: {
      [VALID_SESSION.id]: VALID_SESSION,
      [targetSessionId]: {
        ...VALID_SESSION,
        id: targetSessionId,
        actor_id: "other-actor@marine.local",
      },
    },
    credentialRowsByActorId: {
      [VALID_SESSION.actor_id]: {
        ...VALID_CREDENTIAL,
        mfa_enabled: 1,
      },
    },
    inserts,
  });

  const result = await revokeStationAdminSession(VALID_SESSION.id, VALID_SESSION.csrf_token, targetSessionId, {
    resolvePath: () => "test.db",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.equal(result.result, "mfa_required");

  const mfaChallengeInsert = inserts.find((capture) => capture.sql.includes("station_admin_mfa_challenges"));
  assert.ok(mfaChallengeInsert, "should issue MFA challenge for cross-actor revocation");
});
