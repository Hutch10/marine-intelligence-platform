/**
 * MFA enrollment lifecycle routes.
 *
 * Routes:
 *   POST /station-admin/mfa/enroll/start       — Start TOTP enrollment
 *   POST /station-admin/mfa/enroll/verify      — Verify enrollment, enable MFA
 *   POST /station-admin/mfa/recovery/regenerate — Regenerate recovery codes
 *   POST /station-admin/mfa/disable            — Disable MFA
 */

import type { RouteDefinition } from "../types";
import type {
  MfaEnrollStartResult,
  MfaEnrollVerifyResult,
  RecoveryRegenerateResult,
  MfaDisableResult,
} from "../repositories/station-admin-mfa";

function callEnrollStart(sessionId: string, csrfToken: string): MfaEnrollStartResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-mfa") as {
      startMfaEnrollment: (sessionId: string, csrfToken: string) => MfaEnrollStartResult;
    };
    return repo.startMfaEnrollment(sessionId, csrfToken);
  } catch {
    return { result: "not_available" };
  }
}

function callEnrollVerify(sessionId: string, csrfToken: string, totpCode: string): MfaEnrollVerifyResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-mfa") as {
      verifyMfaEnrollment: (sessionId: string, csrfToken: string, totpCode: string) => MfaEnrollVerifyResult;
    };
    return repo.verifyMfaEnrollment(sessionId, csrfToken, totpCode);
  } catch {
    return { result: "not_available" };
  }
}

function callRecoveryRegenerate(sessionId: string, csrfToken: string): RecoveryRegenerateResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-mfa") as {
      regenerateRecoveryCodes: (sessionId: string, csrfToken: string) => RecoveryRegenerateResult;
    };
    return repo.regenerateRecoveryCodes(sessionId, csrfToken);
  } catch {
    return { result: "not_available" };
  }
}

function callDisable(sessionId: string, csrfToken: string, totpCode: string): MfaDisableResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-mfa") as {
      disableMfa: (sessionId: string, csrfToken: string, totpCode: string) => MfaDisableResult;
    };
    return repo.disableMfa(sessionId, csrfToken, totpCode);
  } catch {
    return { result: "not_available" };
  }
}

// ---------------------------------------------------------------------------
// Request interfaces
// ---------------------------------------------------------------------------

interface MfaEnrollStartRequest {
  sessionId: string;
  csrfToken: string;
}

interface MfaEnrollVerifyRequest {
  sessionId: string;
  csrfToken: string;
  totpCode: string;
}

interface MfaRecoveryRegenerateRequest {
  sessionId: string;
  csrfToken: string;
}

interface MfaDisableRequest {
  sessionId: string;
  csrfToken: string;
  totpCode: string;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface MfaEnrollStartResponse {
  qrCodeUri: string;
  /** Base32 secret — displayed once for manual entry. Never logged. */
  secret: string;
}

interface MfaEnrollVerifyResponse {
  result: "enrolled";
  mfa: {
    enabled: boolean;
    enrolledAt: string | null;
    lastVerifiedAt: string | null;
    recoveryCodesRemaining: number;
  };
  /** Plain-text recovery codes — shown once only */
  recoveryCodes: string[];
}

interface MfaRecoveryRegenerateResponse {
  result: "regenerated";
  mfa: {
    enabled: boolean;
    enrolledAt: string | null;
    lastVerifiedAt: string | null;
    recoveryCodesRemaining: number;
  };
  recoveryCodes: string[];
}

interface MfaDisableResponse {
  ok: true;
}

interface MfaRequiredResponse {
  mfaRequired: true;
  challenge: {
    challengeId: string;
    purpose: string;
    expiresAt: string;
    recoveryCodeAllowed: boolean;
  };
}

// ---------------------------------------------------------------------------
// Route builders (exported for testing)
// ---------------------------------------------------------------------------

export function buildMfaEnrollStartResponse(result: MfaEnrollStartResult): {
  status: 200 | 400 | 404 | 409 | 503;
  json: MfaEnrollStartResponse | { message: string };
} {
  switch (result.result) {
    case "started":
      return {
        status: 200,
        json: { qrCodeUri: result.qrCodeUri, secret: result.secret },
      };

    case "already_enrolled":
      return {
        status: 409,
        json: { message: "MFA is already enrolled. Disable it first to re-enroll." },
      };

    case "not_found":
      return {
        status: 404,
        json: { message: "Session not found or expired" },
      };

    case "not_available":
      return {
        status: 503,
        json: { message: "Service unavailable" },
      };
  }
}

export function buildMfaEnrollVerifyResponse(result: MfaEnrollVerifyResult): {
  status: 200 | 400 | 401 | 404 | 410 | 503;
  json: MfaEnrollVerifyResponse | { message: string };
} {
  switch (result.result) {
    case "enrolled":
      return {
        status: 200,
        json: {
          result: "enrolled",
          mfa: result.mfa,
          recoveryCodes: result.recoveryCodes,
        },
      };

    case "invalid_code":
      return {
        status: 401,
        json: { message: "TOTP code invalid. Ensure your authenticator app is synced." },
      };

    case "enrollment_expired":
      return {
        status: 410,
        json: { message: "Enrollment session expired. Please start enrollment again." },
      };

    case "not_found":
      return {
        status: 404,
        json: { message: "Session not found or no pending enrollment" },
      };

    case "not_available":
      return {
        status: 503,
        json: { message: "Service unavailable" },
      };
  }
}

export function buildMfaRecoveryRegenerateResponse(result: RecoveryRegenerateResult): {
  status: 200 | 400 | 401 | 403 | 404 | 503;
  json: MfaRecoveryRegenerateResponse | MfaRequiredResponse | { message: string };
} {
  switch (result.result) {
    case "regenerated":
      return {
        status: 200,
        json: {
          result: "regenerated",
          mfa: result.mfa,
          recoveryCodes: result.recoveryCodes,
        },
      };

    case "mfa_required":
      return {
        status: 401,
        json: {
          mfaRequired: true,
          challenge: result.challenge,
        },
      };

    case "csrf_invalid":
      return {
        status: 403,
        json: { message: "CSRF token invalid" },
      };

    case "mfa_not_enrolled":
      return {
        status: 400,
        json: { message: "MFA is not enrolled" },
      };

    case "not_found":
      return {
        status: 404,
        json: { message: "Session not found or expired" },
      };

    case "not_available":
      return {
        status: 503,
        json: { message: "Service unavailable" },
      };
  }
}

export function buildMfaDisableResponse(result: MfaDisableResult): {
  status: 200 | 400 | 401 | 403 | 404 | 503;
  json: MfaDisableResponse | MfaRequiredResponse | { message: string };
} {
  switch (result.result) {
    case "disabled":
      return {
        status: 200,
        json: { ok: true },
      };

    case "invalid_code":
      return {
        status: 401,
        json: { message: "TOTP code invalid" },
      };

    case "mfa_required":
      return {
        status: 401,
        json: {
          mfaRequired: true,
          challenge: result.challenge,
        },
      };

    case "csrf_invalid":
      return {
        status: 403,
        json: { message: "CSRF token invalid" },
      };

    case "mfa_not_enrolled":
      return {
        status: 400,
        json: { message: "MFA is not enrolled" },
      };

    case "not_found":
      return {
        status: 404,
        json: { message: "Session not found or expired" },
      };

    case "not_available":
      return {
        status: 503,
        json: { message: "Service unavailable" },
      };
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const postMfaEnrollStartRoute: RouteDefinition<
  MfaEnrollStartResponse | { message: string },
  MfaEnrollStartRequest
> = {
  method: "POST",
  path: "/station-admin/mfa/enroll/start",
  handler(request) {
    const result = callEnrollStart(request.body.sessionId, request.body.csrfToken);
    return buildMfaEnrollStartResponse(result);
  },
};

export const postMfaEnrollVerifyRoute: RouteDefinition<
  MfaEnrollVerifyResponse | { message: string },
  MfaEnrollVerifyRequest
> = {
  method: "POST",
  path: "/station-admin/mfa/enroll/verify",
  handler(request) {
    const result = callEnrollVerify(
      request.body.sessionId,
      request.body.csrfToken,
      request.body.totpCode,
    );
    return buildMfaEnrollVerifyResponse(result);
  },
};

export const postMfaRecoveryRegenerateRoute: RouteDefinition<
  MfaRecoveryRegenerateResponse | MfaRequiredResponse | { message: string },
  MfaRecoveryRegenerateRequest
> = {
  method: "POST",
  path: "/station-admin/mfa/recovery/regenerate",
  handler(request) {
    const result = callRecoveryRegenerate(request.body.sessionId, request.body.csrfToken);
    return buildMfaRecoveryRegenerateResponse(result);
  },
};

export const postMfaDisableRoute: RouteDefinition<
  MfaDisableResponse | MfaRequiredResponse | { message: string },
  MfaDisableRequest
> = {
  method: "POST",
  path: "/station-admin/mfa/disable",
  handler(request) {
    const result = callDisable(
      request.body.sessionId,
      request.body.csrfToken,
      request.body.totpCode,
    );
    return buildMfaDisableResponse(result);
  },
};
