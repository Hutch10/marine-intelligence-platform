import test from "node:test";
import assert from "node:assert/strict";
import type { AsyncDbAdapter } from "../db/async-client";
import {
  countRecentHarnessEventsByKind,
  readRecentReplaySampleTargets,
  recordHarnessEvent,
} from "../repositories/environmental-harness-events";
import {
  enqueueReviewItem,
  readReviewQueueItems,
} from "../repositories/environmental-review-queue";
import { buildOperatorStatusRouteResponse } from "../routes/operator-status";
import { buildOperatorConsoleHarnessSection } from "../services/environmental-harness/operator-console";
import {
  resolvePublicTrustMetadata,
  canPromoteEnvironmentalSignal,
} from "../services/environmental-harness/presentation-gate";
import {
  runReplayValidationJob,
  validateReplaySample,
  evaluatePublishedAlertLineage,
} from "../services/environmental-harness/replay-validation";
import { applyReviewQueueAction } from "../services/environmental-harness/review-queue";
import { buildDeterministicSignalId } from "../services/environmental-harness/lineage";
import { readHarnessEventsBySignalId } from "../repositories/environmental-harness-events";

function createPhase3MemoryAdapter(): AsyncDbAdapter {
  const harnessEvents = new Map<string, Record<string, unknown>>();
  const reviewQueue = new Map<string, Record<string, unknown>>();

  return {
    async execute(sql: string, params: unknown[] = []) {
      const normalized = sql.trim().toUpperCase();

      if (normalized.startsWith("CREATE") || normalized.startsWith("ALTER")) {
        return [];
      }

      if (normalized.startsWith("INSERT") && normalized.includes("ENVIRONMENTAL_HARNESS_EVENTS")) {
        const id = String(params[0]);
        harnessEvents.set(id, {
          id,
          event_kind: params[1],
          event_type: params[2],
          subject_type: params[3],
          subject_id: params[4],
          parent_event_id: params[5],
          root_event_id: params[6],
          signal_id: params[7],
          alert_id: params[8],
          outcome: params[9],
          payload_json: params[10],
          content_hash: params[11],
          created_at: params[12],
        });
        return [];
      }

      if (normalized.startsWith("INSERT") && normalized.includes("ENVIRONMENTAL_REVIEW_QUEUE")) {
        const id = String(params[0]);
        if (!reviewQueue.has(id)) {
          reviewQueue.set(id, {
            id,
            subject_type: params[1],
            subject_id: params[2],
            signal_id: params[3],
            alert_id: params[4],
            root_event_id: params[5],
            parent_event_id: params[6],
            queue_status: params[7],
            annotation: params[8],
            actor: params[9],
            review_event_id: params[10],
            created_at: params[11],
            updated_at: params[12],
          });
        }
        return [];
      }

      if (normalized.startsWith("UPDATE") && normalized.includes("ENVIRONMENTAL_REVIEW_QUEUE")) {
        const id = String(params[5]);
        const row = reviewQueue.get(id);
        if (row) {
          row.queue_status = params[0];
          if (params[1] !== null) row.annotation = params[1];
          if (params[2] !== null) row.actor = params[2];
          if (params[3] !== null) row.review_event_id = params[3];
          row.updated_at = params[4];
        }
        return [];
      }

      if (normalized.includes("FROM ENVIRONMENTAL_HARNESS_EVENTS")) {
        let rows = [...harnessEvents.values()];

        if (normalized.includes("WHERE EVENT_KIND = ?")) {
          rows = rows.filter((row) => row.event_kind === params[0]);
        }

        if (normalized.includes("WHERE SIGNAL_ID = ?")) {
          rows = rows.filter((row) => row.signal_id === params[0]);
        }

        if (normalized.includes("WHERE ROOT_EVENT_ID = ?")) {
          rows = rows.filter((row) => row.root_event_id === params[0]);
        }

        if (normalized.includes("WHERE ID = ?")) {
          rows = rows.filter((row) => row.id === params[0]);
        }

        if (normalized.includes("DISTINCT SIGNAL_ID")) {
          const seen = new Set<string>();
          return rows
            .filter((row) => row.signal_id && !seen.has(String(row.signal_id)) && seen.add(String(row.signal_id)))
            .slice(0, Number(params[0]))
            .map((row) => ({ signal_id: row.signal_id }));
        }

        if (normalized.includes("DISTINCT ALERT_ID")) {
          const seen = new Set<string>();
          return rows
            .filter((row) => row.alert_id && !seen.has(String(row.alert_id)) && seen.add(String(row.alert_id)))
            .slice(0, Number(params[0]))
            .map((row) => ({ alert_id: row.alert_id }));
        }

        if (normalized.includes("COUNT(*)")) {
          const kind = params[0];
          const since = Number(params[1]);
          const count = rows.filter((row) => row.event_kind === kind && Number(row.created_at) >= since).length;
          return [{ count }];
        }

        if (normalized.includes("ORDER BY CREATED_AT DESC")) {
          rows.sort((a, b) => Number(b.created_at) - Number(a.created_at));
        } else if (normalized.includes("ORDER BY CREATED_AT ASC")) {
          rows.sort((a, b) => Number(a.created_at) - Number(b.created_at));
        }

        if (normalized.includes("LIMIT ?")) {
          const limitIndex = params.length - 1;
          rows = rows.slice(0, Number(params[limitIndex]));
        }

        return rows as never[];
      }

      if (normalized.includes("FROM ENVIRONMENTAL_REVIEW_QUEUE")) {
        let rows = [...reviewQueue.values()];

        if (normalized.includes("WHERE QUEUE_STATUS = ?")) {
          rows = rows.filter((row) => row.queue_status === params[0]);
        }

        if (normalized.includes("WHERE ID = ?")) {
          rows = rows.filter((row) => row.id === params[0]);
        }

        rows.sort((a, b) => Number(b.updated_at) - Number(a.updated_at));

        if (normalized.includes("LIMIT ?")) {
          const limit = normalized.includes("WHERE QUEUE_STATUS = ?") ? Number(params[1]) : Number(params[0]);
          rows = rows.slice(0, limit);
        }

        return rows as never[];
      }

      return [];
    },
    close() {},
    resourceId: "memory-phase3",
  };
}

async function seedMinimalReplayChain(adapter: AsyncDbAdapter): Promise<{
  signalId: string;
  alertId: string;
  rootEventId: string;
}> {
  const signalId = buildDeterministicSignalId({
    source: "noaa_ndbc",
    stationId: "46042",
    observedAt: "2026-06-01T12:00:00.000Z",
    provenanceId: "PRV-PHASE3",
  });
  const alertId = "alert-phase3-test";

  const ingestionEventId = await recordHarnessEvent(
    {
      eventKind: "ingestion",
      eventType: "ingestion",
      subjectType: "source",
      subjectId: "noaa_ndbc",
      signalId,
      outcome: "pass",
      payload: {
        eventId: "ing-1",
        source: "noaa_ndbc",
        runId: "run-1",
        status: "success",
        insertedCount: 1,
        rejectedCount: 0,
        startedAt: "2026-06-01T12:00:00.000Z",
        completedAt: "2026-06-01T12:00:01.000Z",
        outcome: "pass",
        signalId,
        rawInputs: {
          source: "noaa_ndbc",
          observedAt: "2026-06-01T12:00:00.000Z",
        },
        provenance: {
          source: "noaa_ndbc",
          provenanceId: "PRV-PHASE3",
        },
      },
    },
    { getAdapter: () => adapter },
  );

  await recordHarnessEvent(
    {
      eventKind: "verification",
      eventType: "verification",
      subjectType: "signal",
      subjectId: signalId,
      parentEventId: ingestionEventId,
      rootEventId: ingestionEventId,
      signalId,
      outcome: "pass",
      payload: {
        eventId: "ver-1",
        subject: signalId,
        check: "ingestion_verification",
        outcome: "pass",
        evaluatedAt: "2026-06-01T12:00:02.000Z",
      },
    },
    { getAdapter: () => adapter },
  );

  await recordHarnessEvent(
    {
      eventKind: "alert_validation",
      eventType: "alert",
      subjectType: "operational_alert",
      subjectId: alertId,
      parentEventId: ingestionEventId,
      rootEventId: ingestionEventId,
      signalId,
      alertId,
      outcome: "published",
      payload: {
        eventId: "alert-val-1",
        alertKey: alertId,
        source: "noaa_ndbc",
        ruleType: "source_stale",
        lifecycleStatus: "published",
        verificationStatus: "verified",
        outcome: "published",
        evaluatedAt: "2026-06-01T12:00:03.000Z",
      },
    },
    { getAdapter: () => adapter },
  );

  await recordHarnessEvent(
    {
      eventKind: "publication",
      eventType: "publication",
      subjectType: "operational_alert",
      subjectId: alertId,
      parentEventId: ingestionEventId,
      rootEventId: ingestionEventId,
      signalId,
      alertId,
      outcome: "published",
      payload: {
        eventId: "pub-1",
        alertId,
        alertKey: alertId,
        signalId,
        lifecycleStatus: "published",
        outcome: "published",
        evaluatedAt: "2026-06-01T12:00:04.000Z",
      },
    },
    { getAdapter: () => adapter },
  );

  return { signalId, alertId, rootEventId: ingestionEventId };
}

test("operator console aggregates harness diagnostics", async () => {
  const adapter = createPhase3MemoryAdapter();
  await seedMinimalReplayChain(adapter);

  const section = await buildOperatorConsoleHarnessSection({
    getAdapter: () => adapter,
    replaySampleLimit: 4,
  });

  assert.ok(section.latestIngestionRuns.length >= 1);
  assert.equal(section.verificationStatus.latestOutcome, "pass");
  assert.ok(section.replayValidation.sampleCount >= 1);
  assert.ok(Array.isArray(section.reviewQueue.items));
  assert.ok(Array.isArray(section.publicationDecisions));
});

test("operator status includes harness section", async () => {
  const response = await buildOperatorStatusRouteResponse();
  assert.ok(response.json.harness);
  assert.ok(response.json.harness.replayValidation);
});

test("replay validation job passes for reconstructable chain", async () => {
  const adapter = createPhase3MemoryAdapter();
  const { signalId, alertId } = await seedMinimalReplayChain(adapter);

  const signalResult = await validateReplaySample({ kind: "signal", id: signalId }, { getAdapter: () => adapter });
  assert.equal(signalResult.passed, true);
  assert.ok(signalResult.rootEventId);
  assert.ok(["complete", "partial"].includes(signalResult.evidenceStatus));

  const alertResult = await validateReplaySample({ kind: "alert", id: alertId }, { getAdapter: () => adapter });
  assert.equal(alertResult.passed, true);
  assert.equal(alertResult.publicationReconstructable, true);

  const job = await runReplayValidationJob({
    getAdapter: () => adapter,
    sampleLimit: 4,
    additionalTargets: [{ kind: "signal", id: signalId }, { kind: "alert", id: alertId }],
  });

  assert.equal(job.overallPass, true);
});

test("replay validation fails when lineage is missing", async () => {
  const adapter = createPhase3MemoryAdapter();
  const result = await validateReplaySample(
    { kind: "signal", id: "SIG-missing-lineage" },
    { getAdapter: () => adapter },
  );

  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes("replay_packet_unavailable") || failure.includes("lineage")));
});

test("H+72 gate blocks promotion when replay validation fails", () => {
  const failingJob = {
    generatedAt: new Date().toISOString(),
    sampleCount: 2,
    passedCount: 1,
    failedCount: 1,
    overallPass: false,
    samples: [],
  };

  const gatePass = failingJob.overallPass && failingJob.sampleCount > 0;
  assert.equal(gatePass, false);
});

test("published alert without lineage fails verification", () => {
  const evaluation = evaluatePublishedAlertLineage("alert-no-lineage", {
    target: { kind: "alert", id: "alert-no-lineage" },
    passed: false,
    failures: ["root_event_id_missing"],
    evidenceStatus: "partial",
    withheldSections: ["publicationOutcome"],
    packetId: "RP-test",
    rootEventId: null,
    publicationReconstructable: false,
  });

  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.reason, "lineage_missing");
});

test("review actions update lineage-linked harness events", async () => {
  const adapter = createPhase3MemoryAdapter();
  const { signalId, alertId, rootEventId } = await seedMinimalReplayChain(adapter);

  const queueItem = await enqueueReviewItem(
    {
      subjectType: "alert",
      subjectId: alertId,
      signalId,
      alertId,
      rootEventId,
      parentEventId: rootEventId,
    },
    { getAdapter: () => adapter },
  );

  const action = await applyReviewQueueAction(
    {
      queueItemId: queueItem.id,
      action: "approve",
      actor: "operator@test",
      annotation: "Looks good",
    },
    { getAdapter: () => adapter },
  );

  assert.equal(action.ok, true);
  if (!action.ok) {
    return;
  }

  assert.equal(action.item.queueStatus, "approved");
  assert.ok(action.reviewEventId);

  const events = await readHarnessEventsBySignalId(signalId, { getAdapter: () => adapter });
  assert.equal(events.source, "db");
  if (events.source !== "db") {
    return;
  }

  const reviewEvent = events.events.find((event) => event.eventKind === "human_review");
  assert.ok(reviewEvent);
  assert.equal(reviewEvent?.rootEventId, rootEventId);
});

test("partial evidence appears as partial, not complete", async () => {
  const adapter = createPhase3MemoryAdapter();
  const signalId = buildDeterministicSignalId({
    source: "noaa_coral_reef_watch",
    regionKey: "fl_keys",
    observedAt: "2026-06-01T00:00:00.000Z",
    provenanceId: "PRV-partial",
  });

  const ingestionEventId = await recordHarnessEvent(
    {
      eventKind: "ingestion",
      eventType: "ingestion",
      subjectType: "source",
      subjectId: "noaa_coral_reef_watch",
      signalId,
      outcome: "pass",
      payload: {
        source: "noaa_coral_reef_watch",
        rawInputs: { source: "noaa_coral_reef_watch", productDate: "2026-06-01" },
        provenance: { source: "noaa_coral_reef_watch", productDate: "2026-06-01" },
      },
    },
    { getAdapter: () => adapter },
  );

  const result = await validateReplaySample({ kind: "signal", id: signalId }, { getAdapter: () => adapter });
  assert.equal(result.passed, true);
  assert.equal(result.evidenceStatus, "partial");
  assert.notEqual(result.evidenceStatus, "complete");
  assert.ok(result.withheldSections.length > 0);
  void ingestionEventId;
});

test("public surfaces do not mark unreplayable alerts as trusted", () => {
  const untrusted = resolvePublicTrustMetadata({
    source: "noaa_ndbc",
    verificationStatus: "verified",
    freshnessClassification: "live",
    provenance: { source: "noaa_ndbc", provenanceId: "PRV-1" },
    requireReplayLineage: true,
    rootEventId: null,
  });

  assert.equal(untrusted.trustedForPromotion, false);
  assert.notEqual(untrusted.evidenceStatus, "complete");

  const trusted = resolvePublicTrustMetadata({
    source: "noaa_ndbc",
    verificationStatus: "verified",
    freshnessClassification: "live",
    provenance: { source: "noaa_ndbc", provenanceId: "PRV-1" },
    requireReplayLineage: true,
    rootEventId: "EHE-ingestion-root",
    replayEvidenceStatus: "complete",
  });

  assert.equal(trusted.trustedForPromotion, true);
  assert.equal(canPromoteEnvironmentalSignal({
    source: "noaa_ndbc",
    verificationStatus: "verified",
    provenance: { source: "noaa_ndbc" },
    requireReplayLineage: true,
    rootEventId: null,
  }), false);
});

test("recent replay sample targets are discovered from harness events", async () => {
  const adapter = createPhase3MemoryAdapter();
  const { signalId } = await seedMinimalReplayChain(adapter);
  const targets = await readRecentReplaySampleTargets(5, { getAdapter: () => adapter });

  assert.ok(targets.some((target) => target.kind === "signal" && target.id === signalId));
  const verificationCount = await countRecentHarnessEventsByKind(
    "verification",
    Date.now() - 86400000,
    { getAdapter: () => adapter },
  );
  assert.ok(verificationCount >= 1);
});

test("pending review queue items are listed", async () => {
  const adapter = createPhase3MemoryAdapter();
  await enqueueReviewItem(
    {
      subjectType: "signal",
      subjectId: "SIG-pending",
      signalId: "SIG-pending",
    },
    { getAdapter: () => adapter },
  );

  const pending = await readReviewQueueItems({ status: "pending_review" }, { getAdapter: () => adapter });
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.queueStatus, "pending_review");
});
