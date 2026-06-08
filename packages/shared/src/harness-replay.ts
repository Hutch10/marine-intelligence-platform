import type {
  AlertValidationEvent,
  EnvironmentalSignalProvenance,
  FreshnessStatus,
  HarnessOutcome,
  HumanReviewEvent,
  VerificationEvent,
} from "./harness";

export type HarnessLineageEventType =
  | "ingestion"
  | "verification"
  | "alert"
  | "review"
  | "publication";

export interface HarnessLineageNode {
  eventId: string;
  parentEventId: string | null;
  rootEventId: string;
  eventType: HarnessLineageEventType;
  createdAt: string;
  outcome?: HarnessOutcome;
}

export interface ReplaySourceInputs {
  status: "available";
  source: string;
  sourceFeed?: string | null;
  sourceTimestamp?: string | null;
  rawInputs?: Record<string, unknown> | null;
  provenance?: EnvironmentalSignalProvenance | null;
  observationRecordId?: string | null;
}

export interface ReplayWithheldSection {
  status: "withheld" | "unavailable";
  reason: string;
}

export type ReplayFreshnessEvaluation =
  | { status: "available"; evaluation: FreshnessStatus }
  | ReplayWithheldSection;

export type ReplayVerificationResults =
  | { status: "available"; results: VerificationEvent[] }
  | ReplayWithheldSection;

export type ReplayAlertDecisions =
  | { status: "available"; decisions: AlertValidationEvent[] }
  | ReplayWithheldSection;

export type ReplayReviewActions =
  | { status: "available"; actions: HumanReviewEvent[] }
  | ReplayWithheldSection;

export interface PublicationEvent {
  eventId: string;
  alertId: string;
  signalId?: string | null;
  outcome: HarnessOutcome;
  lifecycleStatus: "published" | "rejected" | "withheld";
  evaluatedAt: string;
  detail?: string | null;
}

export type ReplayPublicationOutcome =
  | { status: "available"; publication: PublicationEvent }
  | ReplayWithheldSection;

export interface EnvironmentalReplayPacket {
  packetId: string;
  signalId?: string | null;
  alertId?: string | null;
  eventId?: string | null;
  lineage: HarnessLineageNode[];
  sourceInputs: ReplaySourceInputs | ReplayWithheldSection;
  freshnessEvaluation: ReplayFreshnessEvaluation;
  verificationResults: ReplayVerificationResults;
  alertDecisions: ReplayAlertDecisions;
  reviewActions: ReplayReviewActions;
  publicationOutcome: ReplayPublicationOutcome;
  evidenceStatus: "complete" | "partial" | "withheld";
  withheldSections: string[];
}

export interface EnvironmentalEvidencePacket {
  packetId: string;
  generatedAt: string;
  rootEventId: string;
  signalId?: string | null;
  alertId?: string | null;
  provenance: EnvironmentalSignalProvenance | ReplayWithheldSection;
  lineage: HarnessLineageNode[];
  verification: ReplayVerificationResults;
  reviewHistory: ReplayReviewActions;
  publicationDecision: ReplayPublicationOutcome;
  replay: EnvironmentalReplayPacket;
  evidenceStatus: "complete" | "partial" | "withheld";
  withheldSections: string[];
}
