/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  aiLabWorkspaceData,
  dashboardOverviewData,
  investigationsTimelineFallbackData,
  investigationsWorkspaceData,
  signalDetectionsFallbackData,
  speciesFallbackData,
  speciesMovementSignalsFallbackData,
  speciesSightingsFallbackData,
  oceanStationAnalytics,
  oceanStationDetails,
  oceanStationsData,
  oceanMapWorkspaceData,
  liveMarineConditionsData,
  reefStressWatchData,
} from "@/lib/api/mock-data";
import {
  buildRid,
  mapInvestigation,
  mapObservation,
  resolveInvestigationAlerts,
  resolveInvestigationSpecies,
  resolveInvestigationStations,
  resolveSpeciesObservations,
} from "@/lib/ontology/resolvers";
import type {
  SpeciesOntologyObject,
  StationOntologyObject,
} from "@/lib/ontology/types";
import type { InvestigationOntologyNetworkContext, InvestigationsWorkspaceData } from "@/lib/api/types";
import type {
  ApiKeyRecord,
  ApiUsageLogEntry,
  AnalyzeRequestBody,
  InvestigationEventCreateResponse,
  InvestigationEventCreateTelemetry,
  InvestigationTimelineResponse,
  InvestigationTimelineTelemetry,
  SignalCreateRequest,
  SignalCreateResponse,
  SignalCreateTelemetry,
  SignalDetailResponse,
  SignalDetailTelemetry,
  SignalDismissResponse,
  SignalDismissTelemetry,
  SignalPromoteResponse,
  SignalPromoteTelemetry,
  SignalsListResponse,
  SignalsListTelemetry,
  SpeciesDetailResponse,
  SpeciesDetailTelemetry,
  SpeciesListResponse,
  SpeciesListTelemetry,
  SpeciesMovementSignalsResponse,
  SpeciesMovementSignalsTelemetry,
  SpeciesSightingCreateRequest,
  SpeciesSightingCreateResponse,
  SpeciesSightingCreateTelemetry,
  SpeciesSightingsResponse,
  SpeciesSightingsTelemetry,
  DatasetDetailTelemetry,
  DatasetRecordsTelemetry,
  DatasetsTelemetry,
  OceanStationAdminTelemetry,
  OceanStationAdminAuditTelemetry,
  OceanStationAnalyticsTelemetry,
  StationAdminAuthEventsExportResponse,
  StationAdminAuthEventsExportTelemetry,
  StationAdminAuthEventsResponse,
  StationAdminAuthEventsTelemetry,
  StationAdminSecurityAlertsResponse,
  StationAdminSecurityAlertsTelemetry,
  StationAdminSecuritySummaryResponse,
  StationAdminSecuritySummaryTelemetry,
  StationAdminLoginResponse,
  StationAdminLoginTelemetry,
  StationAdminMfaVerifyResponse,
  StationAdminMfaVerifyErrorResponse,
  StationAdminMfaVerifyTelemetry,
  StationAdminLogoutResponse,
  StationAdminLogoutTelemetry,
  StationAdminRefreshResponse,
  StationAdminRefreshTelemetry,
  StationAdminRevokeMfaRequiredResponse,
  StationAdminRevokeResponse,
  StationAdminRevokeTelemetry,
  StationAdminSessionAuthTelemetry,
  StationAdminSessionsResponse,
  StationAdminSessionsTelemetry,
  StationAlertAcknowledgeResponse,
  StationAlertAcknowledgeTelemetry,
  StationEventAcknowledgeResponse,
  StationEventAcknowledgeTelemetry,
  StationPatchTelemetry,
  StationViewTrackTelemetry,
  StationEventsListTelemetry,
  StationEventDetailTelemetry,
  StationInvestigationsListTelemetry,
  StationInvestigationDetailTelemetry,
  StationEventListResponse,
  StationEventDetailResponse,
  StationInvestigationListResponse,
  StationInvestigationDetailResponse,
  MarineWorkflowEventsResponse,
  MarineWorkflowEventsTelemetry,
  MarineWorkflowInvestigationsResponse,
  MarineWorkflowInvestigationsTelemetry,
  MarineWorkflowAlertsResponse,
  MarineWorkflowAlertsTelemetry,
  MarineWorkflowCreateInvestigationResponse,
  MarineWorkflowCreateInvestigationTelemetry,
  MarineWorkflowAlertActionResponse,
  MarineWorkflowAlertActionTelemetry,
  MarineWorkflowDecisionItem,
  MarineWorkflowDecisionResponse,
  MarineWorkflowFeedbackItem,
  MarineWorkflowFeedbackRequest,
  MarineWorkflowFeedbackResponse,
  MarineWorkflowDecisionSummary,
  MarineWorkflowDecisionSummaryResponse,
  MarineWorkflowTelemetryEventItem,
  MarineWorkflowTelemetryEventRequest,
  MarineWorkflowTelemetryEventResponse,
  MarineWorkflowValidationOutcomeResponse,
  RiskEvaluationOutcomeRequest,
  RiskEvaluationRecord,
  ValidationSummaryResponse,
  LiveConditionsResponse,
  LiveConditionsTelemetry,
  ReefAlertsResponse,
  ReefAlertsTelemetry,
  SimilarInvestigation,
  SimilarInvestigationsResponse,
  SimilarInvestigationsTelemetry,
} from "@marine/shared";
import { SystemIntegrityStatus } from "@/lib/integrity-constants";
import type {
  OceanStationAdminAuthContext,
  OceanStationAdminAuditEntry,
  StationAdminAuthEvent,
  StationAdminAuthEventFilters,
  StationAdminAuthEventExportPayload,
  StationAdminAuthEventPage,
  StationAdminSecurityAlert,
  StationAdminSecuritySummary,
  OceanStationAdminBrandingPatch,
  OceanStationAdminContentPatch,
  OceanStationAdminPatch,
  OceanStationAlert,
  OceanStationAnalytics,
  OceanStationDetail,
  OceanStationViewType,
  StationAdminRequestMetadata,
  StationAdminMfaChallenge,
  StationAdminMfaEnrollmentState,
  StationAdminSessionSummary,
  StationAdminSessionsQuery,
  DataExplorerDatasetDetail,
  DataExplorerDatasetFilters,
  DataExplorerDatasetDetailFetchResult,
  DataExplorerFetchMeta,
  DataExplorerRelatedRecordsFetchResult,
  DataExplorerRelatedRecordsQuery,
  DataExplorerRelatedRecordsResult,
  DataExplorerWorkspaceFetchResult,
  InvestigationTimelineFilters,
  InvestigationTimelineItem,
  CreateSignalInput,
  PromoteSignalInput,
  CreateSpeciesSightingInput,
  RecordInvestigationEventInput,
  SignalDetection,
  SignalFilters,
  SpeciesFilters,
  SpeciesMovementSignalFilters,
  SpeciesMovementSignal,
  SpeciesProfile,
  SpeciesSighting,
  SpeciesSightingFilters,
  LiveMarineCondition,
  OperationalAlertItem,
  OperationalAlertsData,
  OperationalAlertsFallbackReason,
  OperationalAlertsFilters,
  ReefStressWatchItem,
  StationEventFilters,
  StationInvestigationFilters,
  StationEventListItem,
  StationEventDetail,
  StationInvestigationSummary,
  StationInvestigationDetail,
  MarineWorkflowAlertFilters,
  MarineWorkflowAlertItem,
  MarineWorkflowEventFilters,
  MarineWorkflowEventItem,
  MarineWorkflowInvestigationFilters,
  MarineWorkflowInvestigationItem,
} from "@/lib/api/types";
import type {
  DataExplorerBehaviorDedupeDropSummaryQuery,
  DataExplorerBehaviorDedupeDropSummaryExportQuery,
  DataExplorerDedupeExportLogPayload,
  DataExplorerBehaviorDedupeDropSummaryExportFormat,
  DataExplorerBehaviorDedupeDropSummaryExportHistoryItem,
  DataExplorerBehaviorDedupeDropSummaryExportResult,
  DataExplorerBehaviorDedupeDropSummaryExportSnapshot,
  DataExplorerBehaviorDedupeDropSummaryResult,
  DataExplorerBehaviorEventListResult,
  DataExplorerBehaviorEventType,
  DataExplorerBehaviorEventWriteResult,
  DataExplorerPresetAuditAction,
  DataExplorerPresetAuditListResult,
  DataExplorerPresetFilters,
  DataExplorerPresetMutationReason,
  DataExplorerPresetMutationResult,
  DataExplorerPresetSessionStatusResult,
  DataExplorerPresetScope,
} from "@/lib/persistence/types";
import {
  DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING,
  DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE,
} from "@/lib/persistence/types";

function nowIso() {
  return new Date().toISOString();
}

function cloneAnalytics(analytics: OceanStationAnalytics): OceanStationAnalytics {
  return {
    stationId: analytics.stationId,
    views: { ...analytics.views },
    lastViewedAt: analytics.lastViewedAt,
  };
}

function findMockStation(stationId: string): OceanStationDetail | null {
  if (oceanStationDetails[stationId]) {
    return oceanStationDetails[stationId];
  }

  return Object.values(oceanStationDetails).find((station) => station.slug === stationId) ?? null;
}

function syncMockStationSummary(station: OceanStationDetail) {
  const summaryIndex = oceanStationsData.findIndex((item) => item.id === station.id);

  if (summaryIndex === -1) {
    return;
  }

  oceanStationsData[summaryIndex] = {
    id: station.id,
    slug: station.slug,
    name: station.name,
    region: station.region,
    status: station.status,
    summary: station.summary,
    locationLabel: station.locationLabel,
    depthM: station.depthM,
    lastReported: station.lastReported,
    heroMetric: station.heroMetric,
    branding: { ...station.branding },
  };
}

function applyMockStationPatch(stationId: string, patch: OceanStationAdminPatch): OceanStationDetail | null {
  const station = findMockStation(stationId);

  if (!station) {
    return null;
  }

  if (patch.sponsorName !== undefined) {
    station.branding.sponsorName = patch.sponsorName;
  }

  if (patch.operatorName !== undefined) {
    station.branding.operatorName = patch.operatorName;
  }

  if (patch.exhibitTitle !== undefined) {
    station.branding.exhibitTitle = patch.exhibitTitle;
  }

  if (patch.publicDescription !== undefined) {
    station.branding.publicDescription = patch.publicDescription;
  }

  if (patch.accentColor !== undefined) {
    station.branding.accentColor = patch.accentColor;
  }

  if (patch.species !== undefined) {
    station.species = patch.species.map((item, index) => ({
      id: `SPC-${station.id}-${String(index + 1).padStart(3, "0")}`,
      name: item.name,
      status: item.status,
      populationTrend: item.populationTrend,
      notes: item.notes,
      observedAt: "Just now",
    }));
  }

  if (patch.alerts !== undefined) {
    station.alerts = patch.alerts.map((item, index) => ({
      id: `STA-ALT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      severity: item.severity,
      status: item.status,
      detail: item.detail,
      detectedAt: "Just now",
      acknowledgedAt: null,
      acknowledgedBy: null,
    }));
  }

  if (patch.timeline !== undefined) {
    station.timeline = patch.timeline.map((item, index) => ({
      id: `STL-${station.id}-${String(index + 1).padStart(3, "0")}`,
      label: item.label,
      phase: item.phase,
      detail: item.detail,
      happenedAt: "Just now",
    }));
  }

  if (patch.content !== undefined) {
    station.content = patch.content.map((item, index) => ({
      id: `CNT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      contentType: item.contentType,
      title: item.title,
      summary: item.summary,
      href: item.href ?? null,
      publishedAt: "Just now",
    }));
  }

  syncMockStationSummary(station);
  return station;
}

function buildFetchMeta(
  section: DataExplorerFetchMeta["section"],
  startedAtMs: number,
  options: Omit<DataExplorerFetchMeta, "section" | "startedAt" | "finishedAt" | "durationMs">,
): DataExplorerFetchMeta {
  const finishedAtMs = Date.now();

  return {
    section,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    ...options,
  };
}

function createMockAuthContext(sessionId: string): OceanStationAdminAuthContext {
  return {
    actorId: sessionId.trim() || "station-admin-dev",
    role: "admin",
    permissions: ["station.view_admin", "station.view_audit", "station.edit_branding", "station.edit_content", "station.publish"],
    csrfToken: `csrf-${sessionId.trim() || "station-admin-dev"}`,
  };
}

function ensureServerOnlyClientMethod(methodName: string) {
  if (typeof window !== "undefined") {
    throw new Error(`${methodName} is only available on the server.`);
  }
}


function logDataExplorerFetch(meta: DataExplorerFetchMeta) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(`[DataExplorer:${meta.section}]`, meta);
}

function logDataExplorerDedupeExport(payload: Omit<DataExplorerDedupeExportLogPayload, "layer">) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE, {
    layer: "client",
    ...payload,
  } satisfies DataExplorerDedupeExportLogPayload);
}

const DATA_EXPLORER_SOURCE_HEADER = "x-marine-data-source";
const DATA_EXPLORER_FALLBACK_HEADER = "x-marine-fallback-reason";

function canUseDataExplorerNetworkBoundary() {
  return typeof window !== "undefined" && typeof fetch === "function";
}

function isPresetMutationReason(value: unknown): value is DataExplorerPresetMutationReason {
  return value === "validation"
    || value === "duplicate_name"
    || value === "not_found"
    || value === "read_failed"
    || value === "write_failed"
    || value === "storage_unavailable"
    || value === "invalid_schema"
    || value === "corrupt_json"
    || value === "unsupported_version";
}

function parsePresetMutationResult(payload: unknown): DataExplorerPresetMutationResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean" || !Array.isArray(candidate.presets)) {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    presets: candidate.presets,
    reason,
    error,
  };
}

function parsePresetAuditListResult(payload: unknown): DataExplorerPresetAuditListResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean" || !Array.isArray(candidate.events)) {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    events: candidate.events,
    reason,
    error,
  };
}

function parseBehaviorEventListResult(payload: unknown): DataExplorerBehaviorEventListResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean" || !Array.isArray(candidate.events)) {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    events: candidate.events,
    reason,
    error,
  };
}

function parseBehaviorEventWriteResult(payload: unknown): DataExplorerBehaviorEventWriteResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean") {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    reason,
    error,
  };
}

function parseBehaviorDedupeDropSummaryResult(payload: unknown): DataExplorerBehaviorDedupeDropSummaryResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean"
    || !Array.isArray(candidate.summary)
    || typeof candidate.windowMinutes !== "number") {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    ok: candidate.ok,
    summary: candidate.summary as DataExplorerBehaviorDedupeDropSummaryResult["summary"],
    windowMinutes: candidate.windowMinutes,
    reason,
    error,
  };
}

function parseBehaviorDedupeDropSummaryExportSnapshot(
  payload: unknown,
): DataExplorerBehaviorDedupeDropSummaryExportSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (candidate.schemaVersion !== 1
    || typeof candidate.exportedAt !== "string"
    || typeof candidate.windowMinutes !== "number"
    || typeof candidate.totalDatasets !== "number"
    || !Array.isArray(candidate.summary)
    || !candidate.provenance
    || (candidate.scope !== "shared" && candidate.scope !== "personal")) {
    return null;
  }

  const provenance = candidate.provenance as Record<string, unknown>;

  if (provenance.source !== "repository"
    || provenance.route !== "/api/data-explorer/activity/dedupe-summary/export"
    || !provenance.ordering
    || !provenance.requestedBy
    || !Array.isArray(provenance.exportHistory)
    || (provenance.requestedFormat !== "json" && provenance.requestedFormat !== "csv")) {
    return null;
  }

  const ordering = provenance.ordering as Record<string, unknown>;
  const requestedBy = provenance.requestedBy as Record<string, unknown>;

  if (ordering.primary !== DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.primary
    || ordering.secondary !== DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.secondary
    || (requestedBy.actorType !== "station_admin" && requestedBy.actorType !== "unknown")) {
    return null;
  }

  return {
    schemaVersion: 1,
    exportedAt: candidate.exportedAt,
    scope: candidate.scope as DataExplorerBehaviorDedupeDropSummaryExportSnapshot["scope"],
    windowMinutes: candidate.windowMinutes,
    totalDatasets: candidate.totalDatasets,
    summary: candidate.summary as DataExplorerBehaviorDedupeDropSummaryExportSnapshot["summary"],
    provenance: {
      source: "repository",
      route: "/api/data-explorer/activity/dedupe-summary/export",
      requestedFormat: provenance.requestedFormat as DataExplorerBehaviorDedupeDropSummaryExportFormat,
      ...(typeof provenance.requestedLimit === "number" ? { requestedLimit: provenance.requestedLimit } : {}),
      ordering: {
        primary: DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.primary,
        secondary: DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.secondary,
      },
      requestedBy: {
        actorId: typeof requestedBy.actorId === "string" ? requestedBy.actorId : null,
        actorType: requestedBy.actorType as DataExplorerBehaviorDedupeDropSummaryExportSnapshot["provenance"]["requestedBy"]["actorType"],
        ownerId: typeof requestedBy.ownerId === "string" ? requestedBy.ownerId : null,
      },
      exportHistory: provenance.exportHistory as DataExplorerBehaviorDedupeDropSummaryExportHistoryItem[],
    },
  };
}

function parseBehaviorDedupeDropSummaryExportFailure(
  payload: unknown,
): Pick<DataExplorerBehaviorDedupeDropSummaryExportResult, "reason" | "error"> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (candidate.ok !== false) {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  return {
    reason,
    error,
  };
}

function parseContentDispositionFilename(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = /filename=\"?([^\";]+)\"?/i.exec(value);

  if (!match || !match[1]) {
    return null;
  }

  const filename = match[1].trim();
  return filename || null;
}

function parsePresetSessionStatusResult(payload: unknown): DataExplorerPresetSessionStatusResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.ok !== "boolean") {
    return null;
  }

  const reason = isPresetMutationReason(candidate.reason)
    ? candidate.reason
    : undefined;
  const error = typeof candidate.error === "string"
    ? candidate.error
    : undefined;

  if (!candidate.ok) {
    return {
      ok: false,
      status: null,
      reason,
      error,
    };
  }

  const status = candidate.status;

  if (!status || typeof status !== "object") {
    return null;
  }

  const statusRecord = status as Record<string, unknown>;

  if (typeof statusRecord.sessionActive !== "boolean"
    || typeof statusRecord.personalScopeAvailable !== "boolean") {
    return null;
  }

  const actorLabel = typeof statusRecord.actorLabel === "string"
    ? statusRecord.actorLabel
    : null;

  return {
    ok: true,
    status: {
      sessionActive: statusRecord.sessionActive,
      actorLabel,
      personalScopeAvailable: statusRecord.personalScopeAvailable,
    },
  };
}

function buildPresetScopeUrl(scope: DataExplorerPresetScope, path = "/api/data-explorer/presets") {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("scope", scope);
  return `${url.pathname}${url.search}`;
}

function buildPresetScopeHeaders(): HeadersInit {
  return {
    Accept: "application/json",
  };
}

function createPresetStoreUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerPresetMutationResult {
  return {
    ok: false,
    presets: [],
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal preset store unavailable."
      : "Shared preset store unavailable.",
  };
}

function createPresetAuditStoreUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerPresetAuditListResult {
  return {
    ok: false,
    events: [],
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal preset audit store unavailable."
      : "Shared preset audit store unavailable.",
  };
}

function createBehaviorStoreUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerBehaviorEventListResult {
  return {
    ok: false,
    events: [],
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal activity store unavailable."
      : "Shared activity store unavailable.",
  };
}

function createBehaviorWriteUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerBehaviorEventWriteResult {
  return {
    ok: false,
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal activity write unavailable."
      : "Shared activity write unavailable.",
  };
}

function createBehaviorDedupeDropSummaryUnavailableResult(
  scope: DataExplorerPresetScope,
): DataExplorerBehaviorDedupeDropSummaryResult {
  return {
    ok: false,
    summary: [],
    windowMinutes: 60,
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal dedupe diagnostics unavailable."
      : "Shared dedupe diagnostics unavailable.",
  };
}

function createBehaviorDedupeDropSummaryExportUnavailableResult(
  scope: DataExplorerPresetScope,
  format: DataExplorerBehaviorDedupeDropSummaryExportFormat = "json",
): DataExplorerBehaviorDedupeDropSummaryExportResult {
  return {
    ok: false,
    format,
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "storage_unavailable",
    error: scope === "personal"
      ? "Personal dedupe diagnostics export unavailable."
      : "Shared dedupe diagnostics export unavailable.",
  };
}

function isCsvContentType(value: string | null): boolean {
  return typeof value === "string" && value.toLowerCase().includes("text/csv");
}

function isJsonContentType(value: string | null): boolean {
  return typeof value === "string" && value.toLowerCase().includes("application/json");
}

function createPresetSessionStatusUnavailableResult(): DataExplorerPresetSessionStatusResult {
  return {
    ok: false,
    status: null,
    reason: "storage_unavailable",
    error: "Preset session status unavailable.",
  };
}

function toDataExplorerFetchSource(value: string | null): DataExplorerFetchMeta["source"] {
  return value === "db" || value === "mock" ? value : undefined;
}

function toDataExplorerFallbackReason(
  value: string | null,
): DataExplorerFetchMeta["fallbackReason"] {
  return value === "db_path_missing" || value === "db_open_failed" || value === "db_query_failed"
    ? value
    : undefined;
}

function createDataExplorerHeaderMeta(response: Response): {
  source?: DataExplorerFetchMeta["source"];
  fallbackReason?: DataExplorerFetchMeta["fallbackReason"];
} {
  return {
    source: toDataExplorerFetchSource(response.headers.get(DATA_EXPLORER_SOURCE_HEADER)),
    fallbackReason: toDataExplorerFallbackReason(response.headers.get(DATA_EXPLORER_FALLBACK_HEADER)),
  };
}

function appendDataExplorerQuery(
  searchParams: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined || value === "") {
    return;
  }

  searchParams.set(key, String(value));
}

type HandlerResult<TJson, TTelemetry> = {
  status: number;
  json: TJson;
  telemetry?: TTelemetry;
};

type AuthMutationResult<TData> =
  | { ok: true; status: number; data: TData }
  | { ok: false; status: number; message: string };

type RevokeSessionResult =
  | { ok: true; status: number }
  | {
      ok: false;
      status: number;
      message: string;
      mfaRequired: true;
      challenge: StationAdminMfaChallenge;
    }
  | {
      ok: false;
      status: number;
      message: string;
      mfaRequired?: false;
    };

interface OperationalAlertsRouteResponseItem {
  id: string;
  source: string;
  rule_type: string;
  severity: string;
  status: string;
  lifecycle_status?: string;
  title: string;
  detail: string | null;
  detected_at: number;
  resolved_at: number | null;
  validation_state?: string;
  created_at: string;
  updated_at: string;
}

interface OperationalAlertsRouteResponse {
  source: "db" | "unavailable";
  fallback_reason: OperationalAlertsFallbackReason | null;
  generated_at: string;
  system_integrity?: string;
  summary: {
    active_alert_count: number;
    critical_count: number;
    warning_count: number;
    info_count: number;
    failed_source_count: number;
    stale_source_count: number;
    last_updated_at: string;
  };
  active_alerts: OperationalAlertsRouteResponseItem[];
  recent_history: OperationalAlertsRouteResponseItem[];
}

function mapOperationalAlertsItem(item: OperationalAlertsRouteResponseItem): OperationalAlertItem {
  return {
    id: item.id,
    source: item.source,
    ruleType: item.rule_type as OperationalAlertItem["ruleType"],
    severity: item.severity as OperationalAlertItem["severity"],
    status: item.status as OperationalAlertItem["status"],
    lifecycleStatus: (item.lifecycle_status as OperationalAlertItem["lifecycleStatus"]) ?? "open",
    title: item.title,
    detail: item.detail,
    detectedAt: item.detected_at,
    resolvedAt: item.resolved_at,
    validationState: item.validation_state,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function buildOperationalAlertsFallback(reason: OperationalAlertsFallbackReason = "db_query_failed"): OperationalAlertsData {
  const generatedAt = nowIso();

  return {
    source: "unavailable",
    fallbackReason: reason,
    generatedAt,
    systemIntegrity: SystemIntegrityStatus.TRUST_BLOCKED,
    summary: {
      activeAlertCount: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      failedSourceCount: 0,
      staleSourceCount: 0,
      lastUpdatedAt: generatedAt,
    },
    activeAlerts: [],
    recentHistory: [],
  };
}

function readRouteErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallbackMessage;
}

function normalizeDatasetFilters(filters: DataExplorerDatasetFilters = {}): DataExplorerDatasetFilters {
  return {
    q: filters.q?.trim() || undefined,
    category: filters.category?.trim() || undefined,
    region: filters.region?.trim() || undefined,
    status: filters.status?.trim() || undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

// ─── Ontology network builder ─────────────────────────────────────────────────
//
// Resolves Species, Stations, Observations, and Alerts for the active
// investigation using the ontology resolver layer. All calls are pure —
// no DB access, deterministic output.

function buildInvestigationOntologyNetwork(
  workspace: Pick<InvestigationsWorkspaceData, "analysisTracks" | "speciesSummary">,
): InvestigationOntologyNetworkContext {
  const activeTrack = workspace.analysisTracks[0];

  if (!activeTrack) {
    return {
      investigation: null,
      species: [],
      stations: [],
      observations: [],
      alerts: [],
      resolvedAt: new Date().toISOString(),
    };
  }

  const investigation = mapInvestigation(activeTrack);

  // Map species from the investigation species summary entries
  const entries = workspace.speciesSummary?.entries ?? [];
  const allSpecies: SpeciesOntologyObject[] = entries.map((entry) => ({
    __type: "Species" as const,
    __rid: buildRid("Species", entry.speciesId),
    __primaryKey: entry.speciesId,
    commonName: entry.commonName,
    scientificName: entry.scientificName,
    conservationStatus: "data_deficient",
    habitatRegion: "Active investigation zone",
    summary: `${entry.movementSignalCount} movement signal(s) · ${entry.verifiedSightingCount} verified sighting(s)`,
    createdAt: entry.lastObservedAt ?? new Date().toISOString(),
    updatedAt: entry.lastObservedAt ?? new Date().toISOString(),
  }));

  const correlatedSpeciesIds = entries.map((e) => e.speciesId);
  const species = resolveInvestigationSpecies(correlatedSpeciesIds, allSpecies);

  // Derive stations from live marine conditions — active monitoring buoys
  // reporting during the investigation window
  const uniqueStationIds = [...new Set(liveMarineConditionsData.map((c) => c.stationId))];
  const allStations: StationOntologyObject[] = uniqueStationIds.map((id) => ({
    __type: "Station" as const,
    __rid: buildRid("Station", id),
    __primaryKey: id,
    slug: `buoy-${id.toLowerCase()}`,
    name: `NDBC Buoy ${id}`,
    region: id === "46042" ? "North Pacific" : "South Atlantic",
    status: "active",
    summary: "Active monitoring buoy — reporting during investigation window",
    locationLabel: id,
    depthM: null,
  }));

  const stations = resolveInvestigationStations(uniqueStationIds, allStations);

  // Resolve observations at the linked station IDs via the species sighting chain
  const allObservations = liveMarineConditionsData.map(mapObservation);
  const observations = resolveSpeciesObservations(uniqueStationIds, allObservations);

  // Alerts linked to this investigation (empty until workspace exposes
  // individual alert object IDs with linkedInvestigationId populated)
  const alerts = resolveInvestigationAlerts(investigation.__primaryKey, []);

  return {
    investigation,
    species,
    stations,
    observations,
    alerts,
    resolvedAt: new Date().toISOString(),
  };
}


export const apiClient = {
  stationAdminAuth: {
    async getSession(sessionId: string): Promise<OceanStationAdminAuthContext | null> {
      const normalizedSessionId = sessionId.trim();

      if (!normalizedSessionId) {
        return null;
      }

      return createMockAuthContext(normalizedSessionId);
    },

    async login(
      actorId: string,
      password: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<AuthMutationResult<StationAdminLoginResponse>> {
      if (!actorId.trim() || !password.trim()) {
        return {
          ok: false,
          status: 400,
          message: "Authentication failed",
        };
      }

      return {
        ok: true,
        status: 200,
        data: {
          sessionId: `sess-${actorId.trim()}`,
          csrfToken: `csrf-${actorId.trim()}`,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
          actorId: actorId.trim(),
          role: "admin",
          permissions: createMockAuthContext(actorId.trim()).permissions,
        },
      };
    },

    async verifyMfaChallenge(
      challengeId: string,
      options: {
        code?: string;
        recoveryCode?: string;
        sessionId?: string;
        csrfToken?: string;
        metadata?: StationAdminRequestMetadata;
      },
    ): Promise<
      | { ok: true; status: number; data: StationAdminMfaVerifyResponse }
      | { ok: false; status: number; message: string; error?: StationAdminMfaVerifyErrorResponse }
    > {
      if (!challengeId.trim() || (!options.code?.trim() && !options.recoveryCode?.trim())) {
        return {
          ok: false,
          status: 400,
          message: "MFA verification failed",
        };
      }

      return {
        ok: true,
        status: 200,
        data: {
          result: "verified",
          challengePurpose: "login",
          actorId: options.sessionId?.trim() || "station-admin-dev",
          mfa: {
            enabled: true,
            enrolledAt: nowIso(),
            lastVerifiedAt: nowIso(),
            recoveryCodesRemaining: 3,
          },
        },
      };
    },

    async logout(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<boolean> {
      return Boolean(sessionId.trim() && csrfToken.trim());
    },

    async refreshSession(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<{ sessionId: string; csrfToken: string; expiresAt: string } | null> {
      if (!sessionId.trim() || !csrfToken.trim()) {
        return null;
      }

      return {
        sessionId: sessionId.trim(),
        csrfToken: csrfToken.trim(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      };
    },

    async revokeSession(
      sessionId: string,
      csrfToken: string,
      targetSessionId: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<RevokeSessionResult> {
      if (!sessionId.trim() || !csrfToken.trim() || !targetSessionId.trim()) {
        return { ok: false, status: 400, message: "Revoke failed", mfaRequired: false };
      }

      return { ok: true, status: 200 };
    },

    async getEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEvent[] | null> {
      const page = await apiClient.stationAdminAuth.queryEvents(filters, auth);

      return page?.events ?? null;
    },

    async queryEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEventPage | null> {
      return { events: [], nextCursor: null };
    },

    async exportEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEventExportPayload | null> {
      return {
        format: "json",
        fileName: "station-admin-auth-events.json",
        exportedAt: nowIso(),
        filters,
        events: [],
      };
    },

    async getSessions(
      query: StationAdminSessionsQuery = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSessionSummary[] | null> {
      if (!auth) {
        return [];
      }

      return [{
        id: `sess-${auth.actorId}`,
        actorId: auth.actorId,
        actorRole: auth.role,
        issuedAt: nowIso(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        lastActiveAt: nowIso(),
        ip: null,
        userAgent: null,
        source: "web",
      }];
    },

    async getSecuritySummary(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecuritySummary | null> {
      return {
        activeSessionCount: auth ? 1 : 0,
        loginSuccessCount24h: auth ? 1 : 0,
        loginFailureCount24h: 0,
        lockoutCount24h: 0,
        revokeCount24h: 0,
        uniqueIpCount24h: 0,
        lastEventAt: auth ? nowIso() : null,
      };
    },

    async getSecurityAlerts(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecurityAlert[] | null> {
      return [];
    },
  },
  stationAdminMfa: {
    async enrollStart(
      sessionId: string,
      csrfToken: string,
    ): Promise<{ ok: true; qrCodeUri: string; secret: string } | { ok: false; status: number; message: string }> {
      if (!sessionId.trim() || !csrfToken.trim()) {
        return { ok: false, status: 400, message: "Enrollment start failed" };
      }

      return { ok: true, qrCodeUri: "otpauth://totp/marine:station-admin?secret=TESTSECRET", secret: "TESTSECRET" };
    },

    async enrollVerify(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string }
    > {
      if (!sessionId.trim() || !csrfToken.trim() || !totpCode.trim()) {
        return { ok: false, status: 400, message: "Enrollment verification failed" };
      }

      return {
        ok: true,
        mfa: {
          enabled: true,
          enrolledAt: nowIso(),
          lastVerifiedAt: nowIso(),
          recoveryCodesRemaining: 3,
        },
        recoveryCodes: ["RECOVERY-1", "RECOVERY-2", "RECOVERY-3"],
      };
    },

    async recoveryRegenerate(
      sessionId: string,
      csrfToken: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      if (!sessionId.trim() || !csrfToken.trim()) {
        return { ok: false, status: 400, message: "Recovery code regeneration failed" };
      }

      return {
        ok: true,
        mfa: {
          enabled: true,
          enrolledAt: nowIso(),
          lastVerifiedAt: nowIso(),
          recoveryCodesRemaining: 3,
        },
        recoveryCodes: ["RECOVERY-NEW-1", "RECOVERY-NEW-2", "RECOVERY-NEW-3"],
      };
    },

    async disable(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      if (!sessionId.trim() || !csrfToken.trim() || !totpCode.trim()) {
        return { ok: false, status: 400, message: "MFA disable failed" };
      }

      return { ok: true };
    },
  },

  dashboard: {
    async getOverview() {
      return dashboardOverviewData;
    },
  },
  liveConditions: {
    async getLatest(): Promise<LiveMarineCondition[]> {
      return liveMarineConditionsData;
    },
  },
  reefAlerts: {
    async getLatest(): Promise<ReefStressWatchItem[]> {
      return reefStressWatchData;
    },
  },
  ingestionOperations: {
    async getOperationalAlerts(filters: OperationalAlertsFilters = {}): Promise<OperationalAlertsData> {
      try {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.source) params.set("source", filters.source);
        if (filters.ruleType) params.set("ruleType", filters.ruleType);
        if (filters.limit) params.set("limit", String(filters.limit));

        const response = await fetch(`/operational-alerts?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          return buildOperationalAlertsFallback("db_query_failed");
        }

        const data = await response.json();
        const SIS = SystemIntegrityStatus;

        return {
          source: data.source === "db" ? "db" : "unavailable",
          fallbackReason: data.fallback_reason ?? null,
          generatedAt: data.generated_at ?? new Date().toISOString(),
          systemIntegrity: (data.system_integrity as SystemIntegrityStatus) ?? SIS.TRUST_BLOCKED,
          summary: {
            activeAlertCount: Number(data.summary?.active_alert_count ?? 0),
            criticalCount: Number(data.summary?.critical_count ?? 0),
            warningCount: Number(data.summary?.warning_count ?? 0),
            infoCount: Number(data.summary?.info_count ?? 0),
            failedSourceCount: Number(data.summary?.failed_source_count ?? 0),
            staleSourceCount: Number(data.summary?.stale_source_count ?? 0),
            lastUpdatedAt: data.summary?.last_updated_at ?? new Date().toISOString(),
          },
          activeAlerts: (data.active_alerts ?? []).map(mapOperationalAlertsItem),
          recentHistory: (data.recent_history ?? []).map(mapOperationalAlertsItem),
        };
      } catch {
        return buildOperationalAlertsFallback("db_query_failed");
      }
    },
  },
  investigations: {
    async getWorkspace() {
      return {
        ...investigationsWorkspaceData,
        timeline: investigationsTimelineFallbackData,
        ontologyNetwork: buildInvestigationOntologyNetwork(investigationsWorkspaceData),
      };
    },

    async getTimeline(
      investigationId: string,
      filters: InvestigationTimelineFilters = {},
    ): Promise<InvestigationTimelineItem[]> {
      const eventType = filters.eventType;
      const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
      const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
      const filtered = eventType
        ? investigationsTimelineFallbackData.filter((item) => item.eventType === eventType)
        : investigationsTimelineFallbackData;

      return filtered.slice(0, boundedLimit);
    },

    async recordEvent(
      investigationId: string,
      input: RecordInvestigationEventInput,
    ): Promise<InvestigationTimelineItem | null> {
      return {
        id: `evt-${investigationId}-${Date.now()}`,
        timestamp: nowIso(),
        eventType: input.eventType,
        source: input.source,
        summary: input.summary,
        detail: input.detail ?? undefined,
      };
    },

    async findSimilar(investigationId: string): Promise<SimilarInvestigation[]> {
      const id = investigationId.trim();

      if (!id) {
        return [];
      }

      const demoFlag =
        typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1"
          ? "&demo=1"
          : "";

      const response = await fetch(
        `/api/marine-intelligence/investigations/similar?id=${encodeURIComponent(id)}${demoFlag}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        },
      );
      const payload = await response.json() as SimilarInvestigationsResponse | { message?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Similarity request failed.",
        );
      }

      if (Array.isArray((payload as SimilarInvestigationsResponse).investigations)) {
        return (payload as SimilarInvestigationsResponse).investigations;
      }

      throw new Error("Similarity request returned an invalid payload.");
    },
  },
  signals: {
    async list(filters: SignalFilters = {}): Promise<SignalDetection[]> {
      const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
      const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

      return signalDetectionsFallbackData
        .filter((signal) => {
          if (filters.signalType && signal.signalType !== filters.signalType) {
            return false;
          }

          if (filters.severity && signal.severity !== filters.severity) {
            return false;
          }

          if (filters.status && signal.status !== filters.status) {
            return false;
          }

          if (filters.region && signal.region.toLowerCase() !== filters.region.trim().toLowerCase()) {
            return false;
          }

          if (filters.stationId && signal.stationId !== filters.stationId) {
            return false;
          }

          return true;
        })
        .sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime())
        .slice(0, boundedLimit);
    },

    async getById(signalId: string): Promise<SignalDetection | null> {
      return signalDetectionsFallbackData.find((signal) => signal.id === signalId) ?? null;
    },

    async create(input: CreateSignalInput): Promise<SignalDetection | null> {
      return null;
    },

    async promote(signalId: string, input: PromoteSignalInput): Promise<SignalDetection | null> {
      return signalDetectionsFallbackData.find((signal) => signal.id === signalId) ?? null;
    },

    async dismiss(signalId: string, actor?: string): Promise<SignalDetection | null> {
      return signalDetectionsFallbackData.find((signal) => signal.id === signalId) ?? null;
    },
  },
  species: {
    async list(filters: SpeciesFilters = {}): Promise<SpeciesProfile[]> {
      const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
      const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

      return speciesFallbackData
        .filter((species) => {
          if (filters.region && species.habitatRegion.toLowerCase() !== filters.region.trim().toLowerCase()) {
            return false;
          }

          if (filters.conservationStatus && species.conservationStatus !== filters.conservationStatus) {
            return false;
          }

          return true;
        })
        .slice(0, boundedLimit);
    },

    async getById(speciesId: string): Promise<SpeciesProfile | null> {
      return speciesFallbackData.find((species) => species.id === speciesId) ?? null;
    },

    async listSightings(filters: SpeciesSightingFilters = {}): Promise<SpeciesSighting[]> {
      if (filters.speciesId) {
        const bySpecies = await apiClient.species.getSightingsBySpecies(filters.speciesId, {
          region: filters.region,
          stationId: filters.stationId,
          verificationStatus: filters.verificationStatus,
          limit: filters.limit,
        });

        return bySpecies ?? [];
      }

      const species = await apiClient.species.list({ limit: 25 });

      if (species.length === 0) {
        return [];
      }

      const sightingsGroups = await Promise.all(
        species.map((entry) =>
          apiClient.species.getSightingsBySpecies(entry.id, {
            region: filters.region,
            stationId: filters.stationId,
            verificationStatus: filters.verificationStatus,
            limit: filters.limit ?? 8,
          }),
        ),
      );

      const merged = sightingsGroups
        .flatMap((group) => group ?? [])
        .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime());

      const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
      const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

      return merged.slice(0, boundedLimit);
    },

    async getSightingsBySpecies(
      speciesId: string,
      filters: Omit<SpeciesSightingFilters, "speciesId"> = {},
    ): Promise<SpeciesSighting[] | null> {
      const species = speciesFallbackData.find((entry) => entry.id === speciesId);

      if (!species) {
        return null;
      }

      const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
      const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

      return speciesSightingsFallbackData
        .filter((sighting) => sighting.speciesId === speciesId)
        .slice(0, boundedLimit);
    },

    async createSighting(
      input: CreateSpeciesSightingInput,
      auth?: OceanStationAdminAuthContext,
    ): Promise<SpeciesSighting | null> {
      return null;
    },

    async listMovementSignals(
      speciesId: string,
      filters: SpeciesMovementSignalFilters = {},
    ): Promise<SpeciesMovementSignal[] | null> {
      const species = speciesFallbackData.find((entry) => entry.id === speciesId);

      if (!species) {
        return null;
      }

      return speciesMovementSignalsFallbackData.filter((signal) => signal.speciesId === speciesId);
    },

    getFallbackSpecies(): SpeciesProfile[] {
      return speciesFallbackData;
    },

    getFallbackSightings(): SpeciesSighting[] {
      return speciesSightingsFallbackData;
    },

    getFallbackMovementSignals(): SpeciesMovementSignal[] {
      return speciesMovementSignalsFallbackData;
    },
  },
  dataExplorer: {
    async getWorkspace(filters?: DataExplorerDatasetFilters): Promise<DataExplorerWorkspaceFetchResult> {
      const startedAtMs = Date.now();
      try {
        const response = await fetch("/v1/explorer/query", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(filters ?? {}),
        });
        const payload = await response.json();
        if (response.ok && payload && payload.datasets) {
          const result = {
            data: payload,
            meta: buildFetchMeta("workspace", startedAtMs, {
              state: "success",
              delivery: "real_backend",
              source: "db",
              fallbackReason: undefined,
            }),
          } satisfies DataExplorerWorkspaceFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }
        throw new Error("Backend workspace response was not in the expected shape.");
      } catch (error) {
        const result = {
          data: null,
          meta: buildFetchMeta("workspace", startedAtMs, {
            state: "error",
            delivery: "real_backend",
            source: undefined,
            fallbackReason: undefined,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async getDatasetDetail(datasetId: string): Promise<DataExplorerDatasetDetailFetchResult> {
      const startedAtMs = Date.now();
      try {
        const response = await fetch(`/v1/explorer/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ datasetId }),
        });
        const payload = await response.json();
        if (response.ok && payload && payload.id) {
          const result = {
            data: payload,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "real_backend",
              source: "db",
              fallbackReason: undefined,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }
        throw new Error("Backend detail response was not in the expected shape.");
      } catch (error) {
        const result = {
          data: null,
          meta: buildFetchMeta("detail", startedAtMs, {
            state: "error",
            datasetId,
            delivery: "real_backend",
            source: undefined,
            fallbackReason: undefined,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          }),
        } satisfies DataExplorerDatasetDetailFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async getDatasetRecords(
      datasetId: string,
      query?: DataExplorerRelatedRecordsQuery,
    ): Promise<DataExplorerRelatedRecordsFetchResult> {
      const startedAtMs = Date.now();
      try {
        const response = await fetch(`/v1/explorer/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ datasetId, ...query }),
        });
        const payload = await response.json();
        if (response.ok && payload && payload.records) {
          const result = {
            data: payload,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "real_backend",
              source: "db",
              fallbackReason: undefined,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }
        throw new Error("Backend records response was not in the expected shape.");
      } catch (error) {
        const result = {
          data: null,
          meta: buildFetchMeta("records", startedAtMs, {
            state: "error",
            datasetId,
            delivery: "real_backend",
            source: undefined,
            fallbackReason: undefined,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          }),
        } satisfies DataExplorerRelatedRecordsFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async listPresetAuditEvents(options?: {
      scope?: DataExplorerPresetScope;
      presetId?: string;
      actorId?: string;
      action?: DataExplorerPresetAuditAction;
      limit?: number;
    }): Promise<DataExplorerPresetAuditListResult> {
      const scope = options?.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetAuditStoreUnavailableResult(scope);
      }

      try {
        const url = new URL("/api/data-explorer/presets/audit", "http://localhost");
        url.searchParams.set("scope", scope);

        if (options?.presetId) {
          url.searchParams.set("presetId", options.presetId);
        }

        if (options?.actorId) {
          url.searchParams.set("actorId", options.actorId);
        }

        if (options?.action) {
          url.searchParams.set("action", options.action);
        }

        if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
          url.searchParams.set("limit", String(Math.floor(options.limit)));
        }

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parsePresetAuditListResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetAuditStoreUnavailableResult(scope);
    },
    async getPresetSessionStatus(): Promise<DataExplorerPresetSessionStatusResult> {
      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetSessionStatusUnavailableResult();
      }

      try {
        const response = await fetch("/api/data-explorer/presets/session-status", {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parsePresetSessionStatusResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetSessionStatusUnavailableResult();
    },
    async listBehaviorEvents(options?: {
      scope?: DataExplorerPresetScope;
      limit?: number;
    }): Promise<DataExplorerBehaviorEventListResult> {
      const scope = options?.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createBehaviorStoreUnavailableResult(scope);
      }

      try {
        const url = new URL("/api/data-explorer/activity", "http://localhost");
        url.searchParams.set("scope", scope);

        if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
          url.searchParams.set("limit", String(Math.floor(options.limit)));
        }

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parseBehaviorEventListResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createBehaviorStoreUnavailableResult(scope);
    },
    async listBehaviorDedupeDropSummary(options?: DataExplorerBehaviorDedupeDropSummaryQuery): Promise<DataExplorerBehaviorDedupeDropSummaryResult> {
      const scope = options?.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createBehaviorDedupeDropSummaryUnavailableResult(scope);
      }

      try {
        const url = new URL("/api/data-explorer/activity/dedupe-summary", "http://localhost");
        url.searchParams.set("scope", scope);

        if (typeof options?.windowMinutes === "number" && Number.isFinite(options.windowMinutes)) {
          url.searchParams.set("windowMinutes", String(Math.floor(options.windowMinutes)));
        }

        if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
          url.searchParams.set("limit", String(Math.floor(options.limit)));
        }

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parseBehaviorDedupeDropSummaryResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createBehaviorDedupeDropSummaryUnavailableResult(scope);
    },
    async exportBehaviorDedupeSummary(options?: DataExplorerBehaviorDedupeDropSummaryExportQuery): Promise<DataExplorerBehaviorDedupeDropSummaryExportResult> {
      const scope = options?.scope ?? "shared";
      const format = options?.format === "csv" ? "csv" : "json";

      logDataExplorerDedupeExport({
        event: "request",
        scope,
        format,
        windowMinutes: options?.windowMinutes,
        limit: options?.limit,
      });

      if (!canUseDataExplorerNetworkBoundary()) {
        logDataExplorerDedupeExport({
          event: "failure",
          scope,
          format,
          windowMinutes: options?.windowMinutes,
          limit: options?.limit,
          reason: "storage_unavailable",
          error: "Data Explorer dedupe diagnostics export unavailable.",
        });
        return createBehaviorDedupeDropSummaryExportUnavailableResult(scope, format);
      }

      try {
        const url = new URL("/api/data-explorer/activity/dedupe-summary/export", "http://localhost");
        url.searchParams.set("scope", scope);

        if (format === "csv") {
          url.searchParams.set("format", format);
        }

        if (typeof options?.windowMinutes === "number" && Number.isFinite(options.windowMinutes)) {
          url.searchParams.set("windowMinutes", String(Math.floor(options.windowMinutes)));
        }

        if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
          url.searchParams.set("limit", String(Math.floor(options.limit)));
        }

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });

        if (!response.ok) {
          const errorPayload = parseBehaviorDedupeDropSummaryExportFailure(await response.json());

          if (errorPayload) {
            logDataExplorerDedupeExport({
              event: "failure",
              scope,
              format,
              windowMinutes: options?.windowMinutes,
              limit: options?.limit,
              reason: errorPayload.reason,
              error: errorPayload.error,
            });
            return {
              ok: false,
              format,
              snapshot: null,
              filename: null,
              content: null,
              contentType: null,
              reason: errorPayload.reason,
              error: errorPayload.error,
            };
          }

          logDataExplorerDedupeExport({
            event: "failure",
            scope,
            format,
            windowMinutes: options?.windowMinutes,
            limit: options?.limit,
            reason: "storage_unavailable",
            error: "Data Explorer dedupe diagnostics export unavailable.",
          });
          return createBehaviorDedupeDropSummaryExportUnavailableResult(scope, format);
        }

        const contentDispositionFilename = parseContentDispositionFilename(response.headers.get("content-disposition"));
        const contentType = response.headers.get("content-type");

        if (isCsvContentType(contentType)) {
          const content = await response.text();

          logDataExplorerDedupeExport({
            event: "success",
            scope,
            format: "csv",
            windowMinutes: options?.windowMinutes,
            limit: options?.limit,
          });

          return {
            ok: true,
            format: "csv",
            snapshot: null,
            filename: contentDispositionFilename ?? `data-explorer-dedupe-summary-${scope}.csv`,
            content,
            contentType,
          };
        }

        if (isJsonContentType(contentType)) {
          const snapshot = parseBehaviorDedupeDropSummaryExportSnapshot(await response.json());

          if (snapshot) {
            logDataExplorerDedupeExport({
              event: snapshot.summary.length === 0 ? "empty" : "success",
              scope,
              format: "json",
              windowMinutes: snapshot.windowMinutes,
              limit: options?.limit,
              datasetCount: snapshot.summary.length,
            });
            return {
              ok: true,
              format: "json",
              snapshot,
              filename: contentDispositionFilename ?? `data-explorer-dedupe-summary-${scope}.json`,
              content: JSON.stringify(snapshot, null, 2),
              contentType,
            };
          }
        }
      } catch {
        // fall through
      }

      logDataExplorerDedupeExport({
        event: "failure",
        scope,
        format,
        windowMinutes: options?.windowMinutes,
        limit: options?.limit,
        reason: "storage_unavailable",
        error: "Data Explorer dedupe diagnostics export unavailable.",
      });

      return createBehaviorDedupeDropSummaryExportUnavailableResult(scope, format);
    },
    async writeBehaviorEvent(input: {
      eventType: DataExplorerBehaviorEventType;
      scope?: DataExplorerPresetScope;
      presetId?: string;
      presetName?: string;
      datasetId?: string;
      datasetName?: string;
      sourceContext?: Record<string, unknown>;
    }): Promise<DataExplorerBehaviorEventWriteResult> {
      const scope = input.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createBehaviorWriteUnavailableResult(scope);
      }

      try {
        const url = new URL("/api/data-explorer/activity", "http://localhost");
        url.searchParams.set("scope", scope);

        const response = await fetch(`${url.pathname}${url.search}`, {
          method: "POST",
          headers: {
            ...buildPresetScopeHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        const payload = parseBehaviorEventWriteResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createBehaviorWriteUnavailableResult(scope);
    },
    async listPresets(scope: DataExplorerPresetScope = "shared"): Promise<DataExplorerPresetMutationResult> {
      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(buildPresetScopeUrl(scope), {
          method: "GET",
          headers: buildPresetScopeHeaders(),
        });
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
    async upsertPreset(input: {
      id?: string;
      name: string;
      scope?: DataExplorerPresetScope;
      filters: Partial<DataExplorerPresetFilters>;
    }): Promise<DataExplorerPresetMutationResult> {
      const scope = input.scope ?? "shared";

      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(buildPresetScopeUrl(scope), {
          method: "POST",
          headers: {
            ...buildPresetScopeHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
    async deletePreset(
      presetId: string,
      scope: DataExplorerPresetScope = "shared",
    ): Promise<DataExplorerPresetMutationResult> {
      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(
          buildPresetScopeUrl(scope, `/api/data-explorer/presets/${encodeURIComponent(presetId)}`),
          {
          method: "DELETE",
            headers: buildPresetScopeHeaders(),
          },
        );
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
    async markPresetUsed(
      presetId: string,
      scope: DataExplorerPresetScope = "shared",
    ): Promise<DataExplorerPresetMutationResult> {
      if (!canUseDataExplorerNetworkBoundary()) {
        return createPresetStoreUnavailableResult(scope);
      }

      try {
        const response = await fetch(
          buildPresetScopeUrl(scope, `/api/data-explorer/presets/${encodeURIComponent(presetId)}/mark-used`),
          {
            method: "POST",
            headers: buildPresetScopeHeaders(),
          },
        );
        const payload = parsePresetMutationResult(await response.json());

        if (payload) {
          return payload;
        }
      } catch {
        // fall through
      }

      return createPresetStoreUnavailableResult(scope);
    },
  },
  apiKeys: {
    async generate(input: {
      name: string;
      tier?: string;
      scopes?: string[];
    }): Promise<
      | { ok: true; key: ApiKeyRecord; rawKey: string }
      | { ok: false; message: string }
    > {
      ensureServerOnlyClientMethod("apiClient.apiKeys.generate");
      void input;
      return { ok: false, message: "Use the server-only public API key store helpers in route handlers." };
    },
    async lookupByHash(hash: string): Promise<ApiKeyRecord | null> {
      ensureServerOnlyClientMethod("apiClient.apiKeys.lookupByHash");
      void hash;
      return null;
    },
    async recordLastUsed(id: string): Promise<ApiKeyRecord | null> {
      ensureServerOnlyClientMethod("apiClient.apiKeys.recordLastUsed");
      void id;
      return null;
    },
    async revoke(id: string): Promise<ApiKeyRecord | null> {
      ensureServerOnlyClientMethod("apiClient.apiKeys.revoke");
      void id;
      return null;
    },
  },
  usageLog: {
    async append(input: {
      keyId: string;
      route: string;
      statusCode: number;
      durationMs?: number | null;
      requestAt?: number;
    }): Promise<ApiUsageLogEntry | null> {
      ensureServerOnlyClientMethod("apiClient.usageLog.append");
      void input;
      return null;
    },
    async getSummary(
      keyId: string,
      from: number,
      to: number,
    ): Promise<{
      keyId: string;
      from: string;
      to: string;
      totalRequests: number;
      errorCount: number;
      averageDurationMs: number | null;
      lastRequestAt: string | null;
      routeCounts: Array<{ route: string; count: number }>;
    } | null> {
      ensureServerOnlyClientMethod("apiClient.usageLog.getSummary");
      void keyId;
      void from;
      void to;
      return null;
    },
  },
  oceanMap: {
    async getWorkspace() {
      return oceanMapWorkspaceData;
    },
  },
  oceanStations: {
    async getStations() {
      return oceanStationsData;
    },
    async getStationById(stationId: string): Promise<OceanStationDetail | null> {
      return findMockStation(stationId);
    },
    async getStationBySlug(slug: string): Promise<OceanStationDetail | null> {
      return apiClient.oceanStations.getStationById(slug);
    },
    async getStationAdmin(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      return findMockStation(stationId);
    },
    async getStationAdminAudit(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationAdminAuditEntry[] | null> {
      return [];
    },
    async updateStation(
      stationId: string,
      patch: OceanStationAdminPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      return applyMockStationPatch(stationId, patch);
    },
    async updateStationBranding(
      stationId: string,
      patch: OceanStationAdminBrandingPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      return applyMockStationPatch(stationId, patch);
    },
    async updateStationContent(
      stationId: string,
      patch: OceanStationAdminContentPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      return applyMockStationPatch(stationId, patch);
    },
    async getStationAnalytics(stationId: string): Promise<OceanStationAnalytics | null> {
      const fromId = oceanStationAnalytics[stationId];

      if (fromId) {
        return cloneAnalytics(fromId);
      }

      const bySlug = Object.values(oceanStationDetails).find((station) => station.slug === stationId);

      if (!bySlug) {
        return null;
      }

      const fromSlug = oceanStationAnalytics[bySlug.id];
      return fromSlug ? cloneAnalytics(fromSlug) : null;
    },
    async trackStationView(stationId: string, viewType: OceanStationViewType): Promise<void> {
      const station = findMockStation(stationId);

      if (!station) {
        return;
      }

      const current = oceanStationAnalytics[station.id] ?? {
        stationId: station.id,
        views: { detail: 0, exhibit: 0, public: 0, total: 0 },
        lastViewedAt: null,
      };

      current.views[viewType] += 1;
      current.views.total += 1;
      current.lastViewedAt = nowIso();
      oceanStationAnalytics[station.id] = current;
    },
    async acknowledgeAlert(
      stationId: string,
      alertId: string,
      actorId: string,
    ): Promise<
      | { ok: true; alert: OceanStationAlert; timelineEvent?: StationAlertAcknowledgeResponse["timelineEvent"] }
      | { ok: false; status: 404 | 409; message: string }
    > {
      return { ok: false, status: 404, message: "Failed to acknowledge alert" };
    },
  },
  aiLab: {
    async getWorkspace() {
      return aiLabWorkspaceData;
    },
    async analyze(input: AnalyzeRequestBody) {
      const [summary, findings, evidence, confidence, uncertainty, suggestedNextActions] =
        aiLabWorkspaceData.results;

      return {
        prompt: input.prompt,
        summary,
        findings,
        evidence,
        confidence,
        uncertainty,
        suggestedNextActions,
        sources: aiLabWorkspaceData.sources,
      };
    },
  },
  stationEvents: {
    async queryEvents(
      stationId: string,
      filters: StationEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventListResponse | null> {
      return { events: [], nextCursor: null };
    },

    async getEvents(
      stationId: string,
      filters: StationEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventListItem[] | null> {
      const page = await apiClient.stationEvents.queryEvents(stationId, filters, auth);

      return page?.events ?? null;
    },

    async getEventDetail(
      stationId: string,
      eventId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventDetail | null> {
      return null;
    },

    async queryInvestigations(
      stationId: string,
      filters: StationInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationListResponse | null> {
      return { investigations: [], nextCursor: null };
    },

    async getInvestigations(
      stationId: string,
      filters: StationInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationSummary[] | null> {
      const page = await apiClient.stationEvents.queryInvestigations(stationId, filters, auth);

      return page?.investigations ?? null;
    },

    async getInvestigationDetail(
      stationId: string,
      investigationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationDetail | null> {
      return null;
    },

    async acknowledgeEvent(
      stationId: string,
      eventId: string,
      actorId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; event: StationEventAcknowledgeResponse["event"] }
      | { ok: false; status: 403 | 404 | 409; message: string }
    > {
      return { ok: false, status: 404, message: "Failed to acknowledge event" };
    },
  },
  marineIntelligence: {
    async getEvents(
      filters: MarineWorkflowEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<MarineWorkflowEventItem[] | null> {
      return [];
    },

    async getInvestigations(
      filters: MarineWorkflowInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<MarineWorkflowInvestigationItem[] | null> {
      return [];
    },

    async createInvestigation(
      input: {
        eventId: string;
        title: string;
        ownerId?: string;
        sourceType?: "signal" | "anomaly";
        stationId?: string;
        region?: string;
        detectedAt?: string;
      },
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; investigation: MarineWorkflowInvestigationItem }
      | { ok: false; status: 400 | 403 | 404 | 503; message: string }
    > {
      if (!input.eventId.trim() || !input.title.trim()) {
        return { ok: false, status: 400, message: "Unable to create investigation" };
      }

      return {
        ok: true,
        investigation: {
          id: `MIID-${Date.now()}`,
          eventId: input.eventId,
          eventTitle: input.title,
          sourceType: input.sourceType ?? null,
          stationId: input.stationId ?? null,
          region: input.region ?? null,
          detectedAt: input.detectedAt ?? null,
          title: input.title,
          status: "open",
          ownerId: input.ownerId ?? auth?.actorId ?? null,
          notes: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          acknowledgedAt: null,
          resolvedAt: null,
          dismissedAt: null,
          truthPartition: "FIELD_TRUTH",
        },
      };
    },

    async getAlerts(
      filters: MarineWorkflowAlertFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<MarineWorkflowAlertItem[] | null> {
      return [];
    },

    async acknowledgeAlert(
      alertId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; alert: MarineWorkflowAlertItem }
      | { ok: false; status: 400 | 403 | 404 | 503; message: string }
    > {
      return { ok: false, status: 404, message: "Unable to acknowledge alert" };
    },

    async resolveAlert(
      alertId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; alert: MarineWorkflowAlertItem }
      | { ok: false; status: 400 | 403 | 404 | 503; message: string }
    > {
      return { ok: false, status: 404, message: "Unable to resolve alert" };
    },

    async submitDecision(input: {
      investigationId: string;
      stationId: string;
      decision: string;
      rationale: string;
      timestamp: string;
    }): Promise<MarineWorkflowDecisionItem> {
      const response = await fetch("/api/marine-intelligence/decisions", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as
        | ({ ok?: true } & MarineWorkflowDecisionResponse)
        | { message?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Marine decision request failed.",
        );
      }

      if (payload && typeof payload === "object" && "decision" in payload && payload.decision) {
        return payload.decision;
      }

      throw new Error("Marine decision request returned an invalid payload.");
    },

    async submitFeedback(input: MarineWorkflowFeedbackRequest): Promise<MarineWorkflowFeedbackItem> {
      const response = await fetch("/api/marine-intelligence/feedback", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as
        | ({ ok?: true } & MarineWorkflowFeedbackResponse)
        | { message?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Marine feedback request failed.",
        );
      }

      if (payload && typeof payload === "object" && "feedback" in payload && payload.feedback) {
        return payload.feedback;
      }

      throw new Error("Marine feedback request returned an invalid payload.");
    },

    async recordTelemetry(input: MarineWorkflowTelemetryEventRequest): Promise<MarineWorkflowTelemetryEventItem> {
      const response = await fetch("/api/marine-intelligence/telemetry", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as
        | ({ ok?: true } & MarineWorkflowTelemetryEventResponse)
        | { message?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Marine telemetry request failed.",
        );
      }

      if (payload && typeof payload === "object" && "event" in payload && payload.event) {
        return payload.event;
      }

      throw new Error("Marine telemetry request returned an invalid payload.");
    },

    async getSummary(): Promise<MarineWorkflowDecisionSummary> {
      const response = await fetch("/api/marine-intelligence/summary", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });
      const payload = await response.json() as MarineWorkflowDecisionSummaryResponse | { message?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Marine metrics request failed.",
        );
      }

      if (payload && typeof payload === "object" && "summary" in payload && payload.summary) {
        return payload.summary;
      }

      throw new Error("Marine metrics request returned an invalid payload.");
    },

    async attachValidationOutcome(input: RiskEvaluationOutcomeRequest): Promise<RiskEvaluationRecord> {
      const response = await fetch("/api/marine-intelligence/validation/outcomes", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as MarineWorkflowValidationOutcomeResponse | { message?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Marine validation outcome request failed.",
        );
      }

      if (payload && typeof payload === "object" && "evaluation" in payload && payload.evaluation) {
        return payload.evaluation;
      }

      throw new Error("Marine validation outcome request returned an invalid payload.");
    },

    async getValidationSummary(
      filters: {
        stationId?: string;
        since?: string;
      } = {},
    ): Promise<ValidationSummaryResponse> {
      const params = new URLSearchParams();

      if (filters.stationId) {
        params.set("stationId", filters.stationId);
      }

      if (filters.since) {
        params.set("since", filters.since);
      }

      const suffix = params.toString() ? `?${params.toString()}` : "";
      const response = await fetch(`/api/v1/validation/summary${suffix}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });
      const payload = await response.json() as ValidationSummaryResponse | { message?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Marine validation summary request failed.",
        );
      }

      if (payload && typeof payload === "object" && "reliability" in payload) {
        return payload;
      }

      throw new Error("Marine validation summary request returned an invalid payload.");
    },

    async getStationWorkflow(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
      filters: {
        eventStatus?: MarineWorkflowEventFilters["status"];
        eventSeverity?: MarineWorkflowEventFilters["severity"];
        investigationStatus?: MarineWorkflowInvestigationFilters["status"];
        alertStatus?: MarineWorkflowAlertFilters["status"];
        alertSeverity?: MarineWorkflowAlertFilters["severity"];
      } = {},
    ): Promise<{
      events: MarineWorkflowEventItem[];
      investigations: MarineWorkflowInvestigationItem[];
      alerts: MarineWorkflowAlertItem[];
    }> {
      const [events, investigations, alerts] = await Promise.all([
        apiClient.marineIntelligence.getEvents(
          {
            stationId,
            status: filters.eventStatus,
            severity: filters.eventSeverity,
            limit: 20,
          },
          auth,
        ),
        apiClient.marineIntelligence.getInvestigations(
          {
            stationId,
            status: filters.investigationStatus,
            limit: 10,
          },
          auth,
        ),
        apiClient.marineIntelligence.getAlerts(
          {
            stationId,
            status: filters.alertStatus,
            severity: filters.alertSeverity,
            limit: 12,
          },
          auth,
        ),
      ]);

      return {
        events: events ?? [],
        investigations: investigations ?? [],
        alerts: alerts ?? [],
      };
    },
  },
};
