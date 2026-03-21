import type {
  RouteDefinition,
  StationAdminSessionAuthRequest,
  StationAdminSessionAuthResponse,
  StationAdminSessionAuthTelemetry,
} from "../types";

type StationAdminSessionReadResult =
  | {
      source: "db";
      result: "found";
      auth: StationAdminSessionAuthResponse["auth"];
    }
  | {
      source: "db";
      result: "not_found";
    }
  | {
      source: "mock";
      fallbackReason: StationAdminSessionAuthTelemetry["fallbackReason"];
    };

function readStationAdminSession(
  sessionId: string,
): StationAdminSessionReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-admin-auth") as {
      getStationAdminSessionAuth: (sessionId: string) => StationAdminSessionReadResult;
    };

    return repository.getStationAdminSessionAuth(sessionId);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
    };
  }
}

export function buildStationAdminSessionAuthRouteResponse(
  sessionId: string,
  readResult = readStationAdminSession(sessionId),
): {
  status: 200 | 401;
  json: StationAdminSessionAuthResponse | { message: string };
  telemetry: StationAdminSessionAuthTelemetry;
} {
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    return {
      status: 401,
      json: { message: "Session required" },
      telemetry: {
        route: "POST /station-admin/session",
        source: "db",
        result: "not_found",
      },
    };
  }

  if (readResult.source === "db") {
    if (readResult.result === "found") {
      return {
        status: 200,
        json: { auth: readResult.auth },
        telemetry: {
          route: "POST /station-admin/session",
          source: "db",
          result: "found",
          actorId: readResult.auth.actorId,
        },
      };
    }

    return {
      status: 401,
      json: { message: "Session not found" },
      telemetry: {
        route: "POST /station-admin/session",
        source: "db",
        result: "not_found",
      },
    };
  }

  return {
    status: 401,
    json: { message: "Session not found" },
    telemetry: {
      route: "POST /station-admin/session",
      source: "mock",
      result: "not_found",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const postStationAdminSessionRoute: RouteDefinition<
  StationAdminSessionAuthResponse | { message: string },
  StationAdminSessionAuthRequest
> = {
  method: "POST",
  path: "/station-admin/session",
  handler: (request) => buildStationAdminSessionAuthRouteResponse(request.body.sessionId),
};
