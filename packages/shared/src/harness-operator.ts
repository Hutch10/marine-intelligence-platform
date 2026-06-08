// HutchStack Phase 3 — operator console, review queue, replay validation burn-in

export type ReviewQueueStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "escalated"
  | "annotated";

export type ReviewSubjectType = "signal" | "alert" | "risk_evaluation" | "investigation" | "anomaly";

export interface ReviewQueueItem {
  id: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  signalId: string | null;
  alertId: string | null;
  rootEventId: string | null;
  parentEventId: string | null;
  queueStatus: ReviewQueueStatus;
  annotation: string | null;
  actor: string | null;
  reviewEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReplayValidationSampleTarget {
  kind: "signal" | "alert";
  id: string;
}

export interface ReplayValidationCheckResult {
  target: ReplayValidationSampleTarget;
  passed: boolean;
  failures: string[];
  evidenceStatus: "complete" | "partial" | "withheld" | "unavailable";
  withheldSections: string[];
  packetId: string | null;
  rootEventId: string | null;
  publicationReconstructable: boolean | null;
}

export interface ReplayValidationJobResult {
  generatedAt: string;
  sampleCount: number;
  passedCount: number;
  failedCount: number;
  overallPass: boolean;
  samples: ReplayValidationCheckResult[];
}

export interface OperatorReplayCompletenessItem {
  targetKind: "signal" | "alert";
  targetId: string;
  rootEventId: string | null;
  evidenceStatus: "complete" | "partial" | "withheld" | "unavailable";
  withheldSections: string[];
  packetId: string | null;
  replayAvailable: boolean;
}

export interface OperatorPublicationDecisionItem {
  alertId: string;
  signalId: string | null;
  rootEventId: string | null;
  lifecycleStatus: string;
  outcome: string;
  evaluatedAt: string;
  publicationReconstructable: boolean;
}

export interface OperatorHumanReviewItem {
  eventId: string;
  subjectType: string;
  subjectId: string;
  action: string;
  outcome: string;
  evaluatedAt: string;
  rootEventId: string | null;
}

export interface OperatorConsoleHarnessSection {
  latestIngestionRuns: Array<{
    eventId: string;
    source: string;
    outcome: string;
    completedAt: string;
    signalId: string | null;
    rootEventId: string;
  }>;
  verificationStatus: {
    latestOutcome: string | null;
    latestEvaluatedAt: string | null;
    recentCount: number;
  };
  replayCompleteness: OperatorReplayCompletenessItem[];
  replayValidation: ReplayValidationJobResult;
  publicationDecisions: OperatorPublicationDecisionItem[];
  humanReviewActions: OperatorHumanReviewItem[];
  reviewQueue: {
    pendingCount: number;
    items: ReviewQueueItem[];
  };
  alerts: {
    activeCount: number;
    suppressedCount: number;
    active: Array<{ id: string; source: string; ruleType: string; severity: string; title: string }>;
    suppressed: Array<{ alertKey: string; source: string; ruleType: string; reason: string; evaluatedAt: string }>;
  };
}

export interface PublicTrustMetadata {
  trustedForPromotion: boolean;
  evidenceStatus: "complete" | "partial" | "withheld" | "unavailable";
  replayCompleteness: "reconstructable" | "partial" | "unavailable";
}
