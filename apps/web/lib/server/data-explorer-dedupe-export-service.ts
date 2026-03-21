import {
  DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE,
  type DataExplorerBehaviorDedupeDropSummaryExportFormat,
  type DataExplorerBehaviorDedupeDropSummaryExportQuery,
  type DataExplorerBehaviorDedupeDropSummaryExportResult,
  type DataExplorerDedupeExportLogPayload,
  type DataExplorerPresetAuditActorType,
  type DataExplorerPresetScope,
} from "@/lib/persistence/types";
import { exportDataExplorerBehaviorDedupeDropSummarySnapshot } from "@/lib/server/data-explorer-preset-store";

interface DedupeExportActorContext {
  actorId: string | null;
  actorType: DataExplorerPresetAuditActorType;
}

export interface DataExplorerDedupeExportExecutionInput {
  scope: DataExplorerPresetScope;
  ownerId?: string;
  actor?: DedupeExportActorContext;
  query: DataExplorerBehaviorDedupeDropSummaryExportQuery;
}

export type DataExplorerDedupeExportQueryParseResult =
  | {
    ok: true;
    query: DataExplorerBehaviorDedupeDropSummaryExportQuery;
  }
  | {
    ok: false;
    status: 400;
    payload: DataExplorerBehaviorDedupeDropSummaryExportResult;
  };

export type DataExplorerDedupeExportExecutionResult =
  | {
    ok: false;
    status: number;
    payload: DataExplorerBehaviorDedupeDropSummaryExportResult;
  }
  | {
    ok: true;
    status: 200;
    content: string;
    contentType: string;
    filename: string;
  };

const dedupeExportTelemetry = {
  requests: 0,
  failures: 0,
  emptyResults: 0,
};

function parseInteger(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

function parseFormat(value: string | null): DataExplorerBehaviorDedupeDropSummaryExportFormat | null {
  if (value === null || value === "json") {
    return "json";
  }

  if (value === "csv") {
    return "csv";
  }

  return null;
}

function toStatusCode(reason?: string): number {
  switch (reason) {
    case "validation":
      return 400;
    case "read_failed":
    case "write_failed":
    case "storage_unavailable":
    case "invalid_schema":
    case "corrupt_json":
    case "unsupported_version":
      return 503;
    default:
      return 500;
  }
}

function logDedupeExport(payload: Omit<DataExplorerDedupeExportLogPayload, "layer">) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE, {
    layer: "route",
    requests: dedupeExportTelemetry.requests,
    failures: dedupeExportTelemetry.failures,
    emptyResults: dedupeExportTelemetry.emptyResults,
    ...payload,
  } satisfies DataExplorerDedupeExportLogPayload);
}

function createUnsupportedFormatFailure(): DataExplorerBehaviorDedupeDropSummaryExportResult {
  return {
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "validation",
    error: "Export format is not supported.",
  };
}

export function parseDataExplorerDedupeExportQuery(url: URL): DataExplorerDedupeExportQueryParseResult {
  const format = parseFormat(url.searchParams.get("format"));

  if (!format) {
    dedupeExportTelemetry.failures += 1;
    logDedupeExport({
      event: "failure",
      format: "json",
      reason: "validation",
      error: "Export format is not supported.",
    });

    return {
      ok: false,
      status: 400,
      payload: createUnsupportedFormatFailure(),
    };
  }

  return {
    ok: true,
    query: {
      format,
      windowMinutes: parseInteger(url.searchParams.get("windowMinutes")),
      limit: parseInteger(url.searchParams.get("limit")),
    },
  };
}

export function executeDataExplorerDedupeExport(
  input: DataExplorerDedupeExportExecutionInput,
): DataExplorerDedupeExportExecutionResult {
  dedupeExportTelemetry.requests += 1;
  logDedupeExport({
    event: "request",
    scope: input.scope,
    format: input.query.format,
    windowMinutes: input.query.windowMinutes,
    limit: input.query.limit,
  });

  const result = exportDataExplorerBehaviorDedupeDropSummarySnapshot({
    scope: input.scope,
    ownerId: input.ownerId,
    actor: input.actor,
    format: input.query.format,
    windowMinutes: input.query.windowMinutes,
    limit: input.query.limit,
  });

  if (!result.ok) {
    dedupeExportTelemetry.failures += 1;
    logDedupeExport({
      event: "failure",
      scope: input.scope,
      format: input.query.format,
      windowMinutes: input.query.windowMinutes,
      limit: input.query.limit,
      reason: result.reason,
      error: result.error,
    });

    return {
      ok: false,
      status: toStatusCode(result.reason),
      payload: result,
    };
  }

  if (!result.snapshot) {
    const payload: DataExplorerBehaviorDedupeDropSummaryExportResult = {
      ok: false,
      format: input.query.format === "csv" ? "csv" : "json",
      snapshot: null,
      filename: null,
      content: null,
      contentType: null,
      reason: "read_failed",
      error: "Data Explorer dedupe diagnostics unavailable.",
    };

    dedupeExportTelemetry.failures += 1;
    logDedupeExport({
      event: "failure",
      scope: input.scope,
      format: input.query.format,
      windowMinutes: input.query.windowMinutes,
      limit: input.query.limit,
      reason: payload.reason,
      error: payload.error,
    });

    return {
      ok: false,
      status: 503,
      payload,
    };
  }

  if (result.snapshot.summary.length === 0) {
    dedupeExportTelemetry.emptyResults += 1;
    logDedupeExport({
      event: "empty",
      scope: input.scope,
      format: input.query.format,
      windowMinutes: result.snapshot.windowMinutes,
      limit: input.query.limit,
      datasetCount: 0,
    });
  } else {
    logDedupeExport({
      event: "success",
      scope: input.scope,
      format: input.query.format,
      windowMinutes: result.snapshot.windowMinutes,
      limit: input.query.limit,
      datasetCount: result.snapshot.summary.length,
    });
  }

  const content = result.content ?? JSON.stringify(result.snapshot, null, 2);
  const contentType = result.contentType ?? "application/json; charset=utf-8";
  const filename = result.filename ?? `data-explorer-dedupe-summary.${input.query.format}`;

  return {
    ok: true,
    status: 200,
    content,
    contentType,
    filename,
  };
}
