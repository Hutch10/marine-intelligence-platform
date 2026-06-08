import type {
  LiveMarineCondition,
  ReefStressWatchItem,
  ReplayValidationCheckResult,
  ReplayValidationJobResult,
  ReplayValidationSampleTarget,
} from "@marine/shared";
import type { AsyncDbAdapter } from "../../db/async-client";
import { readRecentReplaySampleTargets } from "../../repositories/environmental-harness-events";
import {
  generateReplayPacketForAlertId,
  generateReplayPacketForSignalId,
} from "./replay";

export interface PublicEnvironmentalSignalSample {
  kind: "live_condition" | "reef_alert";
  signalId: string | null | undefined;
  rootEventId: string | null | undefined;
  trustStatus?: string | null;
  trustedForPromotion?: boolean | null;
}

export interface ReplayValidationDependencies {
  getAdapter?: () => AsyncDbAdapter;
  sampleLimit?: number;
  additionalTargets?: ReplayValidationSampleTarget[];
  publicSignals?: PublicEnvironmentalSignalSample[];
  liveConditions?: LiveMarineCondition[];
  reefAlerts?: ReefStressWatchItem[];
}

function parsePublicationExpectation(
  lineage: Array<{ eventType: string }>,
): boolean {
  return lineage.some((node) => node.eventType === "publication");
}

export async function validateReplaySample(
  target: ReplayValidationSampleTarget,
  dependencies: ReplayValidationDependencies = {},
): Promise<ReplayValidationCheckResult> {
  const failures: string[] = [];
  const replayDeps = dependencies.getAdapter ? { getAdapter: dependencies.getAdapter } : {};

  const replay = target.kind === "signal"
    ? await generateReplayPacketForSignalId(target.id, replayDeps)
    : await generateReplayPacketForAlertId(target.id, replayDeps);

  if (replay.status !== "available") {
    return {
      target,
      passed: false,
      failures: [`replay_packet_unavailable:${replay.reason}`],
      evidenceStatus: "unavailable",
      withheldSections: [],
      packetId: null,
      rootEventId: null,
      publicationReconstructable: null,
    };
  }

  const packet = replay.packet;
  const rootEventId = packet.lineage[0]?.rootEventId ?? null;

  if (packet.lineage.length === 0) {
    failures.push("lineage_missing");
  }

  if (!rootEventId) {
    failures.push("root_event_id_missing");
  }

  if (packet.evidenceStatus === "withheld") {
    failures.push("evidence_withheld");
  }

  if (packet.evidenceStatus === "complete" && packet.sourceInputs.status !== "available") {
    failures.push("synthesized_evidence_detected");
  }

  const replayRepeat = target.kind === "signal"
    ? await generateReplayPacketForSignalId(target.id, replayDeps)
    : await generateReplayPacketForAlertId(target.id, replayDeps);

  if (replayRepeat.status === "available" && replayRepeat.packet.packetId !== packet.packetId) {
    failures.push("packet_id_not_deterministic");
  }

  const expectsPublication = parsePublicationExpectation(packet.lineage);
  let publicationReconstructable: boolean | null = null;

  if (expectsPublication) {
    publicationReconstructable = packet.publicationOutcome.status === "available";
    if (!publicationReconstructable) {
      failures.push("publication_not_reconstructable");
    }
  }

  return {
    target,
    passed: failures.length === 0,
    failures,
    evidenceStatus: packet.evidenceStatus,
    withheldSections: packet.withheldSections,
    packetId: packet.packetId,
    rootEventId,
    publicationReconstructable,
  };
}

export function buildPublicSignalSamples(input: {
  liveConditions?: LiveMarineCondition[];
  reefAlerts?: ReefStressWatchItem[];
}): PublicEnvironmentalSignalSample[] {
  const samples: PublicEnvironmentalSignalSample[] = [];

  for (const condition of input.liveConditions ?? []) {
    samples.push({
      kind: "live_condition",
      signalId: condition.signalId,
      rootEventId: condition.rootEventId,
      trustStatus: condition.trustStatus,
      trustedForPromotion: condition.trustedForPromotion,
    });
  }

  for (const alert of input.reefAlerts ?? []) {
    samples.push({
      kind: "reef_alert",
      signalId: alert.signalId,
      rootEventId: alert.rootEventId,
      trustStatus: alert.trustStatus,
      trustedForPromotion: alert.trustedForPromotion,
    });
  }

  return samples;
}

export async function validatePublicEnvironmentalSignal(
  sample: PublicEnvironmentalSignalSample,
  dependencies: ReplayValidationDependencies = {},
): Promise<ReplayValidationCheckResult> {
  const failures: string[] = [];
  const markedTrusted = sample.trustedForPromotion === true || sample.trustStatus === "trusted";

  if (!sample.signalId) {
    failures.push("signal_id_missing");
  }

  if (!sample.rootEventId) {
    failures.push("root_event_id_missing");
  }

  if (markedTrusted && !sample.rootEventId) {
    failures.push("trusted_public_signal_missing_lineage");
  }

  let replayResult: ReplayValidationCheckResult | null = null;

  if (sample.signalId && sample.rootEventId) {
    replayResult = await validateReplaySample(
      { kind: "signal", id: sample.signalId },
      dependencies,
    );

    if (!replayResult.passed) {
      failures.push(...replayResult.failures.map((failure) => `replay:${failure}`));
    }

    if (markedTrusted && replayResult.evidenceStatus === "withheld") {
      failures.push("trusted_signal_evidence_withheld");
    }

    if (markedTrusted && replayResult.rootEventId && sample.rootEventId
      && replayResult.rootEventId !== sample.rootEventId) {
      failures.push("trust_metadata_root_event_mismatch");
    }
  } else if (markedTrusted) {
    failures.push("trusted_public_signal_not_replayable");
  }

  return {
    target: {
      kind: "signal",
      id: sample.signalId ?? `public-${sample.kind}`,
    },
    passed: failures.length === 0,
    failures,
    evidenceStatus: replayResult?.evidenceStatus ?? "unavailable",
    withheldSections: replayResult?.withheldSections ?? [],
    packetId: replayResult?.packetId ?? null,
    rootEventId: sample.rootEventId ?? replayResult?.rootEventId ?? null,
    publicationReconstructable: replayResult?.publicationReconstructable ?? null,
  };
}

export async function runReplayValidationJob(
  dependencies: ReplayValidationDependencies = {},
): Promise<ReplayValidationJobResult> {
  const sampleLimit = dependencies.sampleLimit ?? 8;
  const getAdapter = dependencies.getAdapter;
  const adapterDeps = getAdapter ? { getAdapter } : {};

  const discovered = await readRecentReplaySampleTargets(sampleLimit, adapterDeps);
  const targetMap = new Map<string, ReplayValidationSampleTarget>();

  for (const target of [...discovered, ...(dependencies.additionalTargets ?? [])]) {
    targetMap.set(`${target.kind}:${target.id}`, target);
  }

  const targets = [...targetMap.values()].slice(0, sampleLimit * 2);
  const samples: ReplayValidationCheckResult[] = [];

  for (const target of targets) {
    samples.push(await validateReplaySample(target, dependencies));
  }

  const publicSignals = dependencies.publicSignals ?? buildPublicSignalSamples({
    liveConditions: dependencies.liveConditions,
    reefAlerts: dependencies.reefAlerts,
  });

  for (const publicSignal of publicSignals.slice(0, sampleLimit)) {
    samples.push(await validatePublicEnvironmentalSignal(publicSignal, dependencies));
  }

  const passedCount = samples.filter((sample) => sample.passed).length;

  return {
    generatedAt: new Date().toISOString(),
    sampleCount: samples.length,
    passedCount,
    failedCount: samples.length - passedCount,
    overallPass: samples.length > 0 && passedCount === samples.length,
    samples,
  };
}

export function evaluatePublishedAlertLineage(
  alertId: string,
  replayResult: ReplayValidationCheckResult | null,
): { passed: boolean; reason: string | null } {
  if (!replayResult) {
    return { passed: false, reason: "replay_validation_missing" };
  }

  if (replayResult.target.id !== alertId) {
    return { passed: false, reason: "replay_target_mismatch" };
  }

  if (!replayResult.rootEventId) {
    return { passed: false, reason: "lineage_missing" };
  }

  if (replayResult.publicationReconstructable === false) {
    return { passed: false, reason: "publication_not_reconstructable" };
  }

  if (replayResult.evidenceStatus === "withheld") {
    return { passed: false, reason: "evidence_withheld" };
  }

  return { passed: true, reason: null };
}
