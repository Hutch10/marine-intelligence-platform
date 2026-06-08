// HutchStack Environmental Intelligence Harness — shared contracts

export type HarnessEventKind =
  | "ingestion"
  | "scheduler_execution"
  | "verification"
  | "freshness"
  | "alert_validation"
  | "human_review"
  | "publication";

export type HarnessOutcome =
  | "pass"
  | "warn"
  | "fail"
  | "withheld"
  | "published"
  | "rejected";

export type FreshnessClassification = "live" | "stale" | "withheld" | "unknown";

export type VerificationStatus = "verified" | "unverified" | "withheld" | "failed";

export type FreshnessPolicyBand = "pass" | "warn" | "fail";

export interface FreshnessStatus {
  classification: FreshnessClassification;
  ageMs: number;
  thresholdMs: number;
  policyBand: FreshnessPolicyBand;
  evaluatedAt: string;
  source: string;
}

export interface EnvironmentalSignalProvenance {
  source: string;
  sourceFeed?: string | null;
  productDate?: string | null;
  ingestedAt?: string | null;
  provenanceId?: string | null;
  contentHash?: string | null;
}

export interface IngestionEvent {
  eventId: string;
  source: string;
  runId: string | null;
  status: "success" | "degraded" | "failed";
  insertedCount: number;
  rejectedCount: number;
  startedAt: string;
  completedAt: string;
  outcome: HarnessOutcome;
}

export interface SchedulerExecutionEvent {
  eventId: string;
  workerRunId: string;
  trigger: "github_actions" | "in_process_scheduler" | "manual";
  status: "success" | "degraded" | "failed";
  startedAt: string;
  completedAt: string;
  sourceCount: number;
  outcome: HarnessOutcome;
}

export interface VerificationEvent {
  eventId: string;
  subject: string;
  check: string;
  outcome: HarnessOutcome;
  detail?: string | null;
  evaluatedAt: string;
}

export type AlertLifecycleStatus = "open" | "withheld" | "published" | "rejected";

export interface AlertValidationEvent {
  eventId: string;
  alertKey: string;
  source: string;
  ruleType: string;
  lifecycleStatus: AlertLifecycleStatus;
  verificationStatus: VerificationStatus;
  feedHealthGeneratedAt?: string | null;
  outcome: HarnessOutcome;
  evaluatedAt: string;
}

export interface HumanReviewEvent {
  eventId: string;
  subjectType: "risk_evaluation" | "investigation" | "anomaly";
  subjectId: string;
  action: string;
  actor?: string | null;
  outcome: HarnessOutcome;
  evaluatedAt: string;
  detail?: string | null;
}

export interface PublicationHarnessEvent {
  eventId: string;
  alertId: string;
  alertKey: string;
  signalId?: string | null;
  lifecycleStatus: "published" | "rejected" | "withheld";
  outcome: HarnessOutcome;
  evaluatedAt: string;
  detail?: string | null;
}

export type EnvironmentalSignalTrustStatus =
  | "trusted"
  | "unverified_lineage"
  | "withheld"
  | "partial";

export interface EnvironmentalSignalLineage {
  signalId: string;
  rootEventId: string;
  sourceIngestionEventId: string;
  verificationEventId: string | null;
  provenanceHash: string;
}

export interface EnvironmentalHarnessEventRecord {
  id: string;
  eventKind: HarnessEventKind;
  subjectType: string;
  subjectId: string;
  outcome: HarnessOutcome;
  payloadJson: string;
  contentHash: string;
  createdAt: string;
}
