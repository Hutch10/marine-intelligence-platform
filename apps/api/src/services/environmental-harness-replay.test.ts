import test from "node:test";
import assert from "node:assert/strict";
import type { AsyncDbAdapter } from "../db/async-client";
import {
  readHarnessEventById,
  readHarnessEventsBySignalId,
  recordHarnessEvent,
} from "../repositories/environmental-harness-events";
import {
  buildDeterministicSignalId,
  buildEvidencePacketId,
  buildReplayPacketId,
} from "./environmental-harness/lineage";
import {
  buildEnvironmentalEvidencePacket,
  generateReplayPacketForEventId,
  generateReplayPacketForSignalId,
} from "./environmental-harness/replay";
import { stableContentHash } from "./environmental-harness/provenance";

function createReplayMemoryAdapter(): AsyncDbAdapter {
  const events = new Map<string, Record<string, unknown>>();

  return {
    async execute(sql: string, params: unknown[] = []) {
      const normalized = sql.trim().toUpperCase();

      if (normalized.startsWith("CREATE") || normalized.startsWith("ALTER")) {
        return [];
      }

      if (normalized.startsWith("INSERT")) {
        const id = String(params[0]);
        events.set(id, {
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

      if (normalized.includes("WHERE ID = ?")) {
        const id = String(params[0]);
        const row = events.get(id);
        return row ? [row] : [];
      }

      if (normalized.includes("WHERE SIGNAL_ID = ?")) {
        const signalId = String(params[0]);
        return [...events.values()]
          .filter((row) => row.signal_id === signalId)
          .sort((a, b) => Number(a.created_at) - Number(b.created_at));
      }

      if (normalized.includes("WHERE ROOT_EVENT_ID = ?")) {
        const rootEventId = String(params[0]);
        return [...events.values()]
          .filter((row) => row.root_event_id === rootEventId)
          .sort((a, b) => Number(a.created_at) - Number(b.created_at));
      }

      return [];
    },
    close() {},
    resourceId: "memory-replay",
  };
}

async function seedLineageChain(adapter: AsyncDbAdapter): Promise<{
  signalId: string;
  alertId: string;
  rootEventId: string;
  publicationEventId: string;
  reviewEventId: string;
}> {
  const signalId = buildDeterministicSignalId({
    source: "noaa_ndbc",
    stationId: "46042",
    observedAt: "2026-06-01T12:00:00.000Z",
    provenanceId: "PRV-TEST-1",
  });
  const alertId = "alert-noaa_ndbc-source_stale-_-1700000000000";

  const ingestionEventId = await recordHarnessEvent(
    {
      eventKind: "ingestion",
      eventType: "ingestion",
      subjectType: "source",
      subjectId: "noaa_ndbc",
      signalId,
      outcome: "pass",
      createdAtMs: 1_700_000_000_000,
      payload: {
        source: "noaa_ndbc",
        runId: "ING-TEST-1",
        startedAt: "2026-06-01T12:00:00.000Z",
        completedAt: "2026-06-01T12:00:05.000Z",
        insertedCount: 1,
        rejectedCount: 0,
        signalId,
        provenanceId: "PRV-TEST-1",
        rawInputs: {
          stationId: "46042",
          observedAt: "2026-06-01T12:00:00.000Z",
          sourceFeed: "https://www.ndbc.noaa.gov/data/realtime2/46042.txt",
          sourceTimestamp: "2026-06-01T12:00:00.000Z",
        },
      },
    },
    { getAdapter: () => adapter, now: () => 1_700_000_000_000 },
  );

  const verificationEventId = await recordHarnessEvent(
    {
      eventKind: "verification",
      eventType: "verification",
      subjectType: "signal",
      subjectId: signalId,
      parentEventId: ingestionEventId,
      rootEventId: ingestionEventId,
      signalId,
      outcome: "pass",
      createdAtMs: 1_700_000_001_000,
      payload: {
        eventId: "verify-1",
        subject: signalId,
        check: "ingestion_verification",
        outcome: "pass",
        evaluatedAt: "2026-06-01T12:00:05.000Z",
      },
    },
    { getAdapter: () => adapter, now: () => 1_700_000_001_000 },
  );

  await recordHarnessEvent(
    {
      eventKind: "freshness",
      eventType: "verification",
      subjectType: "signal",
      subjectId: signalId,
      parentEventId: verificationEventId,
      rootEventId: ingestionEventId,
      signalId,
      outcome: "pass",
      createdAtMs: 1_700_000_002_000,
      payload: {
        signalId,
        evaluation: {
          classification: "live",
          ageMs: 1000,
          thresholdMs: 21600000,
          policyBand: "pass",
          evaluatedAt: "2026-06-01T12:00:05.000Z",
          source: "noaa_ndbc",
        },
      },
    },
    { getAdapter: () => adapter, now: () => 1_700_000_002_000 },
  );

  const alertValidationEventId = await recordHarnessEvent(
    {
      eventKind: "alert_validation",
      eventType: "alert",
      subjectType: "operational_alert",
      subjectId: "noaa_ndbc|source_stale|",
      parentEventId: verificationEventId,
      rootEventId: ingestionEventId,
      signalId,
      alertId,
      outcome: "published",
      createdAtMs: 1_700_000_003_000,
      payload: {
        eventId: "alert-val-1",
        alertKey: "noaa_ndbc|source_stale|",
        source: "noaa_ndbc",
        ruleType: "source_stale",
        lifecycleStatus: "published",
        verificationStatus: "verified",
        outcome: "published",
        evaluatedAt: "2026-06-01T12:00:06.000Z",
      },
    },
    { getAdapter: () => adapter, now: () => 1_700_000_003_000 },
  );

  const publicationEventId = await recordHarnessEvent(
    {
      eventKind: "publication",
      eventType: "publication",
      subjectType: "operational_alert",
      subjectId: alertId,
      parentEventId: alertValidationEventId,
      rootEventId: ingestionEventId,
      signalId,
      alertId,
      outcome: "published",
      createdAtMs: 1_700_000_004_000,
      payload: {
        eventId: "pub-1",
        alertId,
        alertKey: "noaa_ndbc|source_stale|",
        signalId,
        lifecycleStatus: "published",
        outcome: "published",
        evaluatedAt: "2026-06-01T12:00:07.000Z",
        detail: "Source is stale: noaa_ndbc",
      },
    },
    { getAdapter: () => adapter, now: () => 1_700_000_004_000 },
  );

  const reviewEventId = await recordHarnessEvent(
    {
      eventKind: "human_review",
      eventType: "review",
      subjectType: "risk_evaluation",
      subjectId: "EVAL-123",
      parentEventId: publicationEventId,
      rootEventId: ingestionEventId,
      signalId,
      alertId,
      outcome: "pass",
      createdAtMs: 1_700_000_005_000,
      payload: {
        eventId: "review-1",
        subjectType: "risk_evaluation",
        subjectId: "EVAL-123",
        action: "attach_outcome",
        actor: "operator@test",
        outcome: "pass",
        evaluatedAt: "2026-06-01T12:00:08.000Z",
        detail: "confirmed",
      },
    },
    { getAdapter: () => adapter, now: () => 1_700_000_005_000 },
  );

  return {
    signalId,
    alertId,
    rootEventId: ingestionEventId,
    publicationEventId,
    reviewEventId,
  };
}

test("lineage chain creation preserves parent and root relationships", async () => {
  const adapter = createReplayMemoryAdapter();
  const chain = await seedLineageChain(adapter);

  const events = await readHarnessEventsBySignalId(chain.signalId, { getAdapter: () => adapter });
  assert.equal(events.source, "db");
  assert.equal(events.events.length, 6);

  const ingestion = events.events[0];
  assert.equal(ingestion?.eventType, "ingestion");
  assert.equal(ingestion?.parentEventId, null);
  assert.equal(ingestion?.rootEventId, chain.rootEventId);

  const review = events.events[5];
  assert.equal(review?.eventType, "review");
  assert.equal(review?.parentEventId, chain.publicationEventId);
  assert.equal(review?.rootEventId, chain.rootEventId);
});

test("replay packet generation is deterministic", async () => {
  const adapter = createReplayMemoryAdapter();
  const chain = await seedLineageChain(adapter);

  const first = await generateReplayPacketForSignalId(chain.signalId, { getAdapter: () => adapter });
  const second = await generateReplayPacketForSignalId(chain.signalId, { getAdapter: () => adapter });

  assert.equal(first.status, "available");
  assert.equal(second.status, "available");
  if (first.status === "available" && second.status === "available") {
    assert.equal(first.packet.packetId, second.packet.packetId);
    assert.deepEqual(first.packet.lineage.map((node) => node.eventId), second.packet.lineage.map((node) => node.eventId));
  }
});

test("replay packet reconstructs publication and review history", async () => {
  const adapter = createReplayMemoryAdapter();
  const chain = await seedLineageChain(adapter);
  const replay = await generateReplayPacketForEventId(chain.publicationEventId, { getAdapter: () => adapter });

  assert.equal(replay.status, "available");
  if (replay.status !== "available") {
    return;
  }

  assert.equal(replay.packet.publicationOutcome.status, "available");
  if (replay.packet.publicationOutcome.status === "available") {
    assert.equal(replay.packet.publicationOutcome.publication.alertId, chain.alertId);
    assert.equal(replay.packet.publicationOutcome.publication.lifecycleStatus, "published");
  }

  assert.equal(replay.packet.reviewActions.status, "available");
  if (replay.packet.reviewActions.status === "available") {
    assert.equal(replay.packet.reviewActions.actions[0]?.subjectId, "EVAL-123");
  }

  assert.equal(replay.packet.verificationResults.status, "available");
  assert.equal(replay.packet.alertDecisions.status, "available");
});

test("evidence packet wraps replay with deterministic packet id", async () => {
  const adapter = createReplayMemoryAdapter();
  const chain = await seedLineageChain(adapter);
  const replay = await generateReplayPacketForSignalId(chain.signalId, { getAdapter: () => adapter });
  assert.equal(replay.status, "available");
  if (replay.status !== "available") {
    return;
  }

  const evidence = buildEnvironmentalEvidencePacket(replay.packet, "2026-06-01T12:00:09.000Z");
  assert.equal(
    evidence.packetId,
    buildEvidencePacketId(replay.packet.packetId, chain.rootEventId),
  );
  assert.equal(evidence.rootEventId, chain.rootEventId);
  assert.equal(evidence.replay.packetId, replay.packet.packetId);
});

test("missing evidence fails closed without synthesis", async () => {
  const adapter = createReplayMemoryAdapter();
  const missing = await generateReplayPacketForSignalId("SIG-does-not-exist", { getAdapter: () => adapter });
  assert.equal(missing.status, "withheld");
  assert.equal(missing.reason, "not_found");
});

test("partial lineage marks withheld sections explicitly", async () => {
  const adapter = createReplayMemoryAdapter();
  const signalId = buildDeterministicSignalId({ source: "noaa_ndbc", stationId: "46042" });

  const ingestionEventId = await recordHarnessEvent(
    {
      eventKind: "ingestion",
      eventType: "ingestion",
      subjectType: "source",
      subjectId: "noaa_ndbc",
      signalId,
      outcome: "pass",
      payload: {
        source: "noaa_ndbc",
        startedAt: "2026-06-01T12:00:00.000Z",
      },
    },
    { getAdapter: () => adapter },
  );

  const replay = await generateReplayPacketForEventId(ingestionEventId, { getAdapter: () => adapter });
  assert.equal(replay.status, "available");
  if (replay.status !== "available") {
    return;
  }

  assert.equal(replay.packet.evidenceStatus, "partial");
  assert.ok(replay.packet.withheldSections.includes("verificationResults"));
  assert.ok(replay.packet.withheldSections.includes("publicationOutcome"));
});

test("replay packet id excludes timestamps from hash inputs", () => {
  const id1 = buildReplayPacketId({
    rootEventId: "EHE-ingestion-abc",
    signalId: "SIG-123",
    lineageEventIds: ["a", "b", "c"],
  });
  const id2 = buildReplayPacketId({
    rootEventId: "EHE-ingestion-abc",
    signalId: "SIG-123",
    lineageEventIds: ["c", "b", "a"],
  });

  assert.equal(id1, id2);
  assert.equal(id1, `RP-${stableContentHash({
    rootEventId: "EHE-ingestion-abc",
    signalId: "SIG-123",
    alertId: null,
    eventId: null,
    lineageEventIds: ["a", "b", "c"],
  }).slice(0, 16)}`);
});

test("readHarnessEventById returns lineage metadata", async () => {
  const adapter = createReplayMemoryAdapter();
  const chain = await seedLineageChain(adapter);
  const event = await readHarnessEventById(chain.reviewEventId, { getAdapter: () => adapter });

  assert.equal(event.source, "db");
  if (event.source === "db") {
    assert.equal(event.event.parentEventId, chain.publicationEventId);
    assert.equal(event.event.rootEventId, chain.rootEventId);
    assert.equal(event.event.signalId, chain.signalId);
    assert.equal(event.event.alertId, chain.alertId);
  }
});
