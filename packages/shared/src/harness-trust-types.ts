import type {
  EnvironmentalSignalProvenance,
  FreshnessClassification,
  FreshnessStatus,
  VerificationStatus,
} from "./harness";

/** Evidence availability on trusted public projections and replay packets. */
export type TrustEvidenceStatus = "complete" | "partial" | "withheld" | "unavailable";

/** Replay reconstructability on trusted public projections. */
export type TrustReplayCompleteness = "reconstructable" | "partial" | "unavailable";

/** Resolved trust metadata from promotion and presentation gates. */
export interface TrustMetadata {
  trustedForPromotion: boolean;
  evidenceStatus: TrustEvidenceStatus;
  replayCompleteness: TrustReplayCompleteness;
}

/** Persisted replay lineage anchors on signals and alerts. */
export interface ReplayLineageReference {
  signalId?: string | null;
  rootEventId?: string | null;
  sourceIngestionEventId?: string | null;
  verificationEventId?: string | null;
  provenanceHash?: string | null;
}

/** Verification harness references on a signal. */
export interface VerificationReference {
  verificationStatus?: VerificationStatus;
}

/** Replay validation and evidence projection references. */
export interface ReplayValidationReference {
  replayEvidenceStatus?: TrustEvidenceStatus;
  evidenceStatus?: TrustEvidenceStatus;
  replayCompleteness?: TrustReplayCompleteness;
  packetId?: string | null;
  publicationReconstructable?: boolean | null;
}

/** Trust gate input fields shared across presentation and public signal types. */
export interface SignalTrustFields
  extends ReplayLineageReference, VerificationReference, ReplayValidationReference {
  source?: string | null;
  provenance?: EnvironmentalSignalProvenance | null;
  provenanceId?: string | null;
  freshnessStatus?: FreshnessStatus;
  freshnessClassification?: FreshnessClassification;
  requireReplayLineage?: boolean;
  /** Observations may promote on ingestion+verification partial replay; alerts require publication. */
  promotionKind?: "observation" | "alert";
}
