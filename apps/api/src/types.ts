export * from "@marine/shared";

import type { OceanStationAdminAuthContext } from "@marine/shared";

// ─── API-internal: Route infrastructure ──────────────────────────────────────

export interface RouteRequest<TBody = any, TQuery = any> {
  body: TBody;
  query?: TQuery;
  params?: Record<string, string>;
  headers?: Record<string, string | undefined>;
  auth?: OceanStationAdminAuthContext;
}

export interface RouteResponse<TData> {
  status: number;
  json: TData;
  headers?: Record<string, string>;
  telemetry?: unknown;
}

export interface RouteDefinition<TResponse, TBody = any, TQuery = any> {
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  handler: (request: RouteRequest<TBody, TQuery>) => RouteResponse<TResponse> | Promise<RouteResponse<TResponse>>;
}

// ─── API-internal: Worker types ───────────────────────────────────────────────

export type WorkerJobStatus = "queued" | "noop";

export interface WorkerResult<TPayload> {
  worker: string;
  status: WorkerJobStatus;
  message: string;
  payload: TPayload;
}

export interface IngestDatasetJobInput {
  datasetId: string;
  source: string;
  requestedBy?: string;
}

export interface IngestDatasetJobPayload {
  datasetId: string;
  source: string;
  receivedAt: string;
}

export interface ComputeAnomaliesJobInput {
  regionId: string;
  datasetIds: string[];
  window: string;
}

export interface ComputeAnomaliesJobPayload {
  regionId: string;
  datasetIds: string[];
  window: string;
  analysisQueuedAt: string;
}

export interface GenerateReportJobInput {
  investigationId: string;
  reportType: string;
  requestedBy?: string;
}

export interface GenerateReportJobPayload {
  investigationId: string;
  reportType: string;
  requestedAt: string;
}
