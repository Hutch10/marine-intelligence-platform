import type {
  OceanStationAdminAuthContext,
  OceanStationAdminPermission,
} from "@marine/shared";
import type {
  MarineWorkflowAlertActionRequest,
  MarineWorkflowAlertActionResponse,
  MarineWorkflowAlertActionTelemetry,
  MarineWorkflowAlertsResponse,
  MarineWorkflowAlertsTelemetry,
  MarineWorkflowAlertFilters,
  MarineWorkflowDecisionRequest,
  MarineWorkflowDecisionResponse,
  MarineWorkflowDecisionSummaryResponse,
  MarineWorkflowDecisionSummaryTelemetry,
  MarineWorkflowDecisionTelemetry,
  MarineWorkflowFeedbackRequest,
  MarineWorkflowFeedbackResponse,
  MarineWorkflowFeedbackTelemetry,
  MarineWorkflowCreateInvestigationRequest,
  MarineWorkflowCreateInvestigationResponse,
  MarineWorkflowCreateInvestigationTelemetry,
  MarineWorkflowEventFilters,
  MarineWorkflowEventsResponse,
  MarineWorkflowEventsTelemetry,
  MarineWorkflowInvestigationFilters,
  MarineWorkflowInvestigationsResponse,
  MarineWorkflowInvestigationsTelemetry,
  MarineWorkflowTelemetryEventRequest,
  MarineWorkflowTelemetryEventResponse,
  MarineWorkflowTelemetryEventTelemetry,
  RouteDefinition,
} from "../types";
import {
  createMarineIntelligenceWorkflowService,
  type MarineWorkflowAlertMutationResult,
  type MarineWorkflowCreateInvestigationResult,
  type MarineWorkflowListAlertsResult,
  type MarineWorkflowListEventsResult,
  type MarineWorkflowListInvestigationsResult,
} from "../services/marine-intelligence-workflow";
import {
  getMarineIntelligenceDecisionSummary,
  recordMarineIntelligenceDecision,
  recordMarineIntelligenceFeedback,
  recordMarineIntelligenceTelemetryEvent,
  type MarineIntelligenceDecisionCreateResult,
  type MarineIntelligenceDecisionSummaryResult,
  type MarineIntelligenceFeedbackCreateResult,
  type MarineIntelligenceTelemetryEventCreateResult,
} from "../repositories/marine-intelligence-decisions";

const workflowService = createMarineIntelligenceWorkflowService();

function hasViewAdminPermission(
  auth: OceanStationAdminAuthContext | undefined,
): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes("station.view_admin" as OceanStationAdminPermission);
}

function eventsFiltersApplied(filters: MarineWorkflowEventFilters | undefined): boolean {
  if (!filters) {
    return false;
  }

  return Boolean(
    filters.stationId
      || filters.region
      || filters.status
      || filters.severity
      || filters.eventClass
      || filters.limit,
  );
}

function investigationsFiltersApplied(
  filters: MarineWorkflowInvestigationFilters | undefined,
): boolean {
  if (!filters) {
    return false;
  }

  return Boolean(
    filters.stationId
      || filters.region
      || filters.eventId
      || filters.status
      || filters.ownerId
      || filters.limit,
  );
}

function alertsFiltersApplied(filters: MarineWorkflowAlertFilters | undefined): boolean {
  if (!filters) {
    return false;
  }

  return Boolean(
    filters.stationId
      || filters.region
      || filters.eventId
      || filters.investigationId
      || filters.status
      || filters.severity
      || filters.ruleType
      || filters.limit,
  );
}

export function buildMarineWorkflowDecisionRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowDecisionRequest,
  createResult: MarineIntelligenceDecisionCreateResult = recordMarineIntelligenceDecision(body),
): {
  status: 200 | 400 | 403 | 404 | 503;
  json: MarineWorkflowDecisionResponse | { message: string };
  telemetry: MarineWorkflowDecisionTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "POST /marine-intelligence/decisions",
        source: "db",
        result: "forbidden",
        investigationId: body.investigationId,
        stationId: body.stationId,
      },
    };
  }

  if (createResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Marine decision storage unavailable" },
      telemetry: {
        route: "POST /marine-intelligence/decisions",
        source: "unavailable",
        result: "validation",
        investigationId: body.investigationId,
        stationId: body.stationId,
        fallbackReason: createResult.fallbackReason,
      },
    };
  }

  if (!createResult.result.ok || !createResult.result.decision) {
    return {
      status: 400,
      json: { message: createResult.result.error ?? "Unable to record marine decision" },
      telemetry: {
        route: "POST /marine-intelligence/decisions",
        source: "db",
        result: "validation",
        investigationId: body.investigationId,
        stationId: body.stationId,
      },
    };
  }

  return {
    status: 200,
    json: { decision: createResult.result.decision },
    telemetry: {
      route: "POST /marine-intelligence/decisions",
      source: "db",
      result: "created",
      investigationId: body.investigationId,
      stationId: body.stationId,
    },
  };
}

export function buildMarineWorkflowTelemetryRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowTelemetryEventRequest,
  createResult: MarineIntelligenceTelemetryEventCreateResult = recordMarineIntelligenceTelemetryEvent(body),
): {
  status: 200 | 400 | 403 | 503;
  json: MarineWorkflowTelemetryEventResponse | { message: string };
  telemetry: MarineWorkflowTelemetryEventTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "POST /marine-intelligence/telemetry",
        source: "db",
        result: "forbidden",
        eventType: body.eventType,
        investigationId: body.investigationId,
        stationId: body.stationId,
      },
    };
  }

  if (createResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Marine telemetry storage unavailable" },
      telemetry: {
        route: "POST /marine-intelligence/telemetry",
        source: "unavailable",
        result: "validation",
        eventType: body.eventType,
        investigationId: body.investigationId,
        stationId: body.stationId,
        fallbackReason: createResult.fallbackReason,
      },
    };
  }

  if (!createResult.result.ok || !createResult.result.event) {
    return {
      status: 400,
      json: { message: createResult.result.error ?? "Unable to record marine telemetry event" },
      telemetry: {
        route: "POST /marine-intelligence/telemetry",
        source: "db",
        result: "validation",
        eventType: body.eventType,
        investigationId: body.investigationId,
        stationId: body.stationId,
      },
    };
  }

  return {
    status: 200,
    json: { event: createResult.result.event },
    telemetry: {
      route: "POST /marine-intelligence/telemetry",
      source: "db",
      result: "created",
      eventType: body.eventType,
      investigationId: body.investigationId,
      stationId: body.stationId,
    },
  };
}

export function buildMarineWorkflowFeedbackRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowFeedbackRequest,
  createResult: MarineIntelligenceFeedbackCreateResult = recordMarineIntelligenceFeedback(body),
): {
  status: 200 | 400 | 403 | 503;
  json: MarineWorkflowFeedbackResponse | { message: string };
  telemetry: MarineWorkflowFeedbackTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "POST /marine-intelligence/feedback",
        source: "db",
        result: "forbidden",
        investigationId: body.investigationId,
        stationId: body.stationId,
      },
    };
  }

  if (createResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Marine feedback storage unavailable" },
      telemetry: {
        route: "POST /marine-intelligence/feedback",
        source: "unavailable",
        result: "validation",
        investigationId: body.investigationId,
        stationId: body.stationId,
        fallbackReason: createResult.fallbackReason,
      },
    };
  }

  if (!createResult.result.ok || !createResult.result.feedback) {
    return {
      status: 400,
      json: { message: createResult.result.error ?? "Unable to record marine feedback" },
      telemetry: {
        route: "POST /marine-intelligence/feedback",
        source: "db",
        result: "validation",
        investigationId: body.investigationId,
        stationId: body.stationId,
      },
    };
  }

  return {
    status: 200,
    json: { feedback: createResult.result.feedback },
    telemetry: {
      route: "POST /marine-intelligence/feedback",
      source: "db",
      result: "created",
      investigationId: body.investigationId,
      stationId: body.stationId,
    },
  };
}

export function buildMarineWorkflowSummaryRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  summaryResult: MarineIntelligenceDecisionSummaryResult = getMarineIntelligenceDecisionSummary(),
): {
  status: 200 | 403 | 503;
  json: MarineWorkflowDecisionSummaryResponse | { message: string };
  telemetry: MarineWorkflowDecisionSummaryTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /marine-intelligence/summary",
        source: "db",
        result: "forbidden",
        decisionCount: 0,
        telemetryEventCount: 0,
      },
    };
  }

  if (summaryResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Marine decision summary unavailable" },
      telemetry: {
        route: "GET /marine-intelligence/summary",
        source: "unavailable",
        result: "found",
        decisionCount: 0,
        telemetryEventCount: 0,
        fallbackReason: summaryResult.fallbackReason,
      },
    };
  }

  return {
    status: 200,
    json: { summary: summaryResult.result.summary },
    telemetry: {
      route: "GET /marine-intelligence/summary",
      source: "db",
      result: "found",
      decisionCount: summaryResult.result.summary.decisionCount,
      telemetryEventCount: summaryResult.result.summary.telemetryEventCount,
    },
  };
}

export function buildMarineWorkflowEventsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: MarineWorkflowEventFilters = {},
  readResult: MarineWorkflowListEventsResult = workflowService.listEvents(query),
): {
  status: 200 | 403;
  json: MarineWorkflowEventsResponse | { message: string };
  telemetry: MarineWorkflowEventsTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /marine-intelligence/events",
        source: "db",
        result: "forbidden",
        filtersApplied: eventsFiltersApplied(query),
      },
    };
  }

  return {
    status: 200,
    json: { events: readResult.events },
    telemetry: {
      route: "GET /marine-intelligence/events",
      source: readResult.ok ? "db" : "unavailable",
      result: "found",
      eventCount: readResult.events.length,
      filtersApplied: eventsFiltersApplied(query),
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildMarineWorkflowInvestigationsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: MarineWorkflowInvestigationFilters = {},
  readResult: MarineWorkflowListInvestigationsResult = workflowService.listInvestigations(query),
): {
  status: 200 | 403;
  json: MarineWorkflowInvestigationsResponse | { message: string };
  telemetry: MarineWorkflowInvestigationsTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /marine-intelligence/investigations",
        source: "db",
        result: "forbidden",
        filtersApplied: investigationsFiltersApplied(query),
      },
    };
  }

  return {
    status: 200,
    json: { investigations: readResult.investigations },
    telemetry: {
      route: "GET /marine-intelligence/investigations",
      source: readResult.ok ? "db" : "unavailable",
      result: "found",
      investigationCount: readResult.investigations.length,
      filtersApplied: investigationsFiltersApplied(query),
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildMarineWorkflowCreateInvestigationRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowCreateInvestigationRequest,
  createResult: MarineWorkflowCreateInvestigationResult = workflowService.createInvestigation(body),
): {
  status: 200 | 400 | 403 | 404 | 503;
  json: MarineWorkflowCreateInvestigationResponse | { message: string };
  telemetry: MarineWorkflowCreateInvestigationTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "POST /marine-intelligence/investigations",
        source: "db",
        result: "forbidden",
        eventId: body.eventId,
      },
    };
  }

  if (!createResult.ok || !createResult.investigation) {
    if (createResult.fallbackReason) {
      return {
        status: 503,
        json: { message: createResult.error ?? "Marine investigation storage unavailable" },
        telemetry: {
          route: "POST /marine-intelligence/investigations",
          source: "unavailable",
          result: createResult.reason === "not_found" ? "not_found" : "validation",
          eventId: body.eventId,
          fallbackReason: createResult.fallbackReason,
        },
      };
    }

    return {
      status: createResult.reason === "not_found" ? 404 : 400,
      json: { message: createResult.error ?? "Unable to create marine investigation" },
      telemetry: {
        route: "POST /marine-intelligence/investigations",
        source: "db",
        result: createResult.reason === "not_found" ? "not_found" : "validation",
        eventId: body.eventId,
      },
    };
  }

  return {
    status: 200,
    json: { investigation: createResult.investigation },
    telemetry: {
      route: "POST /marine-intelligence/investigations",
      source: "db",
      result: "created",
      eventId: body.eventId,
    },
  };
}

function buildMarineWorkflowAlertMutationRouteResponse(
  route:
    | "POST /marine-intelligence/alerts/:alertId/acknowledge"
    | "POST /marine-intelligence/alerts/:alertId/resolve",
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowAlertActionRequest,
  mutationResult: MarineWorkflowAlertMutationResult,
): {
  status: 200 | 400 | 403 | 404 | 503;
  json: MarineWorkflowAlertActionResponse | { message: string };
  telemetry: MarineWorkflowAlertActionTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route,
        source: "db",
        result: "forbidden",
        alertId: body.alertId,
      },
    };
  }

  if (!mutationResult.ok || !mutationResult.alert) {
    if (mutationResult.fallbackReason) {
      return {
        status: 503,
        json: { message: mutationResult.error ?? "Marine alert storage unavailable" },
        telemetry: {
          route,
          source: "unavailable",
          result: mutationResult.reason === "not_found" ? "not_found" : "validation",
          alertId: body.alertId,
          fallbackReason: mutationResult.fallbackReason,
        },
      };
    }

    return {
      status: mutationResult.reason === "not_found" ? 404 : 400,
      json: { message: mutationResult.error ?? "Unable to update marine alert" },
      telemetry: {
        route,
        source: "db",
        result: mutationResult.reason === "not_found" ? "not_found" : "validation",
        alertId: body.alertId,
      },
    };
  }

  return {
    status: 200,
    json: { alert: mutationResult.alert },
    telemetry: {
      route,
      source: "db",
      result: "updated",
      alertId: body.alertId,
    },
  };
}

export function buildMarineWorkflowAlertsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: MarineWorkflowAlertFilters = {},
  readResult: MarineWorkflowListAlertsResult = workflowService.listAlerts(query),
): {
  status: 200 | 403;
  json: MarineWorkflowAlertsResponse | { message: string };
  telemetry: MarineWorkflowAlertsTelemetry;
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /marine-intelligence/alerts",
        source: "db",
        result: "forbidden",
        filtersApplied: alertsFiltersApplied(query),
      },
    };
  }

  return {
    status: 200,
    json: { alerts: readResult.alerts },
    telemetry: {
      route: "GET /marine-intelligence/alerts",
      source: readResult.ok ? "db" : "unavailable",
      result: "found",
      alertCount: readResult.alerts.length,
      filtersApplied: alertsFiltersApplied(query),
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildMarineWorkflowAcknowledgeAlertRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowAlertActionRequest,
  mutationResult: MarineWorkflowAlertMutationResult = workflowService.acknowledgeAlert(body.alertId),
) {
  return buildMarineWorkflowAlertMutationRouteResponse(
    "POST /marine-intelligence/alerts/:alertId/acknowledge",
    auth,
    body,
    mutationResult,
  );
}

export function buildMarineWorkflowResolveAlertRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowAlertActionRequest,
  mutationResult: MarineWorkflowAlertMutationResult = workflowService.resolveAlert(body.alertId),
) {
  return buildMarineWorkflowAlertMutationRouteResponse(
    "POST /marine-intelligence/alerts/:alertId/resolve",
    auth,
    body,
    mutationResult,
  );
}

export const getMarineWorkflowEventsRoute: RouteDefinition<
  MarineWorkflowEventsResponse | { message: string },
  undefined,
  MarineWorkflowEventFilters
> = {
  method: "GET",
  path: "/marine-intelligence/events",
  handler(request) {
    return buildMarineWorkflowEventsRouteResponse(request.auth, request.query ?? {});
  },
};

export const getMarineWorkflowInvestigationsRoute: RouteDefinition<
  MarineWorkflowInvestigationsResponse | { message: string },
  undefined,
  MarineWorkflowInvestigationFilters
> = {
  method: "GET",
  path: "/marine-intelligence/investigations",
  handler(request) {
    return buildMarineWorkflowInvestigationsRouteResponse(request.auth, request.query ?? {});
  },
};

export const postMarineWorkflowCreateInvestigationRoute: RouteDefinition<
  MarineWorkflowCreateInvestigationResponse | { message: string },
  MarineWorkflowCreateInvestigationRequest
> = {
  method: "POST",
  path: "/marine-intelligence/investigations",
  handler(request) {
    return buildMarineWorkflowCreateInvestigationRouteResponse(request.auth, request.body);
  },
};

export const getMarineWorkflowAlertsRoute: RouteDefinition<
  MarineWorkflowAlertsResponse | { message: string },
  undefined,
  MarineWorkflowAlertFilters
> = {
  method: "GET",
  path: "/marine-intelligence/alerts",
  handler(request) {
    return buildMarineWorkflowAlertsRouteResponse(request.auth, request.query ?? {});
  },
};

export const postMarineWorkflowAcknowledgeAlertRoute: RouteDefinition<
  MarineWorkflowAlertActionResponse | { message: string },
  MarineWorkflowAlertActionRequest
> = {
  method: "POST",
  path: "/marine-intelligence/alerts/:alertId/acknowledge",
  handler(request) {
    return buildMarineWorkflowAcknowledgeAlertRouteResponse(request.auth, request.body);
  },
};

export const postMarineWorkflowResolveAlertRoute: RouteDefinition<
  MarineWorkflowAlertActionResponse | { message: string },
  MarineWorkflowAlertActionRequest
> = {
  method: "POST",
  path: "/marine-intelligence/alerts/:alertId/resolve",
  handler(request) {
    return buildMarineWorkflowResolveAlertRouteResponse(request.auth, request.body);
  },
};

export const postMarineWorkflowDecisionRoute: RouteDefinition<
  MarineWorkflowDecisionResponse | { message: string },
  MarineWorkflowDecisionRequest
> = {
  method: "POST",
  path: "/marine-intelligence/decisions",
  handler(request) {
    return buildMarineWorkflowDecisionRouteResponse(request.auth, request.body);
  },
};

export const postMarineWorkflowFeedbackRoute: RouteDefinition<
  MarineWorkflowFeedbackResponse | { message: string },
  MarineWorkflowFeedbackRequest
> = {
  method: "POST",
  path: "/marine-intelligence/feedback",
  handler(request) {
    return buildMarineWorkflowFeedbackRouteResponse(request.auth, request.body);
  },
};

export const postMarineWorkflowTelemetryRoute: RouteDefinition<
  MarineWorkflowTelemetryEventResponse | { message: string },
  MarineWorkflowTelemetryEventRequest
> = {
  method: "POST",
  path: "/marine-intelligence/telemetry",
  handler(request) {
    return buildMarineWorkflowTelemetryRouteResponse(request.auth, request.body);
  },
};

export const getMarineWorkflowSummaryRoute: RouteDefinition<
  MarineWorkflowDecisionSummaryResponse | { message: string },
  undefined
> = {
  method: "GET",
  path: "/marine-intelligence/summary",
  handler(request) {
    return buildMarineWorkflowSummaryRouteResponse(request.auth);
  },
};
