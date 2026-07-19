import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCrwFreshness,
  classifyNdbcFreshness,
  CRW_FAIL_MS,
  CRW_WARN_MS,
  NDBC_API_STALE_MS,
} from "./environmental-harness/freshness-policy";
import { gateAlertPublish } from "./environmental-harness/alert-gate";
import { buildSignalProvenance } from "./environmental-harness/provenance";
import { buildLiveConditionsRouteResponse } from "../routes/live-conditions";
import { buildReefAlertsRouteResponse } from "../routes/reef-alerts";
import { buildFeedHealthRouteResponse } from "../routes/feed-health";
import { createOperationalAlertsService } from "./operational-alerts";
import { DbAlertStore } from "./db-alert-store";
import type { AsyncDbAdapter } from "../db/async-client";
import { recordHarnessEvent, readLatestHarnessEventByKind } from "../repositories/environmental-harness-events";
import { CRW_SOURCE } from "../connectors/coral-reef-watch/constants";
import {
  canPromoteEnvironmentalSignal,
  filterPromotableLiveConditions,
} from "./environmental-harness/presentation-gate";

function createHarnessMemoryAdapter(): AsyncDbAdapter {
  const tables = new Map<string, Array<Record<string, unknown>>>();

  return {
    async execute(sql: string, params: unknown[] = []) {
      const normalized = sql.trim().toUpperCase();

      if (normalized.startsWith("CREATE")) {
        return [];
      }

      if (normalized.startsWith("INSERT")) {
        const table = "environmental_harness_events";
        const rows = tables.get(table) ?? [];
        rows.push({
          id: params[0],
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
        tables.set(table, rows);
        return [];
      }

      if (normalized.includes("FROM ENVIRONMENTAL_HARNESS_EVENTS")) {
        const rows = tables.get("environmental_harness_events") ?? [];
        const eventKind = params[0];
        const filtered = rows
          .filter((row) => row.event_kind === eventKind)
          .sort((a, b) => Number(b.created_at) - Number(a.created_at));

        return filtered.slice(0, 1).map((row) => ({
          id: row.id,
          subject_id: row.subject_id,
          outcome: row.outcome,
          created_at: row.created_at,
        })) as never[];
      }

      return [];
    },
    close() {},
    resourceId: "memory-harness",
  };
}

test("presentation gate blocks stale and synthetic signals", () => {
  const now = Date.now();
  const staleFreshness = classifyNdbcFreshness(now - NDBC_API_STALE_MS - 1000, now);

  assert.equal(
    canPromoteEnvironmentalSignal({
      source: "noaa_ndbc",
      verificationStatus: "failed",
      freshnessStatus: staleFreshness,
      freshnessClassification: staleFreshness.classification,
      provenance: { source: "noaa_ndbc", contentHash: "abc" },
    }),
    false,
  );

  assert.equal(
    canPromoteEnvironmentalSignal({
      source: "synthetic_baseline",
      verificationStatus: "withheld",
      provenance: { source: "synthetic_baseline" },
    }),
    false,
  );

  const fresh = classifyNdbcFreshness(now - 60_000, now);
  const promotable = filterPromotableLiveConditions([
    {
      stationId: "46042",
      timestamp: new Date(now - 60_000).toISOString(),
      sstC: 20,
      waveHeightM: 1,
      windSpeedMps: 5,
      pressureHpa: 1010,
      source: "noaa_ndbc",
      provenanceId: "PRV-1",
      freshnessClassification: fresh.classification,
      freshnessStatus: fresh,
      verificationStatus: "verified",
      provenance: { source: "noaa_ndbc", contentHash: "def" },
    },
    {
      stationId: "46025",
      timestamp: new Date(now - NDBC_API_STALE_MS - 1000).toISOString(),
      sstC: 20,
      waveHeightM: 1,
      windSpeedMps: 5,
      pressureHpa: 1010,
      source: "noaa_ndbc",
      provenanceId: "PRV-2",
      freshnessClassification: staleFreshness.classification,
      freshnessStatus: staleFreshness,
      verificationStatus: "failed",
      provenance: { source: "noaa_ndbc", contentHash: "ghi" },
    },
  ]);

  assert.equal(promotable.length, 1);
  assert.equal(promotable[0]?.stationId, "46042");
});

test("stale NDBC cannot render as fresh", () => {
  const now = Date.now();
  const observedAt = now - NDBC_API_STALE_MS - 60_000;
  const freshness = classifyNdbcFreshness(observedAt, now);

  assert.notEqual(freshness.classification, "live");
  assert.equal(freshness.policyBand, "fail");
});

test("CRW 48-72h emits WARN", () => {
  const now = Date.now();
  const productDate = now - CRW_WARN_MS - 60_000;

  const freshness = classifyCrwFreshness(productDate, now);
  assert.equal(freshness.policyBand, "warn");
  assert.equal(freshness.classification, "stale");
});

test("CRW >72h hard fails", () => {
  const now = Date.now();
  const productDate = now - CRW_FAIL_MS - 60_000;

  const freshness = classifyCrwFreshness(productDate, now);
  assert.equal(freshness.policyBand, "fail");
  assert.equal(freshness.classification, "withheld");
});

test("mock data cannot be promoted as live in production routes", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercel = process.env.VERCEL;

  process.env.NODE_ENV = "production";
  delete process.env.VERCEL;

  try {
    const live = await buildLiveConditionsRouteResponse({ source: "mock", fallbackReason: "db_path_missing" });
    assert.equal(live.status, 503);
    assert.equal(live.telemetry.source, "withheld");
    assert.equal(live.json.conditions.length, 0);

    const reef = await buildReefAlertsRouteResponse({ source: "mock", fallbackReason: "db_path_missing" });
    assert.equal(reef.status, 503);
    assert.equal(reef.telemetry.source, "withheld");
    assert.equal(reef.json.alerts.length, 0);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousVercel) {
      process.env.VERCEL = previousVercel;
    }
  }
});

test("reef alerts include provenance harness fields", async () => {
  const now = Date.now();
  const productDate = new Date(now - 12 * 60 * 60 * 1000).toISOString();

  const response = await buildReefAlertsRouteResponse({
    source: "db",
    alerts: [
      {
        region: "florida-keys",
        stationId: "CREEF",
        timestamp: productDate,
        sstAnomalyC: 1.1,
        hotSpotC: 0.8,
        dhw: 2,
        stressLevel: "Watch",
        source: CRW_SOURCE,
        outputClass: "derived",
        ingestedAt: new Date(now).toISOString(),
        sourceFeed: "https://coralreefwatch.noaa.gov/example",
        productDate,
        freshnessStatus: classifyCrwFreshness(Date.parse(productDate), now),
        verificationStatus: "verified",
        provenance: buildSignalProvenance({
          source: CRW_SOURCE,
          productDate,
          contentHash: "abc123",
        }),
        provenanceId: "PRV-CRW-1",
        rootEventId: "EHE-ingestion-test-root",
        sourceIngestionEventId: "EHE-ingestion-test-source",
        verificationEventId: "EHE-ingestion-test-verify",
      },
    ],
  });

  const alert = response.json.alerts[0];
  assert.ok(alert?.ingestedAt);
  assert.ok(alert?.sourceFeed);
  assert.ok(alert?.productDate);
  assert.ok(alert?.freshnessStatus);
  assert.ok(alert?.verificationStatus);
  assert.ok(alert?.provenance);
});

test("scheduler events persist after ingestion audit", async () => {
  const adapter = createHarnessMemoryAdapter();
  const getAdapter = () => adapter;
  const workerRunId = "LWR-test-scheduler";

  await recordHarnessEvent(
    {
      eventKind: "scheduler_execution",
      subjectType: "worker_run",
      subjectId: workerRunId,
      outcome: "pass",
      payload: {
        workerRunId,
        trigger: "github_actions",
        status: "success",
        sourceCount: 1,
      },
    },
    { getAdapter },
  );

  const latest = await readLatestHarnessEventByKind("scheduler_execution", { getAdapter });
  assert.ok(latest);
  assert.equal(latest.subjectId, workerRunId);
});

test("ingestion failures appear in feed-health", () => {
  const response = buildFeedHealthRouteResponse({
    source: "db",
    snapshot: {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 6 * 60 * 60 * 1000,
      summary: {
        latestSourceCount: 1,
        healthySourceCount: 0,
        degradedSourceCount: 0,
        failedSourceCount: 1,
        staleSourceCount: 0,
        insertedCount: 0,
        rejectedCount: 3,
        recentHistoryCount: 1,
        lastCompletedAt: new Date().toISOString(),
      },
      latestBySource: [
        {
          source: CRW_SOURCE,
          workerRunId: "WR-1",
          workerStatus: "failed",
          status: "failed",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1000,
          insertedCount: 0,
          rejectedCount: 3,
          rejectionReasons: { fetch_failed: 3 },
          runId: null,
          error: "timeout",
          stationDiagnostics: [],
          isStale: false,
          staleByMs: null,
        },
      ],
      recentHistory: [],
    },
  });

  assert.equal(response.json.summary.failed_source_count, 1);
  assert.equal(response.json.latest_status_by_source[0]?.status, "failed");
});

test("alert cannot publish without verification", async () => {
  const gate = await gateAlertPublish({
    alertKey: "noaa_ndbc|source_stale|",
    source: "noaa_ndbc",
    ruleType: "source_stale",
    context: {
      feedHealthGeneratedAt: new Date().toISOString(),
      sourceStatus: {
        source: "noaa_ndbc",
        workerRunId: "WR-1",
        workerStatus: "success",
        status: "success",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1000,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        runId: null,
        error: null,
        stationDiagnostics: [],
        isStale: true,
        staleByMs: 60_000,
      },
    },
  });

  assert.equal(gate.allowed, false);
});

test("human review action creates audit trail", async () => {
  const adapter = createHarnessMemoryAdapter();
  const getAdapter = () => adapter;

  const eventId = await recordHarnessEvent(
    {
      eventKind: "human_review",
      subjectType: "risk_evaluation",
      subjectId: "EVAL-123",
      outcome: "pass",
      payload: {
        subjectId: "EVAL-123",
        action: "attach_outcome",
        actor: "operator@test",
        detail: "confirmed",
      },
    },
    { getAdapter },
  );

  assert.ok(eventId.startsWith("EHE-human_review-"));

  const rows = await readLatestHarnessEventByKind("human_review", { getAdapter });
  assert.ok(rows);
  assert.equal(rows.subjectId, "EVAL-123");
});

test("verified alert context allows publish", async () => {
  const operationalAlerts: Array<Record<string, unknown>> = [];
  const adapter: AsyncDbAdapter = {
    async execute(sql: string, params: unknown[] = []) {
      const normalized = sql.trim().toUpperCase();
      if (normalized.includes("INSERT INTO INVESTIGATIONS")) {
        return [];
      }
      if (normalized.includes("INSERT INTO OPERATIONAL_ALERTS")) {
        operationalAlerts.push({
          id: params[0],
          source: params[1],
          rule_type: params[3],
          status: params[6],
        });
        return [];
      }
      if (normalized.includes("SELECT") && normalized.includes("OPERATIONAL_ALERTS")) {
        return operationalAlerts as never[];
      }
      return [];
    },
    close() {},
    resourceId: "memory-alerts",
  };

  const alertStore = new DbAlertStore(adapter);
  const service = createOperationalAlertsService({
    adapter,
    now: () => 1_700_000_000_000,
    alertStore,
    alertVerificationContextBySource: {
      noaa_ndbc: {
        feedHealthGeneratedAt: new Date().toISOString(),
        sourceStatus: {
          source: "noaa_ndbc",
          workerRunId: "WR-1",
          workerStatus: "success",
          status: "success",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1000,
          insertedCount: 1,
          rejectedCount: 0,
          rejectionReasons: {},
          runId: "ING-1",
          error: null,
          stationDiagnostics: [],
          isStale: false,
          staleByMs: null,
        },
      },
    },
  });

  const ids = await service.applyAlertActions([
    {
      type: "create",
      source: "noaa_ndbc",
      ruleType: "source_stale",
      severity: "warning",
      title: "Verified publish",
    },
  ]);

  assert.equal(ids.length, 1);
});

test("harness event record uses deterministic id", async () => {
  const adapter = createHarnessMemoryAdapter();
  const getAdapter = () => adapter;
  const payload = { check: "db_reachable", subject: "/health", outcome: "pass" };
  const id1 = await recordHarnessEvent(
    {
      eventKind: "verification",
      subjectType: "endpoint",
      subjectId: "/health",
      outcome: "pass",
      payload,
    },
    { getAdapter },
  );
  const id2 = await recordHarnessEvent(
    {
      eventKind: "verification",
      subjectType: "endpoint",
      subjectId: "/health",
      outcome: "pass",
      payload,
    },
    { getAdapter },
  );

  assert.equal(id1, id2);
});
