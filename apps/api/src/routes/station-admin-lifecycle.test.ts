import test from "node:test";
import assert from "node:assert/strict";
import { buildStationAdminSessionAuthRouteResponse } from "./station-admin-auth";
import {
  buildStationAdminLoginRouteResponse,
  buildStationAdminMfaVerifyRouteResponse,
  buildStationAdminLogoutRouteResponse,
  buildStationAdminRefreshRouteResponse,
  buildStationAdminRevokeRouteResponse,
} from "./station-admin-lifecycle";

test("station admin login route issues a valid session", async () => {
  const response = await buildStationAdminLoginRouteResponse(
    "ops.lead@marine.local",
    "marine-admin-2026",
    undefined,
    {
      result: "issued",
      sessionId: "sess-new-001",
      csrfToken: "csrf-new-001",
      expiresAt: "2026-03-16T16:00:00.000Z",
      actorId: "ops.lead@marine.local",
      actorRole: "admin",
      permissions: [
        "station.view_admin",
        "station.edit_branding",
        "station.edit_content",
        "station.view_audit",
        "station.publish",
      ],
      mfa: {
        enabled: false,
        enrolledAt: null,
        lastVerifiedAt: null,
        recoveryCodesRemaining: 0,
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "issued");
  if ("sessionId" in response.json) {
    assert.equal(response.json.sessionId, "sess-new-001");
    assert.equal(response.json.csrfToken, "csrf-new-001");
  }
});

test("station admin auth blocks expired session", () => {
  const response = buildStationAdminSessionAuthRouteResponse("sess-expired-001", {
    source: "db",
    result: "not_found",
  });

  assert.equal(response.status, 401);
  assert.equal(response.telemetry.result, "not_found");
});

test("station admin auth blocks revoked session", () => {
  const response = buildStationAdminSessionAuthRouteResponse("sess-revoked-001", {
    source: "db",
    result: "not_found",
  });

  assert.equal(response.status, 401);
  assert.equal(response.telemetry.result, "not_found");
});

test("station admin lifecycle endpoints require csrf token for mutation", async () => {
  const logoutResponse = await buildStationAdminLogoutRouteResponse("sess-admin-ops-001", "wrong-csrf", undefined, {
    result: "csrf_invalid",
  });

  const refreshResponse = await buildStationAdminRefreshRouteResponse("sess-admin-ops-001", "wrong-csrf", undefined, {
    result: "csrf_invalid",
  });

  const revokeResponse = await buildStationAdminRevokeRouteResponse(
    "sess-admin-ops-001",
    "wrong-csrf",
    "sess-viewer-ops-001",
    undefined,
    {
      result: "csrf_invalid",
    },
  );

  assert.equal(logoutResponse.status, 403);
  assert.equal(logoutResponse.telemetry.result, "csrf_invalid");
  assert.equal(refreshResponse.status, 403);
  assert.equal(refreshResponse.telemetry.result, "csrf_invalid");
  assert.equal(revokeResponse.status, 403);
  assert.equal(revokeResponse.telemetry.result, "csrf_invalid");
});

test("station admin logout route invalidates session", async () => {
  const response = await buildStationAdminLogoutRouteResponse("sess-admin-ops-001", "csrf-ok", undefined, {
    result: "revoked",
    actorId: "ops.lead@marine.local",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "revoked");
  assert.deepEqual(response.json, { ok: true });
});

test("station admin login route returns 429 when account is locked out", async () => {
  const response = await buildStationAdminLoginRouteResponse(
    "ops.lead@marine.local",
    "marine-admin-2026",
    undefined,
    { result: "locked_out" },
  );

  assert.equal(response.status, 429);
  assert.equal(response.telemetry.result, "locked_out");
  assert.ok("message" in response.json && typeof response.json.message === "string");
});

test("station admin login route returns 202 when MFA challenge is required", async () => {
  const response = await buildStationAdminLoginRouteResponse(
    "ops.lead@marine.local",
    "marine-admin-2026",
    undefined,
    {
      result: "pending_mfa",
      actorId: "ops.lead@marine.local",
      actorRole: "admin",
      challenge: {
        challengeId: "mfa-challenge-login-001",
        purpose: "login",
        expiresAt: "2026-03-16T10:10:00.000Z",
        recoveryCodeAllowed: true,
      },
      mfa: {
        enabled: true,
        enrolledAt: "2026-03-10T09:00:00.000Z",
        lastVerifiedAt: "2026-03-15T18:00:00.000Z",
        recoveryCodesRemaining: 2,
      },
    },
  );

  assert.equal(response.status, 202);
  assert.equal(response.telemetry.result, "pending_mfa");
  assert.ok("result" in response.json && response.json.result === "pending_mfa");
});

test("station admin MFA verify route issues session on successful login challenge", async () => {
  const response = await buildStationAdminMfaVerifyRouteResponse(
    {
      challengeId: "mfa-challenge-login-001",
      code: "246810",
    },
    {
      result: "issued",
      sessionId: "sess-admin-verified-001",
      csrfToken: "csrf-admin-verified-001",
      expiresAt: "2026-03-16T18:00:00.000Z",
      actorId: "ops.lead@marine.local",
      actorRole: "admin",
      permissions: [
        "station.view_admin",
        "station.edit_branding",
        "station.edit_content",
        "station.view_audit",
        "station.publish",
      ],
      mfa: {
        enabled: true,
        enrolledAt: "2026-03-10T09:00:00.000Z",
        lastVerifiedAt: "2026-03-16T10:00:00.000Z",
        recoveryCodesRemaining: 2,
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "issued");
  assert.ok("result" in response.json && response.json.result === "issued");
});

test("station admin MFA verify route returns attemptsRemaining for invalid MFA code", async () => {
  const response = await buildStationAdminMfaVerifyRouteResponse(
    {
      challengeId: "mfa-challenge-login-002",
      code: "wrong",
    },
    {
      result: "mfa_failed",
      attemptsRemaining: 2,
      lockedOut: false,
    },
  );

  assert.equal(response.status, 401);
  assert.equal(response.telemetry.result, "mfa_failed");
  assert.ok("result" in response.json && response.json.result === "mfa_failed");
  assert.ok("attemptsRemaining" in response.json && response.json.attemptsRemaining === 2);
});

test("station admin MFA verify route returns explicit expired status", async () => {
  const response = await buildStationAdminMfaVerifyRouteResponse(
    {
      challengeId: "mfa-challenge-login-003",
      code: "246810",
    },
    {
      result: "expired",
    },
  );

  assert.equal(response.status, 410);
  assert.equal(response.telemetry.result, "expired");
  assert.ok("result" in response.json && response.json.result === "expired");
});

test("station admin MFA verify route returns explicit lockout status", async () => {
  const response = await buildStationAdminMfaVerifyRouteResponse(
    {
      challengeId: "mfa-challenge-login-004",
      code: "246810",
    },
    {
      result: "locked_out",
      attemptsRemaining: 0,
    },
  );

  assert.equal(response.status, 401);
  assert.equal(response.telemetry.result, "locked_out");
  assert.ok("result" in response.json && response.json.result === "locked_out");
  assert.ok("attemptsRemaining" in response.json && response.json.attemptsRemaining === 0);
});

test("station admin MFA verify route returns explicit rate-limited status", async () => {
  const response = await buildStationAdminMfaVerifyRouteResponse(
    {
      challengeId: "mfa-challenge-login-005",
      code: "246810",
    },
    {
      result: "rate_limited",
      retryAfterSeconds: 60,
    },
  );

  assert.equal(response.status, 429);
  assert.equal(response.telemetry.result, "rate_limited");
  assert.ok("result" in response.json && response.json.result === "rate_limited");
  assert.ok("retryAfterSeconds" in response.json && response.json.retryAfterSeconds === 60);
  assert.equal(response.headers?.["Retry-After"], "60");
});

test("station admin revoke route returns 401 when step-up MFA is required", async () => {
  const response = await buildStationAdminRevokeRouteResponse(
    "sess-admin-ops-001",
    "csrf-admin-ops-001",
    "sess-viewer-ops-001",
    undefined,
    {
      result: "mfa_required",
      challenge: {
        challengeId: "mfa-challenge-revoke-001",
        purpose: "session_revoke",
        expiresAt: "2026-03-16T10:10:00.000Z",
        recoveryCodeAllowed: true,
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(response.telemetry.result, "mfa_required");
  assert.ok("mfaRequired" in response.json && response.json.mfaRequired === true);
});
