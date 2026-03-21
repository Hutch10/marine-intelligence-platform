import { apiMockData } from "../data";
import type {
  InvestigationEventCreateRequest,
  InvestigationEventCreateResponse,
  InvestigationEventCreateTelemetry,
  InvestigationTimelineQuery,
  InvestigationTimelineResponse,
  InvestigationTimelineTelemetry,
  RouteDefinition,
} from "../types";
import type {
  InvestigationTimelineEventType,
  InvestigationTimelineItem,
} from "../../../web/lib/api/types";
import type {
  InvestigationTimelineFilters,
  InvestigationTimelineResult,
  RecordInvestigationEventInput,
  RecordInvestigationEventResult,
} from "../repositories/investigation-events";

const VALID_EVENT_TYPES = new Set<InvestigationTimelineEventType>([
  "case_opened",
  "signal_linked",
  "hypothesis_tested",
  "evidence_promoted",
  "track_escalated",
  "case_closed",
]);

function readInvestigationTimeline(
  investigationId: string,
  filters: InvestigationTimelineFilters,
): InvestigationTimelineResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/investigation-events") as {
      getInvestigationTimeline: (
        id: string,
        query?: InvestigationTimelineFilters,
      ) => InvestigationTimelineResult;
    };

    return repository.getInvestigationTimeline(investigationId, filters);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function recordEvent(input: RecordInvestigationEventInput): RecordInvestigationEventResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/investigation-events") as {
      recordInvestigationEvent: (value: RecordInvestigationEventInput) => RecordInvestigationEventResult;
    };

    return repository.recordInvestigationEvent(input);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function normalizeTimelineLimit(rawLimit: number | string | undefined): number {
  if (rawLimit === undefined) {
    return 50;
  }

  const parsed = typeof rawLimit === "string" ? Number(rawLimit) : rawLimit;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 200);
}

function filterMockTimeline(query: InvestigationTimelineQuery = {}): InvestigationTimelineItem[] {
  const eventType = query.eventType;
  const limit = normalizeTimelineLimit(query.limit);
  const base = apiMockData.investigationsTimelineFallbackData;

  const filtered = eventType
    ? base.filter((item) => item.eventType === eventType)
    : base;

  return filtered.slice(0, limit);
}

function normalizeTimelineQuery(query: InvestigationTimelineQuery | undefined): InvestigationTimelineFilters {
  return {
    eventType: query?.eventType,
    limit: query?.limit,
  };
}

function timelineFiltersApplied(query: InvestigationTimelineQuery | undefined): boolean {
  if (!query) {
    return false;
  }

  return Boolean(query.eventType || query.limit);
}

function isValidEventType(eventType: string): eventType is InvestigationTimelineEventType {
  return VALID_EVENT_TYPES.has(eventType as InvestigationTimelineEventType);
}

export function buildInvestigationTimelineRouteResponse(
  investigationId: string,
  query: InvestigationTimelineQuery = {},
  readResult = readInvestigationTimeline(investigationId, normalizeTimelineQuery(query)),
): {
  status: number;
  json: InvestigationTimelineResponse;
  telemetry: InvestigationTimelineTelemetry;
} {
  const filtersApplied = timelineFiltersApplied(query);

  if (readResult.source === "db") {
    return {
      status: 200,
      json: { timeline: readResult.timeline },
      telemetry: {
        route: "GET /investigations/:id/timeline",
        source: "db",
        investigationId,
        eventCount: readResult.timeline.length,
        filtersApplied,
      },
    };
  }

  const fallbackTimeline = filterMockTimeline(query);

  return {
    status: 200,
    json: { timeline: fallbackTimeline },
    telemetry: {
      route: "GET /investigations/:id/timeline",
      source: "mock",
      investigationId,
      eventCount: fallbackTimeline.length,
      filtersApplied,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildInvestigationEventCreateRouteResponse(
  investigationId: string,
  body: InvestigationEventCreateRequest,
  recordResult?: RecordInvestigationEventResult,
): {
  status: number;
  json: InvestigationEventCreateResponse | { message: string };
  telemetry: InvestigationEventCreateTelemetry;
} {
  const source = body.source?.trim();
  const summary = body.summary?.trim();
  const detail = body.detail?.trim();

  if (!investigationId || !body.id || investigationId !== body.id) {
    return {
      status: 400,
      json: { message: "Investigation ID mismatch" },
      telemetry: {
        route: "POST /investigations/:id/events",
        source: "db",
        investigationId,
        result: "invalid",
        validationError: "id_mismatch",
      },
    };
  }

  if (!isValidEventType(body.eventType)) {
    return {
      status: 400,
      json: { message: "Invalid event type" },
      telemetry: {
        route: "POST /investigations/:id/events",
        source: "db",
        investigationId,
        result: "invalid",
        validationError: "invalid_event_type",
      },
    };
  }

  if (!source) {
    return {
      status: 400,
      json: { message: "Source is required" },
      telemetry: {
        route: "POST /investigations/:id/events",
        source: "db",
        investigationId,
        result: "invalid",
        validationError: "missing_source",
      },
    };
  }

  if (!summary) {
    return {
      status: 400,
      json: { message: "Summary is required" },
      telemetry: {
        route: "POST /investigations/:id/events",
        source: "db",
        investigationId,
        result: "invalid",
        validationError: "missing_summary",
      },
    };
  }

  if (body.confidence !== undefined) {
    if (!Number.isInteger(body.confidence) || body.confidence < 0 || body.confidence > 100) {
      return {
        status: 400,
        json: { message: "Confidence must be an integer between 0 and 100" },
        telemetry: {
          route: "POST /investigations/:id/events",
          source: "db",
          investigationId,
          result: "invalid",
          validationError: "invalid_confidence",
        },
      };
    }
  }

  const result =
    recordResult
    ?? recordEvent({
      investigationId,
      eventType: body.eventType,
      source,
      actor: body.actor?.trim() || undefined,
      summary,
      detail: detail || undefined,
      confidence: body.confidence,
    });

  if (result.source === "mock") {
    return {
      status: 503,
      json: { message: "Investigation events unavailable" },
      telemetry: {
        route: "POST /investigations/:id/events",
        source: "mock",
        investigationId,
        result: "not_found",
        fallbackReason: result.fallbackReason,
      },
    };
  }

  if (result.result === "not_found") {
    return {
      status: 404,
      json: { message: "Investigation not found" },
      telemetry: {
        route: "POST /investigations/:id/events",
        source: "db",
        investigationId,
        result: "not_found",
      },
    };
  }

  return {
    status: 201,
    json: { event: result.event },
    telemetry: {
      route: "POST /investigations/:id/events",
      source: "db",
      investigationId,
      result: "created",
    },
  };
}

export const getInvestigationTimelineRoute: RouteDefinition<InvestigationTimelineResponse, { id: string }, InvestigationTimelineQuery> = {
  method: "GET",
  path: "/investigations/:id/timeline",
  handler(request) {
    return buildInvestigationTimelineRouteResponse(request.body.id, request.query ?? {});
  },
};

export const postInvestigationEventRoute: RouteDefinition<InvestigationEventCreateResponse | { message: string }, InvestigationEventCreateRequest> = {
  method: "POST",
  path: "/investigations/:id/events",
  handler(request) {
    return buildInvestigationEventCreateRouteResponse(request.body.id, request.body);
  },
};
