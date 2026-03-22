import type { OceanStationAdminAuthContext } from "@marine/shared";
import type {
  RouteDefinition,
  StationAdminAuthEventsExportResponse,
  StationAdminAuthEventsExportTelemetry,
  StationAdminAuthEventsResponse,
  StationAdminAuthEventsTelemetry,
  StationAdminAuthEventFilters,
} from "../types";
import type {
  StationAdminAuthEventsExportResult,
  StationAdminAuthEventsReadResult,
} from "../repositories/station-admin-auth-events";

function hasAuditPermission(auth: OceanStationAdminAuthContext | undefined): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes("station.view_audit");
}

function readStationAdminAuthEvents(
  filters: StationAdminAuthEventFilters = {},
): StationAdminAuthEventsReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-admin-auth-events") as {
      listStationAdminAuthEvents: (filters: StationAdminAuthEventFilters) => StationAdminAuthEventsReadResult;
    };

    return repository.listStationAdminAuthEvents(filters);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: {
        limit: 25,
      },
      nextCursor: null,
    };
  }
}

function readStationAdminAuthEventsExport(
  filters: StationAdminAuthEventFilters = {},
): StationAdminAuthEventsExportResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-admin-auth-events") as {
      exportStationAdminAuthEvents: (filters: StationAdminAuthEventFilters) => StationAdminAuthEventsExportResult;
    };

    return repository.exportStationAdminAuthEvents(filters);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: {
        limit: 500,
      },
      export: {
        format: "json",
        fileName: `station-admin-events-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        exportedAt: new Date().toISOString(),
        filters: {
          limit: 500,
        },
        events: [],
      },
    };
  }
}

function filtersApplied(filters: StationAdminAuthEventFilters | undefined): boolean {
  if (!filters) {
    return false;
  }

  return Boolean(filters.eventType || filters.actor || filters.ip || filters.since || filters.until || filters.limit || filters.cursor);
}

export function buildStationAdminAuthEventsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: StationAdminAuthEventFilters = {},
  readResult = readStationAdminAuthEvents(query),
): {
  status: 200 | 403;
  json: StationAdminAuthEventsResponse | { message: string };
  telemetry: StationAdminAuthEventsTelemetry;
} {
  if (!hasAuditPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_audit" },
      telemetry: {
        route: "GET /station-admin/events",
        source: "db",
        result: "forbidden",
        filtersApplied: filtersApplied(query),
      },
    };
  }

  if (readResult.source === "db") {
    return {
      status: 200,
      json: {
        events: readResult.events,
        nextCursor: readResult.nextCursor,
      },
      telemetry: {
        route: "GET /station-admin/events",
        source: "db",
        result: "found",
        eventCount: readResult.events.length,
        filtersApplied: filtersApplied(readResult.filters),
      },
    };
  }

  return {
    status: 200,
    json: {
      events: [],
      nextCursor: null,
    },
    telemetry: {
      route: "GET /station-admin/events",
      source: "mock",
      result: "found",
      eventCount: 0,
      filtersApplied: filtersApplied(readResult.filters),
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildStationAdminAuthEventsExportRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: StationAdminAuthEventFilters = {},
  readResult = readStationAdminAuthEventsExport(query),
): {
  status: 200 | 403;
  json: StationAdminAuthEventsExportResponse | { message: string };
  telemetry: StationAdminAuthEventsExportTelemetry;
} {
  if (!hasAuditPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_audit" },
      telemetry: {
        route: "GET /station-admin/events/export",
        source: "db",
        result: "forbidden",
        filtersApplied: filtersApplied(query),
      },
    };
  }

  return {
    status: 200,
    json: {
      export: readResult.export,
    },
    telemetry: {
      route: "GET /station-admin/events/export",
      source: readResult.source,
      result: "exported",
      eventCount: readResult.export.events.length,
      filtersApplied: filtersApplied(readResult.filters),
      fallbackReason: readResult.source === "mock" ? readResult.fallbackReason : undefined,
    },
  };
}

export const getStationAdminAuthEventsRoute: RouteDefinition<
  StationAdminAuthEventsResponse | { message: string },
  undefined,
  StationAdminAuthEventFilters
> = {
  method: "GET",
  path: "/station-admin/events",
  handler(request) {
    return buildStationAdminAuthEventsRouteResponse(request.auth, request.query);
  },
};

export const getStationAdminAuthEventsExportRoute: RouteDefinition<
  StationAdminAuthEventsExportResponse | { message: string },
  undefined,
  StationAdminAuthEventFilters
> = {
  method: "GET",
  path: "/station-admin/events/export",
  handler(request) {
    return buildStationAdminAuthEventsExportRouteResponse(request.auth, request.query);
  },
};
