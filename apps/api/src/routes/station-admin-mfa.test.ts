import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMfaEnrollStartResponse,
  buildMfaEnrollVerifyResponse,
  buildMfaRecoveryRegenerateResponse,
  buildMfaDisableResponse,
} from "./station-admin-mfa";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MFA_STATE = {
  enabled: true,
  enrolledAt: "2026-03-16T10:00:00.000Z",
  lastVerifiedAt: "2026-03-16T11:00:00.000Z",
  recoveryCodesRemaining: 8,
};

const STEP_UP_CHALLENGE = {
  challengeId: "chal-mfa-001",
  purpose: "permission_mutation" as const,
  expiresAt: "2026-03-16T18:00:00.000Z",
  recoveryCodeAllowed: true,
};

// ---------------------------------------------------------------------------
// buildMfaEnrollStartResponse
// ---------------------------------------------------------------------------

test("enroll start: started → 200 with qrCodeUri and secret", () => {
  const { status, json } = buildMfaEnrollStartResponse({
    result: "started",
    qrCodeUri: "data:image/png;base64,abc123",
    secret: "JBSWY3DPEHPK3PXP",
  });

  assert.equal(status, 200);
  assert.ok("qrCodeUri" in json, "response must include qrCodeUri");
  assert.ok("secret" in json, "response must include secret");
  if ("qrCodeUri" in json) {
    assert.equal(json.qrCodeUri, "data:image/png;base64,abc123");
    assert.equal(json.secret, "JBSWY3DPEHPK3PXP");
  }
});

test("enroll start: already_enrolled → 409", () => {
  const { status } = buildMfaEnrollStartResponse({ result: "already_enrolled" });
  assert.equal(status, 409);
});

test("enroll start: not_found → 404", () => {
  const { status } = buildMfaEnrollStartResponse({ result: "not_found" });
  assert.equal(status, 404);
});

test("enroll start: not_available → 503", () => {
  const { status } = buildMfaEnrollStartResponse({ result: "not_available" });
  assert.equal(status, 503);
});

// ---------------------------------------------------------------------------
// buildMfaEnrollVerifyResponse
// ---------------------------------------------------------------------------

test("enroll verify: enrolled → 200 with mfa state and recovery codes", () => {
  const { status, json } = buildMfaEnrollVerifyResponse({
    result: "enrolled",
    mfa: MFA_STATE,
    recoveryCodes: ["AAAA-BBBB", "CCCC-DDDD"],
  });

  assert.equal(status, 200);
  assert.ok("result" in json && json.result === "enrolled");
  assert.ok("recoveryCodes" in json);
  if ("recoveryCodes" in json) {
    assert.equal(json.recoveryCodes.length, 2);
  }
});

test("enroll verify: invalid_code → 401", () => {
  const { status } = buildMfaEnrollVerifyResponse({ result: "invalid_code" });
  assert.equal(status, 401);
});

test("enroll verify: enrollment_expired → 410", () => {
  const { status } = buildMfaEnrollVerifyResponse({ result: "enrollment_expired" });
  assert.equal(status, 410);
});

test("enroll verify: not_found → 404", () => {
  const { status } = buildMfaEnrollVerifyResponse({ result: "not_found" });
  assert.equal(status, 404);
});

test("enroll verify: not_available → 503", () => {
  const { status } = buildMfaEnrollVerifyResponse({ result: "not_available" });
  assert.equal(status, 503);
});

// ---------------------------------------------------------------------------
// buildMfaRecoveryRegenerateResponse
// ---------------------------------------------------------------------------

test("recovery regenerate: regenerated → 200 with mfa state and recovery codes", () => {
  const { status, json } = buildMfaRecoveryRegenerateResponse({
    result: "regenerated",
    mfa: MFA_STATE,
    recoveryCodes: ["EEEE-FFFF"],
  });

  assert.equal(status, 200);
  assert.ok("result" in json && json.result === "regenerated");
  assert.ok("recoveryCodes" in json);
});

test("recovery regenerate: mfa_required → 401 with mfaRequired flag and challenge", () => {
  const { status, json } = buildMfaRecoveryRegenerateResponse({
    result: "mfa_required",
    challenge: STEP_UP_CHALLENGE,
  });

  assert.equal(status, 401);
  assert.ok("mfaRequired" in json && json.mfaRequired === true);
  assert.ok("challenge" in json);
  if ("challenge" in json) {
    assert.equal(json.challenge.challengeId, "chal-mfa-001");
  }
});

test("recovery regenerate: csrf_invalid → 403", () => {
  const { status } = buildMfaRecoveryRegenerateResponse({ result: "csrf_invalid" });
  assert.equal(status, 403);
});

test("recovery regenerate: mfa_not_enrolled → 400", () => {
  const { status } = buildMfaRecoveryRegenerateResponse({ result: "mfa_not_enrolled" });
  assert.equal(status, 400);
});

test("recovery regenerate: not_found → 404", () => {
  const { status } = buildMfaRecoveryRegenerateResponse({ result: "not_found" });
  assert.equal(status, 404);
});

test("recovery regenerate: not_available → 503", () => {
  const { status } = buildMfaRecoveryRegenerateResponse({ result: "not_available" });
  assert.equal(status, 503);
});

// ---------------------------------------------------------------------------
// buildMfaDisableResponse
// ---------------------------------------------------------------------------

test("mfa disable: disabled → 200 with ok:true", () => {
  const { status, json } = buildMfaDisableResponse({ result: "disabled", actorId: "ops.lead@marine.local" });

  assert.equal(status, 200);
  assert.ok("ok" in json && json.ok === true);
});

test("mfa disable: invalid_code → 401", () => {
  const { status } = buildMfaDisableResponse({ result: "invalid_code" });
  assert.equal(status, 401);
});

test("mfa disable: mfa_required → 401 with mfaRequired flag and challenge", () => {
  const { status, json } = buildMfaDisableResponse({
    result: "mfa_required",
    challenge: STEP_UP_CHALLENGE,
  });

  assert.equal(status, 401);
  assert.ok("mfaRequired" in json && json.mfaRequired === true);
  assert.ok("challenge" in json);
});

test("mfa disable: csrf_invalid → 403", () => {
  const { status } = buildMfaDisableResponse({ result: "csrf_invalid" });
  assert.equal(status, 403);
});

test("mfa disable: mfa_not_enrolled → 400", () => {
  const { status } = buildMfaDisableResponse({ result: "mfa_not_enrolled" });
  assert.equal(status, 400);
});

test("mfa disable: not_found → 404", () => {
  const { status } = buildMfaDisableResponse({ result: "not_found" });
  assert.equal(status, 404);
});

test("mfa disable: not_available → 503", () => {
  const { status } = buildMfaDisableResponse({ result: "not_available" });
  assert.equal(status, 503);
});
