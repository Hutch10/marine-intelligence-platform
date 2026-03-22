/**
 * Action type definitions.
 *
 * Actions are audited mutations dispatched through the ontology layer.
 * This file declares the type catalog and input shapes. Implementations
 * are added when mutation support is introduced.
 */

import type { OntologyLinkTypeId, OntologyObjectTypeId } from "./types";

export type OntologyActionTypeId =
  | "AcknowledgeAlert"
  | "CloseInvestigation"
  | "AnnotateSighting"
  | "PromoteSignalToInvestigation";

export interface OntologyActionMetadata {
  id: OntologyActionTypeId;
  displayName: string;
  description: string;
  modifiesTypes: OntologyObjectTypeId[];
  modifiesLinks: OntologyLinkTypeId[];
}

export interface OntologyActionContext {
  actorId: string;
  actorType: "station_admin" | "agent" | "system";
  requestId: string;
  timestamp: string;
}

export interface OntologyActionResult<P = unknown> {
  ok: boolean;
  actionType: OntologyActionTypeId;
  affectedRids: string[];
  payload: P | null;
  auditEventId: string;
  executedAt: string;
  error?: string;
}

// ─── Input shapes ─────────────────────────────────────────────────────────────

export interface AcknowledgeAlertInput {
  alertId: string;
  acknowledgedBy: string;
}

export interface CloseInvestigationInput {
  investigationId: string;
  outcome: "resolved" | "dismissed" | "escalated";
  summary: string;
}

export interface AnnotateSightingInput {
  sightingId: string;
  notes: string;
  verificationStatus: "pending" | "verified" | "rejected";
}

export interface PromoteSignalToInvestigationInput {
  signalId: string;
  investigationTitle: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const REGISTRY: Record<OntologyActionTypeId, OntologyActionMetadata> = {
  AcknowledgeAlert: {
    id: "AcknowledgeAlert",
    displayName: "Acknowledge Alert",
    description: "Mark an alert as acknowledged by an operator.",
    modifiesTypes: ["MarineAlert"],
    modifiesLinks: [],
  },
  CloseInvestigation: {
    id: "CloseInvestigation",
    displayName: "Close Investigation",
    description: "Conclude an investigation track with an outcome.",
    modifiesTypes: ["Investigation"],
    modifiesLinks: [],
  },
  AnnotateSighting: {
    id: "AnnotateSighting",
    displayName: "Annotate Sighting",
    description: "Add verification status and notes to a species sighting.",
    modifiesTypes: ["Species"],
    modifiesLinks: ["Species_observedAt_Observation"],
  },
  PromoteSignalToInvestigation: {
    id: "PromoteSignalToInvestigation",
    displayName: "Promote Signal",
    description: "Promote a signal detection to an investigation track.",
    modifiesTypes: ["Investigation", "MarineAlert"],
    modifiesLinks: ["Investigation_involves_MarineAlert"],
  },
};

export function listActions(): OntologyActionMetadata[] {
  return Object.values(REGISTRY);
}

export function getAction(id: OntologyActionTypeId): OntologyActionMetadata {
  return REGISTRY[id];
}
