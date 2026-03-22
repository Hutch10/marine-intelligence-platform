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
import { getDashboardRoute } from "../../../api/src/routes/dashboard";
import { getLiveConditionsRoute } from "../../../api/src/routes/live-conditions";
import { getOperationalAlertsRoute } from "../../../api/src/routes/operational-alerts";
import { getReefAlertsRoute } from "../../../api/src/routes/reef-alerts";
import {
  buildDatasetDetailRouteResponse,
  buildDatasetRecordsRouteResponse,
  buildDatasetsRouteResponse,
  getDatasetByIdRoute,
  getDatasetRecordsRoute,
  getDatasetsRoute,
} from "../../../api/src/routes/datasets";
import { getInvestigationsRoute } from "../../../api/src/routes/investigations";
import { getInvestigationTimelineRoute, postInvestigationEventRoute } from "../../../api/src/routes/investigation-events";
import {
  getSignalByIdRoute,
  getSignalsRoute,
  postSignalCreateRoute,
  postSignalDismissRoute,
  postSignalPromoteRoute,
} from "../../../api/src/routes/signals";
import {
  getSpeciesByIdRoute,
  getAllSpeciesSightingsRoute,
  getSpeciesMovementSignalsRoute,
  getSpeciesRoute,
  postSpeciesSightingRoute,
} from "../../../api/src/routes/species";
import { getAiLabRoute } from "../../../api/src/routes/ai-lab";
import { getRegionsRoute } from "../../../api/src/routes/regions";
import { postStationAdminSessionRoute } from "../../../api/src/routes/station-admin-auth";
import {
  getStationAdminAuthEventsExportRoute,
  getStationAdminAuthEventsRoute,
} from "../../../api/src/routes/station-admin-auth-events";
import {
  getStationAdminSecurityAlertsRoute,
  getStationAdminSecuritySummaryRoute,
  getStationAdminSessionsRoute,
} from "../../../api/src/routes/station-admin-security";
import {
  postStationAdminLoginRoute,
  postStationAdminLogoutRoute,
  postStationAdminMfaVerifyRoute,
  postStationAdminRefreshRoute,
  postStationAdminRevokeRoute,
} from "../../../api/src/routes/station-admin-lifecycle";
import {
  postMfaEnrollStartRoute,
  postMfaEnrollVerifyRoute,
  postMfaRecoveryRegenerateRoute,
  postMfaDisableRoute,
} from "../../../api/src/routes/station-admin-mfa";
import {
  getStationAdminAuditRoute,
  getStationAdminRoute,
  getStationAnalyticsRoute,
  getStationByIdRoute,
  getStationsRoute,
  patchStationBrandingRoute,
  patchStationContentRoute,
  patchStationRoute,
  postStationAlertAcknowledgeRoute,
  postStationViewRoute,
} from "../../../api/src/routes/stations";
import {
  getStationEventsRoute,
  getStationEventDetailRoute,
  getStationInvestigationsRoute,
  getStationInvestigationDetailRoute,
  postStationEventAcknowledgeRoute,
} from "../../../api/src/routes/station-events";
import { postAiAnalyzeRoute } from "../../../api/src/routes/ai";
import type {
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
  LiveConditionsResponse,
  LiveConditionsTelemetry,
  ReefAlertsResponse,
  ReefAlertsTelemetry,
} from "@marine/shared";
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

type MarineWorkflowRoutesModule = typeof import("../../../api/src/routes/marine-intelligence");

async function getMarineWorkflowRoutes() {
  if (typeof window !== "undefined") {
    throw new Error("Marine workflow routes are only available on the server");
  }

  const loadModule = Function("specifier", "return import(specifier);") as (
    specifier: string,
  ) => Promise<MarineWorkflowRoutesModule>;

  return loadModule("../../../api/src/routes/marine-intelligence");
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
  title: string;
  detail: string | null;
  detected_at: number;
  resolved_at: number | null;
  created_at: string;
  updated_at: string;
}

interface OperationalAlertsRouteResponse {
  source: "db" | "unavailable";
  fallback_reason: OperationalAlertsFallbackReason | null;
  generated_at: string;
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
    title: item.title,
    detail: item.detail,
    detectedAt: item.detected_at,
    resolvedAt: item.resolved_at,
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

      try {
        const response = postStationAdminSessionRoute.handler({ body: { sessionId: normalizedSessionId } }) as HandlerResult<
          { auth: OceanStationAdminAuthContext } | { message: string },
          StationAdminSessionAuthTelemetry
        >;

        if (response.status !== 200 || !("auth" in response.json)) {
          return null;
        }

        return response.json.auth;
      } catch {
        return null;
      }
    },

    async login(
      actorId: string,
      password: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<AuthMutationResult<StationAdminLoginResponse>> {
      try {
        const response = postStationAdminLoginRoute.handler({
          body: { actorId, password, metadata },
        }) as HandlerResult<StationAdminLoginResponse | { message: string }, StationAdminLoginTelemetry>;

        if (
          (response.status === 200 && "sessionId" in response.json)
          || (response.status === 202 && "result" in response.json && response.json.result === "pending_mfa")
        ) {
          return {
            ok: true,
            status: response.status,
            data: response.json as StationAdminLoginResponse,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: readRouteErrorMessage(response.json, "Authentication failed"),
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "Authentication failed",
        };
      }
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
      try {
        const response = postStationAdminMfaVerifyRoute.handler({
          body: {
            challengeId,
            code: options.code,
            recoveryCode: options.recoveryCode,
            sessionId: options.sessionId,
            csrfToken: options.csrfToken,
            metadata: options.metadata,
          },
        }) as HandlerResult<
          StationAdminMfaVerifyResponse | StationAdminMfaVerifyErrorResponse | { message: string },
          StationAdminMfaVerifyTelemetry
        >;

        if (
          response.status === 200
          && "result" in response.json
          && (response.json.result === "issued" || response.json.result === "verified")
        ) {
          return {
            ok: true,
            status: response.status,
            data: response.json as StationAdminMfaVerifyResponse,
          };
        }

        const routeMessage = readRouteErrorMessage(response.json, "MFA verification failed");

        if (
          "result" in response.json
          && typeof response.json.result === "string"
          && "message" in response.json
          && typeof response.json.message === "string"
        ) {
          return {
            ok: false,
            status: response.status,
            message: routeMessage,
            error: response.json as StationAdminMfaVerifyErrorResponse,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: routeMessage,
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "MFA verification failed",
        };
      }
    },

    async logout(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<boolean> {
      try {
        const response = postStationAdminLogoutRoute.handler({
          body: { sessionId, csrfToken, metadata },
        }) as HandlerResult<StationAdminLogoutResponse | { message: string }, StationAdminLogoutTelemetry>;

        return response.status === 200 && "ok" in response.json && response.json.ok === true;
      } catch {
        return false;
      }
    },

    async refreshSession(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<{ sessionId: string; csrfToken: string; expiresAt: string } | null> {
      try {
        const response = postStationAdminRefreshRoute.handler({
          body: { sessionId, csrfToken, metadata },
        }) as HandlerResult<StationAdminRefreshResponse | { message: string }, StationAdminRefreshTelemetry>;

        if (response.status !== 200 || !("sessionId" in response.json)) {
          return null;
        }

        return response.json as StationAdminRefreshResponse;
      } catch {
        return null;
      }
    },

    async revokeSession(
      sessionId: string,
      csrfToken: string,
      targetSessionId: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<RevokeSessionResult> {
      try {
        const response = postStationAdminRevokeRoute.handler({
          body: { sessionId, csrfToken, targetSessionId, metadata },
        }) as HandlerResult<StationAdminRevokeResponse | StationAdminRevokeMfaRequiredResponse | { message: string }, StationAdminRevokeTelemetry>;

        if (response.status === 200 && "ok" in response.json && response.json.ok === true) {
          return {
            ok: true,
            status: response.status,
          };
        }

        if (response.status === 401 && "mfaRequired" in response.json && response.json.mfaRequired === true) {
          return {
            ok: false,
            status: response.status,
            message: "MFA verification required",
            mfaRequired: true,
            challenge: response.json.challenge,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: readRouteErrorMessage(response.json, "Revoke failed"),
          mfaRequired: false,
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "Revoke failed",
          mfaRequired: false,
        };
      }
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
      try {
        const response = getStationAdminAuthEventsRoute.handler({ body: undefined, query: filters, auth }) as HandlerResult<
          StationAdminAuthEventsResponse | { message: string },
          StationAdminAuthEventsTelemetry
        >;

        if (response.status !== 200 || !("events" in response.json)) {
          return null;
        }

        return {
          events: response.json.events,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return {
          events: [],
          nextCursor: null,
        };
      }
    },

    async exportEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEventExportPayload | null> {
      try {
        const response = getStationAdminAuthEventsExportRoute.handler({ body: undefined, query: filters, auth }) as HandlerResult<
          StationAdminAuthEventsExportResponse | { message: string },
          StationAdminAuthEventsExportTelemetry
        >;

        if (response.status !== 200 || !("export" in response.json)) {
          return null;
        }

        return response.json.export;
      } catch {
        return null;
      }
    },

    async getSessions(
      query: StationAdminSessionsQuery = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSessionSummary[] | null> {
      try {
        const response = getStationAdminSessionsRoute.handler({ body: undefined, query, auth }) as HandlerResult<
          StationAdminSessionsResponse | { message: string },
          StationAdminSessionsTelemetry
        >;

        if (response.status !== 200 || !("sessions" in response.json)) {
          return null;
        }

        return response.json.sessions;
      } catch {
        return [];
      }
    },

    async getSecuritySummary(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecuritySummary | null> {
      try {
        const response = getStationAdminSecuritySummaryRoute.handler({ body: undefined, auth }) as HandlerResult<
          StationAdminSecuritySummaryResponse | { message: string },
          StationAdminSecuritySummaryTelemetry
        >;

        if (response.status !== 200 || !("summary" in response.json)) {
          return null;
        }

        return response.json.summary;
      } catch {
        return null;
      }
    },

    async getSecurityAlerts(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecurityAlert[] | null> {
      try {
        const response = getStationAdminSecurityAlertsRoute.handler({ body: undefined, auth }) as HandlerResult<
          StationAdminSecurityAlertsResponse | { message: string },
          StationAdminSecurityAlertsTelemetry
        >;

        if (response.status !== 200 || !("alerts" in response.json)) {
          return null;
        }

        return response.json.alerts;
      } catch {
        return [];
      }
    },
  },
  stationAdminMfa: {
    async enrollStart(
      sessionId: string,
      csrfToken: string,
    ): Promise<{ ok: true; qrCodeUri: string; secret: string } | { ok: false; status: number; message: string }> {
      try {
        const response = postMfaEnrollStartRoute.handler({ body: { sessionId, csrfToken } }) as HandlerResult<
          { qrCodeUri: string; secret: string } | { message: string },
          never
        >;

        if (response.status === 200 && "qrCodeUri" in response.json) {
          return { ok: true, qrCodeUri: response.json.qrCodeUri, secret: response.json.secret };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Enrollment start failed") };
      } catch {
        return { ok: false, status: 503, message: "Enrollment start failed" };
      }
    },

    async enrollVerify(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string }
    > {
      try {
        const response = postMfaEnrollVerifyRoute.handler({ body: { sessionId, csrfToken, totpCode } }) as HandlerResult<
          { result: "enrolled"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] } | { message: string },
          never
        >;

        if (response.status === 200 && "result" in response.json && (response.json as { result?: string }).result === "enrolled") {
          const r = response.json as { result: "enrolled"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] };
          return { ok: true, mfa: r.mfa, recoveryCodes: r.recoveryCodes };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Enrollment verification failed") };
      } catch {
        return { ok: false, status: 503, message: "Enrollment verification failed" };
      }
    },

    async recoveryRegenerate(
      sessionId: string,
      csrfToken: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      try {
        const response = postMfaRecoveryRegenerateRoute.handler({ body: { sessionId, csrfToken } }) as HandlerResult<
          | { result: "regenerated"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
          | { mfaRequired: true; challenge: StationAdminMfaChallenge }
          | { message: string },
          never
        >;

        if (response.status === 200 && "result" in response.json && (response.json as { result?: string }).result === "regenerated") {
          const r = response.json as { result: "regenerated"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] };
          return { ok: true, mfa: r.mfa, recoveryCodes: r.recoveryCodes };
        }

        if (response.status === 401 && "mfaRequired" in response.json && (response.json as { mfaRequired?: boolean }).mfaRequired === true) {
          const r = response.json as { mfaRequired: true; challenge: StationAdminMfaChallenge };
          return { ok: false, status: 401, message: "MFA step-up required", mfaRequired: true, challenge: r.challenge };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Recovery code regeneration failed") };
      } catch {
        return { ok: false, status: 503, message: "Recovery code regeneration failed" };
      }
    },

    async disable(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      try {
        const response = postMfaDisableRoute.handler({ body: { sessionId, csrfToken, totpCode } }) as HandlerResult<
          | { ok: true }
          | { mfaRequired: true; challenge: StationAdminMfaChallenge }
          | { message: string },
          never
        >;

        if (response.status === 200 && "ok" in response.json && (response.json as { ok?: boolean }).ok === true) {
          return { ok: true };
        }

        if (response.status === 401 && "mfaRequired" in response.json && (response.json as { mfaRequired?: boolean }).mfaRequired === true) {
          const r = response.json as { mfaRequired: true; challenge: StationAdminMfaChallenge };
          return { ok: false, status: 401, message: "MFA step-up required", mfaRequired: true, challenge: r.challenge };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "MFA disable failed") };
      } catch {
        return { ok: false, status: 503, message: "MFA disable failed" };
      }
    },
  },

  dashboard: {
    async getOverview() {
      try {
        return getDashboardRoute.handler({ body: undefined }).json;
      } catch {
        return dashboardOverviewData;
      }
    },
  },
  liveConditions: {
    async getLatest(): Promise<LiveMarineCondition[]> {
      try {
        const response = getLiveConditionsRoute.handler({ body: undefined }) as HandlerResult<
          LiveConditionsResponse,
          LiveConditionsTelemetry
        >;

        return response.json.conditions;
      } catch {
        return liveMarineConditionsData;
      }
    },
  },
  reefAlerts: {
    async getLatest(): Promise<ReefStressWatchItem[]> {
      try {
        const response = getReefAlertsRoute.handler({ body: undefined }) as HandlerResult<
          ReefAlertsResponse,
          ReefAlertsTelemetry
        >;

        return response.json.alerts;
      } catch {
        return reefStressWatchData;
      }
    },
  },
  ingestionOperations: {
    async getOperationalAlerts(filters: OperationalAlertsFilters = {}): Promise<OperationalAlertsData> {
      const query: OperationalAlertsFilters = {};

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.ruleType) {
        query.ruleType = filters.ruleType;
      }

      const source = filters.source?.trim();
      if (source) {
        query.source = source;
      }

      if (typeof filters.limit === "number" && Number.isFinite(filters.limit)) {
        query.limit = filters.limit;
      } else if (typeof filters.historyLimit === "number" && Number.isFinite(filters.historyLimit)) {
        query.historyLimit = filters.historyLimit;
      }

      try {
        const response = getOperationalAlertsRoute.handler({ body: undefined, query }) as HandlerResult<
          OperationalAlertsRouteResponse,
          { route: string; source: "db" | "unavailable" }
        >;

        const payload = response.json;

        return {
          source: payload.source,
          fallbackReason: payload.fallback_reason,
          generatedAt: payload.generated_at,
          summary: {
            activeAlertCount: payload.summary.active_alert_count,
            criticalCount: payload.summary.critical_count,
            warningCount: payload.summary.warning_count,
            infoCount: payload.summary.info_count,
            failedSourceCount: payload.summary.failed_source_count,
            staleSourceCount: payload.summary.stale_source_count,
            lastUpdatedAt: payload.summary.last_updated_at,
          },
          activeAlerts: payload.active_alerts.map(mapOperationalAlertsItem),
          recentHistory: payload.recent_history.map(mapOperationalAlertsItem),
        };
      } catch {
        return buildOperationalAlertsFallback();
      }
    },
  },
  investigations: {
    async getWorkspace() {
      try {
        const workspace = getInvestigationsRoute.handler({ body: undefined }).json.workspace;
        const activeInvestigationId = workspace.analysisTracks[0]?.id;

        if (!activeInvestigationId) {
          return {
            ...workspace,
            timeline: [],
            ontologyNetwork: buildInvestigationOntologyNetwork(workspace),
          };
        }

        const timelineResponse = getInvestigationTimelineRoute.handler({
          body: { id: activeInvestigationId },
          query: { limit: 50 },
        }) as HandlerResult<InvestigationTimelineResponse, InvestigationTimelineTelemetry>;

        return {
          ...workspace,
          timeline: timelineResponse.json.timeline,
          ontologyNetwork: buildInvestigationOntologyNetwork(workspace),
        };
      } catch {
        return {
          ...investigationsWorkspaceData,
          timeline: investigationsTimelineFallbackData,
          ontologyNetwork: buildInvestigationOntologyNetwork(investigationsWorkspaceData),
        };
      }
    },

    async getTimeline(
      investigationId: string,
      filters: InvestigationTimelineFilters = {},
    ): Promise<InvestigationTimelineItem[]> {
      try {
        const response = getInvestigationTimelineRoute.handler({
          body: { id: investigationId },
          query: filters,
        }) as HandlerResult<InvestigationTimelineResponse, InvestigationTimelineTelemetry>;

        return response.json.timeline;
      } catch {
        const eventType = filters.eventType;
        const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
        const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
        const filtered = eventType
          ? investigationsTimelineFallbackData.filter((item) => item.eventType === eventType)
          : investigationsTimelineFallbackData;

        return filtered.slice(0, boundedLimit);
      }
    },

    async recordEvent(
      investigationId: string,
      input: RecordInvestigationEventInput,
    ): Promise<InvestigationTimelineItem | null> {
      try {
        const response = postInvestigationEventRoute.handler({
          body: {
            id: investigationId,
            eventType: input.eventType,
            source: input.source,
            actor: input.actor,
            summary: input.summary,
            detail: input.detail,
            confidence: input.confidence,
          },
        }) as HandlerResult<InvestigationEventCreateResponse | { message: string }, InvestigationEventCreateTelemetry>;

        if (response.status !== 201 || !("event" in response.json)) {
          return null;
        }

        return response.json.event;
      } catch {
        return null;
      }
    },
  },
  signals: {
    async list(filters: SignalFilters = {}): Promise<SignalDetection[]> {
      try {
        const response = getSignalsRoute.handler({
          body: undefined,
          query: {
            signalType: filters.signalType,
            severity: filters.severity,
            status: filters.status,
            region: filters.region,
            stationId: filters.stationId,
            limit: filters.limit,
          },
        }) as HandlerResult<SignalsListResponse, SignalsListTelemetry>;

        return response.json.signals;
      } catch {
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
      }
    },

    async getById(signalId: string): Promise<SignalDetection | null> {
      try {
        const response = getSignalByIdRoute.handler({ body: { id: signalId } }) as HandlerResult<
          SignalDetailResponse | { message: string },
          SignalDetailTelemetry
        >;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return signalDetectionsFallbackData.find((signal) => signal.id === signalId) ?? null;
      }
    },

    async create(input: CreateSignalInput): Promise<SignalDetection | null> {
      try {
        const response = postSignalCreateRoute.handler({ body: input as SignalCreateRequest }) as HandlerResult<
          SignalCreateResponse | { message: string },
          SignalCreateTelemetry
        >;

        if (response.status !== 201 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },

    async promote(signalId: string, input: PromoteSignalInput): Promise<SignalDetection | null> {
      try {
        const response = postSignalPromoteRoute.handler({
          body: {
            id: signalId,
            investigationId: input.investigationId,
            actor: input.actor,
          },
        }) as HandlerResult<SignalPromoteResponse | { message: string }, SignalPromoteTelemetry>;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },

    async dismiss(signalId: string, actor?: string): Promise<SignalDetection | null> {
      try {
        const response = postSignalDismissRoute.handler({
          body: {
            id: signalId,
            actor,
          },
        }) as HandlerResult<SignalDismissResponse | { message: string }, SignalDismissTelemetry>;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },
  },
  species: {
    async list(filters: SpeciesFilters = {}): Promise<SpeciesProfile[]> {
      try {
        const response = getSpeciesRoute.handler({
          body: undefined,
          query: {
            region: filters.region,
            conservationStatus: filters.conservationStatus,
            limit: filters.limit,
          },
        }) as HandlerResult<SpeciesListResponse | { message: string }, SpeciesListTelemetry>;

        if (response.status !== 200 || !("species" in response.json)) {
          return [];
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.species;
      } catch {
        return [];
      }
    },

    async getById(speciesId: string): Promise<SpeciesProfile | null> {
      try {
        const response = getSpeciesByIdRoute.handler({ body: { id: speciesId } }) as HandlerResult<
          SpeciesDetailResponse | { message: string },
          SpeciesDetailTelemetry
        >;

        if (response.status !== 200 || !("species" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return null;
        }

        return response.json.species;
      } catch {
        return null;
      }
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
      try {
        const response = getAllSpeciesSightingsRoute.handler({
          body: { id: speciesId },
          query: {
            region: filters.region,
            stationId: filters.stationId,
            verificationStatus: filters.verificationStatus,
            limit: filters.limit,
          },
        }) as HandlerResult<SpeciesSightingsResponse | { message: string }, SpeciesSightingsTelemetry>;

        if (response.status === 404) {
          return null;
        }

        if (response.status !== 200 || !("sightings" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.sightings;
      } catch {
        return null;
      }
    },

    async createSighting(
      input: CreateSpeciesSightingInput,
      auth?: OceanStationAdminAuthContext,
    ): Promise<SpeciesSighting | null> {
      try {
        const response = postSpeciesSightingRoute.handler({
          body: {
            ...(input as SpeciesSightingCreateRequest),
            csrfToken: auth?.csrfToken ?? "",
          },
          auth,
        }) as HandlerResult<SpeciesSightingCreateResponse | { message: string }, SpeciesSightingCreateTelemetry>;

        if (response.status !== 201 || !("sighting" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return null;
        }

        return response.json.sighting;
      } catch {
        return null;
      }
    },

    async listMovementSignals(
      speciesId: string,
      filters: SpeciesMovementSignalFilters = {},
    ): Promise<SpeciesMovementSignal[] | null> {
      try {
        const response = getSpeciesMovementSignalsRoute.handler({
          body: { id: speciesId },
          query: {
            movementType: filters.movementType,
            minConfidence: filters.minConfidence,
            startDate: filters.startDate,
            endDate: filters.endDate,
            region: filters.region,
            stationId: filters.stationId,
            investigationId: filters.investigationId,
            limit: filters.limit,
          },
        }) as HandlerResult<
          SpeciesMovementSignalsResponse | { message: string },
          SpeciesMovementSignalsTelemetry
        >;

        if (response.status === 404) {
          return null;
        }

        if (response.status !== 200 || !("movementSignals" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.movementSignals;
      } catch {
        return null;
      }
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
      const query = normalizeDatasetFilters(filters);
      const startedAtMs = Date.now();

      try {
        if (canUseDataExplorerNetworkBoundary()) {
          const searchParams = new URLSearchParams();
          appendDataExplorerQuery(searchParams, "q", query.q);
          appendDataExplorerQuery(searchParams, "category", query.category);
          appendDataExplorerQuery(searchParams, "region", query.region);
          appendDataExplorerQuery(searchParams, "status", query.status);
          appendDataExplorerQuery(searchParams, "sortBy", query.sortBy);
          appendDataExplorerQuery(searchParams, "sortDir", query.sortDir);
          appendDataExplorerQuery(searchParams, "page", query.page);
          appendDataExplorerQuery(searchParams, "pageSize", query.pageSize);

          const endpoint = searchParams.size > 0
            ? `/api/data-explorer?${searchParams.toString()}`
            : "/api/data-explorer";
          const response = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" } });
          const payload = (await response.json()) as
            | DataExplorerWorkspaceFetchResult["data"]
            | { message?: string };

          if (response.ok && "datasets" in payload) {
            const headerMeta = createDataExplorerHeaderMeta(response);
            const result = {
              data: payload,
              meta: buildFetchMeta("workspace", startedAtMs, {
                state: "success",
                  delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerWorkspaceFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          throw new Error("Network workspace response was not in the expected shape.");
        }

        const response = getDatasetsRoute.handler({ body: undefined, query }) as HandlerResult<
          DataExplorerWorkspaceFetchResult["data"],
          DatasetsTelemetry
        >;
        const result = {
          data: response.json,
          meta: buildFetchMeta("workspace", startedAtMs, {
            state: "success",
            delivery: "in_process",
            source: response.telemetry?.source,
            fallbackReason: response.telemetry?.fallbackReason,
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      } catch {
        const fallbackResponse = buildDatasetsRouteResponse(query);
        const result = {
          data: fallbackResponse.json,
          meta: buildFetchMeta("workspace", startedAtMs, {
            state: "success",
            delivery: "fallback_builder",
            source: fallbackResponse.telemetry.source,
            fallbackReason: fallbackResponse.telemetry.fallbackReason,
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async getDatasetDetail(datasetId: string): Promise<DataExplorerDatasetDetailFetchResult> {
      const startedAtMs = Date.now();

      try {
        if (canUseDataExplorerNetworkBoundary()) {
          const response = await fetch(`/api/data-explorer/${encodeURIComponent(datasetId)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          const payload = (await response.json()) as DataExplorerDatasetDetail | { message?: string };
          const headerMeta = createDataExplorerHeaderMeta(response);

          if (response.status === 404) {
            const result = {
              data: null,
              meta: buildFetchMeta("detail", startedAtMs, {
                state: "not_found",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerDatasetDetailFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          if (response.ok && "id" in payload) {
            const result = {
              data: payload,
              meta: buildFetchMeta("detail", startedAtMs, {
                state: "success",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerDatasetDetailFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          throw new Error("Network detail response was not in the expected shape.");
        }

        const response = getDatasetByIdRoute.handler({ body: { id: datasetId } }) as HandlerResult<
          DataExplorerDatasetDetail | { message: string },
          DatasetDetailTelemetry
        >;

        if (response.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "not_found",
              datasetId,
              delivery: "in_process",
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        const result = {
          data: response.json as DataExplorerDatasetDetail,
          meta: buildFetchMeta("detail", startedAtMs, {
            state: "success",
            datasetId,
            delivery: "in_process",
            source: response.telemetry?.source,
            fallbackReason: response.telemetry?.fallbackReason,
          }),
        } satisfies DataExplorerDatasetDetailFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      } catch (error) {
        const fallbackResponse = buildDatasetDetailRouteResponse(datasetId);

        if (fallbackResponse.status === 200 && !("message" in fallbackResponse.json)) {
          const result = {
            data: fallbackResponse.json,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "fallback_builder",
              source: fallbackResponse.telemetry.source,
              fallbackReason: fallbackResponse.telemetry.fallbackReason,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        if (fallbackResponse.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "not_found",
              datasetId,
              delivery: "fallback_builder",
              source: fallbackResponse.telemetry.source,
              fallbackReason: fallbackResponse.telemetry.fallbackReason,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        const result = {
          data: null,
          meta: buildFetchMeta("detail", startedAtMs, {
            state: "error",
            datasetId,
            delivery: "fallback_builder",
            source: "mock",
            fallbackReason: "db_query_failed",
            errorMessage: error instanceof Error ? error.message : "Unknown detail fetch error",
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
        if (canUseDataExplorerNetworkBoundary()) {
          const searchParams = new URLSearchParams();
          appendDataExplorerQuery(searchParams, "sortBy", query?.sortBy);
          appendDataExplorerQuery(searchParams, "sortDir", query?.sortDir);
          appendDataExplorerQuery(searchParams, "page", query?.page);
          appendDataExplorerQuery(searchParams, "pageSize", query?.pageSize);
          const endpoint = searchParams.size > 0
            ? `/api/data-explorer/${encodeURIComponent(datasetId)}/records?${searchParams.toString()}`
            : `/api/data-explorer/${encodeURIComponent(datasetId)}/records`;

          const response = await fetch(endpoint, {
            method: "GET",
            headers: { Accept: "application/json" },
          });
          const payload = (await response.json()) as
            | DataExplorerRelatedRecordsResult
            | { message?: string };
          const headerMeta = createDataExplorerHeaderMeta(response);

          if (response.status === 404) {
            const result = {
              data: null,
              meta: buildFetchMeta("records", startedAtMs, {
                state: "not_found",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerRelatedRecordsFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          if (response.ok && "records" in payload) {
            const result = {
              data: payload,
              meta: buildFetchMeta("records", startedAtMs, {
                state: "success",
                datasetId,
                delivery: "browser_api",
                source: headerMeta.source,
                fallbackReason: headerMeta.fallbackReason,
              }),
            } satisfies DataExplorerRelatedRecordsFetchResult;
            logDataExplorerFetch(result.meta);
            return result;
          }

          throw new Error("Network records response was not in the expected shape.");
        }

        const response = getDatasetRecordsRoute.handler({ body: { id: datasetId }, query }) as HandlerResult<
          DataExplorerRelatedRecordsResult | { message: string },
          DatasetRecordsTelemetry
        >;

        if (response.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "not_found",
              datasetId,
              delivery: "in_process",
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        if ("records" in response.json) {
          const result = {
            data: response.json,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "in_process",
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }
      } catch {
        const fallbackResponse = buildDatasetRecordsRouteResponse(datasetId, query);

        if (fallbackResponse.status === 200 && "records" in fallbackResponse.json) {
          const result = {
            data: fallbackResponse.json,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "success",
              datasetId,
              delivery: "fallback_builder",
              source: fallbackResponse.telemetry.source,
              fallbackReason: fallbackResponse.telemetry.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        const result = {
          data: null,
          meta: buildFetchMeta("records", startedAtMs, {
            state: "not_found",
            datasetId,
            delivery: "fallback_builder",
            source: fallbackResponse.telemetry.source,
            fallbackReason: fallbackResponse.telemetry.fallbackReason,
          }),
        } satisfies DataExplorerRelatedRecordsFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }

      throw new Error("Dataset records response was not in the expected shape.");
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
  oceanMap: {
    async getWorkspace() {
      try {
        return getRegionsRoute.handler({ body: undefined }).json.map;
      } catch {
        return oceanMapWorkspaceData;
      }
    },
  },
  oceanStations: {
    async getStations() {
      try {
        return getStationsRoute.handler({ body: undefined }).json.stations;
      } catch {
        return oceanStationsData;
      }
    },
    async getStationById(stationId: string): Promise<OceanStationDetail | null> {
      try {
        const response = getStationByIdRoute.handler({ body: { id: stationId } });

        if (response.status === 404 || "message" in response.json) {
          return null;
        }

        return response.json;
      } catch {
        return findMockStation(stationId);
      }
    },
    async getStationBySlug(slug: string): Promise<OceanStationDetail | null> {
      return apiClient.oceanStations.getStationById(slug);
    },
    async getStationAdmin(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = getStationAdminRoute.handler({ body: { id: stationId }, auth }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          OceanStationAdminTelemetry
        >;

        if ((response.status === 404 || response.status === 403) || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return findMockStation(stationId);
      }
    },
    async getStationAdminAudit(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationAdminAuditEntry[] | null> {
      try {
        const response = getStationAdminAuditRoute.handler({ body: { id: stationId }, auth }) as HandlerResult<
          { entries: OceanStationAdminAuditEntry[] } | { message: string },
          OceanStationAdminAuditTelemetry
        >;

        if ((response.status === 404 || response.status === 403) || !("entries" in response.json)) {
          return null;
        }

        return response.json.entries;
      } catch {
        return [];
      }
    },
    async updateStation(
      stationId: string,
      patch: OceanStationAdminPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async updateStationBranding(
      stationId: string,
      patch: OceanStationAdminBrandingPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationBrandingRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async updateStationContent(
      stationId: string,
      patch: OceanStationAdminContentPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationContentRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async getStationAnalytics(stationId: string): Promise<OceanStationAnalytics | null> {
      try {
        const response = getStationAnalyticsRoute.handler({ body: { id: stationId } }) as HandlerResult<
          { analytics: OceanStationAnalytics } | { message: string },
          OceanStationAnalyticsTelemetry
        >;

        if (response.status === 404 || !("analytics" in response.json)) {
          return null;
        }

        return response.json.analytics;
      } catch {
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
      }
    },
    async trackStationView(stationId: string, viewType: OceanStationViewType): Promise<void> {
      try {
        postStationViewRoute.handler({ body: { id: stationId, viewType } }) as HandlerResult<
          { ok: true; stationId: string; viewType: OceanStationViewType; viewedAt: string } | { message: string },
          StationViewTrackTelemetry
        >;
      } catch {
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
      }
    },
    async acknowledgeAlert(
      stationId: string,
      alertId: string,
      actorId: string,
    ): Promise<
      | { ok: true; alert: OceanStationAlert; timelineEvent?: StationAlertAcknowledgeResponse["timelineEvent"] }
      | { ok: false; status: 404 | 409; message: string }
    > {
      try {
        const response = postStationAlertAcknowledgeRoute.handler({
          body: { id: stationId, alertId, actorId },
        }) as HandlerResult<StationAlertAcknowledgeResponse | { message: string }, StationAlertAcknowledgeTelemetry>;

        if (response.status === 200 && "alert" in response.json) {
          return {
            ok: true,
            alert: response.json.alert,
            timelineEvent: "timelineEvent" in response.json ? response.json.timelineEvent : undefined,
          };
        }

        const message = "message" in response.json ? response.json.message : "Unexpected error";
        return { ok: false, status: response.status as 404 | 409, message };
      } catch {
        return { ok: false, status: 404, message: "Failed to acknowledge alert" };
      }
    },
  },
  aiLab: {
    async getWorkspace() {
      try {
        return getAiLabRoute.handler({ body: undefined }).json;
      } catch {
        return aiLabWorkspaceData;
      }
    },
    async analyze(input: AnalyzeRequestBody) {
      try {
        return postAiAnalyzeRoute.handler({ body: input }).json;
      } catch {
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
      }
    },
  },
  stationEvents: {
    async queryEvents(
      stationId: string,
      filters: StationEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventListResponse | null> {
      try {
        const response = getStationEventsRoute.handler({
          body: { id: stationId },
          query: filters,
          auth,
        }) as HandlerResult<StationEventListResponse | { message: string }, StationEventsListTelemetry>;

        if (response.status !== 200 || !("events" in response.json)) {
          return null;
        }

        return {
          events: response.json.events,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return { events: [], nextCursor: null };
      }
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
      try {
        const response = getStationEventDetailRoute.handler({
          body: { id: stationId, eventId },
          auth,
        }) as HandlerResult<StationEventDetailResponse | { message: string }, StationEventDetailTelemetry>;

        if (response.status !== 200 || !("event" in response.json)) {
          return null;
        }

        return response.json.event;
      } catch {
        return null;
      }
    },

    async queryInvestigations(
      stationId: string,
      filters: StationInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationListResponse | null> {
      try {
        const response = getStationInvestigationsRoute.handler({
          body: { id: stationId },
          query: filters,
          auth,
        }) as HandlerResult<StationInvestigationListResponse | { message: string }, StationInvestigationsListTelemetry>;

        if (response.status !== 200 || !("investigations" in response.json)) {
          return null;
        }

        return {
          investigations: response.json.investigations,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return { investigations: [], nextCursor: null };
      }
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
      try {
        const response = getStationInvestigationDetailRoute.handler({
          body: { id: stationId, investigationId },
          auth,
        }) as HandlerResult<StationInvestigationDetailResponse | { message: string }, StationInvestigationDetailTelemetry>;

        if (response.status !== 200 || !("investigation" in response.json)) {
          return null;
        }

        return response.json.investigation;
      } catch {
        return null;
      }
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
      try {
        const response = postStationEventAcknowledgeRoute.handler({
          body: { id: stationId, eventId, actorId },
          auth,
        }) as HandlerResult<StationEventAcknowledgeResponse | { message: string }, StationEventAcknowledgeTelemetry>;

        if (response.status === 200 && "event" in response.json) {
          return { ok: true, event: response.json.event };
        }

        const message = "message" in response.json ? response.json.message : "Unexpected error";
        return { ok: false, status: response.status as 403 | 404 | 409, message };
      } catch {
        return { ok: false, status: 404, message: "Failed to acknowledge event" };
      }
    },
  },
  marineIntelligence: {
    async getEvents(
      filters: MarineWorkflowEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<MarineWorkflowEventItem[] | null> {
      try {
        const { getMarineWorkflowEventsRoute } = await getMarineWorkflowRoutes();
        const response = getMarineWorkflowEventsRoute.handler({
          body: undefined,
          query: filters,
          auth,
        }) as HandlerResult<MarineWorkflowEventsResponse | { message: string }, MarineWorkflowEventsTelemetry>;

        if (response.status !== 200 || !("events" in response.json)) {
          return null;
        }

        return response.json.events;
      } catch {
        return [];
      }
    },

    async getInvestigations(
      filters: MarineWorkflowInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<MarineWorkflowInvestigationItem[] | null> {
      try {
        const { getMarineWorkflowInvestigationsRoute } = await getMarineWorkflowRoutes();
        const response = getMarineWorkflowInvestigationsRoute.handler({
          body: undefined,
          query: filters,
          auth,
        }) as HandlerResult<
          MarineWorkflowInvestigationsResponse | { message: string },
          MarineWorkflowInvestigationsTelemetry
        >;

        if (response.status !== 200 || !("investigations" in response.json)) {
          return null;
        }

        return response.json.investigations;
      } catch {
        return [];
      }
    },

    async createInvestigation(
      input: { eventId: string; title: string; ownerId?: string },
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; investigation: MarineWorkflowInvestigationItem }
      | { ok: false; status: 400 | 403 | 404 | 503; message: string }
    > {
      try {
        const { postMarineWorkflowCreateInvestigationRoute } = await getMarineWorkflowRoutes();
        const response = postMarineWorkflowCreateInvestigationRoute.handler({
          body: input,
          auth,
        }) as HandlerResult<
          MarineWorkflowCreateInvestigationResponse | { message: string },
          MarineWorkflowCreateInvestigationTelemetry
        >;

        if (response.status === 200 && "investigation" in response.json) {
          return { ok: true, investigation: response.json.investigation };
        }

        const message = "message" in response.json ? response.json.message : "Unable to create investigation";
        return { ok: false, status: response.status as 400 | 403 | 404 | 503, message };
      } catch {
        return { ok: false, status: 503, message: "Unable to create investigation" };
      }
    },

    async getAlerts(
      filters: MarineWorkflowAlertFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<MarineWorkflowAlertItem[] | null> {
      try {
        const { getMarineWorkflowAlertsRoute } = await getMarineWorkflowRoutes();
        const response = getMarineWorkflowAlertsRoute.handler({
          body: undefined,
          query: filters,
          auth,
        }) as HandlerResult<MarineWorkflowAlertsResponse | { message: string }, MarineWorkflowAlertsTelemetry>;

        if (response.status !== 200 || !("alerts" in response.json)) {
          return null;
        }

        return response.json.alerts;
      } catch {
        return [];
      }
    },

    async acknowledgeAlert(
      alertId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; alert: MarineWorkflowAlertItem }
      | { ok: false; status: 400 | 403 | 404 | 503; message: string }
    > {
      try {
        const { postMarineWorkflowAcknowledgeAlertRoute } = await getMarineWorkflowRoutes();
        const response = postMarineWorkflowAcknowledgeAlertRoute.handler({
          body: { alertId },
          auth,
        }) as HandlerResult<
          MarineWorkflowAlertActionResponse | { message: string },
          MarineWorkflowAlertActionTelemetry
        >;

        if (response.status === 200 && "alert" in response.json) {
          return { ok: true, alert: response.json.alert };
        }

        const message = "message" in response.json ? response.json.message : "Unable to acknowledge alert";
        return { ok: false, status: response.status as 400 | 403 | 404 | 503, message };
      } catch {
        return { ok: false, status: 503, message: "Unable to acknowledge alert" };
      }
    },

    async resolveAlert(
      alertId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; alert: MarineWorkflowAlertItem }
      | { ok: false; status: 400 | 403 | 404 | 503; message: string }
    > {
      try {
        const { postMarineWorkflowResolveAlertRoute } = await getMarineWorkflowRoutes();
        const response = postMarineWorkflowResolveAlertRoute.handler({
          body: { alertId },
          auth,
        }) as HandlerResult<
          MarineWorkflowAlertActionResponse | { message: string },
          MarineWorkflowAlertActionTelemetry
        >;

        if (response.status === 200 && "alert" in response.json) {
          return { ok: true, alert: response.json.alert };
        }

        const message = "message" in response.json ? response.json.message : "Unable to resolve alert";
        return { ok: false, status: response.status as 400 | 403 | 404 | 503, message };
      } catch {
        return { ok: false, status: 503, message: "Unable to resolve alert" };
      }
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
