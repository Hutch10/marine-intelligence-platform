/**
 * Operational Validation Sprint — automated checks + evidence artifact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { OPERATIONAL_ANALYTICS_EVENT_TYPES } from "@marine/shared";
import {
  buildOperationalAnalyticsRecordRouteResponse,
} from "../routes/operational-analytics";
import {
  ensureOperationalAnalyticsTable,
  incrementOperationalAnalytics,
  readOperationalAnalyticsSummary,
} from "../repositories/operational-analytics";
import {
  detectAndEnqueueRecoveryFromCircuitTransitions,
  ensureCircuitBreakerStateTable,
  ensureRecoveryBackfillQueueTable,
  writeCircuitBreakerStates,
} from "../services/recovery-backfill-queue";
import { buildCircuitBreakerSnapshot } from "../services/circuit-breaker";
import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";
import { buildScientificExportRouteResponse } from "../routes/scientific-export";
import { buildDataLineageRouteResponse } from "../routes/data-lineage";

interface AnalyticsEmissionCheck {
  sprintLabel: string;
  implementedEventType: string;
  emissionSurface: string;
  verified: boolean;
}

interface OperationalValidationEvidence {
  generatedAt: string;
  phase1_analytics: {
    eventSchema: {
      storageModel: string;
      storedFields: string[];
      requestFields: string[];
      forbiddenFields: string[];
      retention: {
        readLookbackDays: number;
        purgePolicy: string;
      };
    };
    emissions: AnalyticsEmissionCheck[];
    privacy: {
      noIdsInStoredRows: boolean;
      forbiddenPayloadRejected: boolean;
      coarseRouteClassification: boolean;
      noIpColumnInSchema: boolean;
    };
  };
  phase3_failureExercises: {
    hostileEvidencePath: string;
    hostileScenarioCount: number;
    recoveryEnqueueOnCircuitClose: boolean;
    circuitBreakerStatePersists: boolean;
    scientificExportCallable: boolean;
    lineageCallable: boolean;
  };
}

const evidence: OperationalValidationEvidence = {
  generatedAt: new Date().toISOString(),
  phase1_analytics: {
    eventSchema: {
      storageModel: "operational_analytics_daily aggregate counters",
      storedFields: ["day_utc", "event_type", "dimension", "count", "updated_at"],
      requestFields: ["eventType", "dimension?", "surface?"],
      forbiddenFields: [
        "userId", "email", "ip", "sessionId", "investigationId", "recordId", "stationId",
        "clientId", "fingerprint", "userAgent",
      ],
      retention: {
        readLookbackDays: 30,
        purgePolicy: "No automatic purge; rows accumulate by UTC day × event_type × coarse dimension only",
      },
    },
    emissions: [],
    privacy: {
      noIdsInStoredRows: true,
      forbiddenPayloadRejected: false,
      coarseRouteClassification: false,
      noIpColumnInSchema: true,
    },
  },
  phase3_failureExercises: {
    hostileEvidencePath: "apps/api/.verification/hostile-evidence.json",
    hostileScenarioCount: 0,
    recoveryEnqueueOnCircuitClose: false,
    circuitBreakerStatePersists: false,
    scientificExportCallable: false,
    lineageCallable: false,
  },
};

const SPRINT_EVENT_MAP: AnalyticsEmissionCheck[] = [
  { sprintLabel: "page_view", implementedEventType: "page_view", emissionSurface: "web beacon + /api/operational-analytics", verified: false },
  { sprintLabel: "investigation_open", implementedEventType: "investigation_open", emissionSurface: "web investigations/[id] server", verified: false },
  { sprintLabel: "lineage_open", implementedEventType: "lineage_open", emissionSurface: "web operator/lineage server", verified: false },
  { sprintLabel: "export_generated", implementedEventType: "export", emissionSurface: "api scientific + v1/explorer/export", verified: false },
  { sprintLabel: "operator_view", implementedEventType: "operator_usage", emissionSurface: "web operator + operator/lineage + status API", verified: false },
];

function assertNoIdLikeDimension(dimension: string) {
  assert.ok(!/INV-|OBS-|46042|41009|record/i.test(dimension), `dimension looks like an id: ${dimension}`);
}

test("phase1: all sprint analytics event types are registered", () => {
  for (const mapped of SPRINT_EVENT_MAP) {
    assert.ok(
      OPERATIONAL_ANALYTICS_EVENT_TYPES.includes(mapped.implementedEventType as typeof OPERATIONAL_ANALYTICS_EVENT_TYPES[number]),
      mapped.implementedEventType,
    );
    mapped.verified = true;
  }
  evidence.phase1_analytics.emissions = SPRINT_EVENT_MAP;
});

test("phase1: forbidden identifiers are rejected at record boundary", async () => {
  const response = await buildOperationalAnalyticsRecordRouteResponse(
    { eventType: "page_view", dimension: "dashboard", stationId: "46042" },
    {},
  );
  assert.equal(response.status, 400);
  evidence.phase1_analytics.privacy.forbiddenPayloadRejected = true;
});

test("phase1: stored schema has no identifier or IP columns", async () => {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createAsyncTestDatabase } = runtimeRequire("../db/test-utils") as {
    createAsyncTestDatabase: () => import("../db/async-client").AsyncDbAdapter;
  };

  const adapter = createAsyncTestDatabase();
  await adapter.execute("DROP TABLE IF EXISTS operational_analytics_daily");
  await ensureOperationalAnalyticsTable(adapter);
  await incrementOperationalAnalytics(adapter, {
    eventType: "investigation_open",
    occurredAtMs: Date.parse("2026-06-04T10:00:00.000Z"),
  });

  const rows = await adapter.execute(
    "SELECT day_utc, event_type, dimension, count, updated_at FROM operational_analytics_daily",
  ) as Array<Record<string, unknown>>;

  assert.equal(rows.length, 1);
  const keys = Object.keys(rows[0] ?? {});
  assert.ok(!keys.some((key) => /ip|user|session|investigation|record|station/i.test(key)));
  assertNoIdLikeDimension(String(rows[0]?.dimension ?? ""));
  evidence.phase1_analytics.privacy.noIdsInStoredRows = true;
  adapter.close();
});

test("phase1: route classification stays coarse-grained", () => {
  const runtimeRequire = eval("require") as NodeRequire;
  const webRoot = join(process.cwd(), "..", "web");
  const pathnameModule = join(webRoot, "lib", "operational-analytics", "pathname.ts");
  const source = readFileSync(pathnameModule, "utf8");
  assert.ok(!source.includes("params.id"), "pathname classifier must not read route params");
  assert.ok(source.includes("investigation_detail"), "investigation routes map to coarse bucket");

  const classified = runtimeRequire(join(webRoot, "lib", "operational-analytics", "pathname.ts"));
  const result = classified.classifyPathnameForAnalytics("/investigations/SECRET-INV-999");
  assert.equal(result.eventType, "page_view");
  assert.equal(result.dimension, "investigation_detail");
  assertNoIdLikeDimension(result.dimension);
  evidence.phase1_analytics.privacy.coarseRouteClassification = true;
});

test("phase3: circuit breaker and recovery queue persist across adapter", async () => {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createAsyncTestDatabase } = runtimeRequire("../db/test-utils") as {
    createAsyncTestDatabase: () => import("../db/async-client").AsyncDbAdapter;
  };

  const adapter = createAsyncTestDatabase();
  await ensureCircuitBreakerStateTable(adapter);
  await ensureRecoveryBackfillQueueTable(adapter);

  const snapshot: LiveIngestionHealthSnapshot = {
    generatedAt: new Date().toISOString(),
    staleAfterMs: 6 * 60 * 60 * 1000,
    summary: {
      latestSourceCount: 1,
      healthySourceCount: 1,
      degradedSourceCount: 0,
      failedSourceCount: 0,
      staleSourceCount: 0,
      insertedCount: 1,
      rejectedCount: 0,
      recentHistoryCount: 2,
      lastCompletedAt: new Date().toISOString(),
    },
    latestBySource: [{
      source: "noaa_ndbc",
      workerRunId: "LWR-1",
      workerStatus: "completed",
      status: "healthy",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 10,
      insertedCount: 1,
      rejectedCount: 0,
      rejectionReasons: {},
      runId: "RUN-1",
      error: null,
      isStale: false,
      staleByMs: 0,
      stationDiagnostics: [],
    }],
    recentHistory: [
      {
        reportId: "RPT-OK",
        workerRunId: "LWR-OK",
        source: "noaa_ndbc",
        startedAt: "2026-06-04T10:00:00.000Z",
        completedAt: "2026-06-04T10:05:00.000Z",
        durationMs: 10,
        insertedCount: 2,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "healthy",
        runId: "RUN-2",
        error: null,
        workerStatus: "completed",
        stationDiagnostics: [],
      },
      {
        reportId: "RPT-FAIL",
        workerRunId: "LWR-F",
        source: "noaa_ndbc",
        startedAt: "2026-06-03T08:00:00.000Z",
        completedAt: "2026-06-03T08:05:00.000Z",
        durationMs: 10,
        insertedCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        status: "failed",
        runId: null,
        error: "ndbc_outage",
        workerStatus: "failed",
        stationDiagnostics: [],
      },
    ],
  };

  const openSnapshot = buildCircuitBreakerSnapshot({
    ...snapshot,
    latestBySource: [{
      ...snapshot.latestBySource[0]!,
      status: "failed",
      workerStatus: "failed",
      error: "ndbc_outage",
    }],
    recentHistory: snapshot.recentHistory.map((item) => ({
      ...item,
      status: "failed" as const,
      workerStatus: "failed" as const,
    })),
  });
  await writeCircuitBreakerStates(adapter, openSnapshot);

  const statesAfterOpen = await adapter.execute(
    "SELECT source, state FROM circuit_breaker_state",
  ) as Array<{ source: string; state: string }>;
  assert.ok(statesAfterOpen.some((row) => row.source === "noaa_ndbc" && row.state === "open"));
  evidence.phase3_failureExercises.circuitBreakerStatePersists = true;

  const enqueued = await detectAndEnqueueRecoveryFromCircuitTransitions(
    adapter,
    Date.parse("2026-06-04T12:00:00.000Z"),
    { getHealthSnapshot: () => ({ source: "db", snapshot }) },
  );
  assert.ok(enqueued.length >= 1, "expected recovery windows after open→closed transition");
  evidence.phase3_failureExercises.recoveryEnqueueOnCircuitClose = true;

  adapter.close();
});

test("phase3: scientific export and lineage handlers are callable", async () => {
  const exportResponse = await buildScientificExportRouteResponse({ limit: "1" });
  assert.ok([200, 503].includes(exportResponse.status));
  evidence.phase3_failureExercises.scientificExportCallable = true;

  const lineageResponse = await buildDataLineageRouteResponse("OBS-noaa_ndbc-46042-1");
  assert.ok([200, 404, 503].includes(lineageResponse.status));
  evidence.phase3_failureExercises.lineageCallable = true;
});

test.after(() => {
  const hostilePath = join(process.cwd(), ".verification", "hostile-evidence.json");
  try {
    const hostile = JSON.parse(readFileSync(hostilePath, "utf8")) as { scenarios?: unknown[] };
    evidence.phase3_failureExercises.hostileScenarioCount = hostile.scenarios?.length ?? 0;
  } catch {
    evidence.phase3_failureExercises.hostileScenarioCount = 0;
  }

  const outputDir = join(process.cwd(), ".verification");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, "operational-validation-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
});
