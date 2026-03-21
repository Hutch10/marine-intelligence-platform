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
  status: MarineInvestigationStatus;
  ownerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
}

export interface MarineInvestigationCreateInput {
  eventId: string;
  title: string;
  ownerId?: string | null;
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
}

export interface MarineAlertListFilters {
  eventId?: string;
  investigationId?: string;
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