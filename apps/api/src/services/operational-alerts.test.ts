import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFeedHealthForAlerts,
  createOperationalAlertsService,
} from "./operational-alerts";
import type { LiveIngestionHealthSnapshot, LiveIngestionSourceHealthStatus, LiveIngestionHistoryItem } from "../repositories/live-ingestion-reports";
import type { SqliteDatabaseLike } from "../db/client";

function createMockHealthSnapshot(
  sourceOverrides?: Array<Partial<LiveIngestionSourceHealthStatus> & {
    source: string;
    status: "healthy" | "degraded" | "failed";
  }>,
): LiveIngestionHealthSnapshot {
  const defaultSources: LiveIngestionSourceHealthStatus[] = [
    {
      source: "noaa_ndbc",
      workerRunId: "WR-1",
      workerStatus: "success",
      status: "healthy",
      startedAt: "2026-03-18T10:00:00.000Z",
      completedAt: "2026-03-18T10:00:30.000Z",
      durationMs: 30000,
      insertedCount: 10,
      rejectedCount: 0,
      rejectionReasons: {},
      runId: "ING-1",
      error: null,
      isStale: false,
      staleByMs: null,
    },
    {
      source: "noaa_coral_reef_watch",
      workerRunId: "WR-2",
      workerStatus: "failed",
      status: "failed",
      startedAt: "2026-03-18T09:00:00.000Z",
      completedAt: "2026-03-18T09:00:30.000Z",
      durationMs: 30000,
      insertedCount: 0,
      rejectedCount: 0,
      rejectionReasons: {},
      runId: "ING-2",
      error: "Connection timeout",
      isStale: true,
      staleByMs: 3600000,
    },
  ];

  const sources = sourceOverrides || defaultSources;

  return {
    generatedAt: "2026-03-18T10:05:00.000Z",
    staleAfterMs: 6 * 60 * 60 * 1000,
    summary: {
      latestSourceCount: sources.length,
      healthySourceCount: sources.filter((s) => s.status === "healthy").length,
      degradedSourceCount: sources.filter((s) => s.status === "degraded").length,
      failedSourceCount: sources.filter((s) => s.status === "failed").length,
      staleSourceCount: sources.filter((s) => s.isStale).length,
      insertedCount: 10,
      rejectedCount: 0,
      recentHistoryCount: 2,
      lastCompletedAt: "2026-03-18T10:00:30.000Z",
    },
    latestBySource: sources as LiveIngestionSourceHealthStatus[],
    recentHistory: sources.map((entry): LiveIngestionHistoryItem => {
      const s = entry as Partial<LiveIngestionSourceHealthStatus> & {
        source: string;
        status: "healthy" | "degraded" | "failed";
      };

      return {
        reportId: "RPT-1",
        workerRunId: s.workerRunId ?? "WR-1",
        source: s.source,
        startedAt: s.startedAt ?? "2026-03-18T10:00:00.000Z",
        completedAt: s.completedAt ?? "2026-03-18T10:00:30.000Z",
        durationMs: s.durationMs ?? 30000,
        insertedCount: s.insertedCount ?? 0,
        rejectedCount: s.rejectedCount ?? 0,
        rejectionReasons: s.rejectionReasons ?? {},
        status: s.status,
        runId: s.runId ?? null,
        error: s.error ?? null,
        workerStatus: s.workerStatus ?? "success",
      };
    }),
  };
}

function createCapturingDatabase(): { db: SqliteDatabaseLike; captured: Array<{ sql: string; params: unknown[] }> } {
  const captured: Array<{ sql: string; params: unknown[] }> = [];

  const db: SqliteDatabaseLike = {
    prepare(sql: string) {
      return {
        run(...params: unknown[]) {
          captured.push({ sql, params });
        },
        all(...params: unknown[]) {
          captured.push({ sql, params });
          return [];
        },
      };
    },
    close() {},
  };

  return { db, captured };
}

test("evaluateFeedHealthForAlerts detects source_failed rule", () => {
  const snapshot = createMockHealthSnapshot([
    {
      source: "failing_source",
      status: "failed",
      error: "Connection refused",
    },
  ]);

  const actions = evaluateFeedHealthForAlerts(snapshot);

  assert.equal(actions.length, 1);
  assert.equal(actions[0]!.type, "create");
  assert.equal(actions[0]!.ruleType, "source_failed");
  assert.equal(actions[0]!.severity, "critical");
  assert.equal(actions[0]!.source, "failing_source");
  assert.ok(actions[0]!.title.includes("failed"));
});

test("evaluateFeedHealthForAlerts detects source_stale rule", () => {
  const snapshot = createMockHealthSnapshot([
    {
      source: "stale_source",
      status: "degraded",
      isStale: true,
      staleByMs: 7200000, // 2 hours
    },
  ]);

  const actions = evaluateFeedHealthForAlerts(snapshot);

  const staleAlerts = actions.filter((a) => a.ruleType === "source_stale");
  assert.equal(staleAlerts.length, 1);
  assert.equal(staleAlerts[0]!.severity, "warning");
  assert.ok(staleAlerts[0]!.detail?.includes("2 hours"));
});

test("evaluateFeedHealthForAlerts returns empty for healthy snapshot", () => {
  const snapshot = createMockHealthSnapshot([
    {
      source: "healthy_source",
      status: "healthy",
      isStale: false,
    },
  ]);

  const actions = evaluateFeedHealthForAlerts(snapshot);

  assert.equal(actions.length, 0);
});

test("createOperationalAlertsService applyAlertActions creates new alert", () => {
  const { db, captured } = createCapturingDatabase();
  const service = createOperationalAlertsService({ db, now: () => 1234567890000 });

  const ids = service.applyAlertActions([
    {
      type: "create",
      source: "test_source",
      ruleType: "source_failed",
      severity: "critical",
      title: "Test alert",
      detail: "This is a test",
    },
  ]);

  assert.equal(ids.length, 1);
  assert.ok(ids[0]!.includes("alert-"));

  const insertStatements = captured.filter((c) => c.sql.includes("INSERT INTO operational_alerts"));
  assert.equal(insertStatements.length, 1);
});

test("createOperationalAlertsService prevents duplicate alerts for same source+rule", () => {
  const { db, captured } = createCapturingDatabase();

  const service = createOperationalAlertsService({ db, now: () => 1234567890000 });

  // First call creates alert
  const ids1 = service.applyAlertActions([
    {
      type: "create",
      source: "test_source",
      ruleType: "source_failed",
      severity: "critical",
      title: "Test alert 1",
    },
  ]);

  assert.equal(ids1.length, 1);

  // Clear captured to check second call
  captured.length = 0;

  // Second call should update, not create duplicate
  const ids2 = service.applyAlertActions([
    {
      type: "create",
      source: "test_source",
      ruleType: "source_failed",
      severity: "critical",
      title: "Test alert 2",
    },
  ]);

  assert.equal(ids2.length, 1);

  // Should have SELECT and UPDATE, not INSERT
  const selectStatements = captured.filter((c) => c.sql.includes("SELECT"));
  const updateStatements = captured.filter((c) => c.sql.includes("UPDATE"));

  assert.ok(selectStatements.length > 0);
  assert.ok(updateStatements.length > 0);
});

test("createOperationalAlertsService listActiveAlerts filters by status", () => {
  const dbWithRows: SqliteDatabaseLike = {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (sql.includes("SELECT * FROM operational_alerts WHERE status = 'active'")) {
            return [
              {
                id: "alert-1",
                source: "source1",
                rule_type: "source_failed",
                severity: "critical",
                status: "active",
                title: "Alert 1",
                detail: "Detail 1",
                metadata_json: null,
                detected_at: 1000000,
                resolved_at: null,
                created_at: "2026-03-18T10:00:00.000Z",
                updated_at: "2026-03-18T10:00:00.000Z",
              },
            ];
          }
          return [];
        },
      };
    },
    close() {},
  };

  const service = createOperationalAlertsService({ db: dbWithRows });
  const alerts = service.listActiveAlerts();

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]!.source, "source1");
  assert.equal(alerts[0]!.status, "active");
});

test("createOperationalAlertsService resolveAlertsForSource updates status to resolved", () => {
  const { db, captured } = createCapturingDatabase();
  const service = createOperationalAlertsService({ db, now: () => 1234567890000 });

  service.resolveAlertsForSource("test_source");

  const updateStatements = captured.filter((c) => c.sql.includes("UPDATE operational_alerts"));
  assert.equal(updateStatements.length, 1);
  assert.ok(updateStatements[0]!.sql.includes("status = 'resolved'"));
});

test("createOperationalAlertsService listAlertHistory returns recent history", () => {
  const dbWithHistory: SqliteDatabaseLike = {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (sql.includes("SELECT * FROM operational_alerts WHERE source = ?")) {
            return [
              {
                id: "alert-1",
                source: "test_source",
                rule_type: "source_failed",
                severity: "critical",
                status: "resolved",
                title: "Alert 1",
                detail: "Detail 1",
                metadata_json: null,
                detected_at: 1000000,
                resolved_at: 1001000,
                created_at: "2026-03-18T10:00:00.000Z",
                updated_at: "2026-03-18T10:00:10.000Z",
              },
            ];
          }
          return [];
        },
      };
    },
    close() {},
  };

  const service = createOperationalAlertsService({ db: dbWithHistory });
  const history = service.listAlertHistory("test_source", 50);

  assert.equal(history.length, 1);
  assert.equal(history[0]!.status, "resolved");
});
