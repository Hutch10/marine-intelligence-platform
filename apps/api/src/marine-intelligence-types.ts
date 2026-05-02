export type MarineOntologyLayer = "observed" | "derived" | "modeled" | "narrative";

export type MarineOntologyEntityType =
  | "observation"
  | "metric"
  | "signal"
  | "event"
  | "briefing";

export interface MarineOntologyTerm {
  id: string;
  label: string;
  layer: MarineOntologyLayer;
  entityType: MarineOntologyEntityType;
  description: string;
  parentId: string | null;
  tags: string[];
  version: number;
}

export type MarineEventClass = "threshold_alert" | "trend_signal" | "contextual_signal";

export type MarineEventSeverity = "low" | "medium" | "high" | "critical";

export type MarineEventStatus =
  | "detected"
  | "monitoring"
  | "confirmed"
  | "resolved"
  | "dismissed";

export type MarineEventEvidenceType =
  | "observation"
  | "derived_metric"
  | "model_output"
  | "human_note";

export interface MarineEventLineage {
  source: string;
  sourceRecordId: string;
  ingestionRunId: string;
  observedAt: string;
  ingestedAt: string;
}

export interface MarineEventEvidence {
  id: string;
  eventId: string;
  evidenceType: MarineEventEvidenceType;
  summary: string;
  detail: string | null;
  createdAt: string;
}

export interface MarineEventRecord {
  id: string;
  ontologyTermId: string;
  eventClass: MarineEventClass;
  severity: MarineEventSeverity;
  status: MarineEventStatus;
  title: string;
  summary: string;
  region: string;
  stationId: string | null;
  confidence: number;
  lineage: MarineEventLineage;
  detectedAt: string;
  resolvedAt: string | null;
  truthPartition: TruthPartition;
  integrityHash?: string | null;
  integrityChainHash?: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface MarineEventCreateInput {
  ontologyTermId: string;
  eventClass: MarineEventClass;
  severity: MarineEventSeverity;
  status?: MarineEventStatus;
  title: string;
  summary: string;
  region: string;
  stationId?: string | null;
  confidence: number;
  lineage: MarineEventLineage;
  detectedAt?: string;
  truthPartition?: TruthPartition;
}


export interface MarineEventListFilters {
  id?: string;
  ontologyTermId?: string;
  eventClass?: MarineEventClass;
  severity?: MarineEventSeverity;
  status?: MarineEventStatus;
  region?: string;
  stationId?: string;
  source?: string;
  limit?: number;
}

export interface MarineEventMutationResult {
  ok: boolean;
  reason?: "validation" | "ontology_term_not_found" | "not_found";
  error?: string;
}

export interface MarineEventCreateResult extends MarineEventMutationResult {
  event: MarineEventRecord | null;
}

export interface MarineEventListResult {
  ok: boolean;
  events: MarineEventRecord[];
}

export type MarineEventCorrelationResult =
  | { source: "db"; matched: true; existingEventId: string }
  | { source: "db"; matched: false; newEvent: MarineEventRecord }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export interface MarineEventCorrelationInput extends MarineEventCreateInput {
  correlationWindowMs?: number;
}

// --- Step 21: Detection input types ---

export interface MarineDetectionThresholdInput {
  stationId: string | null;
  region: string;
  observedValue: number;
  baselineValue: number;
  observedAt: string;
  source: string;
  sourceRecordId: string;
  ingestionRunId: string;
  ingestedAt: string;
}

export interface MarineDetectionTrendInput {
  stationId: string | null;
  region: string;
  observations: Array<{ value: number; observedAt: string }>;
  source: string;
  sourceRecordId: string;
  ingestionRunId: string;
  ingestedAt: string;
}

export interface MarineDetectionContextualInput {
  stationId: string | null;
  region: string;
  hotspotValue: number;
  dhwValue: number;
  observedAt: string;
  source: string;
  sourceRecordId: string;
  ingestionRunId: string;
  ingestedAt: string;
}

// --- Step 21: Investigation types ---

export type MarineInvestigationStatus =
  | "open"
  | "acknowledged"
  | "in_review"
  | "resolved"
  | "dismissed";

export type MarineInvestigationTransition =
  | "acknowledge"
  | "start_review"
  | "resolve"
  | "dismiss";

export interface MarineInvestigationRecord {
  id: string;
  eventId: string;
  title: string;
  sourceType: "signal" | "anomaly" | null;
  stationId: string | null;
  region: string | null;
  detectedAt: string | null;
  status: MarineInvestigationStatus;
  ownerId: string | null;
  notes: string | null;
  outcome?: "confirmed" | "false_positive" | "inconclusive" | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
  truthPartition: TruthPartition;
  integrityHash?: string | null;
  integrityChainHash?: string | null;
}


export interface MarineInvestigationCreateInput {
  eventId: string;
  title: string;
  sourceType?: "signal" | "anomaly";
  stationId?: string | null;
  region?: string | null;
  detectedAt?: string | null;
  ownerId?: string | null;
  truthPartition?: TruthPartition;
}


export interface MarineInvestigationListFilters {
  eventId?: string;
  status?: MarineInvestigationStatus;
  ownerId?: string;
  limit?: number;
}

export interface MarineInvestigationMutationResult {
  ok: boolean;
  reason?: "validation" | "not_found" | "invalid_transition";
  error?: string;
}

export interface MarineInvestigationCreateResult extends MarineInvestigationMutationResult {
  investigation: MarineInvestigationRecord | null;
}

export interface MarineInvestigationTransitionResult extends MarineInvestigationMutationResult {
  investigation: MarineInvestigationRecord | null;
}

export interface MarineInvestigationGetResult {
  ok: boolean;
  investigation: MarineInvestigationRecord | null;
}

export interface MarineInvestigationListResult {
  ok: boolean;
  investigations: MarineInvestigationRecord[];
}

// --- Step 21: Alert types ---

export type MarineAlertStatus = "active" | "acknowledged" | "resolved";

export type MarineAlertRuleType =
  | "threshold_breach"
  | "trend_detected"
  | "contextual_convergence";

export interface MarineAlertRecord {
  id: string;
  eventId: string;
  investigationId: string | null;
  severity: MarineEventSeverity;
  status: MarineAlertStatus;
  ruleType: MarineAlertRuleType;
  title: string;
  detail: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  truthPartition: TruthPartition;
  integrityHash?: string | null;
  integrityChainHash?: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface MarineAlertCreateInput {
  eventId: string;
  investigationId?: string | null;
  severity: MarineEventSeverity;
  ruleType: MarineAlertRuleType;
  title: string;
  detail?: string | null;
  detectedAt?: string;
  truthPartition?: TruthPartition;
}


export interface MarineAlertListFilters {
  eventId?: string;
  investigationId?: string | null;
  status?: MarineAlertStatus;
  severity?: MarineEventSeverity;
  ruleType?: MarineAlertRuleType;
  limit?: number;
}

export interface MarineAlertMutationResult {
  ok: boolean;
  reason?: "validation" | "not_found";
  error?: string;
}

export interface MarineAlertCreateResult extends MarineAlertMutationResult {
  alert: MarineAlertRecord | null;
}

export interface MarineAlertListResult {
  ok: boolean;
  alerts: MarineAlertRecord[];
}

// --- Signal Intelligence & Acoustic Classification ---

export type TruthPartition = "FIELD_TRUTH" | "PRESSURE_TEST" | "SYNTHETIC_BENCH";

export interface AcousticClassificationResult {
  label: "whale_like" | "fish_chorus_like" | "shrimp_field_like" | "ambiguous_biologic" | "unknown";
  confidence: number;
  trace: SignalDecisionTrace;
}

export interface SignalDecisionTrace {
  rawInputs: {
    frequencyHz: number;
    durationMs: number;
    harmonicity?: number;
    peakPowerDb?: number;
    spectralTilt?: number;
    burstIntervalsMs?: number[];
    tiltSeries?: number[];
    harmonicitySeries?: number[];
    timestamp: string;
  };
  eligibility: {
    whale_like: { eligible: boolean; reasons: string[] };
    fish_chorus_like: { eligible: boolean; reasons: string[] };
    shrimp_field_like: { eligible: boolean; reasons: string[] };
  };
  normalizedSubscores: {
    frequency: number;
    duration: number;
    pattern: number;
    environmental: number;
  };
  weightedTotals: {
    whale_like: number;
    fish_chorus_like: number;
    shrimp_field_like: number;
  };
  exclusions: string[];
  margins: {
    winnerScore: number;
    runnerUpScore: number;
    margin: number;
  };
  mimicIndicators?: {
    isMimicCandidate: boolean;
    penaltyApplied: number;
    reasons: string[];
    tiltContribution?: number;
    temporalContribution?: number;
    correlationMetrics?: {
      dci: number;
      couplingBand: string;
      coupledRecovery: boolean;
    };
    parameters?: ClassifierParameters;
  };
  classifierMetadata: {
    version: string;
    engine: string;
  };
  timestamp: string;
}

export interface ClassifierParameters {
  resolutionFloor: number;
  minMargin: number;
  mimicConfidenceCap: number;
  stationarityLimitMs: number;
  shortDurationLimitMs: number;
  tiltThreshold: number;
  periodicCvThreshold: number;
  stochasticCvThreshold: number;
  dciCouplingLimit: number;
  dciIndependenceLimit: number;
  mimicPenaltyWeight: number;
  tiltPenaltyWeight: number;
  temporalPenaltyWeight: number;
  couplingCreditWeight: number;
}

export const DEFAULT_PARAMETERS: ClassifierParameters = {
  resolutionFloor: 0.65,
  minMargin: 0.20,
  mimicConfidenceCap: 0.85,
  stationarityLimitMs: 1500,
  shortDurationLimitMs: 1500,
  tiltThreshold: 3.0,
  periodicCvThreshold: 0.15,
  stochasticCvThreshold: 0.45,
  dciCouplingLimit: 0.75,
  dciIndependenceLimit: 0.40,
  mimicPenaltyWeight: 1.0, 
  tiltPenaltyWeight: 1.0,  
  temporalPenaltyWeight: 1.0,
  couplingCreditWeight: 1.0
};