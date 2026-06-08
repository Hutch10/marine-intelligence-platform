import type {
  AlertValidationEvent,
  EnvironmentalEvidencePacket,
  EnvironmentalReplayPacket,
  FreshnessStatus,
  HarnessLineageNode,
  HumanReviewEvent,
  PublicationEvent,
  VerificationEvent,
} from "@marine/shared";
import type { AsyncDbAdapter } from "../../db/async-client";
import { getAsyncAdapter } from "../../db/async-client";
import { getProvenanceById } from "../../repositories/provenance";
import {
  readHarnessEventById,
  readHarnessEventsByAlertId,
  readHarnessEventsBySignalId,
  readHarnessLineageChain,
  type HarnessEventRecord,
} from "../../repositories/environmental-harness-events";
import {
  classifyCrwFreshness,
  classifyNdbcFreshness,
} from "./freshness-policy";
import {
  buildEvidencePacketId,
  buildReplayPacketId,
} from "./lineage";
import { buildSignalProvenance } from "./provenance";

export interface ReplayEngineDependencies {
  getAdapter?: () => AsyncDbAdapter;
}

function resolveGetAdapter(dependencies: ReplayEngineDependencies) {
  return dependencies.getAdapter ?? (() => getAsyncAdapter(true));
}

function withheld<T extends { status: "withheld" | "unavailable"; reason: string }>(
  reason: string,
  status: "withheld" | "unavailable" = "withheld",
): T {
  return { status, reason } as T;
}

function toLineageNode(event: HarnessEventRecord): HarnessLineageNode {
  return {
    eventId: event.id,
    parentEventId: event.parentEventId,
    rootEventId: event.rootEventId,
    eventType: event.eventType,
    createdAt: new Date(event.createdAt).toISOString(),
    outcome: event.outcome,
  };
}

function parsePayload<T>(event: HarnessEventRecord): T | null {
  try {
    return JSON.parse(event.payloadJson) as T;
  } catch {
    return null;
  }
}

function collectVerificationResults(events: HarnessEventRecord[]): VerificationEvent[] {
  return events
    .filter((event) => event.eventKind === "verification" || event.eventKind === "freshness")
    .map((event) => parsePayload<VerificationEvent>(event))
    .filter((payload): payload is VerificationEvent => payload !== null);
}

function collectAlertDecisions(events: HarnessEventRecord[]): AlertValidationEvent[] {
  return events
    .filter((event) => event.eventKind === "alert_validation")
    .map((event) => parsePayload<AlertValidationEvent>(event))
    .filter((payload): payload is AlertValidationEvent => payload !== null);
}

function collectReviewActions(events: HarnessEventRecord[]): HumanReviewEvent[] {
  return events
    .filter((event) => event.eventKind === "human_review")
    .map((event) => parsePayload<HumanReviewEvent>(event))
    .filter((payload): payload is HumanReviewEvent => payload !== null);
}

function collectPublicationOutcome(events: HarnessEventRecord[]): PublicationEvent | null {
  const publication = events.find((event) => event.eventKind === "publication");
  if (!publication) {
    return null;
  }

  const payload = parsePayload<PublicationEvent>(publication);
  if (payload) {
    return payload;
  }

  return {
    eventId: publication.id,
    alertId: publication.alertId ?? publication.subjectId,
    signalId: publication.signalId,
    outcome: publication.outcome,
    lifecycleStatus: publication.outcome === "published" ? "published" : "rejected",
    evaluatedAt: new Date(publication.createdAt).toISOString(),
    detail: null,
  };
}

async function readProvenancePayload(
  adapter: AsyncDbAdapter,
  provenanceId: string | null | undefined,
): Promise<Record<string, unknown> | null> {
  if (!provenanceId) {
    return null;
  }

  const record = await getProvenanceById(adapter, provenanceId);
  if (!record) {
    return null;
  }

  return record.payload;
}

function deriveFreshnessFromPersistedInputs(input: {
  source: string;
  observedAtMs?: number | null;
  productDateMs?: number | null;
}): FreshnessStatus | null {
  if (input.source === "noaa_crw" && input.productDateMs) {
    return classifyCrwFreshness(input.productDateMs);
  }

  if (input.observedAtMs) {
    return classifyNdbcFreshness(input.observedAtMs, Date.now(), input.source);
  }

  return null;
}

async function buildSourceInputsFromEvents(
  events: HarnessEventRecord[],
  adapter?: AsyncDbAdapter,
): Promise<EnvironmentalReplayPacket["sourceInputs"]> {
  const ingestion = events.find((event) => event.eventKind === "ingestion");
  if (!ingestion) {
    return withheld("ingestion_event_missing");
  }

  const payload = parsePayload<Record<string, unknown>>(ingestion);
  if (!payload) {
    return withheld("ingestion_payload_unreadable");
  }

  const source = typeof payload.source === "string" ? payload.source : ingestion.subjectId;
  const provenanceId = typeof payload.provenanceId === "string"
    ? payload.provenanceId
    : typeof payload.provenance_id === "string"
      ? payload.provenance_id
      : null;

  let rawInputs: Record<string, unknown> | null = null;
  if (adapter && provenanceId) {
    rawInputs = await readProvenancePayload(adapter, provenanceId);
  }

  if (!rawInputs && payload) {
    rawInputs = {
      runId: payload.runId ?? null,
      startedAt: payload.startedAt ?? null,
      completedAt: payload.completedAt ?? null,
      insertedCount: payload.insertedCount ?? null,
      rejectedCount: payload.rejectedCount ?? null,
    };
  }

  if (!rawInputs) {
    return withheld("source_inputs_not_persisted");
  }

  const provenance = buildSignalProvenance({
    source,
    sourceFeed: typeof rawInputs.sourceFeed === "string" ? rawInputs.sourceFeed : null,
    productDate: typeof rawInputs.productDate === "string" ? rawInputs.productDate : null,
    ingestedAt: typeof rawInputs.ingestedAt === "string" ? rawInputs.ingestedAt : null,
    provenanceId,
    stationId: typeof rawInputs.stationId === "string" ? rawInputs.stationId : null,
    observedAt: typeof rawInputs.observedAt === "string" ? rawInputs.observedAt : null,
  });

  return {
    status: "available",
    source,
    sourceFeed: provenance.sourceFeed ?? null,
    sourceTimestamp: typeof rawInputs.sourceTimestamp === "string"
      ? rawInputs.sourceTimestamp
      : typeof payload.startedAt === "string"
        ? payload.startedAt
        : null,
    rawInputs,
    provenance,
    observationRecordId: typeof rawInputs.recordId === "string" ? rawInputs.recordId : null,
  };
}

function buildFreshnessEvaluation(
  events: HarnessEventRecord[],
  sourceInputs: EnvironmentalReplayPacket["sourceInputs"],
): EnvironmentalReplayPacket["freshnessEvaluation"] {
  const freshnessEvents = events.filter((event) => event.eventKind === "freshness");
  const freshnessPayload = freshnessEvents.length > 0
    ? parsePayload<{ evaluation?: FreshnessStatus }>(freshnessEvents[freshnessEvents.length - 1]!)
    : null;

  if (freshnessPayload?.evaluation) {
    return { status: "available", evaluation: freshnessPayload.evaluation };
  }

  if (sourceInputs.status !== "available") {
    return withheld("freshness_requires_source_inputs");
  }

  const observedAt = sourceInputs.rawInputs?.observedAt;
  const productDate = sourceInputs.provenance?.productDate ?? sourceInputs.rawInputs?.productDate;
  const observedAtMs = typeof observedAt === "string" || typeof observedAt === "number"
    ? Date.parse(String(observedAt))
    : null;
  const productDateMs = typeof productDate === "string" ? Date.parse(productDate) : null;
  const evaluation = deriveFreshnessFromPersistedInputs({
    source: sourceInputs.source,
    observedAtMs: Number.isFinite(observedAtMs ?? NaN) ? observedAtMs : null,
    productDateMs: Number.isFinite(productDateMs ?? NaN) ? productDateMs : null,
  });

  if (!evaluation) {
    return withheld("freshness_inputs_incomplete");
  }

  return { status: "available", evaluation };
}

function computeEvidenceStatus(withheldSections: string[]): EnvironmentalReplayPacket["evidenceStatus"] {
  if (withheldSections.includes("sourceInputs")) {
    return "withheld";
  }

  if (withheldSections.length === 0) {
    return "complete";
  }

  return "partial";
}

async function buildReplayPacketFromEvents(
  events: HarnessEventRecord[],
  identifiers: {
    signalId?: string | null;
    alertId?: string | null;
    eventId?: string | null;
  },
  dependencies: ReplayEngineDependencies = {},
): Promise<EnvironmentalReplayPacket> {
  const lineage = events.map(toLineageNode);
  const rootEventId = events[0]?.rootEventId ?? events[0]?.id ?? identifiers.eventId ?? "unknown";
  const withheldSections: string[] = [];

  let adapter: AsyncDbAdapter | undefined;
  if (dependencies.getAdapter) {
    adapter = dependencies.getAdapter();
  }

  const sourceInputs = await buildSourceInputsFromEvents(events, adapter);
  if (sourceInputs.status !== "available") {
    withheldSections.push("sourceInputs");
  }

  const freshnessEvaluation = buildFreshnessEvaluation(events, sourceInputs);
  if (freshnessEvaluation.status !== "available") {
    withheldSections.push("freshnessEvaluation");
  }

  const verificationResultsList = collectVerificationResults(events);
  const verificationResults = verificationResultsList.length > 0
    ? { status: "available" as const, results: verificationResultsList }
    : withheld("verification_events_missing", "unavailable");

  if (verificationResults.status !== "available") {
    withheldSections.push("verificationResults");
  }

  const alertDecisionList = collectAlertDecisions(events);
  const alertDecisions = alertDecisionList.length > 0
    ? { status: "available" as const, decisions: alertDecisionList }
    : withheld("alert_validation_events_missing", "unavailable");

  if (alertDecisions.status !== "available") {
    withheldSections.push("alertDecisions");
  }

  const reviewActionList = collectReviewActions(events);
  const reviewActions = reviewActionList.length > 0
    ? { status: "available" as const, actions: reviewActionList }
    : withheld("review_events_missing", "unavailable");

  if (reviewActions.status !== "available") {
    withheldSections.push("reviewActions");
  }

  const publication = collectPublicationOutcome(events);
  const publicationOutcome = publication
    ? { status: "available" as const, publication }
    : withheld("publication_event_missing", "unavailable");

  if (publicationOutcome.status !== "available") {
    withheldSections.push("publicationOutcome");
  }

  const packetId = buildReplayPacketId({
    rootEventId,
    signalId: identifiers.signalId ?? events.find((event) => event.signalId)?.signalId ?? null,
    alertId: identifiers.alertId ?? events.find((event) => event.alertId)?.alertId ?? null,
    eventId: identifiers.eventId ?? null,
    lineageEventIds: events.map((event) => event.id),
  });

  return {
    packetId,
    signalId: identifiers.signalId ?? events.find((event) => event.signalId)?.signalId ?? null,
    alertId: identifiers.alertId ?? events.find((event) => event.alertId)?.alertId ?? null,
    eventId: identifiers.eventId ?? null,
    lineage,
    sourceInputs,
    freshnessEvaluation,
    verificationResults,
    alertDecisions,
    reviewActions,
    publicationOutcome,
    evidenceStatus: computeEvidenceStatus(withheldSections),
    withheldSections,
  };
}

export async function generateReplayPacketForEventId(
  eventId: string,
  dependencies: ReplayEngineDependencies = {},
): Promise<{ status: "available"; packet: EnvironmentalReplayPacket } | { status: "withheld"; reason: string }> {
  const getAdapter = resolveGetAdapter(dependencies);
  const eventResult = await readHarnessEventById(eventId, { getAdapter });
  if (eventResult.source !== "db") {
    return { status: "withheld", reason: eventResult.fallbackReason };
  }

  const chainResult = await readHarnessLineageChain(eventResult.event.rootEventId, { getAdapter });
  const events = chainResult.source === "db" ? chainResult.events : [eventResult.event];

  const packet = await buildReplayPacketFromEvents(events, {
    eventId,
    signalId: eventResult.event.signalId,
    alertId: eventResult.event.alertId,
  }, dependencies);

  return { status: "available", packet };
}

export async function generateReplayPacketForSignalId(
  signalId: string,
  dependencies: ReplayEngineDependencies = {},
): Promise<{ status: "available"; packet: EnvironmentalReplayPacket } | { status: "withheld"; reason: string }> {
  const getAdapter = resolveGetAdapter(dependencies);
  const eventsResult = await readHarnessEventsBySignalId(signalId, { getAdapter });
  if (eventsResult.source !== "db") {
    return { status: "withheld", reason: eventsResult.fallbackReason };
  }

  const packet = await buildReplayPacketFromEvents(eventsResult.events, { signalId }, dependencies);
  return { status: "available", packet };
}

export async function generateReplayPacketForAlertId(
  alertId: string,
  dependencies: ReplayEngineDependencies = {},
): Promise<{ status: "available"; packet: EnvironmentalReplayPacket } | { status: "withheld"; reason: string }> {
  const getAdapter = resolveGetAdapter(dependencies);
  const eventsResult = await readHarnessEventsByAlertId(alertId, { getAdapter });
  if (eventsResult.source !== "db") {
    return { status: "withheld", reason: eventsResult.fallbackReason };
  }

  const rootEventId = eventsResult.events[0]?.rootEventId;
  const chainResult = rootEventId
    ? await readHarnessLineageChain(rootEventId, { getAdapter })
    : eventsResult;

  const chainEvents = chainResult.source === "db" ? chainResult.events : [];
  const mergedById = new Map<string, HarnessEventRecord>();
  for (const event of [...chainEvents, ...eventsResult.events]) {
    mergedById.set(event.id, event);
  }
  const events = [...mergedById.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    return left.id.localeCompare(right.id);
  });

  const packet = await buildReplayPacketFromEvents(events, { alertId }, dependencies);
  return { status: "available", packet };
}

export function buildEnvironmentalEvidencePacket(
  replayPacket: EnvironmentalReplayPacket,
  generatedAt = new Date().toISOString(),
): EnvironmentalEvidencePacket {
  const rootEventId = replayPacket.lineage[0]?.rootEventId ?? replayPacket.eventId ?? "unknown";
  const provenance = replayPacket.sourceInputs.status === "available"
    ? replayPacket.sourceInputs.provenance ?? {
      source: replayPacket.sourceInputs.source,
      sourceFeed: replayPacket.sourceInputs.sourceFeed ?? null,
      productDate: replayPacket.sourceInputs.sourceTimestamp ?? null,
    }
    : replayPacket.sourceInputs;

  return {
    packetId: buildEvidencePacketId(replayPacket.packetId, rootEventId),
    generatedAt,
    rootEventId,
    signalId: replayPacket.signalId ?? null,
    alertId: replayPacket.alertId ?? null,
    provenance,
    lineage: replayPacket.lineage,
    verification: replayPacket.verificationResults,
    reviewHistory: replayPacket.reviewActions,
    publicationDecision: replayPacket.publicationOutcome,
    replay: replayPacket,
    evidenceStatus: replayPacket.evidenceStatus,
    withheldSections: replayPacket.withheldSections,
  };
}

export async function generateEnvironmentalEvidencePacketForSignalId(
  signalId: string,
  dependencies: ReplayEngineDependencies = {},
): Promise<{ status: "available"; packet: EnvironmentalEvidencePacket } | { status: "withheld"; reason: string }> {
  const replay = await generateReplayPacketForSignalId(signalId, dependencies);
  if (replay.status !== "available") {
    return replay;
  }

  return {
    status: "available",
    packet: buildEnvironmentalEvidencePacket(replay.packet),
  };
}

export async function generateEnvironmentalEvidencePacketForAlertId(
  alertId: string,
  dependencies: ReplayEngineDependencies = {},
): Promise<{ status: "available"; packet: EnvironmentalEvidencePacket } | { status: "withheld"; reason: string }> {
  const replay = await generateReplayPacketForAlertId(alertId, dependencies);
  if (replay.status !== "available") {
    return replay;
  }

  return {
    status: "available",
    packet: buildEnvironmentalEvidencePacket(replay.packet),
  };
}

export async function generateEnvironmentalEvidencePacketForEventId(
  eventId: string,
  dependencies: ReplayEngineDependencies = {},
): Promise<{ status: "available"; packet: EnvironmentalEvidencePacket } | { status: "withheld"; reason: string }> {
  const replay = await generateReplayPacketForEventId(eventId, dependencies);
  if (replay.status !== "available") {
    return replay;
  }

  return {
    status: "available",
    packet: buildEnvironmentalEvidencePacket(replay.packet),
  };
}
