import type { OceanStationAdminAuthContext } from "@marine/shared";
import type {
  RouteDefinition,
  StationAdminSecurityAlertsResponse,
  StationAdminSecurityAlertsTelemetry,
  StationAdminSecuritySummaryResponse,
  StationAdminSecuritySummaryTelemetry,
  StationAdminSessionsQuery,
  StationAdminSessionsResponse,
  StationAdminSessionsTelemetry,
} from "../types";
import type {
  StationAdminSecurityAlertsReadResult,
  StationAdminSecuritySummaryReadResult,
  StationAdminSessionsReadResult,
} from "../repositories/station-admin-security";

function hasAuditPermission(auth: OceanStationAdminAuthContext | undefined): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes("station.view_audit");
}

function readStationAdminSessions(query: StationAdminSessionsQuery = {}): StationAdminSessionsReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-admin-security") as {
      listStationAdminSessions: (query: StationAdminSessionsQuery) => StationAdminSessionsReadResult;
    };

    return repository.listStationAdminSessions(query);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: { limit: 25 },
    };
  }
}

function readStationAdminSecuritySummary(): StationAdminSecuritySummaryReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-admin-security") as {
      getStationAdminSecuritySummary: () => StationAdminSecuritySummaryReadResult;
    };

    return repository.getStationAdminSecuritySummary();
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      summary: {
        activeSessionCount: 0,
        loginSuccessCount24h: 0,
        loginFailureCount24h: 0,
        lockoutCount24h: 0,
        revokeCount24h: 0,
        uniqueIpCount24h: 0,
        lastEventAt: null,
      },
    };
  }
}

function readStationAdminSecurityAlerts(): StationAdminSecurityAlertsReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-admin-security") as {
      getStationAdminSecurityAlerts: () => StationAdminSecurityAlertsReadResult;
    };

    return repository.getStationAdminSecurityAlerts();
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      alerts: [],
    };
  }
}

function filtersApplied(query: StationAdminSessionsQuery | undefined): boolean {
  if (!query) {
    return false;
  }

  return Boolean(query.limit);
}

export function buildStationAdminSessionsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: StationAdminSessionsQuery = {},
  readResult = readStationAdminSessions(query),
): {
  status: 200 | 403;
  json: StationAdminSessionsResponse | { message: string };
  telemetry: StationAdminSessionsTelemetry;
} {
  if (!hasAuditPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_audit" },
      telemetry: {
        route: "GET /station-admin/sessions",
        source: "db",
        result: "forbidden",
        filtersApplied: filtersApplied(query),
      },
    };
  }

  if (readResult.source === "db") {
    return {
      status: 200,
      json: { sessions: readResult.sessions },
      telemetry: {
        route: "GET /station-admin/sessions",
        source: "db",
        result: "found",
        sessionCount: readResult.sessions.length,
        filtersApplied: filtersApplied(readResult.filters),
      },
    };
  }

  return {
    status: 200,
    json: { sessions: [] },
    telemetry: {
      route: "GET /station-admin/sessions",
      source: "mock",
      result: "found",
      sessionCount: 0,
      filtersApplied: filtersApplied(readResult.filters),
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildStationAdminSecuritySummaryRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  readResult = readStationAdminSecuritySummary(),
): {
  status: 200 | 403;
  json: StationAdminSecuritySummaryResponse | { message: string };
  telemetry: StationAdminSecuritySummaryTelemetry;
} {
  if (!hasAuditPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_audit" },
      telemetry: {
        route: "GET /station-admin/security/summary",
        source: "db",
        result: "forbidden",
      },
    };
  }

  return {
    status: 200,
    json: { summary: readResult.summary },
    telemetry: {
      route: "GET /station-admin/security/summary",
      source: readResult.source,
      result: "found",
      fallbackReason: readResult.source === "mock" ? readResult.fallbackReason : undefined,
    },
  };
}

export function buildStationAdminSecurityAlertsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  readResult = readStationAdminSecurityAlerts(),
): {
  status: 200 | 403;
  json: StationAdminSecurityAlertsResponse | { message: string };
  telemetry: StationAdminSecurityAlertsTelemetry;
} {
  if (!hasAuditPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_audit" },
      telemetry: {
        route: "GET /station-admin/security/alerts",
        source: "db",
        result: "forbidden",
      },
    };
  }

  return {
    status: 200,
    json: { alerts: readResult.alerts },
    telemetry: {
      route: "GET /station-admin/security/alerts",
      source: readResult.source,
      result: "found",
      alertCount: readResult.alerts.length,
      fallbackReason: readResult.source === "mock" ? readResult.fallbackReason : undefined,
    },
  };
}

export const getStationAdminSessionsRoute: RouteDefinition<
  StationAdminSessionsResponse | { message: string },
  undefined,
  StationAdminSessionsQuery
> = {
  method: "GET",
  path: "/station-admin/sessions",
  handler(request) {
    return buildStationAdminSessionsRouteResponse(request.auth, request.query);
  },
};

export const getStationAdminSecuritySummaryRoute: RouteDefinition<
  StationAdminSecuritySummaryResponse | { message: string }
> = {
  method: "GET",
  path: "/station-admin/security/summary",
  handler(request) {
    return buildStationAdminSecuritySummaryRouteResponse(request.auth);
  },
};

export const getStationAdminSecurityAlertsRoute: RouteDefinition<
  StationAdminSecurityAlertsResponse | { message: string }
> = {
  method: "GET",
  path: "/station-admin/security/alerts",
  handler(request) {
    return buildStationAdminSecurityAlertsRouteResponse(request.auth);
  },
};
