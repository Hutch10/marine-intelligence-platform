export interface MarineRegionConfig {
    id: string;
    name: string;
    stationIds: string[];
    minimumHealthyStationRequirement: number;
    crwRegionKey?: string;
}
export type FusionState = "single" | "agreement" | "conflict";
export type FusionSummary = "single" | "agreement" | "mixed";
export type TruthPartition = "FIELD_TRUTH" | "PRESSURE_TEST" | "SYNTHETIC_BENCH" | "RESEARCH" | "EXPERIMENTAL";
export declare const IntegrityStatus: {
    readonly VERIFIED: "VERIFIED";
    readonly UNVERIFIED: "UNVERIFIED";
    readonly REJECTED: "REJECTED";
    readonly SOVEREIGN_VERIFIED: "SOVEREIGN_VERIFIED";
    readonly SOVEREIGN_CONTRADICTED: "SOVEREIGN_CONTRADICTED";
};
export type IntegrityStatus = (typeof IntegrityStatus)[keyof typeof IntegrityStatus];
export declare const SystemIntegrityStatus: {
    readonly NORMAL: "NORMAL";
    readonly DEGRADED: "DEGRADED";
    readonly TRUST_BLOCKED: "TRUST_BLOCKED";
};
export type SystemIntegrityStatus = (typeof SystemIntegrityStatus)[keyof typeof SystemIntegrityStatus];
export type DegradedDataReason = "db_path_missing" | "db_unavailable";
/**
 * @marine/shared — canonical shared type definitions
 *
 * Domain types used by both apps/web and apps/api.
 * Route-boundary request/response/telemetry types that cross the API contract.
 *
 * Web-only types (dashboard UI, client fetch-layer) remain in apps/web/lib/api/types.ts.
 * API-internal types (RouteDefinition, WorkerResult) remain in apps/api/src/types.ts.
 */
export type DataAccent = "cyan" | "emerald" | "amber" | "violet" | "rose";
export interface OntologyInvestigationNode {
    readonly __type: string;
    readonly __rid: string;
    readonly __primaryKey: string;
    title: string;
    summary: string;
    confidence: number;
    state: "Correlated" | "Watch" | "Escalated";
}
export interface OntologySpeciesNode {
    readonly __type: string;
    readonly __rid: string;
    readonly __primaryKey: string;
    commonName: string;
    scientificName: string;
    conservationStatus: string;
    habitatRegion: string;
    summary: string;
}
export interface OntologyStationNode {
    readonly __type: string;
    readonly __rid: string;
    readonly __primaryKey: string;
    slug: string;
    name: string;
    region: string;
    status: string;
    summary: string;
    locationLabel: string;
    depthM: number | null;
}
export interface OntologyObservationNode {
    readonly __type: string;
    readonly __rid: string;
    readonly __primaryKey: string;
    stationId: string;
    timestamp: string;
    sstC: number | null;
    waveHeightM: number | null;
    windSpeedMps: number | null;
    pressureHpa: number | null;
}
export interface OntologyAlertNode {
    readonly __type: string;
    readonly __rid: string;
    readonly __primaryKey: string;
    title: string;
    severity: string;
    status: string;
    detail: string | null;
    stationId: string | null;
    linkedInvestigationId: string | null;
    detectedAt: string;
}
export interface InvestigationOntologyNetworkContext {
    investigation: OntologyInvestigationNode | null;
    species: OntologySpeciesNode[];
    stations: OntologyStationNode[];
    observations: OntologyObservationNode[];
    alerts: OntologyAlertNode[];
    resolvedAt: string;
}
import type { EnvironmentalSignalProvenance, EnvironmentalSignalTrustStatus, FreshnessStatus } from "./harness";
import type { ReplayLineageReference, ReplayValidationReference, TrustMetadata, VerificationReference } from "./harness-trust-types";
/** Optional trust projection fields on public marine signal rows. */
export interface PublicSignalTrustProjection extends Partial<TrustMetadata> {
    trustStatus?: EnvironmentalSignalTrustStatus;
}
export interface LiveMarineCondition extends ReplayLineageReference, VerificationReference, PublicSignalTrustProjection, ReplayValidationReference {
    stationId: string;
    /** Anchor row timestamp — not implied concurrent across metrics. */
    timestamp: string;
    sstC: number | null;
    waveHeightM: number | null;
    windSpeedMps: number | null;
    pressureHpa: number | null;
    /** Per-metric source observation times (ISO). */
    seaTempObservedAt?: string | null;
    waveHeightObservedAt?: string | null;
    windObservedAt?: string | null;
    pressureObservedAt?: string | null;
    /** False when metrics were measured at different times (e.g. NDBC backfill). */
    metricsConcurrent?: boolean;
    backfillIndicators?: {
        seaSurfaceTemp?: boolean;
        waveHeight?: boolean;
    };
    provenanceId?: string | null;
    /** Data source identifier, e.g. "noaa_ndbc" */
    source?: string;
    /** Feed URL or reference the observation was ingested from */
    sourceFeed?: string;
    /** ISO timestamp of when this observation was ingested */
    ingestedAt?: string;
    freshnessClassification?: "live" | "stale" | "withheld" | "unknown";
    /** Normalized freshness envelope (harness) */
    freshnessStatus?: FreshnessStatus;
    provenance?: EnvironmentalSignalProvenance;
}
export interface ReefStressWatchItem extends ReplayLineageReference, VerificationReference, PublicSignalTrustProjection, ReplayValidationReference {
    region: string;
    stationId: string | null;
    timestamp: string;
    sstAnomalyC: number | null;
    hotSpotC: number | null;
    dhw: number | null;
    stressLevel: string | null;
    source: string;
    outputClass: "observed" | "derived" | "inferred";
    /** ISO ingest time from derived_signals.created_at */
    ingestedAt?: string;
    /** Feed URL or reference */
    sourceFeed?: string | null;
    /** NOAA CRW product date (ISO) */
    productDate?: string | null;
    freshnessStatus?: FreshnessStatus;
    provenance?: EnvironmentalSignalProvenance;
}
export interface ApiKeyRecord {
    id: string;
    prefix: string;
    name: string;
    tier: string;
    scopes: string[];
    billingAccountId?: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
}
export interface ApiUsageLogEntry {
    id: string;
    keyId: string;
    route: string;
    statusCode: number;
    durationMs: number | null;
    requestAt: string;
}
export interface PublicApiRateLimitStatus {
    tier: string;
    limit: number;
    remaining: number;
    requestsUsed: number;
    windowSeconds: number;
    resetAt: string;
}
export interface PublicApiQuotaStatus {
    tier: string;
    monthlyQuota: number;
    remainingQuota: number;
    requestsUsed: number;
    billingMonth: string;
}
export interface BillingAccountRecord {
    id: string;
    provider: string;
    externalCustomerId: string | null;
    name: string;
    email: string | null;
    tier: string;
    status: "active" | "inactive";
    monthlyQuota: number;
    costPerRequestCents: number;
    createdAt: string;
    updatedAt: string;
}
export interface BillingUsageRecord {
    id: string;
    keyId: string;
    billingAccountId: string | null;
    route: string;
    statusCode: number;
    requestAt: string;
    units: number;
    costCents: number;
    billingMonth: string;
}
export interface BillingUsageSummary {
    provider: string;
    keyId: string;
    billingAccountId: string | null;
    billingMonth: string;
    billableRequests: number;
    estimatedCostCents: number;
    estimatedCostUsd: number;
    costPerRequestCents: number;
    remainingQuota: number;
}
export interface PublicApiErrorResponse {
    message: string;
    code: string;
    retryable: boolean;
    rateLimit?: PublicApiRateLimitStatus;
    quota?: PublicApiQuotaStatus;
}
export type RiskBaselineQuality = "high" | "medium" | "low";
export type TruthConfidenceClassification = "VERIFIED" | "PARTIAL" | "WEAK" | "UNTRUSTED" | "INSUFFICIENT_DATA" | "CONFLICTING_SIGNALS";
export type ConflictTaxonomy = "none" | "divergence" | "conflict" | "orphan" | "illegal" | "sensor_disagreement";
export interface RiskDerivationTrace {
    value: number | null;
    source: string;
    derivation: string;
    inputs: Record<string, any>;
    timestamp: string;
    confidence: number;
    conflictType?: ConflictTaxonomy;
    exclusionReason?: string;
    causalityParentId?: string;
    nodeId?: string;
}
export type CausalNodeKind = "observation" | "signal" | "rule" | "fusion" | "override" | "final_state";
export type CausalNodeState = "ACCEPTED" | "REJECTED" | "CONFLICT" | "LATENT";
export interface CausalNode {
    id: string;
    kind: CausalNodeKind;
    label: string;
    state: CausalNodeState;
    value: number | string | null;
    latentValue?: number | string | null;
    reason?: string | null;
    evidenceCount?: number;
    metadata?: Record<string, any>;
}
export interface CausalEdge {
    source: string;
    target: string;
    relationship: "supports" | "rejects" | "contradicts" | "overrides";
}
export interface CausalEvidenceGraph {
    nodes: CausalNode[];
    edges: CausalEdge[];
}
export type DivergenceCategory = "DATA_DRIFT" | "POLICY_CHANGE" | "TIME_CONTEXT_CHANGE" | "COVERAGE_CHANGE" | "DERIVATION_CHANGE";
export interface RiskReplayDivergence {
    field: string;
    category: DivergenceCategory;
    oldValue: any;
    newValue: any;
    reason: string;
}
export interface RiskReplayDiff {
    divergenceFound: boolean;
    categories: DivergenceCategory[];
    changes: RiskReplayDivergence[];
    resultA_Hash: string;
    resultB_Hash: string;
}
export interface SignalCoverage {
    acceptedCount: number;
    rejectedCount: number;
    conflictCount: number;
    missingCoverageSummary: string;
    sourcesConsidered: string[];
    stationsConsidered: string[];
}
export interface NdbcMappedObservation {
    id: string;
    stationId: string;
    observedAt: number;
    seaSurfaceTempC: number | null;
    waveHeightM: number | null;
    windSpeedMps: number | null;
    pressureHpa: number | null;
    source: "noaa_ndbc";
    sourceFeed: string;
    sourceTimestamp: string;
    sourceReference: string;
    rawLine: string;
}
export interface CitationMetadata {
    bibtex: string;
    cslJson: Record<string, any>;
    policyVersion: string;
    policyDigest: string;
    inputSnapshotHash: string;
    platformVersion: string;
    generatedAt: string;
    coverage: SignalCoverage;
}
export interface RiskSignalSummary {
    field: "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa" | "crwSstAnomalyC" | "crwHotspotC" | "crwDhw" | "salinityPsu" | "dissolvedOxygenMgL";
    value: number | null;
    mean: number | null;
    stdDev: number | null;
    zScore: number | null;
    sampleCount: number;
    neighborMean: number | null;
    neighborDelta: number | null;
    sources: string[];
    fusionState: FusionState;
    trace?: RiskDerivationTrace;
    integrity?: {
        id: string;
        sourceReference: string;
        partition: string;
        status: IntegrityStatus;
    };
}
export interface RiskAppliedThreshold {
    metric: "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa";
    thresholdValue: number;
    comparator: "above" | "below";
    source: "default" | "station_override";
}
export interface RiskTriggeredRule {
    ruleType: string;
    severity: string;
    title: string;
    detail: string | null;
}
export interface RiskRecommendationSignal {
    kind: "observation" | "alert" | "explanation";
    label: string;
    source: string;
    timestamp: string | null;
    detail: string;
}
export interface RiskRecommendation {
    action: string;
    rationale: string;
    rationalePoints: string[];
    urgency: "low" | "medium" | "high";
    confidenceScore: number;
    siteSwitchSuggestion: string | null;
    supportingSignals: RiskRecommendationSignal[];
    contributingSignals: RiskRecommendationSignal[];
    generatedAt: string;
}
export interface RiskEvaluateHistoryPoint {
    observedAt: string;
    seaSurfaceTempC?: number | null;
    waveHeightM?: number | null;
    windSpeedMps?: number | null;
    pressureHpa?: number | null;
}
export interface RiskEvaluateRequest {
    stationId: string;
    observedAt: string;
    seaSurfaceTempC?: number | null;
    waveHeightM?: number | null;
    windSpeedMps?: number | null;
    pressureHpa?: number | null;
    history?: RiskEvaluateHistoryPoint[];
}
export interface RiskScoreResponse {
    stationId: string;
    window: number;
    computedAt: string;
    signals: RiskSignalSummary[];
    overallRisk: "low" | "medium" | "high" | "critical" | "unknown" | "insufficient_data" | "conflicting_signals";
    triggeredRules: RiskTriggeredRule[];
    appliedThresholds?: RiskAppliedThreshold[];
    confidenceScore: number;
    baselineQuality: RiskBaselineQuality;
    sampleSize: number;
    sampleSufficiency: boolean;
    warningMessages: string[];
    operatorSummary: string;
    confidenceClassification: TruthConfidenceClassification;
    conflictTaxonomy: ConflictTaxonomy;
    trace?: Record<string, RiskDerivationTrace>;
    calibrationAdjustedConfidenceScore?: number | null;
    evaluationId?: string | null;
    recommendation?: RiskRecommendation | null;
    citation?: CitationMetadata;
    policyVersion?: string;
    policyDigest?: string;
    inputSnapshotHash?: string;
    causalGraph?: CausalEvidenceGraph;
    latentRiskLevel?: RiskScoreResponse["overallRisk"];
    sovereignVerification?: {
        status: IntegrityStatus;
        claimId: string;
        contradictions: string[];
        verifiedAt: string;
    };
    overrideReason?: string | null;
    coverage?: SignalCoverage;
    systemIntegrity: SystemIntegrityStatus;
    integritySummary: {
        verifiedCount: number;
        unverifiedCount: number;
        rejectedCount: number;
        exclusionReasonCounts: Record<string, number>;
    };
    integrityAuditTrace?: {
        excludedRecords: Array<{
            id: string;
            sourceReference: string;
            partition: string;
            status: IntegrityStatus;
            reason: string;
        }>;
        isForensicTrace: boolean;
    };
    degraded?: boolean;
    reason?: DegradedDataReason;
    trustStatus?: SystemIntegrityStatus;
}
export interface RiskEvaluateResponse {
    stationId: string;
    triggeredRules: RiskTriggeredRule[];
    baselineStats: RiskSignalSummary[];
    riskLevel: "low" | "medium" | "high" | "critical" | "unknown";
    evaluatedAt: string;
    appliedThresholds?: RiskAppliedThreshold[];
    confidenceScore: number;
    baselineQuality: RiskBaselineQuality;
    sampleSize: number;
    sampleSufficiency: boolean;
    warningMessages: string[];
    operatorSummary: string;
    calibrationAdjustedConfidenceScore?: number | null;
    evaluationId?: string | null;
    recommendation?: RiskRecommendation | null;
    degraded?: boolean;
    reason?: DegradedDataReason;
    trustStatus?: SystemIntegrityStatus;
}
export interface PublicListPagination {
    limit: number;
    returned: number;
    total: number;
    hasMore: boolean;
    maxLimit: number;
    defaultsApplied: string[];
}
export interface AnomalyAppliedFilters {
    stationId: string | null;
    since: string;
    limit: number;
}
export interface AnomalyProvenance {
    sourceObservationTimestamps: string[];
    sourceMetrics: Array<"seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa" | "salinityPsu" | "dissolvedOxygenMgL">;
    sourceRecordIds: string[];
    evidenceSummary: string;
    sources?: string[];
}
export interface PublicAnomalyItem {
    id: string;
    stationId: string | null;
    signalType: string;
    severity: string;
    status: string;
    title: string;
    summary: string;
    detectedAt: string;
    provenance?: AnomalyProvenance;
    sources: string[];
    fusionState: FusionState;
    integrity?: {
        id: string;
        sourceReference: string;
        partition: string;
        status: IntegrityStatus;
    };
}
export interface AnomalyListResponse {
    anomalies: PublicAnomalyItem[];
    total: number;
    stationId: string | null;
    since: string;
    appliedFilters: AnomalyAppliedFilters;
    pagination: PublicListPagination;
    degraded?: boolean;
    reason?: DegradedDataReason;
    trustStatus?: SystemIntegrityStatus;
}
export interface AlertsAppliedFilters {
    stationId: string | null;
    severity: "low" | "medium" | "high" | "critical" | null;
    status: "active" | "acknowledged" | "resolved" | null;
    limit: number;
}
export interface PublicAlertsListResponse {
    alerts: MarineWorkflowAlertItem[];
    total: number;
    appliedFilters: AlertsAppliedFilters;
    pagination: PublicListPagination;
}
export interface PublicApiUsageSummaryResponse {
    keyId: string;
    tier: string;
    billingAccountId: string | null;
    window: {
        from: string;
        to: string;
    };
    summary: {
        totalRequests: number;
        errorCount: number;
        averageDurationMs: number | null;
        lastRequestAt: string | null;
    };
    recentRouteUsage: Array<{
        route: string;
        count: number;
    }>;
    recentRequests: ApiUsageLogEntry[];
    rateLimit: PublicApiRateLimitStatus;
    quota: PublicApiQuotaStatus;
    billing: BillingUsageSummary;
}
export interface PublicApiRouteCatalogItem {
    route: string;
    method: "GET" | "POST";
    requiredAuth: "apiKey" | "adminSession";
    request: string;
    response: string;
    summary: string;
}
export interface PublicApiRouteCatalogResponse {
    version: string;
    generatedAt: string;
    routes: PublicApiRouteCatalogItem[];
}
export interface BillingAccountCreateRequest {
    name: string;
    email?: string | null;
    tier: "free" | "pro" | "enterprise";
    externalCustomerId?: string | null;
}
export interface BillingAccountPlanUpdateRequest {
    billingAccountId: string;
    tier: "free" | "pro" | "enterprise";
}
export type ValidationOutcomeClassification = "correct" | "partial" | "incorrect";
export type ValidationOutcomeSource = "manual" | "simulated";
export interface RiskEvaluationOutcome {
    observedAt: string;
    actualRiskLevel: "low" | "medium" | "high" | "critical";
    classification: ValidationOutcomeClassification;
    summary: string;
    source: ValidationOutcomeSource;
    notes?: string | null;
}
export interface RiskEvaluationRecord {
    id: string;
    stationId: string;
    route: string;
    apiKeyId: string | null;
    predictedAt: string;
    predictedRiskLevel: "low" | "medium" | "high" | "critical";
    recommendationAction: string | null;
    recommendationUrgency: "low" | "medium" | "high" | null;
    confidenceScore: number;
    calibrationAdjustedConfidenceScore: number | null;
    operatorSummary: string;
    warningMessages: string[];
    contributingSignals: RiskRecommendationSignal[];
    triggeredRules: RiskTriggeredRule[];
    feedbackUseful: boolean | null;
    feedbackNote: string | null;
    feedbackCount: number;
    actualOutcome: RiskEvaluationOutcome | null;
    createdAt: string;
    updatedAt: string;
}
export interface RiskEvaluationPredictionRequest {
    stationId: string;
    route: string;
    apiKeyId?: string | null;
    predictedAt: string;
    predictedRiskLevel: "low" | "medium" | "high" | "critical";
    recommendationAction?: string | null;
    recommendationUrgency?: "low" | "medium" | "high" | null;
    confidenceScore: number;
    calibrationAdjustedConfidenceScore?: number | null;
    operatorSummary: string;
    warningMessages?: string[];
    contributingSignals: RiskRecommendationSignal[];
    triggeredRules: RiskTriggeredRule[];
}
export interface RiskEvaluationOutcomeRequest {
    evaluationId: string;
    observedAt: string;
    actualRiskLevel: "low" | "medium" | "high" | "critical";
    classification: ValidationOutcomeClassification;
    summary: string;
    source: ValidationOutcomeSource;
    notes?: string | null;
}
export interface RiskEvaluationFeedbackRequest {
    evaluationId: string;
    useful: boolean;
    note?: string | null;
}
export interface ValidationConfidenceBandSummary {
    label: string;
    minConfidence: number;
    maxConfidence: number;
    evaluationCount: number;
    correctCount: number;
    partialCount: number;
    incorrectCount: number;
    empiricalAccuracy: number | null;
    averagePredictedConfidence: number | null;
    averageAdjustedConfidence: number | null;
    calibrationGap: number | null;
    confidenceState: "well_calibrated" | "overconfident" | "underconfident" | "insufficient_data";
}
export interface ValidationCalibrationCurvePoint {
    bandLabel: string;
    bandMidpoint: number;
    averagePredictedConfidence: number | null;
    empiricalAccuracy: number | null;
    calibrationGap: number | null;
    evaluationCount: number;
}
export interface ValidationFailureModeSummary {
    code: "false_positive_high_risk" | "false_negative_high_outcome" | "missed_multi_factor_interaction" | "overconfident_prediction" | "negative_operator_feedback";
    label: string;
    count: number;
    share: number;
}
export interface ValidationFeedbackTrendFlag {
    signalLabel: string;
    negativeFeedbackRate: number;
    feedbackCount: number;
    recommendationCount: number;
}
export interface ValidationReliabilityStats {
    totalEvaluations: number;
    completedEvaluations: number;
    outcomeCoverage: number;
    empiricalAccuracy: number | null;
    averagePredictedConfidence: number | null;
    averageAdjustedConfidence: number | null;
    overallCalibrationGap: number | null;
    overconfidentBands: number;
    underconfidentBands: number;
}
export interface ValidationSummaryResponse {
    generatedAt: string;
    summaryWindow: {
        since: string | null;
        stationId: string | null;
    };
    reliability: ValidationReliabilityStats;
    confidenceBands: ValidationConfidenceBandSummary[];
    calibrationCurve: ValidationCalibrationCurvePoint[];
    topFailureModes: ValidationFailureModeSummary[];
    feedbackTrendFlags: ValidationFeedbackTrendFlag[];
    degraded?: boolean;
    reason?: DegradedDataReason;
    trustStatus?: SystemIntegrityStatus;
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
    eventId?: string;
    title: string;
    summary: string;
    confidence: number;
    state: InvestigationTrackState;
    sourceType?: "signal" | "anomaly" | null;
    region?: string | null;
    stationId?: string | null;
    detectedAt?: string | null;
    outcome?: "confirmed" | "false_positive" | "inconclusive" | null;
    signals?: Array<{
        id: string;
        type: string;
        confidence: number | null;
        timestamp: string;
        stationId: string | null;
        source: string;
        integrityStatus?: IntegrityStatus;
    }>;
    exclusions?: Array<{
        id: string;
        reason: string;
        timestamp: string;
        source: string;
    }>;
    causalChain?: string;
    integrityMetadata?: {
        overallStatus: SystemIntegrityStatus;
        purityRatio: number;
    };
    lastUpdated?: string | null;
}
export type MissionStatus = "Pending" | "In Progress" | "Complete" | "Aborted";
export interface Mission {
    id: string;
    name: string;
    location: string;
    status: MissionStatus;
    progress: number;
    eta: string;
    description?: string;
    linkedSignalIds?: string[];
    createdAt: string;
    updatedAt: string;
    activatedAt?: string | null;
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
export type InvestigationSpeciesCorrelationReasonKind = "linked_movement_signal" | "verified_sighting" | "pending_verification" | "station_overlap" | "recent_observation";
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
export type SignalType = "thermal_anomaly" | "oxygen_depletion" | "migration_anomaly" | "chlorophyll_bloom" | "current_shear" | "station_health" | "whale_vocalization" | "fish_acoustic_signal" | "shrimp_snap" | "ambiguous_biologic" | "unknown_acoustic";
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
    latitude?: number;
    longitude?: number;
    speciesId?: string;
    title: string;
    summary: string;
    detail: string;
    status: SignalStatus;
    detectedAt: string;
    createdAt: string;
    updatedAt: string;
    linkedInvestigationId: string | null;
    linkedMissionId: string | null;
    validationState: ValidationState;
    validationMetadata: Record<string, any> | null;
    sovereignStatus?: IntegrityStatus;
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
    latitude?: number;
    longitude?: number;
    speciesId?: string;
    title: string;
    summary: string;
    detail: string;
    status?: SignalStatus;
    linkedInvestigationId?: string;
    validationState?: ValidationState;
    validationMetadata?: Record<string, any> | null;
}
export interface PromoteSignalInput {
    investigationId: string;
    actor?: string;
}
export type SpeciesConservationStatus = "least_concern" | "near_threatened" | "vulnerable" | "endangered" | "critically_endangered" | "data_deficient";
export type VerificationState = "observed" | "estimated" | "modeled" | "pending" | "verified" | "rejected" | "unknown";
export type ValidationState = "UNVERIFIED" | "CORROBORATED" | "DIVERGENT" | "CONFLICT" | "MANUALLY_RESOLVED" | "SUPPRESSED";
export type TacticalMode = "STANDARD" | "VERIFIED_FIRST" | "HARDENED" | "INCIDENT";
export interface ValidationResolutionMetadata {
    resolver: string;
    timestamp: string;
    reason: string;
    evidenceNote?: string;
}
export interface ValidationPolicy {
    signalType: string;
    phenomenonClass: "fast" | "moderate" | "slow";
    coastalWindowKm: number;
    coastalWindowHours: number;
    offshoreWindowKm: number;
    offshoreWindowHours: number;
}
export interface BiodiversityMetadata {
    source: string;
    sourceUrl?: string;
    method: string;
    observedAt: string;
    ingestedAt: string;
    updatedAt: string;
    confidenceScore: number;
    coverageScore: number;
    verificationState: VerificationState;
}
export interface SpeciesProfile extends BiodiversityMetadata {
    id: string;
    commonName: string;
    scientificName: string;
    conservationStatus: SpeciesConservationStatus;
    habitatRegion: string;
    summary: string;
    createdAt: string;
    updatedAt: string;
    threatProfile?: SpeciesThreatProfile;
}
export interface SpeciesPopulationEstimate extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    regionId: string | null;
    count: number;
    lowerBound: number | null;
    upperBound: number | null;
    unit: string;
}
export interface SpeciesTrendPoint extends BiodiversityMetadata {
    speciesId: string;
    regionId?: string;
    value: number;
    trend: "increasing" | "decreasing" | "stable" | "unknown";
}
export interface SpeciesObservation extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    stationId: string | null;
    region: string;
    latitude: number;
    longitude: number;
    count: number;
    summary: string;
}
export interface SpeciesSurveyCount extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    surveyId: string;
    region: string;
    count: number;
    latitude: number;
    longitude: number;
}
export interface SpeciesAcousticDetection extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    stationId: string;
    frequencyHz: number | null;
    callType: string | null;
    durationMs: number | null;
}
export interface SpeciesTrack extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    individualId?: string;
    points: SpeciesTrackPoint[];
}
export interface SpeciesTrackPoint extends BiodiversityMetadata {
    id: string;
    trackId: string;
    latitude: number;
    longitude: number;
    depthM: number | null;
}
export interface SpeciesStrandingEvent extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    region: string;
    latitude: number;
    longitude: number;
    condition: string;
    outcome: string;
}
export interface SpeciesDistributionRegion extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    regionId: string;
    season: "breeding" | "non_breeding" | "migration" | "year_round";
    geometry: any;
}
export interface SpeciesThreatProfile extends BiodiversityMetadata {
    id: string;
    speciesId: string;
    primaryThreats: string[];
    climateVulnerability: string;
    habitatLossRisk: number;
}
export interface SpeciesEvidenceItem {
    id: string;
    targetId: string;
    signalType: string;
    contribution: string;
    confidenceContribution: number;
    source: string;
    sourceUrl?: string;
}
export interface SpeciesConfidence {
    overall: number;
    factors: Array<{
        label: string;
        value: number;
    }>;
}
export interface SpeciesCoverage {
    spatial: number;
    temporal: number;
    taxonomic: number;
}
export interface SpeciesFilters {
    region?: string;
    conservationStatus?: SpeciesConservationStatus;
    limit?: number;
}
export type SpeciesSightingVerificationStatus = "pending" | "verified" | "rejected";
export interface SpeciesSighting extends SpeciesObservation {
    verificationStatus: SpeciesSightingVerificationStatus;
    verifiedAt: string | null;
    verifiedBy: string | null;
    createdAt: string;
}
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
export type SpeciesMovementType = "route_deviation" | "aggregation_shift" | "habitat_exit" | "unusual_presence" | "seasonal_mismatch";
export interface SpeciesMovementSignal extends BiodiversityMetadata {
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
export type OceanMapSpatialOverlayCategory = "sightings" | "movement_signals" | "hotspots" | "corridors_foundation";
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
export type OceanStationAdminPermission = "station.view_admin" | "station.edit_branding" | "station.edit_content" | "station.view_audit" | "station.publish" | "species.submit_sighting" | "species.verify_sighting" | "species.annotate_sighting";
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
    oidc?: StationAdminOidcClaims;
}
export type StationAdminAuthEventType = "login_success" | "login_failure" | "login_locked" | "mfa_enrollment" | "mfa_challenge_success" | "mfa_challenge_failure" | "mfa_challenge_locked" | "mfa_challenge_expired" | "mfa_verify_rate_limited" | "mfa_abuse_detected" | "recovery_code_used" | "logout" | "refresh" | "revoke";
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
    amr: string[];
    acr: string | null;
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
export type StationAdminSecurityAlertType = "repeated_login_failures_same_ip" | "many_actor_login_failures_one_ip" | "actor_login_many_ips" | "repeated_lockouts";
export type StationAdminSecurityAlertSeverity = "low" | "medium" | "high";
export interface StationAdminSecurityAlert {
    alertType: StationAdminSecurityAlertType;
    severity: StationAdminSecurityAlertSeverity;
    actorId: string | null;
    ip: string | null;
    eventCount: number;
    timeWindow: string;
}
export type StationAdminAmrValue = "pwd" | "mfa" | "otp" | "sso";
export type StationAdminAcrValue = "urn:mfa:required" | "urn:pwd:only" | "urn:sso:federated";
export interface StationAdminOidcClaims {
    amr: StationAdminAmrValue[];
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
export interface OceanStationAdminPatch extends OceanStationAdminBrandingPatch, OceanStationAdminContentPatch {
}
export type OperationalAlertStatus = "active" | "resolved";
export type OperationalAlertRuleType = "source_failed" | "source_stale" | "repeated_degraded" | "persistence_failure" | "high_sea_temperature" | "high_wave_height" | "high_wind_speed" | "low_pressure_system";
export type OperationalAlertSeverity = "critical" | "warning" | "info";
export type OperationalAlertsFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
export interface OperationalAlertAction {
    type: "create" | "resolve";
    source: string;
    ruleType: OperationalAlertRuleType;
    severity: OperationalAlertSeverity;
    title: string;
    detail?: string;
    stationId?: string | null;
    validationState?: string;
    validationMetadata?: Record<string, any> | null;
}
export interface OperationalAlert {
    id: string;
    source: string;
    stationId: string | null;
    ruleType: OperationalAlertRuleType;
    severity: OperationalAlertSeverity;
    status: OperationalAlertStatus;
    lifecycleStatus: "open" | "ongoing" | "resolved";
    title: string;
    detail: string | null;
    metadataJson: string | null;
    detectedAt: number;
    resolvedAt: number | null;
    occurrenceCount: number;
    windowStartedAt: number;
    windowEndsAt: number;
    validationState?: string;
    validationMetadata?: Record<string, any> | null;
    frozen_system_integrity: string;
    createdAt: string;
    updatedAt: string;
    investigationId?: string | null;
}
export interface OperationalAlertItem {
    id: string;
    source: string;
    ruleType: OperationalAlertRuleType;
    severity: OperationalAlertSeverity;
    status: OperationalAlertStatus;
    lifecycleStatus: "open" | "ongoing" | "resolved";
    title: string;
    detail: string | null;
    detectedAt: number;
    resolvedAt: number | null;
    validationState?: string;
    createdAt: string;
    updatedAt: string;
    investigationId?: string | null;
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
export interface OperationalAlertsData {
    source: "db" | "unavailable";
    fallbackReason: OperationalAlertsFallbackReason | string | null;
    generatedAt: string;
    systemIntegrity: SystemIntegrityStatus;
    summary: OperationalAlertsSummary;
    activeAlerts: OperationalAlertItem[];
    recentHistory: OperationalAlertItem[];
}
export interface OperationalAlertsFilters {
    status?: OperationalAlertStatus;
    source?: string;
    ruleType?: OperationalAlertRuleType;
    limit?: number;
    historyLimit?: number;
}
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
export type StationEventType = "thermal_spike" | "dissolved_oxygen_drop" | "salinity_shift" | "ph_drop" | "turbidity_spike" | "sensor_health_degraded";
export type StationEventSeverity = "low" | "medium" | "high";
export type StationEventStatus = "new" | "acknowledged" | "investigating" | "resolved" | "archived";
export type StationInvestigationStatus = "open" | "monitoring" | "closed" | "archived";
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
export type MarineWorkflowEventClass = "threshold_alert" | "trend_signal" | "contextual_signal";
export type MarineWorkflowEventSeverity = "low" | "medium" | "high" | "critical";
export type MarineWorkflowEventStatus = "detected" | "monitoring" | "confirmed" | "resolved" | "dismissed";
export type MarineWorkflowInvestigationStatus = "open" | "acknowledged" | "in_review" | "resolved" | "dismissed";
export type MarineWorkflowAlertStatus = "active" | "acknowledged" | "resolved";
export type MarineWorkflowAlertRuleType = "threshold_breach" | "trend_detected" | "contextual_convergence";
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
    truthPartition: TruthPartition;
}
export interface MarineWorkflowInvestigationItem {
    id: string;
    eventId: string;
    eventTitle: string | null;
    sourceType: "signal" | "anomaly" | null;
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
    truthPartition: TruthPartition;
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
    truthPartition: TruthPartition;
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
    sourceType?: "signal" | "anomaly";
    stationId?: string;
    region?: string;
    detectedAt?: string;
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
export interface MarineWorkflowDecisionItem {
    id: string;
    investigationId: string;
    stationId: string;
    decision: string;
    rationale: string;
    timestamp: string;
    createdAt: string;
    updatedAt: string;
}
export interface MarineWorkflowTelemetryEventItem {
    id: string;
    eventType: MarineWorkflowTelemetryEventType;
    investigationId: string | null;
    stationId: string | null;
    decisionId: string | null;
    timestamp: string;
    details: string | null;
    createdAt: string;
}
export interface MarineWorkflowFeedbackItem {
    id: string;
    useful: boolean;
    note: string | null;
    investigationId: string | null;
    stationId: string | null;
    decisionId: string | null;
    evaluationId: string | null;
    signalSnapshot: string[] | null;
    timestamp: string;
    createdAt: string;
}
export interface MarineWorkflowDecisionSummary {
    decisionCount: number;
    telemetryEventCount: number;
    viewCount: number;
    clickCount: number;
    submitDecisionCount: number;
    feedbackCount: number;
    usefulFeedbackCount: number;
    notUsefulFeedbackCount: number;
    actionCounts: Array<{
        decision: string;
        count: number;
    }>;
    decisionsPerWeek: Array<{
        weekStart: string;
        count: number;
    }>;
    feedbackPerWeek: Array<{
        weekStart: string;
        count: number;
    }>;
    latestDecision: MarineWorkflowDecisionItem | null;
    latestTelemetryEvent: MarineWorkflowTelemetryEventItem | null;
    latestFeedback: MarineWorkflowFeedbackItem | null;
}
export interface MarineWorkflowDecisionRequest {
    investigationId: string;
    stationId: string;
    decision: string;
    rationale: string;
    timestamp: string;
}
export interface MarineWorkflowDecisionResponse {
    decision: MarineWorkflowDecisionItem;
}
export interface MarineWorkflowFeedbackRequest {
    useful: boolean;
    note?: string;
    investigationId?: string;
    stationId?: string;
    decisionId?: string;
    evaluationId?: string;
    signalSnapshot?: string[];
    timestamp: string;
}
export interface MarineWorkflowFeedbackResponse {
    feedback: MarineWorkflowFeedbackItem;
}
export type MarineWorkflowTelemetryEventType = "view" | "click" | "submit_decision";
export interface MarineWorkflowTelemetryEventRequest {
    eventType: MarineWorkflowTelemetryEventType;
    investigationId?: string;
    stationId?: string;
    decisionId?: string;
    timestamp: string;
    details?: string;
}
export interface MarineWorkflowTelemetryEventResponse {
    event: MarineWorkflowTelemetryEventItem;
}
export interface MarineWorkflowDecisionSummaryResponse {
    summary: MarineWorkflowDecisionSummary;
}
export interface MarineWorkflowValidationOutcomeResponse {
    evaluation: RiskEvaluationRecord;
}
export type RegionsFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
export interface RegionsResponse {
    regions: Array<{
        id: string;
        name: string;
        status: string;
        summary: string;
        metrics: OceanMapRegionMetric[];
        centroid?: {
            lat: number;
            lng: number;
        } | null;
    }>;
    map: OceanMapWorkspaceData;
    systemIntegrity: SystemIntegrityStatus;
}
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
export type DatasetFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
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
    systemIntegrity: SystemIntegrityStatus;
}
export type InvestigationFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
export interface InvestigationsTelemetry {
    route: "GET /investigations";
    source: "db" | "mock";
    trackCount: number;
    fallbackReason?: InvestigationFallbackReason;
}
export interface SimilarInvestigation {
    investigationId: string;
    title: string;
    summary: string;
    /**
     * Final composite score 0–1.
     * Weighted: 60% embedding similarity + 20% same-station boost
     * + 10% recency decay + 10% severity weight.
     */
    similarity: number;
    /** Raw cosine similarity before composite weighting */
    embeddingSimilarity: number;
    /** Which text fields contributed to the embedding */
    matchedOn: Array<"title" | "summary" | "explanation">;
    /** Station ID shared with the query investigation, if any */
    matchedStation?: string | null;
    /** Severity level stored at index time (e.g. "high", "critical") */
    severity?: string | null;
    /** Human-readable age of this indexed record, e.g. "this week" */
    timeframeLabel?: string;
    indexedAt: string;
}
export interface SimilarInvestigationsResponse {
    investigations: SimilarInvestigation[];
    /** The query investigation ID */
    queryId: string;
    generatedAt: string;
}
export interface SimilarInvestigationsTelemetry {
    route: "GET /investigations/similar";
    queryId: string;
    resultCount: number;
    rankingMode?: "vector" | "keyword";
    fallbackReason?: "db_path_missing" | "db_open_failed" | "query_failed" | "not_indexed" | "keyword_fallback";
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
export type SignalFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
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
export interface SignalCreateRequest extends CreateSignalInput {
}
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
export type SpeciesFallbackReason = "db_query_failed" | "db_open_failed" | "db_path_missing" | "invalid_credentials" | "forbidden" | "not_found" | "invalid_request";
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
export type OceanStationsFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
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
export type AiLabFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
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
export type DashboardFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";
export interface DashboardTelemetry {
    route: "GET /dashboard";
    source: "db" | "mock";
    openAlertCount?: number;
    activityItemCount: number;
    activitySource: "db" | "mock";
    speciesActivitySource?: "db" | "unavailable";
    fallbackReason?: DashboardFallbackReason;
}
export type LiveConditionsFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed" | "mock_withheld" | "stale_or_unverifiable_withheld";
export interface LiveConditionsResponse {
    conditions: LiveMarineCondition[];
}
export interface LiveConditionsTelemetry {
    route: "GET /live-conditions";
    source: "db" | "mock" | "withheld";
    conditionCount: number;
    fallbackReason?: LiveConditionsFallbackReason | "mock_withheld";
}
export type ReefAlertsFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed" | "mock_withheld" | "stale_or_unverifiable_withheld";
export interface ReefAlertsResponse {
    alerts: ReefStressWatchItem[];
}
export interface ReefAlertsTelemetry {
    route: "GET /reef-alerts";
    source: "db" | "mock" | "withheld";
    alertCount: number;
    fallbackReason?: ReefAlertsFallbackReason | "mock_withheld";
}
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
export type StationAdminLoginResponse = StationAdminLoginIssuedResponse | StationAdminLoginPendingMfaResponse;
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
export type StationAdminMfaVerifyFailureResult = "mfa_failed" | "locked_out" | "rate_limited" | "expired" | "not_found" | "invalid_request";
export interface StationAdminMfaVerifyErrorResponse {
    result: StationAdminMfaVerifyFailureResult;
    message: string;
    attemptsRemaining?: number;
    lockedOut?: boolean;
    retryAfterSeconds?: number;
}
export type StationAdminMfaVerifyResponse = StationAdminMfaVerifyIssuedResponse | StationAdminMfaVerifyConfirmedResponse;
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
    route: "POST /marine-intelligence/alerts/:alertId/acknowledge" | "POST /marine-intelligence/alerts/:alertId/resolve";
    source: "db" | "unavailable";
    result: "updated" | "forbidden" | "validation" | "not_found";
    alertId: string;
    fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}
export interface MarineWorkflowDecisionTelemetry {
    route: "POST /marine-intelligence/decisions";
    source: "db" | "unavailable";
    result: "created" | "forbidden" | "validation" | "not_found";
    investigationId: string;
    stationId: string;
    fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}
export interface MarineWorkflowFeedbackTelemetry {
    route: "POST /marine-intelligence/feedback";
    source: "db" | "unavailable";
    result: "created" | "forbidden" | "validation";
    investigationId?: string;
    stationId?: string;
    fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}
export interface MarineWorkflowTelemetryEventTelemetry {
    route: "POST /marine-intelligence/telemetry";
    source: "db" | "unavailable";
    result: "created" | "forbidden" | "validation";
    eventType: MarineWorkflowTelemetryEventType;
    investigationId?: string;
    stationId?: string;
    fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}
export interface MarineWorkflowDecisionSummaryTelemetry {
    route: "GET /marine-intelligence/summary";
    source: "db" | "unavailable";
    result: "found" | "forbidden";
    decisionCount: number;
    telemetryEventCount: number;
    windowType?: "live" | "trend";
    fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}
/**
 * Deterministic, fact-based reason kinds produced by the ecological
 * correlation utility. Each value maps to a single independent rule.
 */
export type EcologicalCorrelationReasonKind = "increased_sighting_rate" | "feeding_aggregation_detected" | "migration_shift_detected" | "species_anomaly_window_overlap" | "elevated_movement_confidence";
export interface EcologicalCorrelationReason {
    kind: EcologicalCorrelationReasonKind;
    label: string;
    detail: string;
}
export type DashboardActivityType = "sensor" | "species" | "alert" | "report";
export interface DashboardActivityItem {
    type: DashboardActivityType;
    text: string;
    time: string;
    href?: string;
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
export type DashboardMetricIcon = "fish" | "thermometer" | "wind" | "droplets" | "activity" | "alert-circle";
export interface DashboardMetric {
    label: string;
    value: string;
    unit?: string;
    change: number;
    icon: DashboardMetricIcon;
    color: DataAccent;
}
export interface DashboardMission {
    id: string;
    name: string;
    location: string;
    status: MissionStatus;
    progress: number;
    eta: string;
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
export interface DashboardOverviewData {
    metrics: DashboardMetric[];
    missions: DashboardMission[];
    activity: DashboardActivityItem[];
    quickAccess: DashboardQuickAccessItem[];
    anomalySummary?: DashboardAnomalySummary;
    speciesActivity?: DashboardSpeciesActivity;
}
export type DataExplorerFetchSection = "workspace" | "detail" | "records";
export type DataExplorerFetchSource = "db" | "mock";
export type DataExplorerFetchState = "success" | "not_found" | "error";
export type DataExplorerFetchDelivery = "bootstrap_api" | "browser_api" | "in_process" | "fallback_builder" | "real_backend";
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
    data: DataExplorerWorkspaceData | null;
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
export declare function listMarineRegionConfigs(): MarineRegionConfig[];
export declare function getMarineRegionConfig(regionId: string): MarineRegionConfig | null;
export type MarineEventSeverity = "low" | "medium" | "high" | "critical";
export type DataHonesty = "live" | "delayed" | "estimated" | "modeled" | "unavailable";
export type FreshnessState = "live" | "recent" | "delayed" | "stale" | "historic" | "invalid";
export interface SourceCapability {
    providerId: string;
    latencyClass: "real-time" | "near-real-time" | "delayed" | "batch";
    updateFrequencySeconds: number;
    spatialResolutionKm: number | null;
    licensing: string;
    reliabilityScore: number;
    freshnessClassificationSupported: boolean;
}
export type ObservationSignalType = "sea_surface_temp" | "wave_height" | "wind_speed" | "air_pressure" | "salinity" | "dissolved_oxygen" | "chlorophyll" | "turbidity" | "vessel_position" | "vessel_density" | "acoustic_detection" | "animal_track";
export interface CanonicalObservation {
    id: string;
    signalType: ObservationSignalType;
    value: number | string | any;
    unit: string | null;
    location: {
        lat: number;
        lng: number;
        depth?: number;
    };
    observedAt: string;
    ingestedAt: string;
    sourceId: string;
    honesty: DataHonesty;
    freshness: FreshnessState;
    confidenceScore: number;
    metadata?: Record<string, any>;
    validationState?: ValidationState;
    validationMetadata?: ValidationResolutionMetadata;
}
export interface TourismHazard {
    id: string;
    type: "strong_current" | "high_surf" | "storm" | "poor_visibility" | "ecological_stress";
    severity: MarineEventSeverity;
    summary: string;
    observedAt: string;
    confidence: number;
}
export interface EcologicalSensitivity {
    level: "low" | "moderate" | "high" | "critical";
    reason: string;
    protectedAreaId?: string;
    isStressed: boolean;
}
export interface ViewingOpportunity {
    speciesId: string;
    commonName: string;
    likelihood: number;
    explanation: string;
    supportingSignals: string[];
}
export interface TourismSummary {
    regionId: string;
    overallRating: number;
    conditions: {
        diving: number;
        boating: number;
        snorkeling: number;
    };
    hazards: TourismHazard[];
    sensitivity: EcologicalSensitivity;
    opportunities: ViewingOpportunity[];
    confidence: number;
    freshness: FreshnessState;
    updatedAt: string;
}
export type SpatialRuleType = "bounding_box" | "radius";
export interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
}
export interface RadiusCircle {
    centerLat: number;
    centerLng: number;
    radiusKm: number;
}
export interface SpatialRule {
    id: string;
    type: SpatialRuleType;
    label?: string;
    config: BoundingBox | RadiusCircle;
    notes?: string;
    version: number;
}
export interface MissionTriggerRule {
    missionId: string;
    targetSpeciesId?: string;
    targetSignalType?: SignalType;
    spatial: SpatialRule;
    timeWindowHours?: number;
    minCorroborationCount: number;
    minConfidenceThreshold: number;
}
export interface ConfidenceAudit {
    confidenceScore: number;
    coverageScore: number;
    freshnessState: FreshnessState;
    sensorHealthImpact: number;
    decayReasons: string[];
    metadata?: Record<string, any>;
}
export interface ConfidenceDecayConfig {
    baseDegradedPenalty: number;
    baseFailingPenalty: number;
    scalingFactors: {
        sensorCountMultiplier: number;
        sectorCoverageMultiplier: number;
        corroborationMultiplier: number;
        recencyMultiplier: number;
    };
}
export interface RegionalImpactResult {
    regionId: string;
    environmentalRiskLevel: "low" | "medium" | "high";
    environmentalRisk: number;
    biologicalImpactLevel: "low" | "medium" | "high";
    impactScore: number;
    weightedImpact: number;
    totalSensitivity: number;
    confidence: ConfidenceAudit;
    sensitiveSpeciesCount: number;
    topSensitiveSpecies: Array<{
        speciesId: string;
        commonName: string;
        impactContribution: number;
    }>;
    summary: string;
}
export interface IngestionHealthStatus {
    sourceId: string;
    status: "healthy" | "degraded" | "failing";
    lastSuccessfulIngest: string;
    failureCount24h: number;
    avgLatencyMs: number;
    schemaDriftIncidents: number;
    freshness: FreshnessState;
}
export type SimulatedSensorHealth = "nominal" | "degraded" | "failing";
export interface PlatformHealthOverview {
    overallStatus: "healthy" | "degraded" | "failing";
    sources: IngestionHealthStatus[];
    activeAlerts: number;
    updatedAt: string;
    systemIntegrity: SystemIntegrityStatus;
    partitionPurity: string;
    partitionPurityRatio: number;
}
export type DataExplorerPresetScope = "shared" | "personal";
export type DataExplorerPresetFilters = Pick<Required<DataExplorerDatasetFilters>, "q" | "category" | "region" | "status" | "sortBy" | "sortDir" | "pageSize">;
export interface DataExplorerPresetRecord {
    id: string;
    name: string;
    scope: DataExplorerPresetScope;
    filters: DataExplorerPresetFilters;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string | null;
    useCount?: number;
}
export interface DataExplorerPresetDraft {
    name: string;
    scope?: DataExplorerPresetScope;
    filters: Partial<DataExplorerPresetFilters>;
}
export type DataExplorerPresetMutationReason = "storage_unavailable" | "read_failed" | "write_failed" | "corrupt_json" | "invalid_schema" | "unsupported_version" | "duplicate_name" | "validation" | "not_found";
export interface DataExplorerPresetMutationResult {
    ok: boolean;
    presets: DataExplorerPresetRecord[];
    error?: string;
    reason?: DataExplorerPresetMutationReason;
}
export type DataExplorerPresetAuditAction = "created" | "updated" | "deleted" | "marked_used";
export type DataExplorerPresetAuditActorType = "station_admin" | "unknown";
export type DataExplorerPresetAuditOutcome = "success" | "failure";
export interface DataExplorerPresetAuditEvent {
    id: string;
    presetId: string | null;
    presetName: string;
    scope: DataExplorerPresetScope;
    action: DataExplorerPresetAuditAction;
    actorId: string | null;
    actorType: DataExplorerPresetAuditActorType;
    ownerId: string | null;
    outcome: DataExplorerPresetAuditOutcome;
    reason?: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
}
export interface DataExplorerPresetAuditListResult {
    ok: boolean;
    events: DataExplorerPresetAuditEvent[];
    error?: string;
    reason?: DataExplorerPresetMutationReason;
}
export type DataExplorerBehaviorEventType = "preset_applied" | "dataset_selected" | "dataset_detail_viewed";
export interface DataExplorerBehaviorEvent {
    id: string;
    eventType: DataExplorerBehaviorEventType;
    scope: DataExplorerPresetScope;
    actorId: string | null;
    actorLabel: string | null;
    ownerId: string | null;
    presetId: string | null;
    presetName: string | null;
    datasetId: string | null;
    datasetName: string | null;
    createdAt: string;
    sourceContext?: Record<string, unknown>;
}
export interface DataExplorerBehaviorEventWriteResult {
    ok: boolean;
    error?: string;
    reason?: DataExplorerPresetMutationReason;
}
export interface DataExplorerBehaviorEventListResult {
    ok: boolean;
    events: DataExplorerBehaviorEvent[];
    error?: string;
    reason?: DataExplorerPresetMutationReason;
}
export interface DataExplorerBehaviorDedupeDropSummaryItem {
    datasetId: string;
    dropCount: number;
    mostRecentDroppedAt: string;
}
export interface DataExplorerBehaviorDedupeDropSummaryResult {
    ok: boolean;
    summary: DataExplorerBehaviorDedupeDropSummaryItem[];
    windowMinutes: number;
    error?: string;
    reason?: DataExplorerPresetMutationReason;
}
export type DataExplorerBehaviorDedupeDropSummaryExportFormat = "json" | "csv";
export declare function compareDataExplorerBehaviorDedupeDropSummaryItems(left: DataExplorerBehaviorDedupeDropSummaryItem, right: DataExplorerBehaviorDedupeDropSummaryItem): number;
export declare const DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE = "DataExplorer.dedupeExport";
export interface DataExplorerBehaviorDedupeDropSummaryExportHistoryItem {
    exportedAt: string;
    format: DataExplorerBehaviorDedupeDropSummaryExportFormat;
    scope: DataExplorerPresetScope;
    totalDatasets: number;
    actorId: string | null;
}
export interface DataExplorerBehaviorDedupeDropSummaryExportHistoryResult {
    ok: boolean;
    history: DataExplorerBehaviorDedupeDropSummaryExportHistoryItem[];
    error?: string;
    reason?: DataExplorerPresetMutationReason;
}
export declare const DATA_EXPLORER_DEFAULT_PRESET_FILTERS: DataExplorerPresetFilters;
export declare const DATA_EXPLORER_ALLOWED_SORTS: DataExplorerDatasetSortBy[];
export declare const DATA_EXPLORER_ALLOWED_DIRECTIONS: DataExplorerSortDirection[];
//# sourceMappingURL=types.d.ts.map