import type { OceanStationAdminAuthContext, OceanStationAdminPermission } from "../../../web/lib/api/types";
import type {
  RouteDefinition,
  StationEventListResponse,
  StationEventDetailResponse,
  StationInvestigationListResponse,
  StationInvestigationDetailResponse,
  StationEventsListTelemetry,
  StationEventDetailTelemetry,
  StationInvestigationsListTelemetry,
  StationInvestigationDetailTelemetry,
  StationEventFilters,
  StationInvestigationFilters,
  StationEventAcknowledgeRequest,
  StationEventAcknowledgeResponse,
  StationEventAcknowledgeTelemetry,
} from "../types";
import type {
  StationEventsListResult,
  StationEventDetailResult,
  StationInvestigationsListResult,
  StationInvestigationDetailResult,
  StationEventAcknowledgeResult,
} from "../repositories/station-events";

// ---------------------------------------------------------------------------
// Permission guard
// ---------------------------------------------------------------------------

function hasViewAdminPermission(auth: OceanStationAdminAuthContext | undefined): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes("station.view_admin" as OceanStationAdminPermission);
}

// ---------------------------------------------------------------------------
// eval("require") wrappers
// ---------------------------------------------------------------------------

function readStationEvents(
  stationId: string,
  filters: StationEventFilters = {},
): StationEventsListResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-events") as {
      listStationEvents: (stationId: string, filters: StationEventFilters) => StationEventsListResult;
    };

    return repository.listStationEvents(stationId, filters);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: { limit: 25 },
      nextCursor: null,
    };
  }
}

function readStationEventDetail(
  stationId: string,
  eventId: string,
): StationEventDetailResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-events") as {
      getStationEventDetail: (stationId: string, eventId: string) => StationEventDetailResult;
    };

    return repository.getStationEventDetail(stationId, eventId);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
    };
  }
}

function readStationInvestigations(
  stationId: string,
  filters: StationInvestigationFilters = {},
): StationInvestigationsListResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-events") as {
      listStationInvestigations: (stationId: string, filters: StationInvestigationFilters) => StationInvestigationsListResult;
    };

    return repository.listStationInvestigations(stationId, filters);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
      filters: { limit: 25 },
      nextCursor: null,
    };
  }
}

function readStationInvestigationDetail(
  stationId: string,
  investigationId: string,
): StationInvestigationDetailResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-events") as {
      getStationInvestigationDetail: (stationId: string, investigationId: string) => StationInvestigationDetailResult;
    };

    return repository.getStationInvestigationDetail(stationId, investigationId);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

function filtersApplied(filters: StationEventFilters | undefined): boolean {
  if (!filters) return false;
  return Boolean(filters.status || filters.severity || filters.eventType || filters.since || filters.until || filters.limit || filters.cursor);
}

function investigationFiltersApplied(filters: StationInvestigationFilters | undefined): boolean {
  if (!filters) return false;
  return Boolean(filters.status || filters.owner || filters.limit || filters.cursor);
}

export function buildStationEventsListRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  stationId: string,
  query: StationEventFilters = {},
  readResult = readStationEvents(stationId, query),
): {
  status: 200 | 403 | 404;
  json: StationEventListResponse | { message: string };
  telemetry: StationEventsListTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /stations/:id/events",
        stationId,
        source: "db",
        result: "forbidden",
        filtersApplied: filtersApplied(query),
      },
    };
  }

  if (readResult.source === "not_found") {
    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "GET /stations/:id/events",
        stationId,
        source: "db",
        result: "not_found",
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
        route: "GET /stations/:id/events",
        stationId: readResult.stationId,
        source: "db",
        result: "found",
        eventCount: readResult.events.length,
        filtersApplied: filtersApplied(readResult.filters),
      },
    };
  }

  return {
    status: 200,
    json: { events: [], nextCursor: null },
    telemetry: {
      route: "GET /stations/:id/events",
      stationId,
      source: "mock",
      result: "found",
      eventCount: 0,
      filtersApplied: filtersApplied(readResult.filters),
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildStationEventDetailRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  stationId: string,
  eventId: string,
  readResult = readStationEventDetail(stationId, eventId),
): {
  status: 200 | 403 | 404;
  json: StationEventDetailResponse | { message: string };
  telemetry: StationEventDetailTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /stations/:id/events/:eventId",
        stationId,
        eventId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  if (readResult.source === "not_found") {
    return {
      status: 404,
      json: { message: "Station or event not found" },
      telemetry: {
        route: "GET /stations/:id/events/:eventId",
        stationId,
        eventId,
        source: "db",
        result: "not_found",
      },
    };
  }

  if (readResult.source === "db") {
    return {
      status: 200,
      json: { event: readResult.event },
      telemetry: {
        route: "GET /stations/:id/events/:eventId",
        stationId,
        eventId,
        source: "db",
        result: "found",
      },
    };
  }

  return {
    status: 200,
    json: { message: "Event data temporarily unavailable" },
    telemetry: {
      route: "GET /stations/:id/events/:eventId",
      stationId,
      eventId,
      source: "mock",
      result: "not_found",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildStationInvestigationsListRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  stationId: string,
  query: StationInvestigationFilters = {},
  readResult = readStationInvestigations(stationId, query),
): {
  status: 200 | 403 | 404;
  json: StationInvestigationListResponse | { message: string };
  telemetry: StationInvestigationsListTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /stations/:id/investigations",
        stationId,
        source: "db",
        result: "forbidden",
        filtersApplied: investigationFiltersApplied(query),
      },
    };
  }

  if (readResult.source === "not_found") {
    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "GET /stations/:id/investigations",
        stationId,
        source: "db",
        result: "not_found",
        filtersApplied: investigationFiltersApplied(query),
      },
    };
  }

  if (readResult.source === "db") {
    return {
      status: 200,
      json: {
        investigations: readResult.investigations,
        nextCursor: readResult.nextCursor,
      },
      telemetry: {
        route: "GET /stations/:id/investigations",
        stationId: readResult.stationId,
        source: "db",
        result: "found",
        investigationCount: readResult.investigations.length,
        filtersApplied: investigationFiltersApplied(readResult.filters),
      },
    };
  }

  return {
    status: 200,
    json: { investigations: [], nextCursor: null },
    telemetry: {
      route: "GET /stations/:id/investigations",
      stationId,
      source: "mock",
      result: "found",
      investigationCount: 0,
      filtersApplied: investigationFiltersApplied(readResult.filters),
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildStationInvestigationDetailRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  stationId: string,
  investigationId: string,
  readResult = readStationInvestigationDetail(stationId, investigationId),
): {
  status: 200 | 403 | 404;
  json: StationInvestigationDetailResponse | { message: string };
  telemetry: StationInvestigationDetailTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /stations/:id/investigations/:investigationId",
        stationId,
        investigationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  if (readResult.source === "not_found") {
    return {
      status: 404,
      json: { message: "Station or investigation not found" },
      telemetry: {
        route: "GET /stations/:id/investigations/:investigationId",
        stationId,
        investigationId,
        source: "db",
        result: "not_found",
      },
    };
  }

  if (readResult.source === "db") {
    return {
      status: 200,
      json: { investigation: readResult.investigation },
      telemetry: {
        route: "GET /stations/:id/investigations/:investigationId",
        stationId,
        investigationId,
        source: "db",
        result: "found",
      },
    };
  }

  return {
    status: 200,
    json: { message: "Investigation data temporarily unavailable" },
    telemetry: {
      route: "GET /stations/:id/investigations/:investigationId",
      stationId,
      investigationId,
      source: "mock",
      result: "not_found",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

export const getStationEventsRoute: RouteDefinition<
  StationEventListResponse | { message: string },
  { id: string },
  StationEventFilters
> = {
  method: "GET",
  path: "/stations/:id/events",
  handler(request) {
    return buildStationEventsListRouteResponse(request.auth, request.body.id, request.query);
  },
};

export const getStationEventDetailRoute: RouteDefinition<
  StationEventDetailResponse | { message: string },
  { id: string; eventId: string }
> = {
  method: "GET",
  path: "/stations/:id/events/:eventId",
  handler(request) {
    return buildStationEventDetailRouteResponse(request.auth, request.body.id, request.body.eventId);
  },
};

export const getStationInvestigationsRoute: RouteDefinition<
  StationInvestigationListResponse | { message: string },
  { id: string },
  StationInvestigationFilters
> = {
  method: "GET",
  path: "/stations/:id/investigations",
  handler(request) {
    return buildStationInvestigationsListRouteResponse(request.auth, request.body.id, request.query);
  },
};

export const getStationInvestigationDetailRoute: RouteDefinition<
  StationInvestigationDetailResponse | { message: string },
  { id: string; investigationId: string }
> = {
  method: "GET",
  path: "/stations/:id/investigations/:investigationId",
  handler(request) {
    return buildStationInvestigationDetailRouteResponse(request.auth, request.body.id, request.body.investigationId);
  },
};

// ---------------------------------------------------------------------------
// Acknowledge station event
// ---------------------------------------------------------------------------

function writeAcknowledgeEvent(
  stationId: string,
  eventId: string,
  actorId: string,
): StationEventAcknowledgeResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/station-events") as {
      acknowledgeStationEvent: (
        stationId: string,
        eventId: string,
        actorId: string,
      ) => StationEventAcknowledgeResult;
    };

    return repository.acknowledgeStationEvent(stationId, eventId, actorId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export function buildStationEventAcknowledgeRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  stationId: string,
  eventId: string,
  actorId: string,
  ackResult = writeAcknowledgeEvent(stationId, eventId, actorId),
): {
  status: 200 | 403 | 404 | 409;
  json: StationEventAcknowledgeResponse | { message: string };
  telemetry: StationEventAcknowledgeTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "POST /stations/:id/events/:eventId/acknowledge",
        stationId,
        eventId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  if (ackResult.source === "db") {
    if (ackResult.result === "acknowledged") {
      return {
        status: 200,
        json: { ok: true, event: ackResult.event },
        telemetry: {
          route: "POST /stations/:id/events/:eventId/acknowledge",
          stationId,
          eventId,
          source: "db",
          result: "acknowledged",
        },
      };
    }

    if (ackResult.result === "already_acknowledged") {
      return {
        status: 409,
        json: { message: "Event is already acknowledged." },
        telemetry: {
          route: "POST /stations/:id/events/:eventId/acknowledge",
          stationId,
          eventId,
          source: "db",
          result: "already_acknowledged",
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station or event not found" },
      telemetry: {
        route: "POST /stations/:id/events/:eventId/acknowledge",
        stationId,
        eventId,
        source: "db",
        result: "not_found",
      },
    };
  }

  // Mock fallback — mutations cannot be satisfied without a writable database
  return {
    status: 404,
    json: { message: "Station or event not found" },
    telemetry: {
      route: "POST /stations/:id/events/:eventId/acknowledge",
      stationId,
      eventId,
      source: "mock",
      result: "not_found",
      fallbackReason: ackResult.fallbackReason,
    },
  };
}

export const postStationEventAcknowledgeRoute: RouteDefinition<
  StationEventAcknowledgeResponse | { message: string },
  StationEventAcknowledgeRequest
> = {
  method: "POST",
  path: "/stations/:id/events/:eventId/acknowledge",
  handler(request) {
    return buildStationEventAcknowledgeRouteResponse(
      request.auth,
      request.body.id,
      request.body.eventId,
      request.body.actorId,
    );
  },
};
