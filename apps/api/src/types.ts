import type {
  AiLabSourceReference,
  AiLabWorkspaceData,
  CreateSignalInput,
  DataExplorerDatasetSortBy,
  DataExplorerPageInfo,
  DataExplorerRelatedRecordsPageInfo,
  DataExplorerRelatedRecordSortBy,
  DataExplorerSortDirection,
  DataExplorerRelatedRecord,
  DataExplorerWorkspaceData,
  InvestigationTimelineEventType,
  InvestigationTimelineItem,
  InvestigationsWorkspaceData,
  OceanStationAlert,
  OceanStationAnalytics,
  OceanStationDetail,
  OceanStationSummary,
  OceanStationTimelineItem,
  OceanStationViewType,
  OceanStationAdminBrandingPatch,
  OceanStationAdminContentPatch,
  OceanStationAdminPatch,
  OceanStationAdminAuthContext,
  StationAdminAuthEvent,
  StationAdminAuthEventFilters,
  StationAdminAuthEventExportPayload,
  StationAdminSecuritySummary,
  StationAdminSecurityAlert,
  StationAdminSessionSummary,
  StationAdminSessionsQuery,
  OceanStationAdminAuditEntry,
  OceanStationAdminRole,
  OceanStationAdminPermission,
  StationAdminMfaChallenge,
  StationAdminMfaEnrollmentState,
  StationAdminRequestMetadata,
  OceanMapRegionMetric,
  OceanMapWorkspaceData,
  LiveMarineCondition,
  ReefStressWatchItem,
  StationEventFilters,
  StationInvestigationFilters,
  StationEventListItem,
  StationEventDetail,
  StationInvestigationSummary,
  StationInvestigationDetail,
  StationEventListResponse,
  StationEventDetailResponse,
  StationInvestigationListResponse,
  StationInvestigationDetailResponse,
  MarineWorkflowEventFilters,
  MarineWorkflowInvestigationFilters,
  MarineWorkflowAlertFilters,
  MarineWorkflowEventsResponse,
  MarineWorkflowInvestigationsResponse,
  MarineWorkflowAlertsResponse,
  MarineWorkflowCreateInvestigationRequest,
  MarineWorkflowCreateInvestigationResponse,
  MarineWorkflowAlertActionRequest,
  MarineWorkflowAlertActionResponse,
  SignalDetection,
  SpeciesConservationStatus,
  SpeciesMovementSignalFilters,
  SpeciesMovementSignal,
  SpeciesProfile,
  SpeciesSighting,
  SpeciesSightingVerificationStatus,
  SignalFilters,
  SignalSeverity,
  SignalStatus,
  SignalType,
  CreateSpeciesSightingInput,
} from "../../web/lib/api/types";

export type {
  OceanStationAdminBrandingPatch,
  OceanStationAdminContentPatch,
  OceanStationAdminPatch,
  OceanStationAdminPermission,
  StationAdminMfaChallenge,
  StationAdminMfaEnrollmentState,
  StationAdminAuthEvent,
  StationAdminAuthEventFilters,
  StationAdminAuthEventExportPayload,
  StationAdminRequestMetadata,
  StationAdminSecurityAlert,
  StationAdminSecuritySummary,
  StationAdminSessionSummary,
  StationAdminSessionsQuery,
  StationEventFilters,
  StationInvestigationFilters,
  MarineWorkflowEventFilters,
  MarineWorkflowInvestigationFilters,
  MarineWorkflowAlertFilters,
} from "../../web/lib/api/types";

export interface RouteRequest<TBody = undefined, TQuery = undefined> {
  body: TBody;
  query?: TQuery;
  auth?: OceanStationAdminAuthContext;
}

export interface RouteResponse<TData> {
  status: number;
  json: TData;
  headers?: Record<string, string>;
  telemetry?: unknown;
}

export interface RouteDefinition<TResponse, TBody = undefined, TQuery = undefined> {
  method: "GET" | "POST" | "PATCH";
  path: string;
  handler: (request: RouteRequest<TBody, TQuery>) => RouteResponse<TResponse>;
}

export interface RegionsResponse {
  regions: Array<{
    id: string;
    name: string;
    status: string;
    summary: string;
    metrics: OceanMapRegionMetric[];
  }>;
  map: OceanMapWorkspaceData;
}

export type RegionsFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface RegionsTelemetry {
  route: "GET /regions";
  source: "db" | "mock";
  regionCount: number;
  mapSource: "mock";
  mapStatsSource: "db_enriched_mock" | "mock";
  metricsSource: "db" | "mock";
  regionMetricsSource: "db" | "mock";
  statsSource: "db" | "mock";
  layersSource: "db" | "mock";
  overlayEntitiesSource: "db" | "mock";
  spatialOverlaysSource: "db" | "mock";
  fallbackReason?: RegionsFallbackReason;
}

export interface DatasetsResponse {
  actions: DataExplorerWorkspaceData["actions"];
  datasets: DataExplorerWorkspaceData["datasets"];
  previewSeries: DataExplorerWorkspaceData["previewSeries"];
  metadata: DataExplorerWorkspaceData["metadata"];
  summarySignals: DataExplorerWorkspaceData["summarySignals"];
  pageInfo?: DataExplorerPageInfo;
}

export interface DatasetDetailResponse {
  id: string;
  name: string;
  category: string;
  region: string;
  updated: string;
  records: string;
  status: DataExplorerWorkspaceData["datasets"][number]["status"];
  metadata: Record<string, unknown> | null;
}

export interface DatasetListQuery {
  q?: string;
  category?: string;
  region?: string;
  status?: string;
  sortBy?: DataExplorerDatasetSortBy | string;
  sortDir?: DataExplorerSortDirection | string;
  page?: number | string;
  pageSize?: number | string;
}

export type DatasetFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface DatasetsTelemetry {
  route: "GET /datasets";
  source: "db" | "mock";
  datasetCount: number;
  filtersApplied: boolean;
  filterSummary?: DatasetListQuery;
  sortBy: DataExplorerDatasetSortBy;
  sortDir: DataExplorerSortDirection;
  page: number;
  pageSize: number;
  fallbackReason?: DatasetFallbackReason;
}

export interface DatasetDetailTelemetry {
  route: "GET /datasets/:id";
  datasetId: string;
  source: "db" | "mock";
  result: "found" | "not_found";
  metadataSource?: "db_full" | "db_partial" | "mock";
  fallbackReason?: DatasetFallbackReason;
}

export interface DatasetRecordsResponse {
  records: DataExplorerRelatedRecord[];
  pageInfo?: DataExplorerRelatedRecordsPageInfo;
}

export interface DatasetRecordsQuery {
  sortBy?: DataExplorerRelatedRecordSortBy | string;
  sortDir?: DataExplorerSortDirection | string;
  page?: number | string;
  pageSize?: number | string;
}

export interface DatasetRecordsTelemetry {
  route: "GET /datasets/:id/records";
  datasetId: string;
  source: "db" | "mock";
  recordCount: number;
  result: "found" | "empty" | "not_found";
  sortBy: DataExplorerRelatedRecordSortBy;
  sortDir: DataExplorerSortDirection;
  page: number;
  pageSize: number;
  fallbackReason?: DatasetFallbackReason;
}

export interface InvestigationsResponse {
  workspace: InvestigationsWorkspaceData;
}

export type InvestigationFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface InvestigationsTelemetry {
  route: "GET /investigations";
  source: "db" | "mock";
  trackCount: number;
  fallbackReason?: InvestigationFallbackReason;
}

export interface InvestigationTimelineResponse {
  timeline: InvestigationTimelineItem[];
}

export interface InvestigationTimelineQuery {
  eventType?: InvestigationTimelineEventType;
  limit?: number | string;
}

export interface InvestigationTimelineTelemetry {
  route: "GET /investigations/:id/timeline";
  source: "db" | "mock";
  investigationId: string;
  eventCount: number;
  filtersApplied: boolean;
  fallbackReason?: InvestigationFallbackReason;
}

export interface InvestigationEventCreateRequest {
  id: string;
  eventType: InvestigationTimelineEventType;
  source: string;
  actor?: string;
  summary: string;
  detail?: string;
  confidence?: number;
}

export interface InvestigationEventCreateResponse {
  event: InvestigationTimelineItem;
}

export interface InvestigationEventCreateTelemetry {
  route: "POST /investigations/:id/events";
  source: "db" | "mock";
  investigationId: string;
  result: "created" | "invalid" | "not_found";
  fallbackReason?: InvestigationFallbackReason;
  validationError?: string;
}

export type SignalFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface SignalsListResponse {
  signals: SignalDetection[];
}

export interface SignalsListQuery {
  signalType?: SignalType;
  severity?: SignalSeverity;
  status?: SignalStatus;
  region?: string;
  stationId?: string;
  limit?: number | string;
}

export interface SignalsListTelemetry {
  route: "GET /signals";
  source: "db" | "mock";
  signalCount: number;
  filtersApplied: boolean;
  fallbackReason?: SignalFallbackReason;
}

export interface SignalDetailResponse {
  signal: SignalDetection;
}

export interface SignalDetailTelemetry {
  route: "GET /signals/:id";
  source: "db" | "mock";
  signalId: string;
  result: "found" | "not_found";
  fallbackReason?: SignalFallbackReason;
}

export interface SignalCreateRequest extends CreateSignalInput {}

export interface SignalCreateResponse {
  signal: SignalDetection;
}

export interface SignalCreateTelemetry {
  route: "POST /signals";
  source: "db" | "mock";
  result: "created" | "invalid";
  fallbackReason?: SignalFallbackReason;
  validationError?: string;
}

export interface SignalPromoteRequest {
  id: string;
  investigationId: string;
  actor?: string;
}

export interface SignalPromoteResponse {
  signal: SignalDetection;
}

export interface SignalPromoteTelemetry {
  route: "POST /signals/:id/promote";
  source: "db" | "mock";
  signalId: string;
  investigationId: string;
  result: "promoted" | "invalid" | "not_found";
  fallbackReason?: SignalFallbackReason;
  validationError?: string;
}

export interface SignalDismissRequest {
  id: string;
  actor?: string;
}

export interface SignalDismissResponse {
  signal: SignalDetection;
}

export interface SignalDismissTelemetry {
  route: "POST /signals/:id/dismiss";
  source: "db" | "mock";
  signalId: string;
  result: "dismissed" | "invalid" | "not_found";
  fallbackReason?: SignalFallbackReason;
  validationError?: string;
}

export type SpeciesFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface SpeciesListResponse {
  species: SpeciesProfile[];
}

export interface SpeciesListQuery {
  region?: string;
  conservationStatus?: SpeciesConservationStatus;
  limit?: number | string;
}

export interface SpeciesListTelemetry {
  route: "GET /species";
  source: "db" | "mock";
  speciesCount: number;
  filtersApplied: boolean;
  fallbackReason?: SpeciesFallbackReason;
}

export interface SpeciesDetailResponse {
  species: SpeciesProfile;
}

export interface SpeciesDetailTelemetry {
  route: "GET /species/:id";
  source: "db" | "mock";
  speciesId: string;
  result: "found" | "not_found";
  fallbackReason?: SpeciesFallbackReason;
}

export interface SpeciesSightingsResponse {
  sightings: SpeciesSighting[];
}

export interface SpeciesSightingsQuery {
  speciesId?: string;
  region?: string;
  stationId?: string;
  verificationStatus?: SpeciesSightingVerificationStatus;
  limit?: number | string;
}

export interface SpeciesSightingsTelemetry {
  route: "GET /species/:id/sightings";
  source: "db" | "mock";
  speciesId?: string;
  sightingCount: number;
  filtersApplied: boolean;
  result?: "found" | "not_found";
  fallbackReason?: SpeciesFallbackReason;
}

export interface SpeciesMovementSignalsResponse {
  movementSignals: SpeciesMovementSignal[];
}

export interface SpeciesMovementSignalsQuery {
  movementType?: SpeciesMovementSignalFilters["movementType"];
  minConfidence?: number | string;
  startDate?: string;
  endDate?: string;
  region?: string;
  stationId?: string;
  investigationId?: string;
  limit?: number | string;
}

export interface SpeciesMovementSignalsTelemetry {
  route: "GET /species/:id/movement-signals";
  source: "db" | "mock";
  speciesId: string;
  signalCount: number;
  filtersApplied: boolean;
  result: "found" | "not_found";
  fallbackReason?: SpeciesFallbackReason;
}

export interface SpeciesSightingCreateRequest extends CreateSpeciesSightingInput {
  csrfToken?: string;
}

export interface SpeciesSightingCreateResponse {
  sighting: SpeciesSighting;
}

export interface SpeciesSightingCreateTelemetry {
  route: "POST /species/sightings";
  source: "db" | "mock";
  result: "created" | "invalid" | "not_found" | "forbidden" | "unauthenticated";
  fallbackReason?: SpeciesFallbackReason;
  validationError?: string;
  verificationStatus?: string;
  actorId?: string;
}

export interface OceanStationsResponse {
  stations: OceanStationSummary[];
}

export type StationDetailResponse = OceanStationDetail;

export type OceanStationsFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface OceanStationsTelemetry {
  route: "GET /stations";
  source: "db" | "mock";
  stationCount: number;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface OceanStationDetailTelemetry {
  route: "GET /stations/:id";
  stationId: string;
  source: "db" | "mock";
  result: "found" | "not_found";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationViewTrackRequest {
  id: string;
  viewType: OceanStationViewType;
}

export interface StationViewTrackResponse {
  ok: true;
  stationId: string;
  viewType: OceanStationViewType;
  viewedAt: string;
}

export interface StationViewTrackTelemetry {
  route: "POST /stations/:id/views";
  stationId: string;
  viewType: OceanStationViewType;
  source: "db" | "mock";
  result: "recorded" | "not_found";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface OceanStationAnalyticsResponse {
  analytics: OceanStationAnalytics;
}

export interface OceanStationAnalyticsTelemetry {
  route: "GET /stations/:id/analytics";
  stationId: string;
  source: "db" | "mock";
  result: "found" | "not_found";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationAlertAcknowledgeRequest {
  id: string;
  alertId: string;
  actorId: string;
}

export interface StationAlertAcknowledgeResponse {
  ok: true;
  alert: OceanStationAlert;
  timelineEvent?: OceanStationTimelineItem;
}

export interface StationAlertAcknowledgeTelemetry {
  route: "POST /stations/:id/alerts/:alertId/acknowledge";
  stationId: string;
  alertId: string;
  source: "db" | "mock";
  result: "acknowledged" | "already_acknowledged" | "not_found";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface OceanStationAdminResponse {
  station: OceanStationDetail;
}

export interface OceanStationAdminTelemetry {
  route: "GET /stations/:id/admin";
  stationId: string;
  source: "db" | "mock";
  result: "found" | "not_found" | "forbidden";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface OceanStationAdminAuditResponse {
  entries: OceanStationAdminAuditEntry[];
}

export interface OceanStationAdminAuditTelemetry {
  route: "GET /stations/:id/admin/audit";
  stationId: string;
  source: "db" | "mock";
  result: "found" | "not_found" | "forbidden";
  entryCount?: number;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationAdminSessionAuthRequest {
  sessionId: string;
}

export interface StationAdminSessionAuthResponse {
  auth: OceanStationAdminAuthContext;
}

export interface StationAdminSessionAuthTelemetry {
  route: "POST /station-admin/session";
  source: "db" | "mock";
  result: "found" | "not_found";
  actorId?: string;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationAdminAuthEventsResponse {
  events: StationAdminAuthEvent[];
  nextCursor: string | null;
}

export interface StationAdminAuthEventsTelemetry {
  route: "GET /station-admin/events";
  source: "db" | "mock";
  result: "found" | "forbidden";
  eventCount?: number;
  filtersApplied: boolean;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationAdminAuthEventsExportResponse {
  export: StationAdminAuthEventExportPayload;
}

export interface StationAdminAuthEventsExportTelemetry {
  route: "GET /station-admin/events/export";
  source: "db" | "mock";
  result: "exported" | "forbidden";
  eventCount?: number;
  filtersApplied: boolean;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationAdminSessionsResponse {
  sessions: StationAdminSessionSummary[];
}

export interface StationAdminSessionsTelemetry {
  route: "GET /station-admin/sessions";
  source: "db" | "mock";
  result: "found" | "forbidden";
  sessionCount?: number;
  filtersApplied: boolean;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationAdminSecuritySummaryResponse {
  summary: StationAdminSecuritySummary;
}

export interface StationAdminSecuritySummaryTelemetry {
  route: "GET /station-admin/security/summary";
  source: "db" | "mock";
  result: "found" | "forbidden";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationAdminSecurityAlertsResponse {
  alerts: StationAdminSecurityAlert[];
}

export interface StationAdminSecurityAlertsTelemetry {
  route: "GET /station-admin/security/alerts";
  source: "db" | "mock";
  result: "found" | "forbidden";
  alertCount?: number;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationPatchRequest {
  id: string;
  patch: OceanStationAdminPatch;
  csrfToken: string;
}

export interface StationBrandingPatchRequest {
  id: string;
  patch: OceanStationAdminBrandingPatch;
  csrfToken: string;
}

export interface StationContentPatchRequest {
  id: string;
  patch: OceanStationAdminContentPatch;
  csrfToken: string;
}

export interface StationPatchResponse {
  station: OceanStationDetail;
}

export interface StationPatchTelemetry {
  route: "PATCH /stations/:id" | "PATCH /stations/:id/branding" | "PATCH /stations/:id/content";
  stationId: string;
  source: "db" | "mock";
  result: "updated" | "not_found" | "invalid" | "forbidden";
  actorId?: string;
  fallbackReason?: OceanStationsFallbackReason;
  validationError?: string;
}

export interface AnalyzeRequestBody {
  prompt: string;
  context?: string[];
}

export type AnalyzeResponseSection = AiLabWorkspaceData["results"][number];

export interface AnalyzeResponse {
  prompt: string;
  summary: AnalyzeResponseSection;
  findings: AnalyzeResponseSection;
  evidence: AnalyzeResponseSection;
  confidence: AnalyzeResponseSection;
  uncertainty: AnalyzeResponseSection;
  suggestedNextActions: AnalyzeResponseSection;
  sources: AiLabSourceReference[];
}

export type AiLabFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface AiLabTelemetry {
  route: "GET /ai/lab";
  source: "db" | "mock";
  analysisCount: number;
  promptSource: "db" | "mock";
  summarySource: "db" | "mock";
  confidenceSource: "db" | "mock";
  resultsSource: "db" | "mixed" | "mock";
  sourcesSource: "db" | "mock";
  suggestedPromptsSource: "db" | "mock";
  fallbackReason?: AiLabFallbackReason;
}

export type DashboardFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface DashboardTelemetry {
  route: "GET /dashboard";
  source: "db" | "mock";
  openAlertCount?: number;
  activityItemCount: number;
  activitySource: "db" | "mock";
  speciesActivitySource?: "db" | "unavailable";
  fallbackReason?: DashboardFallbackReason;
}

export type LiveConditionsFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface LiveConditionsResponse {
  conditions: LiveMarineCondition[];
}

export interface LiveConditionsTelemetry {
  route: "GET /live-conditions";
  source: "db" | "mock";
  conditionCount: number;
  fallbackReason?: LiveConditionsFallbackReason;
}

export type ReefAlertsFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface ReefAlertsResponse {
  alerts: ReefStressWatchItem[];
}

export interface ReefAlertsTelemetry {
  route: "GET /reef-alerts";
  source: "db" | "mock";
  alertCount: number;
  fallbackReason?: ReefAlertsFallbackReason;
}

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

// Station admin session lifecycle

export interface StationAdminLoginRequest {
  actorId: string;
  password: string;
  metadata?: StationAdminRequestMetadata;
}

export interface StationAdminLoginIssuedResponse {
  sessionId: string;
  csrfToken: string;
  expiresAt: string;
  actorId: string;
  role: OceanStationAdminRole;
  permissions: OceanStationAdminPermission[];
  mfa?: StationAdminMfaEnrollmentState;
}

export interface StationAdminLoginPendingMfaResponse {
  result: "pending_mfa";
  actorId: string;
  role: OceanStationAdminRole;
  challenge: StationAdminMfaChallenge;
  mfa: StationAdminMfaEnrollmentState;
}

export type StationAdminLoginResponse =
  | StationAdminLoginIssuedResponse
  | StationAdminLoginPendingMfaResponse;

export interface StationAdminLoginTelemetry {
  route: "POST /station-admin/login";
  result: "issued" | "pending_mfa" | "invalid_credentials" | "invalid_request" | "locked_out";
  actorId?: string;
}

export interface StationAdminMfaVerifyRequest {
  challengeId: string;
  code?: string;
  recoveryCode?: string;
  sessionId?: string;
  csrfToken?: string;
  metadata?: StationAdminRequestMetadata;
}

export interface StationAdminMfaVerifyIssuedResponse {
  result: "issued";
  sessionId: string;
  csrfToken: string;
  expiresAt: string;
  actorId: string;
  role: OceanStationAdminRole;
  permissions: OceanStationAdminPermission[];
  mfa: StationAdminMfaEnrollmentState;
}

export interface StationAdminMfaVerifyConfirmedResponse {
  result: "verified";
  challengePurpose: StationAdminMfaChallenge["purpose"];
  actorId: string;
  mfa: StationAdminMfaEnrollmentState;
}

export type StationAdminMfaVerifyFailureResult =
  | "mfa_failed"
  | "locked_out"
  | "rate_limited"
  // Route contract: expired challenge maps to HTTP 410 Gone.
  | "expired"
  | "not_found"
  | "invalid_request";

export interface StationAdminMfaVerifyErrorResponse {
  result: StationAdminMfaVerifyFailureResult;
  message: string;
  attemptsRemaining?: number;
  lockedOut?: boolean;
  retryAfterSeconds?: number;
}

export type StationAdminMfaVerifyResponse =
  | StationAdminMfaVerifyIssuedResponse
  | StationAdminMfaVerifyConfirmedResponse;

export interface StationAdminMfaVerifyTelemetry {
  route: "POST /station-admin/mfa/verify";
  result: "issued" | "verified" | "mfa_failed" | "locked_out" | "rate_limited" | "expired" | "not_found" | "invalid_request";
  actorId?: string;
}

export interface StationAdminLogoutRequest {
  sessionId: string;
  csrfToken: string;
  metadata?: StationAdminRequestMetadata;
}

export interface StationAdminLogoutResponse {
  ok: true;
}

export interface StationAdminLogoutTelemetry {
  route: "POST /station-admin/logout";
  result: "revoked" | "not_found" | "csrf_invalid";
  actorId?: string;
}

export interface StationAdminRefreshRequest {
  sessionId: string;
  csrfToken: string;
  metadata?: StationAdminRequestMetadata;
}

export interface StationAdminRefreshResponse {
  sessionId: string;
  csrfToken: string;
  expiresAt: string;
}

export interface StationAdminRefreshTelemetry {
  route: "POST /station-admin/session/refresh";
  result: "refreshed" | "not_found" | "csrf_invalid";
  actorId?: string;
}

export interface StationAdminRevokeRequest {
  sessionId: string;
  csrfToken: string;
  targetSessionId: string;
  metadata?: StationAdminRequestMetadata;
}

export interface StationAdminRevokeResponse {
  ok: true;
}

export interface StationAdminRevokeMfaRequiredResponse {
  mfaRequired: true;
  challenge: StationAdminMfaChallenge;
}

export interface StationAdminRevokeTelemetry {
  route: "POST /station-admin/session/revoke";
  result: "revoked" | "mfa_required" | "not_found" | "csrf_invalid" | "forbidden";
  actorId?: string;
}

export interface StationEventsListRequest {
  id: string;
}

export type {
  StationEventListResponse,
  StationEventDetailResponse,
  StationInvestigationListResponse,
  StationInvestigationDetailResponse,
  MarineWorkflowEventsResponse,
  MarineWorkflowInvestigationsResponse,
  MarineWorkflowAlertsResponse,
  MarineWorkflowCreateInvestigationResponse,
  MarineWorkflowAlertActionResponse,
} from "../../web/lib/api/types";

export interface StationEventsListTelemetry {
  route: "GET /stations/:id/events";
  stationId: string;
  source: "db" | "mock";
  result: "found" | "not_found" | "forbidden";
  eventCount?: number;
  filtersApplied: boolean;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationEventDetailTelemetry {
  route: "GET /stations/:id/events/:eventId";
  stationId: string;
  eventId: string;
  source: "db" | "mock";
  result: "found" | "not_found" | "forbidden";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationEventAcknowledgeRequest {
  id: string;
  eventId: string;
  actorId: string;
}

export interface StationEventAcknowledgeResponse {
  ok: true;
  event: StationEventListItem;
}

export interface StationEventAcknowledgeTelemetry {
  route: "POST /stations/:id/events/:eventId/acknowledge";
  stationId: string;
  eventId: string;
  source: "db" | "mock";
  result: "acknowledged" | "already_acknowledged" | "not_found" | "forbidden";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationInvestigationsListTelemetry {
  route: "GET /stations/:id/investigations";
  stationId: string;
  source: "db" | "mock";
  result: "found" | "not_found" | "forbidden";
  investigationCount?: number;
  filtersApplied: boolean;
  fallbackReason?: OceanStationsFallbackReason;
}

export interface StationInvestigationDetailTelemetry {
  route: "GET /stations/:id/investigations/:investigationId";
  stationId: string;
  investigationId: string;
  source: "db" | "mock";
  result: "found" | "not_found" | "forbidden";
  fallbackReason?: OceanStationsFallbackReason;
}

export interface MarineWorkflowEventsTelemetry {
  route: "GET /marine-intelligence/events";
  source: "db" | "unavailable";
  result: "found" | "forbidden";
  eventCount?: number;
  filtersApplied: boolean;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowInvestigationsTelemetry {
  route: "GET /marine-intelligence/investigations";
  source: "db" | "unavailable";
  result: "found" | "forbidden";
  investigationCount?: number;
  filtersApplied: boolean;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowAlertsTelemetry {
  route: "GET /marine-intelligence/alerts";
  source: "db" | "unavailable";
  result: "found" | "forbidden";
  alertCount?: number;
  filtersApplied: boolean;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowCreateInvestigationTelemetry {
  route: "POST /marine-intelligence/investigations";
  source: "db" | "unavailable";
  result: "created" | "forbidden" | "validation" | "not_found";
  eventId: string;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowAlertActionTelemetry {
  route:
    | "POST /marine-intelligence/alerts/:alertId/acknowledge"
    | "POST /marine-intelligence/alerts/:alertId/resolve";
  source: "db" | "unavailable";
  result: "updated" | "forbidden" | "validation" | "not_found";
  alertId: string;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export type {
  MarineWorkflowCreateInvestigationRequest,
  MarineWorkflowAlertActionRequest,
} from "../../web/lib/api/types";
