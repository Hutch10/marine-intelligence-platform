/**
 * Ontology-resolved related objects for the active investigation.
 * Populated server-side via the ontology resolver layer.
 *
 * Field shapes mirror the OntologyObject types in @/lib/ontology/types —
 * inlined here to avoid a cross-module import that breaks Vite's JSX
 * transform pipeline for test files that import api/types indirectly.
 */

interface _OntologyBase {
  readonly __type: string;
  readonly __rid: string;
  readonly __primaryKey: string;
}

interface _InvestigationNode extends _OntologyBase {
  title: string;
  summary: string;
  confidence: number;
  state: "Correlated" | "Watch" | "Escalated";
}

interface _SpeciesNode extends _OntologyBase {
  commonName: string;
  scientificName: string;
  conservationStatus: string;
  habitatRegion: string;
  summary: string;
}

interface _StationNode extends _OntologyBase {
  slug: string;
  name: string;
  region: string;
  status: string;
  summary: string;
  locationLabel: string;
  depthM: number | null;
}

interface _ObservationNode extends _OntologyBase {
  stationId: string;
  timestamp: string;
  sstC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
}

interface _AlertNode extends _OntologyBase {
  title: string;
  severity: string;
  status: string;
  detail: string | null;
  stationId: string | null;
  linkedInvestigationId: string | null;
  detectedAt: string;
}

export interface InvestigationOntologyNetworkContext {
  investigation: _InvestigationNode | null;
  species: _SpeciesNode[];
  stations: _StationNode[];
  observations: _ObservationNode[];
  alerts: _AlertNode[];
  resolvedAt: string;
}

export type DataAccent = "cyan" | "emerald" | "amber" | "violet" | "rose";

export type DashboardMetricIcon =
  | "fish"
  | "thermometer"
  | "wind"
  | "droplets"
  | "activity"
  | "alert-circle";

export interface DashboardMetric {
  label: string;
  value: string;
  unit?: string;
  change: number;
  icon: DashboardMetricIcon;
  color: DataAccent;
}

export type MissionStatus = "In Progress" | "Pending" | "Complete";

export interface DashboardMission {
  id: string;
  name: string;
  location: string;
  status: MissionStatus;
  progress: number;
  eta: string;
}

export type DashboardActivityType = "sensor" | "species" | "alert" | "report";

export interface DashboardActivityItem {
  type: DashboardActivityType;
  text: string;
  time: string;
}

export interface DashboardQuickAccessItem {
  label: string;
  desc: string;
  href: string;
  color: Extract<DataAccent, "cyan" | "emerald" | "amber" | "violet">;
}

export interface DashboardAnomalySummary {
  totalAnomalies: number;
  elevatedAnomalies: number;
  criticalAnomalies: number;
  regionsAffected: number;
  trendDirection: "up" | "flat" | "down";
}

/**
 * Deterministic, fact-based reason kinds produced by the ecological
 * correlation utility. Each value maps to a single independent rule.
 */
export type EcologicalCorrelationReasonKind =
  | "increased_sighting_rate"
  | "feeding_aggregation_detected"
  | "migration_shift_detected"
  | "species_anomaly_window_overlap"
  | "elevated_movement_confidence";

export interface EcologicalCorrelationReason {
  kind: EcologicalCorrelationReasonKind;
  label: string;
  detail: string;
}

export interface DashboardSpeciesActivityEntry {
  speciesId: string;
  commonName: string;
  sightingCount: number;
}

/** Aggregated species activity summary included in the dashboard overview. */
export interface DashboardSpeciesActivity {
  recentSightingCount: number;
  recentMovementSignalCount: number;
  topMovementTypes: SpeciesMovementType[];
  topActiveSpecies: DashboardSpeciesActivityEntry[];
  ecologicalReasons: EcologicalCorrelationReason[];
  windowDays: number;
  generatedAt: string;
}

export interface DashboardOverviewData {
  metrics: DashboardMetric[];
  missions: DashboardMission[];
  activity: DashboardActivityItem[];
  quickAccess: DashboardQuickAccessItem[];
  anomalySummary?: DashboardAnomalySummary;
  speciesActivity?: DashboardSpeciesActivity;
}

export interface LiveMarineCondition {
  stationId: string;
  timestamp: string;
  sstC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
}

export interface ReefStressWatchItem {
  region: string;
  stationId: string | null;
  timestamp: string;
  sstAnomalyC: number | null;
  hotSpotC: number | null;
  dhw: number | null;
  stressLevel: string | null;
  source: string;
  outputClass: "observed" | "derived" | "inferred";
}

export interface InvestigationFilterGroup {
  label: string;
  value: string;
  accent: Extract<DataAccent, "cyan" | "amber" | "emerald">;
}

export interface InvestigationSignalMetric {
  label: string;
  value: string;
  delta: string;
  icon: "radar" | "layers" | "shield-alert";
}

export type InvestigationTrackState = "Correlated" | "Watch" | "Escalated";

export interface InvestigationAnalysisTrack {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  state: InvestigationTrackState;
}

export type InvestigationHypothesisStatus = "Supported" | "Testing" | "Needs Review";

export interface InvestigationHypothesisEntry {
  id: string;
  title: string;
  owner: string;
  updated: string;
  status: InvestigationHypothesisStatus;
  notes: string;
}

export type InvestigationEvidenceKind = "Satellite" | "Sensor" | "Field Report" | "Model";
export type InvestigationEvidenceStrength = "High" | "Medium" | "Emerging";

export interface InvestigationEvidenceItem {
  id: string;
  source: string;
  kind: InvestigationEvidenceKind;
  timestamp: string;
  strength: InvestigationEvidenceStrength;
  detail: string;
}

export type InvestigationSpeciesCorrelationReasonKind =
  | "linked_movement_signal"
  | "verified_sighting"
  | "pending_verification"
  | "station_overlap"
  | "recent_observation";

export interface InvestigationSpeciesCorrelationReason {
  kind: InvestigationSpeciesCorrelationReasonKind;
  label: string;
  detail: string;
}

export type InvestigationSpeciesResponseTier = "watch" | "elevated" | "priority";

export interface InvestigationSpeciesSummaryEntry {
  speciesId: string;
  commonName: string;
  scientificName: string;
  movementSignalCount: number;
  verifiedSightingCount: number;
  pendingVerificationCount: number;
  matchedStationCount: number;
  lastObservedAt: string | null;
  maxMovementConfidence: number;
  relevanceScore: number;
  responseTier: InvestigationSpeciesResponseTier;
  reasonTrail: InvestigationSpeciesCorrelationReason[];
}

export interface InvestigationSpeciesSummary {
  investigationId: string;
  generatedAt: string;
  speciesCount: number;
  linkedMovementSignalCount: number;
  verifiedSightingCount: number;
  pendingVerificationCount: number;
  entries: InvestigationSpeciesSummaryEntry[];
  explainabilityNote: string;
}

export interface InvestigationsWorkspaceData {
  filterGroups: InvestigationFilterGroup[];
  signalMetrics: InvestigationSignalMetric[];
  analysisTracks: InvestigationAnalysisTrack[];
  hypothesisLog: InvestigationHypothesisEntry[];
  evidenceItems: InvestigationEvidenceItem[];
  timeline: InvestigationTimelineItem[];
  speciesSummary: InvestigationSpeciesSummary | null;
  ontologyNetwork?: InvestigationOntologyNetworkContext;
}

export type InvestigationTimelineEventType = "case_opened" | "signal_linked" | "hypothesis_tested" | "evidence_promoted" | "track_escalated" | "case_closed";

export interface InvestigationTimelineItem {
  id: string;
  timestamp: string;
  eventType: InvestigationTimelineEventType;
  source: string;
  summary: string;
  detail?: string;
}

export interface InvestigationTimelineFilters {
  eventType?: InvestigationTimelineEventType;
  limit?: number;
}

export interface RecordInvestigationEventInput {
  eventType: InvestigationTimelineEventType;
  source: string;
  actor?: string;
  summary: string;
  detail?: string;
  confidence?: number;
}

export type SignalType =
  | "thermal_anomaly"
  | "oxygen_depletion"
  | "migration_anomaly"
  | "chlorophyll_bloom"
  | "current_shear"
  | "station_health";

export type SignalSeverity = "low" | "medium" | "high" | "critical";

export type SignalStatus = "open" | "monitoring" | "promoted" | "dismissed";

export interface SignalDetection {
  id: string;
  signalType: SignalType;
  severity: SignalSeverity;
  confidence: number;
  sourceType: string;
  sourceId: string;
  region: string;
  stationId: string | null;
  title: string;
  summary: string;
  detail: string;
  status: SignalStatus;
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
  linkedInvestigationId: string | null;
}

export interface SignalFilters {
  signalType?: SignalType;
  severity?: SignalSeverity;
  status?: SignalStatus;
  region?: string;
  stationId?: string;
  limit?: number;
}

export interface CreateSignalInput {
  signalType: SignalType;
  severity: SignalSeverity;
  confidence: number;
  sourceType: string;
  sourceId: string;
  region: string;
  stationId?: string;
  title: string;
  summary: string;
  detail: string;
  status?: SignalStatus;
  linkedInvestigationId?: string;
}

export interface PromoteSignalInput {
  investigationId: string;
  actor?: string;
}

export type SpeciesConservationStatus =
  | "least_concern"
  | "near_threatened"
  | "vulnerable"
  | "endangered"
  | "critically_endangered"
  | "data_deficient";

export interface SpeciesProfile {
  id: string;
  commonName: string;
  scientificName: string;
  conservationStatus: SpeciesConservationStatus;
  habitatRegion: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpeciesFilters {
  region?: string;
  conservationStatus?: SpeciesConservationStatus;
  limit?: number;
}

export interface SpeciesSighting {
  id: string;
  speciesId: string;
  stationId: string | null;
  region: string;
  observedAt: string;
  latitude: number;
  longitude: number;
  count: number;
  source: string;
  summary: string;
  verificationStatus: SpeciesSightingVerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
}

export type SpeciesSightingVerificationStatus = "pending" | "verified" | "rejected";

export interface SpeciesSightingFilters {
  speciesId?: string;
  region?: string;
  stationId?: string;
  verificationStatus?: SpeciesSightingVerificationStatus;
  limit?: number;
}

export interface CreateSpeciesSightingInput {
  speciesId: string;
  stationId?: string;
  region: string;
  observedAt?: string;
  latitude: number;
  longitude: number;
  count: number;
  source: string;
  summary: string;
  verificationStatus?: SpeciesSightingVerificationStatus;
}

export type SpeciesMovementType =
  | "route_deviation"
  | "aggregation_shift"
  | "habitat_exit"
  | "unusual_presence"
  | "seasonal_mismatch";

export interface SpeciesMovementSignal {
  id: string;
  speciesId: string;
  signalId: string | null;
  investigationId: string | null;
  movementType: SpeciesMovementType;
  confidence: number;
  summary: string;
  createdAt: string;
}

export interface SpeciesMovementSignalFilters {
  movementType?: SpeciesMovementType;
  minConfidence?: number;
  startDate?: string;
  endDate?: string;
  region?: string;
  stationId?: string;
  investigationId?: string;
  limit?: number;
}

export type ExplorerActionTone = "primary" | "secondary";

export interface ExplorerAction {
  label: string;
  icon: "play" | "download" | "layers";
  tone: ExplorerActionTone;
}

export type DatasetStatus = "Curated" | "Live" | "Draft";

export interface DataExplorerDatasetRow {
  id: string;
  name: string;
  category: string;
  region: string;
  updated: string;
  records: string;
  status: DatasetStatus;
}

export interface DataExplorerDatasetFilters {
  q?: string;
  category?: string;
  region?: string;
  status?: string;
  sortBy?: DataExplorerDatasetSortBy;
  sortDir?: DataExplorerSortDirection;
  page?: number;
  pageSize?: number;
}

export type DataExplorerDatasetSortBy = "updated" | "name" | "records" | "status";
export type DataExplorerSortDirection = "asc" | "desc";

export interface DataExplorerPageInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sortBy: DataExplorerDatasetSortBy;
  sortDir: DataExplorerSortDirection;
}

export interface DataExplorerPreviewSeriesPoint {
  label: string;
  value: number;
}

export interface DataExplorerMetadataItem {
  label: string;
  value: string;
}

export interface DataExplorerSummarySignal {
  title: string;
  detail: string;
  tone: Extract<DataAccent, "cyan" | "emerald" | "amber">;
}

export interface DataExplorerWorkspaceData {
  actions: ExplorerAction[];
  datasets: DataExplorerDatasetRow[];
  previewSeries: DataExplorerPreviewSeriesPoint[];
  metadata: DataExplorerMetadataItem[];
  summarySignals: DataExplorerSummarySignal[];
  pageInfo?: DataExplorerPageInfo;
}

export interface DataExplorerDatasetDetail {
  id: string;
  name: string;
  category: string;
  region: string;
  updated: string;
  records: string;
  status: DatasetStatus;
  metadata: Record<string, unknown> | null;
}

export interface DataExplorerRelatedRecord {
  id: string;
  title: string;
  type: string;
  status: string;
  updated: string;
  summary?: string;
}

export type DataExplorerRelatedRecordSortBy = "updated" | "status" | "title" | "type";

export interface DataExplorerRelatedRecordsQuery {
  sortBy?: DataExplorerRelatedRecordSortBy;
  sortDir?: DataExplorerSortDirection;
  page?: number;
  pageSize?: number;
}

export interface DataExplorerRelatedRecordsPageInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sortBy: DataExplorerRelatedRecordSortBy;
  sortDir: DataExplorerSortDirection;
}

export interface DataExplorerRelatedRecordsResult {
  records: DataExplorerRelatedRecord[];
  pageInfo?: DataExplorerRelatedRecordsPageInfo;
}

export type DataExplorerFetchSection = "workspace" | "detail" | "records";
export type DataExplorerFetchSource = "db" | "mock";
export type DataExplorerFetchState = "success" | "not_found" | "error";
export type DataExplorerFetchDelivery = "bootstrap_api" | "browser_api" | "in_process" | "fallback_builder";

export interface DataExplorerFetchMeta {
  section: DataExplorerFetchSection;
  state: DataExplorerFetchState;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  delivery?: DataExplorerFetchDelivery;
  source?: DataExplorerFetchSource;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
  datasetId?: string;
  errorMessage?: string;
}

export interface DataExplorerWorkspaceFetchResult {
  data: DataExplorerWorkspaceData;
  meta: DataExplorerFetchMeta;
}

export interface DataExplorerDatasetDetailFetchResult {
  data: DataExplorerDatasetDetail | null;
  meta: DataExplorerFetchMeta;
}

export interface DataExplorerRelatedRecordsFetchResult {
  data: DataExplorerRelatedRecordsResult | null;
  meta: DataExplorerFetchMeta;
}

export interface OceanMapLayerControl {
  label: string;
  description: string;
  active: boolean;
  accent: Extract<DataAccent, "cyan" | "emerald" | "amber">;
  overlayCategory?: OceanMapSpatialOverlayCategory;
}

export interface OceanMapStat {
  label: string;
  value: string;
  icon: "satellite" | "radar" | "route";
}

export interface OceanMapRegionMetric {
  label: string;
  value: string;
}

export interface OceanMapOverlayEntity {
  id: string;
  label: string;
  region: string;
  severity: "high" | "medium" | "low";
  status: string;
  detail: string;
  detectedAt: string;
}

export type OceanMapSpatialOverlayCategory =
  | "sightings"
  | "movement_signals"
  | "hotspots"
  | "corridors_foundation";

export interface OceanMapSightingOverlay {
  id: string;
  speciesId: string;
  commonName: string;
  region: string;
  stationId: string | null;
  latitude: number;
  longitude: number;
  count: number;
  verificationStatus: SpeciesSightingVerificationStatus;
  observedAt: string;
  detail: string;
}

export interface OceanMapMovementSignalOverlay {
  id: string;
  speciesId: string;
  commonName: string;
  region: string;
  stationId: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: "station" | "unavailable";
  signalId: string | null;
  investigationId: string | null;
  movementType: SpeciesMovementType;
  confidence: number;
  createdAt: string;
  detail: string;
}

export type OceanMapHotspotType = "sighting_cluster" | "movement_cluster" | "mixed_activity";

export interface OceanMapHotspotOverlay {
  id: string;
  label: string;
  region: string;
  stationId: string | null;
  latitude: number | null;
  longitude: number | null;
  hotspotType: OceanMapHotspotType;
  severity: OceanMapOverlayEntity["severity"];
  recentSightingCount: number;
  recentMovementSignalCount: number;
  observedIndividualCount: number;
  dominantMovementTypes: SpeciesMovementType[];
  topSpecies: string[];
  activityScore: number;
  detail: string;
}

export interface OceanMapCorridorAnchorPoint {
  label: string;
  latitude: number;
  longitude: number;
}

export interface OceanMapCorridorFoundation {
  id: string;
  label: string;
  region: string;
  priority: OceanMapOverlayEntity["severity"];
  hotspotIds: string[];
  stationIds: string[];
  movementTypes: SpeciesMovementType[];
  speciesNames: string[];
  anchorPoints: OceanMapCorridorAnchorPoint[];
  geometryStatus: "grouped_without_geometry";
  summary: string;
}

export interface OceanMapSpatialOverlays {
  categories: OceanMapSpatialOverlayCategory[];
  sightings: OceanMapSightingOverlay[];
  movementSignals: OceanMapMovementSignalOverlay[];
  hotspots: OceanMapHotspotOverlay[];
  corridorsFoundation: OceanMapCorridorFoundation[];
  generatedAt: string;
  windowDays: number;
}

export interface OceanMapTimelineStep {
  label: string;
  active: boolean;
}

export interface OceanMapWorkspaceData {
  layers: OceanMapLayerControl[];
  mapStats: OceanMapStat[];
  regionMetrics: OceanMapRegionMetric[];
  overlayEntities: OceanMapOverlayEntity[];
  spatialOverlays?: OceanMapSpatialOverlays;
  timelineSteps: OceanMapTimelineStep[];
}

export type OceanStationAlertSeverity = "high" | "medium" | "low";
export type OceanStationThemeAccent = "cyan" | "emerald" | "amber" | "violet" | "rose";

export interface OceanStationBranding {
  sponsorName: string;
  operatorName: string;
  logoUrl: string | null;
  logoLabel: string;
  exhibitTitle: string;
  accentColor: OceanStationThemeAccent;
  publicDescription: string;
}

export interface OceanStationSummary {
  id: string;
  slug: string;
  name: string;
  region: string;
  status: string;
  summary: string;
  locationLabel: string;
  depthM: number | null;
  lastReported: string;
  heroMetric: string;
  branding: OceanStationBranding;
}

export interface OceanStationSpecies {
  id: string;
  name: string;
  status: string;
  populationTrend: string;
  observedAt: string;
  notes: string;
}

export interface OceanStationSensor {
  id: string;
  name: string;
  category: string;
  value: string;
  unit: string | null;
  status: string;
  sampledAt: string;
}

export interface OceanStationAlert {
  id: string;
  title: string;
  severity: OceanStationAlertSeverity;
  status: string;
  detail: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface OceanStationTimelineItem {
  id: string;
  label: string;
  phase: string;
  detail: string;
  happenedAt: string;
}

export interface OceanStationContentItem {
  id: string;
  contentType: string;
  title: string;
  summary: string;
  href: string | null;
  publishedAt: string;
}

export interface OceanStationDetail extends OceanStationSummary {
  species: OceanStationSpecies[];
  sensors: OceanStationSensor[];
  alerts: OceanStationAlert[];
  timeline: OceanStationTimelineItem[];
  content: OceanStationContentItem[];
}

export type OceanStationViewType = "detail" | "exhibit" | "public";

export interface OceanStationViewCounts {
  detail: number;
  exhibit: number;
  public: number;
  total: number;
}

export interface OceanStationAnalytics {
  stationId: string;
  views: OceanStationViewCounts;
  lastViewedAt: string | null;
}

export type OceanStationAdminRole = "admin" | "viewer";

export type OceanStationAdminPermission =
  | "station.view_admin"
  | "station.edit_branding"
  | "station.edit_content"
  | "station.view_audit"
  | "station.publish"
  | "species.submit_sighting"
  | "species.verify_sighting"
  | "species.annotate_sighting";

/**
 * Logical role for species sighting operations.
 * Maps to species.* permission sets; does not replace OceanStationAdminRole.
 * - observer:   species.submit_sighting (pending only)
 * - researcher: species.submit_sighting + species.verify_sighting
 * - scientist:  species.submit_sighting + species.verify_sighting + species.annotate_sighting
 * - admin:      all species permissions
 */
export type SpeciesSightingRole = "observer" | "researcher" | "scientist" | "admin";

export type StationAdminMfaChallengePurpose = "login" | "session_revoke" | "permission_mutation";

export interface StationAdminMfaChallenge {
  challengeId: string;
  purpose: StationAdminMfaChallengePurpose;
  expiresAt: string;
  recoveryCodeAllowed: boolean;
}

export interface StationAdminMfaEnrollmentState {
  enabled: boolean;
  enrolledAt: string | null;
  lastVerifiedAt: string | null;
  recoveryCodesRemaining: number;
}

export interface OceanStationAdminAuthContext {
  actorId: string;
  role: OceanStationAdminRole;
  permissions: OceanStationAdminPermission[];
  csrfToken: string;
  mfa?: StationAdminMfaEnrollmentState;
  /**
   * OIDC claims for this session.
   * Present when the session was issued with AMR/ACR tracking (post-migration).
   * Used for downstream authorization decisions and future OIDC token generation.
   */
  oidc?: StationAdminOidcClaims;
}

export type StationAdminAuthEventType =
  | "login_success"
  | "login_failure"
  | "login_locked"
  | "mfa_enrollment"
  | "mfa_challenge_success"
  | "mfa_challenge_failure"
  | "mfa_challenge_locked"
  | "mfa_challenge_expired"
  | "mfa_verify_rate_limited"
  | "mfa_abuse_detected"
  | "recovery_code_used"
  | "logout"
  | "refresh"
  | "revoke";

export interface StationAdminRequestMetadata {
  ip?: string | null;
  userAgent?: string | null;
  source?: string | null;
}

export interface StationAdminAuthEvent {
  id: string;
  eventType: StationAdminAuthEventType;
  actorId: string | null;
  sessionId: string | null;
  occurredAt: string;
  ip: string | null;
  userAgent: string | null;
  source: string | null;
}

export interface StationAdminAuthEventFilters {
  eventType?: StationAdminAuthEventType;
  actor?: string;
  ip?: string;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
}

export interface StationAdminAuthEventPage {
  events: StationAdminAuthEvent[];
  nextCursor: string | null;
}

export interface StationAdminAuthEventExportPayload {
  format: "json";
  fileName: string;
  exportedAt: string;
  filters: StationAdminAuthEventFilters;
  events: StationAdminAuthEvent[];
}

export interface StationAdminSessionSummary {
  id: string;
  actorId: string;
  actorRole: OceanStationAdminRole;
  issuedAt: string;
  expiresAt: string;
  lastActiveAt: string | null;
  ip: string | null;
  userAgent: string | null;
  source: string | null;
}

export interface StationAdminSessionsQuery {
  limit?: number;
}

export interface StationAdminSecuritySummary {
  activeSessionCount: number;
  loginSuccessCount24h: number;
  loginFailureCount24h: number;
  lockoutCount24h: number;
  revokeCount24h: number;
  uniqueIpCount24h: number;
  lastEventAt: string | null;
}

export type StationAdminSecurityAlertType =
  | "repeated_login_failures_same_ip"
  | "many_actor_login_failures_one_ip"
  | "actor_login_many_ips"
  | "repeated_lockouts";

export type StationAdminSecurityAlertSeverity = "low" | "medium" | "high";

export interface StationAdminSecurityAlert {
  alertType: StationAdminSecurityAlertType;
  severity: StationAdminSecurityAlertSeverity;
  actorId: string | null;
  ip: string | null;
  eventCount: number;
  timeWindow: string;
}

export type OperationalAlertStatus = "active" | "resolved";

export type OperationalAlertRuleType =
  | "source_failed"
  | "source_stale"
  | "repeated_degraded"
  | "persistence_failure";

export type OperationalAlertSeverity = "critical" | "warning" | "info";

export type OperationalAlertsFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";

export interface OperationalAlertItem {
  id: string;
  source: string;
  ruleType: OperationalAlertRuleType;
  severity: OperationalAlertSeverity;
  status: OperationalAlertStatus;
  title: string;
  detail: string | null;
  detectedAt: number;
  resolvedAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalAlertsSummary {
  activeAlertCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  failedSourceCount: number;
  staleSourceCount: number;
  lastUpdatedAt: string;
}

export interface OperationalAlertsFilters {
  status?: OperationalAlertStatus;
  source?: string;
  ruleType?: OperationalAlertRuleType;
  limit?: number;
  historyLimit?: number;
}

export interface OperationalAlertsData {
  source: "db" | "unavailable";
  fallbackReason: OperationalAlertsFallbackReason | null;
  generatedAt: string;
  summary: OperationalAlertsSummary;
  activeAlerts: OperationalAlertItem[];
  recentHistory: OperationalAlertItem[];
}

// ---------------------------------------------------------------------------
// OIDC / SSO readiness — AMR and ACR claims
//
// These types support future integration with OIDC providers (e.g., Auth0,
// Keycloak, AWS Cognito) where authentication context must be expressed as
// standard claims in JWTs or session tokens.
//
// AMR (Authentication Methods References) — RFC 8176
//   Expresses which authentication factors were used:
//   - "pwd"   password verification
//   - "mfa"   a second factor (TOTP, recovery code)
//   - "otp"   one-time password specifically
//   - "sso"   federated single sign-on
//
// ACR (Authentication Context Class Reference) — OIDC Core §2
//   Expresses the required or achieved assurance level:
//   - "urn:mfa:required"  session was issued only after MFA verification
//   - "urn:pwd:only"      session was issued without MFA (MFA not enrolled)
//   - "urn:sso:federated" session was issued via federated SSO
// ---------------------------------------------------------------------------

export type StationAdminAmrValue = "pwd" | "mfa" | "otp" | "sso";

export type StationAdminAcrValue =
  | "urn:mfa:required"
  | "urn:pwd:only"
  | "urn:sso:federated";

/**
 * OIDC claims attached to an authenticated session.
 * Populated at session issuance and preserved for downstream authorization.
 *
 * Where these are attached:
 *   - Backend: `station_admin_sessions.amr` and `station_admin_sessions.acr` columns (see migration M-3)
 *   - API responses: included in `OceanStationAdminAuthContext`
 *   - Future JWT: mapped to standard `amr` and `acr` claims
 */
export interface StationAdminOidcClaims {
  /**
   * Authentication methods used during this session's login.
   * Ordered from least to most recent factor.
   * Example: ["pwd", "mfa"]
   */
  amr: StationAdminAmrValue[];
  /**
   * Authentication context class achieved.
   * Reflects whether MFA was required and completed.
   */
  acr: StationAdminAcrValue;
}

export type OceanStationAdminAuditArea = "branding" | "content";

export interface OceanStationAdminAuditEntry {
  id: string;
  stationId: string;
  actorId: string;
  actorRole: OceanStationAdminRole | "unknown";
  area: OceanStationAdminAuditArea;
  changedAt: string;
  changedFields: string[];
}

export interface OceanStationAdminBrandingPatch {
  sponsorName?: string;
  operatorName?: string;
  exhibitTitle?: string;
  publicDescription?: string;
  accentColor?: OceanStationThemeAccent;
}

export interface OceanStationAdminSpeciesItem {
  name: string;
  status: string;
  populationTrend: string;
  notes: string;
}

export interface OceanStationAdminAlertItem {
  title: string;
  severity: OceanStationAlertSeverity;
  status: string;
  detail: string;
}

export interface OceanStationAdminTimelineItem {
  label: string;
  phase: string;
  detail: string;
}

export interface OceanStationAdminContentItem {
  contentType: string;
  title: string;
  summary: string;
  href?: string | null;
}

export interface OceanStationAdminContentPatch {
  species?: OceanStationAdminSpeciesItem[];
  alerts?: OceanStationAdminAlertItem[];
  timeline?: OceanStationAdminTimelineItem[];
  content?: OceanStationAdminContentItem[];
}

export interface OceanStationAdminPatch extends OceanStationAdminBrandingPatch, OceanStationAdminContentPatch {}

export interface AiLabSuggestedPrompt {
  title: string;
  detail: string;
}

export interface AiLabPromptContext {
  prompt: string;
  tags: string[];
}

export interface AiLabResultSection {
  title: string;
  body: string;
  icon: "sparkles" | "microscope" | "book-open-text" | "check-circle" | "shield-question" | "target";
  accent: Extract<DataAccent, "cyan" | "emerald" | "amber" | "violet">;
}

export type AiLabSourceType = "Dataset" | "Field Report" | "Model" | "Literature";

export interface AiLabSourceReference {
  id: string;
  title: string;
  type: AiLabSourceType;
  note: string;
  freshness: string;
}

export interface AiLabWorkspaceData {
  promptContext: AiLabPromptContext;
  suggestedPrompts: AiLabSuggestedPrompt[];
  results: AiLabResultSection[];
  sources: AiLabSourceReference[];
}

// ---------------------------------------------------------------------------
// Station event system (read-first)
// ---------------------------------------------------------------------------

export type StationEventType =
  | "thermal_spike"
  | "dissolved_oxygen_drop"
  | "salinity_shift"
  | "ph_drop"
  | "turbidity_spike"
  | "sensor_health_degraded";

export type StationEventSeverity = "low" | "medium" | "high";

export type StationEventStatus =
  | "new"
  | "acknowledged"
  | "investigating"
  | "resolved"
  | "archived";

export type StationInvestigationStatus =
  | "open"
  | "monitoring"
  | "closed"
  | "archived";

export interface StationEventFilters {
  status?: StationEventStatus;
  severity?: StationEventSeverity;
  eventType?: StationEventType;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
}

export interface StationInvestigationFilters {
  status?: StationInvestigationStatus;
  owner?: string;
  limit?: number;
  cursor?: string;
}

export interface StationEventListItem {
  id: string;
  eventType: StationEventType;
  severity: StationEventSeverity;
  status: StationEventStatus;
  title: string;
  summary: string;
  detectedAt: string;
  resolvedAt: string | null;
  investigationId: string | null;
}

export interface EventEvidenceItem {
  id: string;
  source: string;
  kind: string;
  capturedAt: string;
  detail: string;
}

export interface EventNoteItem {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface EventActionItem {
  id: string;
  label: string;
  actorId: string;
  performedAt: string;
  detail: string | null;
}

export interface EventHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  changedAt: string;
  reason: string | null;
}

export interface StationEventDetail extends StationEventListItem {
  stationId: string;
  evidence: EventEvidenceItem[];
  notes: EventNoteItem[];
  actions: EventActionItem[];
  history: EventHistoryItem[];
}

export interface StationInvestigationSummary {
  id: string;
  title: string;
  status: StationInvestigationStatus;
  owner: string | null;
  openedAt: string;
  closedAt: string | null;
  linkedEventCount: number;
}

export interface StationInvestigationDetail extends StationInvestigationSummary {
  stationId: string;
  description: string | null;
  events: StationEventListItem[];
}

export interface StationEventListResponse {
  events: StationEventListItem[];
  nextCursor: string | null;
}

export interface StationEventDetailResponse {
  event: StationEventDetail;
}

export interface StationInvestigationListResponse {
  investigations: StationInvestigationSummary[];
  nextCursor: string | null;
}

export interface StationInvestigationDetailResponse {
  investigation: StationInvestigationDetail;
}

export type MarineWorkflowEventClass =
  | "threshold_alert"
  | "trend_signal"
  | "contextual_signal";

export type MarineWorkflowEventSeverity = "low" | "medium" | "high" | "critical";

export type MarineWorkflowEventStatus =
  | "detected"
  | "monitoring"
  | "confirmed"
  | "resolved"
  | "dismissed";

export type MarineWorkflowInvestigationStatus =
  | "open"
  | "acknowledged"
  | "in_review"
  | "resolved"
  | "dismissed";

export type MarineWorkflowAlertStatus = "active" | "acknowledged" | "resolved";

export type MarineWorkflowAlertRuleType =
  | "threshold_breach"
  | "trend_detected"
  | "contextual_convergence";

export interface MarineWorkflowLineage {
  source: string;
  sourceRecordId: string;
  ingestionRunId: string;
  observedAt: string;
  ingestedAt: string;
}

export interface MarineWorkflowEventFilters {
  stationId?: string;
  region?: string;
  status?: MarineWorkflowEventStatus;
  severity?: MarineWorkflowEventSeverity;
  eventClass?: MarineWorkflowEventClass;
  limit?: number;
}

export interface MarineWorkflowInvestigationFilters {
  stationId?: string;
  region?: string;
  eventId?: string;
  status?: MarineWorkflowInvestigationStatus;
  ownerId?: string;
  limit?: number;
}

export interface MarineWorkflowAlertFilters {
  stationId?: string;
  region?: string;
  eventId?: string;
  investigationId?: string;
  status?: MarineWorkflowAlertStatus;
  severity?: MarineWorkflowEventSeverity;
  ruleType?: MarineWorkflowAlertRuleType;
  limit?: number;
}

export interface MarineWorkflowEventItem {
  id: string;
  ontologyTermId: string;
  eventClass: MarineWorkflowEventClass;
  severity: MarineWorkflowEventSeverity;
  status: MarineWorkflowEventStatus;
  title: string;
  summary: string;
  region: string;
  stationId: string | null;
  confidence: number;
  lineage: MarineWorkflowLineage;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarineWorkflowInvestigationItem {
  id: string;
  eventId: string;
  eventTitle: string | null;
  stationId: string | null;
  region: string | null;
  detectedAt: string | null;
  title: string;
  status: MarineWorkflowInvestigationStatus;
  ownerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
}

export interface MarineWorkflowAlertItem {
  id: string;
  eventId: string;
  eventTitle: string | null;
  eventStatus: MarineWorkflowEventStatus | null;
  stationId: string | null;
  region: string | null;
  investigationId: string | null;
  severity: MarineWorkflowEventSeverity;
  status: MarineWorkflowAlertStatus;
  ruleType: MarineWorkflowAlertRuleType;
  title: string;
  detail: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarineWorkflowEventsResponse {
  events: MarineWorkflowEventItem[];
}

export interface MarineWorkflowInvestigationsResponse {
  investigations: MarineWorkflowInvestigationItem[];
}

export interface MarineWorkflowAlertsResponse {
  alerts: MarineWorkflowAlertItem[];
}

export interface MarineWorkflowCreateInvestigationRequest {
  eventId: string;
  title: string;
  ownerId?: string;
}

export interface MarineWorkflowCreateInvestigationResponse {
  investigation: MarineWorkflowInvestigationItem;
}

export interface MarineWorkflowAlertActionRequest {
  alertId: string;
}

export interface MarineWorkflowAlertActionResponse {
  alert: MarineWorkflowAlertItem;
}
