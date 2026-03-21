import { apiMockData } from "../data";
import type {
  RouteDefinition,
  SignalCreateRequest,
  SignalCreateResponse,
  SignalCreateTelemetry,
  SignalDetailResponse,
  SignalDetailTelemetry,
  SignalDismissRequest,
  SignalDismissResponse,
  SignalDismissTelemetry,
  SignalPromoteRequest,
  SignalPromoteResponse,
  SignalPromoteTelemetry,
  SignalsListQuery,
  SignalsListResponse,
  SignalsListTelemetry,
} from "../types";
import type {
  CreateSignalInput,
  SignalDetection,
  SignalSeverity,
  SignalStatus,
  SignalType,
} from "../../../web/lib/api/types";
import type {
  SignalCreateResult,
  SignalDetailResult,
  SignalDismissResult,
  SignalListFilters,
  SignalPromoteResult,
  SignalsListResult,
} from "../repositories/signals";

const VALID_SIGNAL_TYPES = new Set<SignalType>([
  "thermal_anomaly",
  "oxygen_depletion",
  "migration_anomaly",
  "chlorophyll_bloom",
  "current_shear",
  "station_health",
]);

const VALID_SIGNAL_SEVERITIES = new Set<SignalSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);

const VALID_SIGNAL_STATUSES = new Set<SignalStatus>([
  "open",
  "monitoring",
  "promoted",
  "dismissed",
]);

function readSignals(filters: SignalListFilters): SignalsListResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      listSignals: (query: SignalListFilters) => SignalsListResult;
    };

    return repository.listSignals(filters);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function readSignalById(signalId: string): SignalDetailResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      getSignalById: (id: string) => SignalDetailResult;
    };

    return repository.getSignalById(signalId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function createSignalRecord(input: CreateSignalInput): SignalCreateResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      createSignal: (value: CreateSignalInput) => SignalCreateResult;
    };

    return repository.createSignal(input);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function promoteSignalRecord(
  signalId: string,
  investigationId: string,
  actor: string | undefined,
): SignalPromoteResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      promoteSignalToInvestigation: (
        signalId: string,
        investigationId: string,
        actor?: string,
      ) => SignalPromoteResult;
    };

    return repository.promoteSignalToInvestigation(signalId, investigationId, actor);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function dismissSignalRecord(signalId: string, actor: string | undefined): SignalDismissResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      dismissSignal: (signalId: string, actor?: string) => SignalDismissResult;
    };

    return repository.dismissSignal(signalId, actor);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function normalizeLimit(rawLimit: number | string | undefined): number {
  if (rawLimit === undefined) {
    return 50;
  }

  const parsed = typeof rawLimit === "string" ? Number(rawLimit) : rawLimit;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 200);
}

function normalizeSignalFilters(query: SignalsListQuery | undefined): SignalListFilters {
  return {
    signalType: query?.signalType,
    severity: query?.severity,
    status: query?.status,
    region: query?.region,
    stationId: query?.stationId,
    limit: query?.limit,
  };
}

function filtersApplied(query: SignalsListQuery | undefined): boolean {
  if (!query) {
    return false;
  }

  return Boolean(
    query.signalType
      || query.severity
      || query.status
      || query.region
      || query.stationId
      || query.limit,
  );
}

function filterMockSignals(query: SignalsListQuery = {}): SignalDetection[] {
  const filtered = apiMockData.signalDetectionsFallbackData
    .filter((signal) => {
      if (query.signalType && signal.signalType !== query.signalType) {
        return false;
      }

      if (query.severity && signal.severity !== query.severity) {
        return false;
      }

      if (query.status && signal.status !== query.status) {
        return false;
      }

      if (query.region && signal.region.toLowerCase() !== query.region.trim().toLowerCase()) {
        return false;
      }

      if (query.stationId && signal.stationId !== query.stationId) {
        return false;
      }

      return true;
    })
    .sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime());

  return filtered.slice(0, normalizeLimit(query.limit));
}

export function buildSignalsListRouteResponse(
  query: SignalsListQuery = {},
  readResult = readSignals(normalizeSignalFilters(query)),
): {
  status: number;
  json: SignalsListResponse;
  telemetry: SignalsListTelemetry;
} {
  const queryHasFilters = filtersApplied(query);

  if (readResult.source === "db") {
    return {
      status: 200,
      json: { signals: readResult.signals },
      telemetry: {
        route: "GET /signals",
        source: "db",
        signalCount: readResult.signals.length,
        filtersApplied: queryHasFilters,
      },
    };
  }

  const fallbackSignals = filterMockSignals(query);

  return {
    status: 200,
    json: { signals: fallbackSignals },
    telemetry: {
      route: "GET /signals",
      source: "mock",
      signalCount: fallbackSignals.length,
      filtersApplied: queryHasFilters,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildSignalDetailRouteResponse(
  signalId: string,
  readResult = readSignalById(signalId),
): {
  status: number;
  json: SignalDetailResponse | { message: string };
  telemetry: SignalDetailTelemetry;
} {
  if (readResult.source === "db" && readResult.result === "found") {
    return {
      status: 200,
      json: { signal: readResult.signal },
      telemetry: {
        route: "GET /signals/:id",
        source: "db",
        signalId,
        result: "found",
      },
    };
  }

  if (readResult.source === "db") {
    return {
      status: 404,
      json: { message: "Signal not found" },
      telemetry: {
        route: "GET /signals/:id",
        source: "db",
        signalId,
        result: "not_found",
      },
    };
  }

  const fallbackSignal = apiMockData.signalDetectionsFallbackData.find((signal) => signal.id === signalId);

  if (fallbackSignal) {
    return {
      status: 200,
      json: { signal: fallbackSignal },
      telemetry: {
        route: "GET /signals/:id",
        source: "mock",
        signalId,
        result: "found",
        fallbackReason: readResult.fallbackReason,
      },
    };
  }

  return {
    status: 404,
    json: { message: "Signal not found" },
    telemetry: {
      route: "GET /signals/:id",
      source: "mock",
      signalId,
      result: "not_found",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildSignalCreateRouteResponse(
  body: SignalCreateRequest,
  createResult?: SignalCreateResult,
): {
  status: number;
  json: SignalCreateResponse | { message: string };
  telemetry: SignalCreateTelemetry;
} {
  const signalType = body.signalType;
  const severity = body.severity;
  const status = body.status;
  const sourceType = body.sourceType?.trim();
  const sourceId = body.sourceId?.trim();
  const region = body.region?.trim();
  const title = body.title?.trim();
  const summary = body.summary?.trim();
  const detail = body.detail?.trim();

  if (!VALID_SIGNAL_TYPES.has(signalType)) {
    return {
      status: 400,
      json: { message: "Invalid signal type" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "invalid_signal_type",
      },
    };
  }

  if (!VALID_SIGNAL_SEVERITIES.has(severity)) {
    return {
      status: 400,
      json: { message: "Invalid signal severity" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "invalid_signal_severity",
      },
    };
  }

  if (status && !VALID_SIGNAL_STATUSES.has(status)) {
    return {
      status: 400,
      json: { message: "Invalid signal status" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "invalid_signal_status",
      },
    };
  }

  if (!sourceType) {
    return {
      status: 400,
      json: { message: "Source type is required" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "missing_source_type",
      },
    };
  }

  if (!sourceId) {
    return {
      status: 400,
      json: { message: "Source ID is required" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "missing_source_id",
      },
    };
  }

  if (!region) {
    return {
      status: 400,
      json: { message: "Region is required" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "missing_region",
      },
    };
  }

  if (!title) {
    return {
      status: 400,
      json: { message: "Title is required" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "missing_title",
      },
    };
  }

  if (!summary) {
    return {
      status: 400,
      json: { message: "Summary is required" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "missing_summary",
      },
    };
  }

  if (!detail) {
    return {
      status: 400,
      json: { message: "Detail is required" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "missing_detail",
      },
    };
  }

  if (!Number.isFinite(body.confidence) || body.confidence < 0 || body.confidence > 100) {
    return {
      status: 400,
      json: { message: "Confidence must be a number between 0 and 100" },
      telemetry: {
        route: "POST /signals",
        source: "db",
        result: "invalid",
        validationError: "invalid_confidence",
      },
    };
  }

  const result = createResult ?? createSignalRecord({
    signalType,
    severity,
    confidence: body.confidence,
    sourceType,
    sourceId,
    region,
    stationId: body.stationId?.trim() || undefined,
    title,
    summary,
    detail,
    status,
    linkedInvestigationId: body.linkedInvestigationId?.trim() || undefined,
  });

  if (result.source === "mock") {
    return {
      status: 503,
      json: { message: "Signal creation unavailable" },
      telemetry: {
        route: "POST /signals",
        source: "mock",
        result: "invalid",
        fallbackReason: result.fallbackReason,
      },
    };
  }

  return {
    status: 201,
    json: { signal: result.signal },
    telemetry: {
      route: "POST /signals",
      source: "db",
      result: "created",
    },
  };
}

export function buildSignalPromoteRouteResponse(
  signalId: string,
  body: SignalPromoteRequest,
  promoteResult?: SignalPromoteResult,
): {
  status: number;
  json: SignalPromoteResponse | { message: string };
  telemetry: SignalPromoteTelemetry;
} {
  const investigationId = body.investigationId?.trim();

  if (!signalId || signalId !== body.id) {
    return {
      status: 400,
      json: { message: "Signal ID mismatch" },
      telemetry: {
        route: "POST /signals/:id/promote",
        source: "db",
        signalId,
        investigationId: body.investigationId,
        result: "invalid",
        validationError: "id_mismatch",
      },
    };
  }

  if (!investigationId) {
    return {
      status: 400,
      json: { message: "Investigation ID is required" },
      telemetry: {
        route: "POST /signals/:id/promote",
        source: "db",
        signalId,
        investigationId: body.investigationId,
        result: "invalid",
        validationError: "missing_investigation_id",
      },
    };
  }

  const result = promoteResult ?? promoteSignalRecord(signalId, investigationId, body.actor?.trim());

  if (result.source === "mock") {
    return {
      status: 503,
      json: { message: "Signal promotion unavailable" },
      telemetry: {
        route: "POST /signals/:id/promote",
        source: "mock",
        signalId,
        investigationId,
        result: "not_found",
        fallbackReason: result.fallbackReason,
      },
    };
  }

  if (result.result === "not_found") {
    return {
      status: 404,
      json: { message: "Signal or investigation not found" },
      telemetry: {
        route: "POST /signals/:id/promote",
        source: "db",
        signalId,
        investigationId,
        result: "not_found",
      },
    };
  }

  return {
    status: 200,
    json: { signal: result.signal },
    telemetry: {
      route: "POST /signals/:id/promote",
      source: "db",
      signalId,
      investigationId,
      result: "promoted",
    },
  };
}

export function buildSignalDismissRouteResponse(
  signalId: string,
  body: SignalDismissRequest,
  dismissResult?: SignalDismissResult,
): {
  status: number;
  json: SignalDismissResponse | { message: string };
  telemetry: SignalDismissTelemetry;
} {
  if (!signalId || signalId !== body.id) {
    return {
      status: 400,
      json: { message: "Signal ID mismatch" },
      telemetry: {
        route: "POST /signals/:id/dismiss",
        source: "db",
        signalId,
        result: "invalid",
        validationError: "id_mismatch",
      },
    };
  }

  const result = dismissResult ?? dismissSignalRecord(signalId, body.actor?.trim());

  if (result.source === "mock") {
    return {
      status: 503,
      json: { message: "Signal dismissal unavailable" },
      telemetry: {
        route: "POST /signals/:id/dismiss",
        source: "mock",
        signalId,
        result: "not_found",
        fallbackReason: result.fallbackReason,
      },
    };
  }

  if (result.result === "not_found") {
    return {
      status: 404,
      json: { message: "Signal not found" },
      telemetry: {
        route: "POST /signals/:id/dismiss",
        source: "db",
        signalId,
        result: "not_found",
      },
    };
  }

  return {
    status: 200,
    json: { signal: result.signal },
    telemetry: {
      route: "POST /signals/:id/dismiss",
      source: "db",
      signalId,
      result: "dismissed",
    },
  };
}

export const getSignalsRoute: RouteDefinition<SignalsListResponse, undefined, SignalsListQuery> = {
  method: "GET",
  path: "/signals",
  handler(request) {
    return buildSignalsListRouteResponse(request.query ?? {});
  },
};

export const getSignalByIdRoute: RouteDefinition<SignalDetailResponse | { message: string }, { id: string }> = {
  method: "GET",
  path: "/signals/:id",
  handler(request) {
    return buildSignalDetailRouteResponse(request.body.id);
  },
};

export const postSignalCreateRoute: RouteDefinition<SignalCreateResponse | { message: string }, SignalCreateRequest> = {
  method: "POST",
  path: "/signals",
  handler(request) {
    return buildSignalCreateRouteResponse(request.body);
  },
};

export const postSignalPromoteRoute: RouteDefinition<SignalPromoteResponse | { message: string }, SignalPromoteRequest> = {
  method: "POST",
  path: "/signals/:id/promote",
  handler(request) {
    return buildSignalPromoteRouteResponse(request.body.id, request.body);
  },
};

export const postSignalDismissRoute: RouteDefinition<SignalDismissResponse | { message: string }, SignalDismissRequest> = {
  method: "POST",
  path: "/signals/:id/dismiss",
  handler(request) {
    return buildSignalDismissRouteResponse(request.body.id, request.body);
  },
};
