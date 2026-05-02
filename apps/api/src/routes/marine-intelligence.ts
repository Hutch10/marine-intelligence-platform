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
import { lookupApiKeyById } from "../repositories/api-keys";

const workflowService = createMarineIntelligenceWorkflowService();

const DEFAULT_PAID_API_TIERS = ["paid", "pro", "enterprise"];

type MarineApiKeyGateResult =
  | { ok: true; keyId: string; tier: string; active: true }
  | { ok: false; status: 401 | 403 | 503; message: string };

type ApiKeyLookupById = typeof lookupApiKeyById;

function normalizeHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string") {
      continue;
    }

    normalized[key.toLowerCase()] = value;
  }

  return normalized;
}

function extractApiKeyId(headers: Record<string, string | undefined> | undefined): string | null {
  const normalized = normalizeHeaders(headers);
  const apiKeyHeader = (normalized["x-api-key"] ?? "").trim();

  if (apiKeyHeader.length > 0) {
    return apiKeyHeader;
  }

  const authorizationHeader = (normalized["authorization"] ?? "").trim();
  if (!authorizationHeader) {
    return null;
  }

  const bearerPrefix = "bearer ";
  if (authorizationHeader.toLowerCase().startsWith(bearerPrefix)) {
    const token = authorizationHeader.slice(bearerPrefix.length).trim();
    return token.length > 0 ? token : null;
  }

  return null;
}

function getPaidTierAllowList(): Set<string> {
  const configured = (process.env.MARINE_PAID_API_TIERS ?? "").trim();

  if (!configured) {
    return new Set(DEFAULT_PAID_API_TIERS);
  }

  return new Set(
    configured
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

export function buildMarineApiKeyGateFailure(status: 401 | 403 | 503, message: string) {
  return {
    status,
    json: { message },
  };
}

export async function resolveMarineApiKeyGate(
  headers: Record<string, string | undefined> | undefined,
  lookupById: ApiKeyLookupById = lookupApiKeyById,
): Promise<MarineApiKeyGateResult> {
  const keyId = extractApiKeyId(headers);
  if (!keyId) {
    return { ok: false, status: 401, message: "API key required" };
  }

  const keyLookup = lookupById(keyId);

  if (keyLookup.source === "unavailable") {
    return { ok: false, status: 503, message: "API key store unavailable" };
  }

  if (!keyLookup.result.ok) {
    return { ok: false, status: 503, message: keyLookup.result.error || "API key validation failed" };
  }

  const key = keyLookup.result.key;
  if (!key) {
    return { ok: false, status: 401, message: "API key invalid" };
  }

  if (key.revokedAt !== null) {
    return { ok: false, status: 403, message: "API key inactive" };
  }

  const paidTiers = getPaidTierAllowList();
  if (!paidTiers.has(key.tier.trim().toLowerCase())) {
    return { ok: false, status: 403, message: "API key tier is not enabled for paid access" };
  }

  return {
    ok: true,
    keyId: key.id,
    tier: key.tier,
    active: true,
  };
}

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
  createResult: MarineIntelligenceDecisionCreateResult,
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
  createResult: MarineIntelligenceTelemetryEventCreateResult,
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
  createResult: MarineIntelligenceFeedbackCreateResult,
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
  query: { windowType?: "live" | "trend"; windowDays?: number } | undefined,
  summaryResult: MarineIntelligenceDecisionSummaryResult,
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
        windowType: (query?.windowType ?? "live") as any,
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
        windowType: (query?.windowType ?? "live") as any,
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
      windowType: (query?.windowType ?? "live") as any,
    },
  };
}

export function buildMarineWorkflowEventsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: MarineWorkflowEventFilters,
  readResult: MarineWorkflowListEventsResult,
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
  query: MarineWorkflowInvestigationFilters,
  readResult: MarineWorkflowListInvestigationsResult,
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
  createResult: MarineWorkflowCreateInvestigationResult,
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

export function buildMarineWorkflowAlertMutationRouteResponse(
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

export function buildMarineWorkflowAcknowledgeAlertRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: MarineWorkflowAlertActionRequest,
  mutationResult: MarineWorkflowAlertMutationResult,
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
  mutationResult: MarineWorkflowAlertMutationResult,
) {
  return buildMarineWorkflowAlertMutationRouteResponse(
    "POST /marine-intelligence/alerts/:alertId/resolve",
    auth,
    body,
    mutationResult,
  );
}

export function buildMarineWorkflowAlertsRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  query: MarineWorkflowAlertFilters,
  readResult: MarineWorkflowListAlertsResult,
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

export const getMarineWorkflowEventsRoute: RouteDefinition<
  MarineWorkflowEventsResponse | { message: string },
  undefined,
  MarineWorkflowEventFilters
> = {
  method: "GET",
  path: "/marine-intelligence/events",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const { includeAllPartitions, truthPartition, ...query } = (request.query ?? {}) as any;
    const readResult = await workflowService.listEvents(query);
    return buildMarineWorkflowEventsRouteResponse(request.auth, query, readResult);
  },
};

export const getMarineWorkflowInvestigationsRoute: RouteDefinition<
  MarineWorkflowInvestigationsResponse | { message: string },
  undefined,
  MarineWorkflowInvestigationFilters
> = {
  method: "GET",
  path: "/marine-intelligence/investigations",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const { includeAllPartitions, truthPartition, ...query } = (request.query ?? {}) as any;
    const readResult = await workflowService.listInvestigations(query);
    return buildMarineWorkflowInvestigationsRouteResponse(request.auth, query, readResult);
  },
};

export const postMarineWorkflowCreateInvestigationRoute: RouteDefinition<
  MarineWorkflowCreateInvestigationResponse | { message: string },
  MarineWorkflowCreateInvestigationRequest
> = {
  method: "POST",
  path: "/marine-intelligence/investigations",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const createResult = await workflowService.createInvestigation(request.body);
    return buildMarineWorkflowCreateInvestigationRouteResponse(request.auth, request.body, createResult);
  },
};

export const getMarineWorkflowAlertsRoute: RouteDefinition<
  MarineWorkflowAlertsResponse | { message: string },
  undefined,
  MarineWorkflowAlertFilters
> = {
  method: "GET",
  path: "/marine-intelligence/alerts",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const { includeAllPartitions, truthPartition, ...query } = (request.query ?? {}) as any;
    const readResult = await workflowService.listAlerts(query);
    return buildMarineWorkflowAlertsRouteResponse(request.auth, query, readResult);
  },
};

export const postMarineWorkflowAcknowledgeAlertRoute: RouteDefinition<
  MarineWorkflowAlertActionResponse | { message: string },
  MarineWorkflowAlertActionRequest
> = {
  method: "POST",
  path: "/marine-intelligence/alerts/:alertId/acknowledge",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const mutationResult = await workflowService.acknowledgeAlert(request.body.alertId);
    return buildMarineWorkflowAlertMutationRouteResponse(
      "POST /marine-intelligence/alerts/:alertId/acknowledge",
      request.auth,
      request.body,
      mutationResult,
    );
  },
};

export const postMarineWorkflowResolveAlertRoute: RouteDefinition<
  MarineWorkflowAlertActionResponse | { message: string },
  MarineWorkflowAlertActionRequest
> = {
  method: "POST",
  path: "/marine-intelligence/alerts/:alertId/resolve",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const mutationResult = await workflowService.resolveAlert(request.body.alertId);
    return buildMarineWorkflowAlertMutationRouteResponse(
      "POST /marine-intelligence/alerts/:alertId/resolve",
      request.auth,
      request.body,
      mutationResult,
    );
  },
};

export const postMarineWorkflowDecisionRoute: RouteDefinition<
  MarineWorkflowDecisionResponse | { message: string },
  MarineWorkflowDecisionRequest
> = {
  method: "POST",
  path: "/marine-intelligence/decisions",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const createResult = await recordMarineIntelligenceDecision(request.body);
    return buildMarineWorkflowDecisionRouteResponse(request.auth, request.body, createResult);
  },
};

export const postMarineWorkflowFeedbackRoute: RouteDefinition<
  MarineWorkflowFeedbackResponse | { message: string },
  MarineWorkflowFeedbackRequest
> = {
  method: "POST",
  path: "/marine-intelligence/feedback",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const createResult = await recordMarineIntelligenceFeedback(request.body);
    return buildMarineWorkflowFeedbackRouteResponse(request.auth, request.body, createResult);
  },
};

export const postMarineWorkflowTelemetryRoute: RouteDefinition<
  MarineWorkflowTelemetryEventResponse | { message: string },
  MarineWorkflowTelemetryEventRequest
> = {
  method: "POST",
  path: "/marine-intelligence/telemetry",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const createResult = await recordMarineIntelligenceTelemetryEvent(request.body);
    return buildMarineWorkflowTelemetryRouteResponse(request.auth, request.body, createResult);
  },
};

export const getMarineWorkflowSummaryRoute: RouteDefinition<
  MarineWorkflowDecisionSummaryResponse | { message: string },
  undefined
> = {
  method: "GET",
  path: "/marine-intelligence/summary",
  async handler(request) {
    const keyGate = await resolveMarineApiKeyGate(request.headers);
    if (!keyGate.ok) {
      return buildMarineApiKeyGateFailure(keyGate.status, keyGate.message);
    }

    const { includeAllPartitions, truthPartition, ...query } = (request.query ?? {}) as any;
    const summaryResult = await getMarineIntelligenceDecisionSummary(query);
    return buildMarineWorkflowSummaryRouteResponse(request.auth, query, summaryResult);
  },
};
