import { createHash } from "node:crypto";
import type { HarnessEventKind } from "./harness";
import type { HarnessLineageEventType } from "./harness-replay";

export function stableContentHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildHarnessEventId(
  eventKind: string,
  subjectType: string,
  subjectId: string,
  contentHash: string,
): string {
  const digest = createHash("sha256")
    .update(`${eventKind}|${subjectType}|${subjectId}|${contentHash}`)
    .digest("hex")
    .slice(0, 16);

  return `EHE-${eventKind}-${digest}`;
}

export function lineageEventTypeFromKind(eventKind: HarnessEventKind): HarnessLineageEventType {
  switch (eventKind) {
    case "ingestion":
    case "scheduler_execution":
      return "ingestion";
    case "verification":
    case "freshness":
      return "verification";
    case "alert_validation":
      return "alert";
    case "human_review":
      return "review";
    case "publication":
      return "publication";
    default:
      return "verification";
  }
}

export function buildDeterministicSignalId(input: {
  source: string;
  stationId?: string | null;
  regionKey?: string | null;
  observedAt?: string | number | null;
  provenanceId?: string | null;
}): string {
  const digest = stableContentHash({
    source: input.source,
    stationId: input.stationId ?? null,
    regionKey: input.regionKey ?? null,
    observedAt: input.observedAt ?? null,
    provenanceId: input.provenanceId ?? null,
  });

  return `SIG-${digest.slice(0, 16)}`;
}

export function buildSourceScopeSignalId(source: string, runId: string | null, startedAt: string): string {
  return buildDeterministicSignalId({
    source,
    observedAt: startedAt,
    provenanceId: runId,
  });
}

export function buildReplayPacketId(input: {
  rootEventId: string;
  signalId?: string | null;
  alertId?: string | null;
  eventId?: string | null;
  lineageEventIds: string[];
}): string {
  const digest = stableContentHash({
    rootEventId: input.rootEventId,
    signalId: input.signalId ?? null,
    alertId: input.alertId ?? null,
    eventId: input.eventId ?? null,
    lineageEventIds: [...input.lineageEventIds].sort(),
  });

  return `RP-${digest.slice(0, 16)}`;
}

export function buildEvidencePacketId(replayPacketId: string, rootEventId: string): string {
  const digest = stableContentHash({
    replayPacketId,
    rootEventId,
  });

  return `EVP-${digest.slice(0, 16)}`;
}
