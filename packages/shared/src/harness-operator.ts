// HutchStack Phase 3 — operator console, review queue, replay validation burn-in

import type {
  ReplayLineageReference,
  ReplayValidationReference,
  TrustEvidenceStatus,
} from "./harness-trust-types";

export type { TrustMetadata as PublicTrustMetadata } from "./harness-trust-types";

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

export interface ReplayValidationCheckResult
  extends Pick<ReplayLineageReference, "rootEventId">,
    Pick<ReplayValidationReference, "packetId" | "publicationReconstructable"> {
  target: ReplayValidationSampleTarget;
  passed: boolean;
  failures: string[];
  evidenceStatus: TrustEvidenceStatus;
  withheldSections: string[];
}

export interface ReplayValidationJobResult {
  generatedAt: string;
  sampleCount: number;
  passedCount: number;
  failedCount: number;
  overallPass: boolean;
  samples: ReplayValidationCheckResult[];
}

export interface OperatorReplayCompletenessItem
  extends Pick<ReplayLineageReference, "rootEventId">,
    Pick<ReplayValidationReference, "packetId"> {
  targetKind: "signal" | "alert";
  targetId: string;
  evidenceStatus: TrustEvidenceStatus;
  withheldSections: string[];
  replayAvailable: boolean;
}

export interface OperatorPublicationDecisionItem
  extends Pick<ReplayLineageReference, "signalId" | "rootEventId">,
    Pick<ReplayValidationReference, "publicationReconstructable"> {
  alertId: string;
  lifecycleStatus: string;
  outcome: string;
  evaluatedAt: string;
}

export interface OperatorHumanReviewItem extends Pick<ReplayLineageReference, "rootEventId"> {
  eventId: string;
  subjectType: string;
  subjectId: string;
  action: string;
  outcome: string;
  evaluatedAt: string;
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
