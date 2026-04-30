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
} from "@marine/shared";
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

async function readSignals(filters: SignalListFilters): Promise<SignalsListResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      listSignals: (query: SignalListFilters) => Promise<SignalsListResult>;
    };

    return await repository.listSignals(filters);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readSignalById(signalId: string): Promise<SignalDetailResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      getSignalById: (id: string) => Promise<SignalDetailResult>;
    };

    return await repository.getSignalById(signalId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function createSignalRecord(input: CreateSignalInput): Promise<SignalCreateResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      createSignal: (value: CreateSignalInput) => Promise<SignalCreateResult>;
    };

    return await repository.createSignal(input);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function promoteSignalRecord(
  signalId: string,
  investigationId: string,
  actor: string | undefined,
): Promise<SignalPromoteResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      promoteSignalToInvestigation: (
        signalId: string,
        investigationId: string,
        actor?: string,
      ) => Promise<SignalPromoteResult>;
    };

    return await repository.promoteSignalToInvestigation(signalId, investigationId, actor);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function dismissSignalRecord(signalId: string, actor: string | undefined): Promise<SignalDismissResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/signals") as {
      dismissSignal: (signalId: string, actor?: string) => Promise<SignalDismissResult>;
    };

    return await repository.dismissSignal(signalId, actor);
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

export async function buildSignalsListRouteResponse(
  query: SignalsListQuery = {},
  readResult?: SignalsListResult,
): Promise<{
  status: number;
  json: SignalsListResponse;
  telemetry: SignalsListTelemetry;
}> {
  const actualReadResult = readResult ?? await readSignals(normalizeSignalFilters(query));
  const queryHasFilters = filtersApplied(query);

  if (actualReadResult.source === "db") {
    return {
      status: 200,
      json: { signals: actualReadResult.signals },
      telemetry: {
        route: "GET /signals",
        source: "db",
        signalCount: actualReadResult.signals.length,
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
      fallbackReason: actualReadResult.fallbackReason,
    },
  };
}

export async function buildSignalDetailRouteResponse(
  signalId: string,
  readResult?: SignalDetailResult,
): Promise<{
  status: number;
  json: SignalDetailResponse | { message: string };
  telemetry: SignalDetailTelemetry;
}> {
  const actualReadResult = readResult ?? await readSignalById(signalId);

  if (actualReadResult.source === "db" && actualReadResult.result === "found") {
    return {
      status: 200,
      json: { signal: actualReadResult.signal },
      telemetry: {
        route: "GET /signals/:id",
        source: "db",
        signalId,
        result: "found",
      },
    };
  }

  if (actualReadResult.source === "db") {
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
        fallbackReason: actualReadResult.fallbackReason,
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
      fallbackReason: actualReadResult.fallbackReason,
    },
  };
}

export async function buildSignalCreateRouteResponse(
  body: SignalCreateRequest,
  createResult?: SignalCreateResult,
): Promise<{
  status: number;
  json: SignalCreateResponse | { message: string };
  telemetry: SignalCreateTelemetry;
}> {
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

  const result = createResult ?? await createSignalRecord({
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

export async function buildSignalPromoteRouteResponse(
  signalId: string,
  body: SignalPromoteRequest,
  promoteResult?: SignalPromoteResult,
): Promise<{
  status: number;
  json: SignalPromoteResponse | { message: string };
  telemetry: SignalPromoteTelemetry;
}> {
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

  const result = promoteResult ?? await promoteSignalRecord(signalId, investigationId, body.actor?.trim());

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

export async function buildSignalDismissRouteResponse(
  signalId: string,
  body: SignalDismissRequest,
  dismissResult?: SignalDismissResult,
): Promise<{
  status: number;
  json: SignalDismissResponse | { message: string };
  telemetry: SignalDismissTelemetry;
}> {
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

  const result = dismissResult ?? await dismissSignalRecord(signalId, body.actor?.trim());

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
  async handler(request) {
    return await buildSignalsListRouteResponse(request.query ?? {});
  },
};

export const getSignalByIdRoute: RouteDefinition<SignalDetailResponse | { message: string }, { id: string }> = {
  method: "GET",
  path: "/signals/:id",
  async handler(request) {
    return await buildSignalDetailRouteResponse(request.body.id);
  },
};

export const postSignalCreateRoute: RouteDefinition<SignalCreateResponse | { message: string }, SignalCreateRequest> = {
  method: "POST",
  path: "/signals",
  async handler(request) {
    return await buildSignalCreateRouteResponse(request.body);
  },
};

export const postSignalPromoteRoute: RouteDefinition<SignalPromoteResponse | { message: string }, SignalPromoteRequest> = {
  method: "POST",
  path: "/signals/:id/promote",
  async handler(request) {
    return await buildSignalPromoteRouteResponse(request.body.id, request.body);
  },
};

export const postSignalDismissRoute: RouteDefinition<SignalDismissResponse | { message: string }, SignalDismissRequest> = {
  method: "POST",
  path: "/signals/:id/dismiss",
  async handler(request) {
    return await buildSignalDismissRouteResponse(request.body.id, request.body);
  },
};
