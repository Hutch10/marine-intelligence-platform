import type {
  RouteDefinition,
  StationAdminLoginRequest,
  StationAdminLoginResponse,
  StationAdminLoginTelemetry,
  StationAdminMfaVerifyRequest,
  StationAdminMfaVerifyErrorResponse,
  StationAdminMfaVerifyResponse,
  StationAdminMfaVerifyTelemetry,
  StationAdminLogoutRequest,
  StationAdminLogoutResponse,
  StationAdminLogoutTelemetry,
  StationAdminRefreshRequest,
  StationAdminRefreshResponse,
  StationAdminRefreshTelemetry,
  StationAdminRevokeRequest,
  StationAdminRevokeMfaRequiredResponse,
  StationAdminRevokeResponse,
  StationAdminRevokeTelemetry,
} from "../types";
import type {
  StationAdminLoginResult,
  StationAdminMfaVerifyResult,
  StationAdminLogoutResult,
  StationAdminRefreshResult,
  StationAdminRevokeResult,
} from "../repositories/station-admin-lifecycle";

function callLoginRepository(actorId: string, password: string): StationAdminLoginResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-lifecycle") as {
      loginStationAdmin: (
        actorId: string,
        password: string,
        dependencies?: { requestMetadata?: StationAdminLoginRequest["metadata"] },
      ) => StationAdminLoginResult;
    };

    return repo.loginStationAdmin(actorId, password);
  } catch {
    return { result: "not_available" };
  }
}

function callLoginRepositoryWithMetadata(
  actorId: string,
  password: string,
  metadata: StationAdminLoginRequest["metadata"],
): StationAdminLoginResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-lifecycle") as {
      loginStationAdmin: (
        actorId: string,
        password: string,
        dependencies?: { requestMetadata?: StationAdminLoginRequest["metadata"] },
      ) => StationAdminLoginResult;
    };

    return repo.loginStationAdmin(actorId, password, { requestMetadata: metadata });
  } catch {
    return { result: "not_available" };
  }
}

function callLogoutRepository(
  sessionId: string,
  csrfToken: string,
  metadata?: StationAdminLogoutRequest["metadata"],
): StationAdminLogoutResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-lifecycle") as {
      logoutStationAdmin: (
        sessionId: string,
        csrfToken: string,
        dependencies?: { requestMetadata?: StationAdminLogoutRequest["metadata"] },
      ) => StationAdminLogoutResult;
    };

    return repo.logoutStationAdmin(sessionId, csrfToken, { requestMetadata: metadata });
  } catch {
    return { result: "not_found" };
  }
}

function callMfaVerifyRepository(
  request: StationAdminMfaVerifyRequest,
): StationAdminMfaVerifyResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-lifecycle") as {
      verifyStationAdminMfaChallenge: (
        challengeId: string,
        code: string | undefined,
        recoveryCode: string | undefined,
        sessionId: string | undefined,
        csrfToken: string | undefined,
        dependencies?: { requestMetadata?: StationAdminMfaVerifyRequest["metadata"] },
      ) => StationAdminMfaVerifyResult;
    };

    return repo.verifyStationAdminMfaChallenge(
      request.challengeId,
      request.code,
      request.recoveryCode,
      request.sessionId,
      request.csrfToken,
      { requestMetadata: request.metadata },
    );
  } catch {
    return { result: "not_found" };
  }
}

function callRefreshRepository(
  sessionId: string,
  csrfToken: string,
  metadata?: StationAdminRefreshRequest["metadata"],
): StationAdminRefreshResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-lifecycle") as {
      refreshStationAdminSession: (
        sessionId: string,
        csrfToken: string,
        dependencies?: { requestMetadata?: StationAdminRefreshRequest["metadata"] },
      ) => StationAdminRefreshResult;
    };

    return repo.refreshStationAdminSession(sessionId, csrfToken, { requestMetadata: metadata });
  } catch {
    return { result: "not_found" };
  }
}

function callRevokeRepository(
  sessionId: string,
  csrfToken: string,
  targetSessionId: string,
  metadata?: StationAdminRevokeRequest["metadata"],
): StationAdminRevokeResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repo = runtimeRequire("../repositories/station-admin-lifecycle") as {
      revokeStationAdminSession: (
        adminSessionId: string,
        adminCsrfToken: string,
        targetSessionId: string,
        dependencies?: { requestMetadata?: StationAdminRevokeRequest["metadata"] },
      ) => StationAdminRevokeResult;
    };

    return repo.revokeStationAdminSession(sessionId, csrfToken, targetSessionId, { requestMetadata: metadata });
  } catch {
    return { result: "not_found" };
  }
}

export function buildStationAdminLoginRouteResponse(
  actorId: string,
  password: string,
  loginResult = callLoginRepository(actorId, password),
): {
  status: 200 | 202 | 400 | 401 | 429 | 503;
  json: StationAdminLoginResponse | { message: string };
  telemetry: StationAdminLoginTelemetry;
} {
  if (!actorId.trim() || !password) {
    return {
      status: 400,
      json: { message: "actorId and password are required" },
      telemetry: {
        route: "POST /station-admin/login",
        result: "invalid_request",
      },
    };
  }

  if (loginResult.result === "locked_out") {
    return {
      status: 429,
      json: { message: "Too many failed login attempts. Please wait before trying again." },
      telemetry: {
        route: "POST /station-admin/login",
        result: "locked_out",
      },
    };
  }

  if (loginResult.result === "issued") {
    return {
      status: 200,
      json: {
        sessionId: loginResult.sessionId,
        csrfToken: loginResult.csrfToken,
        expiresAt: loginResult.expiresAt,
        actorId: loginResult.actorId,
        role: loginResult.actorRole,
        permissions: loginResult.permissions,
        mfa: loginResult.mfa,
      },
      telemetry: {
        route: "POST /station-admin/login",
        result: "issued",
        actorId: loginResult.actorId,
      },
    };
  }

  if (loginResult.result === "pending_mfa") {
    return {
      status: 202,
      json: {
        result: "pending_mfa",
        actorId: loginResult.actorId,
        role: loginResult.actorRole,
        challenge: loginResult.challenge,
        mfa: loginResult.mfa,
      },
      telemetry: {
        route: "POST /station-admin/login",
        result: "pending_mfa",
        actorId: loginResult.actorId,
      },
    };
  }

  if (loginResult.result === "not_available") {
    return {
      status: 503,
      json: { message: "Authentication service unavailable" },
      telemetry: {
        route: "POST /station-admin/login",
        result: "invalid_credentials",
      },
    };
  }

  return {
    status: 401,
    json: { message: "Invalid credentials" },
    telemetry: {
      route: "POST /station-admin/login",
      result: "invalid_credentials",
    },
  };
}

export function buildStationAdminMfaVerifyRouteResponse(
  request: StationAdminMfaVerifyRequest,
  verifyResult = callMfaVerifyRepository(request),
): {
  status: 200 | 400 | 401 | 404 | 410 | 429;
  json: StationAdminMfaVerifyResponse | StationAdminMfaVerifyErrorResponse;
  headers?: Record<string, string>;
  telemetry: StationAdminMfaVerifyTelemetry;
} {
  const hasCode = typeof request.code === "string" && request.code.trim().length > 0;
  const hasRecoveryCode = typeof request.recoveryCode === "string" && request.recoveryCode.trim().length > 0;

  if (!request.challengeId?.trim() || (!hasCode && !hasRecoveryCode)) {
    return {
      status: 400,
      json: {
        result: "invalid_request",
        message: "challengeId and either code or recoveryCode are required",
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "invalid_request",
      },
    };
  }

  if (verifyResult.result === "issued") {
    return {
      status: 200,
      json: {
        result: "issued",
        sessionId: verifyResult.sessionId,
        csrfToken: verifyResult.csrfToken,
        expiresAt: verifyResult.expiresAt,
        actorId: verifyResult.actorId,
        role: verifyResult.actorRole,
        permissions: verifyResult.permissions,
        mfa: verifyResult.mfa,
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "issued",
        actorId: verifyResult.actorId,
      },
    };
  }

  if (verifyResult.result === "verified") {
    return {
      status: 200,
      json: {
        result: "verified",
        challengePurpose: verifyResult.challengePurpose,
        actorId: verifyResult.actorId,
        mfa: verifyResult.mfa,
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "verified",
        actorId: verifyResult.actorId,
      },
    };
  }

  if (verifyResult.result === "mfa_failed") {
    return {
      status: 401,
      json: {
        result: "mfa_failed",
        message: "MFA code invalid",
        attemptsRemaining: verifyResult.attemptsRemaining,
        lockedOut: verifyResult.lockedOut,
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "mfa_failed",
      },
    };
  }

  if (verifyResult.result === "locked_out") {
    return {
      status: 401,
      json: {
        result: "locked_out",
        message: "MFA challenge locked after too many failed attempts",
        attemptsRemaining: verifyResult.attemptsRemaining,
        lockedOut: true,
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "locked_out",
      },
    };
  }

  if (verifyResult.result === "rate_limited") {
    return {
      status: 429,
      json: {
        result: "rate_limited",
        message: "MFA verification rate limited. Please wait before retrying.",
        retryAfterSeconds: verifyResult.retryAfterSeconds,
      },
      headers: {
        "Retry-After": String(verifyResult.retryAfterSeconds),
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "rate_limited",
      },
    };
  }

  if (verifyResult.result === "expired") {
    return {
      status: 410,
      json: {
        result: "expired",
        message: "MFA challenge expired",
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "expired",
      },
    };
  }

  if (verifyResult.result === "invalid_request") {
    return {
      status: 400,
      json: {
        result: "invalid_request",
        message: "MFA verification request invalid",
      },
      telemetry: {
        route: "POST /station-admin/mfa/verify",
        result: "invalid_request",
      },
    };
  }

  return {
    status: 404,
    json: {
      result: "not_found",
      message: "MFA challenge not found",
    },
    telemetry: {
      route: "POST /station-admin/mfa/verify",
      result: "not_found",
    },
  };
}

export function buildStationAdminLogoutRouteResponse(
  sessionId: string,
  csrfToken: string,
  logoutResult = callLogoutRepository(sessionId, csrfToken),
): {
  status: 200 | 403 | 404;
  json: StationAdminLogoutResponse | { message: string };
  telemetry: StationAdminLogoutTelemetry;
} {
  if (logoutResult.result === "csrf_invalid") {
    return {
      status: 403,
      json: { message: "CSRF token invalid" },
      telemetry: {
        route: "POST /station-admin/logout",
        result: "csrf_invalid",
      },
    };
  }

  if (logoutResult.result === "not_found") {
    return {
      status: 404,
      json: { message: "Session not found or already expired" },
      telemetry: {
        route: "POST /station-admin/logout",
        result: "not_found",
      },
    };
  }

  return {
    status: 200,
    json: { ok: true },
    telemetry: {
      route: "POST /station-admin/logout",
      result: "revoked",
      actorId: logoutResult.actorId,
    },
  };
}

export function buildStationAdminRefreshRouteResponse(
  sessionId: string,
  csrfToken: string,
  refreshResult = callRefreshRepository(sessionId, csrfToken),
): {
  status: 200 | 403 | 404;
  json: StationAdminRefreshResponse | { message: string };
  telemetry: StationAdminRefreshTelemetry;
} {
  if (refreshResult.result === "csrf_invalid") {
    return {
      status: 403,
      json: { message: "CSRF token invalid" },
      telemetry: {
        route: "POST /station-admin/session/refresh",
        result: "csrf_invalid",
      },
    };
  }

  if (refreshResult.result === "not_found") {
    return {
      status: 404,
      json: { message: "Session not found or expired" },
      telemetry: {
        route: "POST /station-admin/session/refresh",
        result: "not_found",
      },
    };
  }

  return {
    status: 200,
    json: {
      sessionId: refreshResult.sessionId,
      csrfToken: refreshResult.csrfToken,
      expiresAt: refreshResult.expiresAt,
    },
    telemetry: {
      route: "POST /station-admin/session/refresh",
      result: "refreshed",
      actorId: refreshResult.actorId,
    },
  };
}

export function buildStationAdminRevokeRouteResponse(
  sessionId: string,
  csrfToken: string,
  targetSessionId: string,
  revokeResult = callRevokeRepository(sessionId, csrfToken, targetSessionId),
): {
  status: 200 | 401 | 403 | 404;
  json: StationAdminRevokeResponse | StationAdminRevokeMfaRequiredResponse | { message: string };
  telemetry: StationAdminRevokeTelemetry;
} {
  if (revokeResult.result === "csrf_invalid") {
    return {
      status: 403,
      json: { message: "CSRF token invalid" },
      telemetry: {
        route: "POST /station-admin/session/revoke",
        result: "csrf_invalid",
      },
    };
  }

  if (revokeResult.result === "forbidden") {
    return {
      status: 403,
      json: { message: "Admin role required to revoke sessions" },
      telemetry: {
        route: "POST /station-admin/session/revoke",
        result: "forbidden",
      },
    };
  }

  if (revokeResult.result === "not_found") {
    return {
      status: 404,
      json: { message: "Session not found" },
      telemetry: {
        route: "POST /station-admin/session/revoke",
        result: "not_found",
      },
    };
  }

  if (revokeResult.result === "mfa_required") {
    return {
      status: 401,
      json: {
        mfaRequired: true,
        challenge: revokeResult.challenge,
      },
      telemetry: {
        route: "POST /station-admin/session/revoke",
        result: "mfa_required",
      },
    };
  }

  return {
    status: 200,
    json: { ok: true },
    telemetry: {
      route: "POST /station-admin/session/revoke",
      result: "revoked",
      actorId: revokeResult.actorId,
    },
  };
}

export const postStationAdminLoginRoute: RouteDefinition<
  StationAdminLoginResponse | { message: string },
  StationAdminLoginRequest
> = {
  method: "POST",
  path: "/station-admin/login",
  handler(request) {
    return buildStationAdminLoginRouteResponse(
      request.body.actorId,
      request.body.password,
      callLoginRepositoryWithMetadata(request.body.actorId, request.body.password, request.body.metadata),
    );
  },
};

export const postStationAdminLogoutRoute: RouteDefinition<
  StationAdminLogoutResponse | { message: string },
  StationAdminLogoutRequest
> = {
  method: "POST",
  path: "/station-admin/logout",
  handler(request) {
    return buildStationAdminLogoutRouteResponse(
      request.body.sessionId,
      request.body.csrfToken,
      callLogoutRepository(request.body.sessionId, request.body.csrfToken, request.body.metadata),
    );
  },
};

export const postStationAdminMfaVerifyRoute: RouteDefinition<
  StationAdminMfaVerifyResponse | StationAdminMfaVerifyErrorResponse,
  StationAdminMfaVerifyRequest
> = {
  method: "POST",
  path: "/station-admin/mfa/verify",
  handler(request) {
    return buildStationAdminMfaVerifyRouteResponse(
      request.body,
      callMfaVerifyRepository(request.body),
    );
  },
};

export const postStationAdminRefreshRoute: RouteDefinition<
  StationAdminRefreshResponse | { message: string },
  StationAdminRefreshRequest
> = {
  method: "POST",
  path: "/station-admin/session/refresh",
  handler(request) {
    return buildStationAdminRefreshRouteResponse(
      request.body.sessionId,
      request.body.csrfToken,
      callRefreshRepository(request.body.sessionId, request.body.csrfToken, request.body.metadata),
    );
  },
};

export const postStationAdminRevokeRoute: RouteDefinition<
  StationAdminRevokeResponse | StationAdminRevokeMfaRequiredResponse | { message: string },
  StationAdminRevokeRequest
> = {
  method: "POST",
  path: "/station-admin/session/revoke",
  handler(request) {
    return buildStationAdminRevokeRouteResponse(
      request.body.sessionId,
      request.body.csrfToken,
      request.body.targetSessionId,
      callRevokeRepository(
        request.body.sessionId,
        request.body.csrfToken,
        request.body.targetSessionId,
        request.body.metadata,
      ),
    );
  },
};
