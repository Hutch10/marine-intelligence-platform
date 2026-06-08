import type { EnvironmentalSignalLineage, HarnessOutcome, IngestionEvent } from "@marine/shared";
import type { AsyncDbAdapter } from "../../db/async-client";
import { recordHarnessEvent } from "../../repositories/environmental-harness-events";
import { auditVerificationForIngestion } from "./audit";
import { buildDeterministicSignalId } from "./lineage";
import { stableContentHash } from "./provenance";

export interface PersistSignalLineageInput {
  source: string;
  runId: string | null;
  startedAt: string;
  completedAt: string;
  signalId?: string;
  stationId?: string | null;
  regionKey?: string | null;
  observedAt?: string | number | null;
  provenanceId?: string | null;
  provenancePayload: Record<string, unknown>;
  ingestionOutcome?: HarnessOutcome;
}

export interface SignalLineageDependencies {
  getAdapter?: () => AsyncDbAdapter;
}

function resolveSignalId(input: PersistSignalLineageInput): string {
  if (input.signalId) {
    return input.signalId;
  }

  return buildDeterministicSignalId({
    source: input.source,
    stationId: input.stationId,
    regionKey: input.regionKey,
    observedAt: input.observedAt,
    provenanceId: input.provenanceId,
  });
}

export async function persistSignalIngestionLineage(
  input: PersistSignalLineageInput,
  dependencies: SignalLineageDependencies = {},
): Promise<EnvironmentalSignalLineage> {
  const signalId = resolveSignalId(input);
  const provenanceHash = stableContentHash(input.provenancePayload);
  const outcome = input.ingestionOutcome ?? "pass";
  const adapterDeps = dependencies.getAdapter ? { getAdapter: dependencies.getAdapter } : {};

  const ingestionPayload: IngestionEvent & {
    signalId: string;
    provenanceHash: string;
    provenanceId?: string | null;
    stationId?: string | null;
    regionKey?: string | null;
  } = {
    eventId: "pending",
    source: input.source,
    runId: input.runId,
    status: outcome === "fail" ? "failed" : outcome === "warn" ? "degraded" : "success",
    insertedCount: 1,
    rejectedCount: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outcome,
    signalId,
    provenanceHash,
    provenanceId: input.provenanceId ?? null,
    stationId: input.stationId ?? null,
    regionKey: input.regionKey ?? null,
    ...input.provenancePayload,
  };

  const sourceIngestionEventId = await recordHarnessEvent({
    eventKind: "ingestion",
    eventType: "ingestion",
    subjectType: "signal",
    subjectId: signalId,
    signalId,
    outcome,
    payload: ingestionPayload as unknown as Record<string, unknown>,
  }, adapterDeps);

  ingestionPayload.eventId = sourceIngestionEventId;

  const verificationEventId = await auditVerificationForIngestion({
    parentEventId: sourceIngestionEventId,
    rootEventId: sourceIngestionEventId,
    signalId,
    source: input.source,
    runId: input.runId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outcome,
  }, adapterDeps);

  return {
    signalId,
    rootEventId: sourceIngestionEventId,
    sourceIngestionEventId,
    verificationEventId,
    provenanceHash,
  };
}

export function buildNdbcSignalLineageInput(input: {
  source: string;
  runId: string;
  stationId: string;
  observedAt: number;
  sourceTimestamp: string;
  provenanceId: string;
  rawLine: string;
  sourceFeed: string;
}): PersistSignalLineageInput {
  return {
    source: input.source,
    runId: input.runId,
    startedAt: new Date(input.observedAt).toISOString(),
    completedAt: new Date().toISOString(),
    stationId: input.stationId,
    observedAt: input.sourceTimestamp,
    provenanceId: input.provenanceId,
    provenancePayload: {
      source: input.source,
      stationId: input.stationId,
      observedAt: input.sourceTimestamp,
      provenanceId: input.provenanceId,
      sourceFeed: input.sourceFeed,
      rawLine: input.rawLine,
    },
  };
}

export function buildCrwSignalLineageInput(input: {
  runId: string;
  regionKey: string;
  stationId: string | null;
  observedAt: number;
  sourceTimestamp: string;
  recordId: string;
  sourceReference: string;
  signalLabel: string | null;
}): PersistSignalLineageInput {
  return {
    source: "noaa_coral_reef_watch",
    runId: input.runId,
    startedAt: new Date(input.observedAt).toISOString(),
    completedAt: new Date().toISOString(),
    regionKey: input.regionKey,
    stationId: input.stationId,
    observedAt: input.sourceTimestamp,
    provenanceId: input.recordId,
    provenancePayload: {
      source: "noaa_coral_reef_watch",
      regionKey: input.regionKey,
      stationId: input.stationId,
      observedAt: input.sourceTimestamp,
      recordId: input.recordId,
      sourceReference: input.sourceReference,
      signalLabel: input.signalLabel,
    },
  };
}
