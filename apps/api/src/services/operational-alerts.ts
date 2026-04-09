import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";
import type { SqliteDatabaseLike } from "../db/client";
import type { AlertStore } from "./alert-store";
import {
  linkOperationalAlertToInvestigation,
  findOpenInvestigationForAlertContext,
} from "../repositories/operational-alerts";
import { recordInvestigationEvent } from "../repositories/investigation-events";

export type OperationalAlertRuleType =
  | "source_failed"
  | "source_stale"
  | "repeated_degraded"
  | "persistence_failure"
  | "high_sea_temperature"
  | "high_wave_height"
  | "high_wind_speed"
  | "low_pressure_system";

export type OperationalAlertSeverity = "critical" | "warning" | "info";

export type OperationalAlertStatus = "active" | "resolved";

export interface OperationalAlertAction {
  type: "create" | "resolve";
  source: string;
  ruleType: OperationalAlertRuleType;
  severity: OperationalAlertSeverity;
  title: string;
  detail?: string;
  stationId?: string | null;
}

export interface OperationalAlert {
  id: string;
  source: string;
  stationId: string | null;
  ruleType: OperationalAlertRuleType;
  severity: OperationalAlertSeverity;
  status: OperationalAlertStatus;
  lifecycleStatus: "open" | "ongoing" | "resolved";
  title: string;
  detail: string | null;
  metadataJson: string | null;
  detectedAt: number;
  resolvedAt: number | null;
  occurrenceCount: number;
  windowStartedAt: number;
  windowEndsAt: number;
  createdAt: string;
  updatedAt: string;
  investigationId?: string | null;
}

interface OperationalAlertEvaluationContext {
  now: number;
}

/**
 * Evaluate a feed-health snapshot for alert conditions & return actions to apply.
 * 
 * Alert Rules:
 * - source_failed: Source status == "failed" (critical)
 * - source_stale: Source is stale (warning)
 * - repeated_degraded: Source status == "degraded" for 3+ consecutive reports (warning)
 * - persistence_failure: Could not read database (critical)
 */
export function evaluateFeedHealthForAlerts(
  snapshot: LiveIngestionHealthSnapshot,
  _context: OperationalAlertEvaluationContext = { now: Date.now() },
): OperationalAlertAction[] {
  const actions: OperationalAlertAction[] = [];

  for (const sourceStatus of snapshot.latestBySource) {
    // Rule 1: source_failed
    if (sourceStatus.status === "failed") {
      actions.push({
        type: "create",
        source: sourceStatus.source,
        ruleType: "source_failed",
        severity: "critical",
        title: `Source failed: ${sourceStatus.source}`,
        detail: sourceStatus.error || "Source ingestion failed without specific error",
      });
    }

    // Rule 2: source_stale
    if (sourceStatus.isStale) {
      const staledMs = sourceStatus.staleByMs || 0;
      const staledHours = Math.floor(staledMs / (60 * 60 * 1000));
      actions.push({
        type: "create",
        source: sourceStatus.source,
        ruleType: "source_stale",
        severity: "warning",
        title: `Source is stale: ${sourceStatus.source}`,
        detail: `No data for ${staledHours} hours`,
      });
    }

    // Rule 3: repeated_degraded
    // Check if last 3 reports are degraded
    const recentSourceReports = snapshot.recentHistory
      .filter((item) => item.source === sourceStatus.source)
      .slice(0, 3);

    if (
      recentSourceReports.length >= 3 &&
      recentSourceReports.every((item) => item.status === "degraded")
    ) {
      actions.push({
        type: "create",
        source: sourceStatus.source,
        ruleType: "repeated_degraded",
        severity: "warning",
        title: `Source repeatedly degraded: ${sourceStatus.source}`,
        detail: `${recentSourceReports.length} consecutive degraded reports`,
      });
    }

    // Rule 4: Attempt to recover - if source is healthy/degraded, resolve any active alerts
    if (sourceStatus.status === "healthy" || sourceStatus.status === "degraded") {
      // We'll resolve alerts in the repository layer when we query for active alerts
      // For now, we just note that they *should* be resolved
    }
  }

  return actions;
}

/**
 * Composable alert service for database operations (compose with application layer).
 */
export interface OperationalAlertsServiceDependencies {
  db: SqliteDatabaseLike;
  now?: () => number;
}

export interface OperationalAlertsService {
  /**
   * Create or update alerts based on evaluation actions.
   * Returns IDs of alerts that were created or updated.
   */
  applyAlertActions(actions: OperationalAlertAction[]): string[];

  /**
   * List all active alerts, optionally filtered by source.
   */
  listActiveAlerts(source?: string): OperationalAlert[];

  /**
   * Resolve alerts for a source when it recovers (transitions to healthy/degraded).
   */
  resolveAlertsForSource(source: string): void;

  /**
   * Get alert history for a source (optionally limited).
   */
  listAlertHistory(source: string, limit?: number): OperationalAlert[];
}

/**
 * Create a new operational alerts service with database composition.
 */
export function createOperationalAlertsService(
  deps: OperationalAlertsServiceDependencies & { alertStore: AlertStore },
): OperationalAlertsService {
  const { db, now = () => Date.now(), alertStore } = deps as OperationalAlertsServiceDependencies & { alertStore: AlertStore };
  const ONE_HOUR_MS = 60 * 60 * 1000;
  // Ensure table for DB, no hydration or internal state
  ensureOperationalAlertsTable();

  function toStatement(sql: string) {
    const stmt = db.prepare(sql);
    if (!stmt) {
      throw new Error("Failed to prepare SQL statement");
    }
    return stmt;
  }

  function runStatement(statement: Parameters<typeof toStatement>[0] | ReturnType<typeof toStatement>) {
    if (typeof statement === "string") {
      const stmt = toStatement(statement);
      if (typeof stmt.run === "function") {
        stmt.run();
      } else {
        stmt.all();
      }
    } else {
      if (typeof statement.run === "function") {
        statement.run();
      } else {
        statement.all();
      }
    }
  }

  function executeStatement(statement: ReturnType<typeof toStatement>, ...params: unknown[]) {
    if (typeof statement.run === "function") {
      statement.run(...params);
      return;
    }

    statement.all(...params);
  }

  function selectOperationalAlertRows(): unknown[] {
    try {
      const rows = toStatement("SELECT * FROM operational_alerts ORDER BY detected_at ASC, id ASC").all() as unknown[];
      return rows;
    } catch {
      return [];
    }
  }

  function normalizeStationId(source: string, stationId?: string | null): string | null {
    const trimmed = stationId?.trim() ?? "";

    if (trimmed) {
      return trimmed;
    }

    const parts = source.split(":");
    const inferred = parts.length > 1 ? parts[parts.length - 1]?.trim() ?? "" : "";
    return inferred || null;
  }

  function alertKey(source: string, ruleType: OperationalAlertRuleType, stationId: string | null): string {
    return [source, ruleType, stationId ?? ""].join("|");
  }

  function parseMetadata(metadataJson: string | null): Record<string, unknown> {
    if (!metadataJson) {
      return {};
    }

    try {
      const parsed = JSON.parse(metadataJson);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  function escalateSeverity(
    current: OperationalAlertSeverity,
    next: OperationalAlertSeverity,
  ): OperationalAlertSeverity {
    const rank: Record<OperationalAlertSeverity, number> = {
      info: 0,
      warning: 1,
      critical: 2,
    };

    return rank[next] > rank[current] ? next : current;
  }

  function toAlertLifecycle(status: string | null | undefined, occurrenceCount = 1): "open" | "ongoing" | "resolved" {
    if (status === "resolved") {
      return "resolved";
    }

    if (status === "ongoing") {
      return "ongoing";
    }

    return occurrenceCount > 1 ? "ongoing" : "open";
  }

  function mapRow(row: Record<string, unknown>): OperationalAlert {
    const detectedAt = Number(row.detected_at ?? 0);
    const resolvedAt = row.resolved_at == null ? null : Number(row.resolved_at);
    const occurrenceCount = Number(row.occurrence_count ?? 1) || 1;
    const windowStartedAt = Number(row.window_started_at ?? detectedAt);
    const windowEndsAt = Number(row.window_ends_at ?? windowStartedAt + ONE_HOUR_MS);
    const lifecycleStatus = toAlertLifecycle(row.lifecycle_status as string | null | undefined, occurrenceCount);

    return {
      id: String(row.id),
      source: String(row.source),
      stationId: (row.station_id as string | null) ?? null,
      ruleType: row.rule_type as OperationalAlertRuleType,
      severity: row.severity as OperationalAlertSeverity,
      status: row.status as OperationalAlertStatus,
      lifecycleStatus,
      title: String(row.title),
      detail: (row.detail as string | null) ?? null,
      metadataJson: (row.metadata_json as string | null) ?? null,
      detectedAt,
      resolvedAt,
      occurrenceCount,
      windowStartedAt,
      windowEndsAt,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  // ...existing code...
  // Removed duplicate/erroneous block. The correct implementation is below.

  function ensureOperationalAlertsTable() {
    runStatement(
      toStatement(
        `CREATE TABLE IF NOT EXISTS operational_alerts (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          station_id TEXT,
          rule_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          status TEXT NOT NULL,
          lifecycle_status TEXT NOT NULL DEFAULT 'open',
          title TEXT NOT NULL,
          detail TEXT,
          metadata_json TEXT,
          detected_at INTEGER NOT NULL,
          resolved_at INTEGER,
          occurrence_count INTEGER NOT NULL DEFAULT 1,
          window_started_at INTEGER NOT NULL DEFAULT 0,
          window_ends_at INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      ),
    );

    const existingColumns = new Set<string>();

    try {
      const rows = toStatement("PRAGMA table_info(operational_alerts)").all() as Array<{ name?: string }>;
      for (const row of rows) {
        if (row.name) {
          existingColumns.add(row.name);
        }
      }
    } catch {
      // If table_info is unavailable we fall back to the create statement above.
    }

    const addColumn = (name: string, sql: string) => {
      if (existingColumns.has(name)) {
        return;
      }

      runStatement(toStatement(`ALTER TABLE operational_alerts ADD COLUMN ${sql}`));
      existingColumns.add(name);
    };

    addColumn("station_id", "station_id TEXT");
    addColumn("lifecycle_status", "lifecycle_status TEXT NOT NULL DEFAULT 'open'");
    addColumn("occurrence_count", "occurrence_count INTEGER NOT NULL DEFAULT 1");
    addColumn("window_started_at", "window_started_at INTEGER NOT NULL DEFAULT 0");
    addColumn("window_ends_at", "window_ends_at INTEGER NOT NULL DEFAULT 0");
  }

  // Ensure table for DB, no hydration or internal state
  ensureOperationalAlertsTable();

  function applyAlertActions(actions: OperationalAlertAction[]): string[] {
    const createdIds: string[] = [];
    const timestamp = new Date(now()).toISOString();
    const nowMs = now();
    for (const action of actions) {
      if (action.type === "create") {
        const stationId = normalizeStationId(action.source, action.stationId);
        const key = alertKey(action.source, action.ruleType, stationId);
        const existingId = alertStore.getAlertIdByKey(key);
        const existing = existingId ? alertStore.getAlertById(existingId) : null;
        const withinWindow = existing ? nowMs <= existing.windowEndsAt : false;
        const shouldUpdateExisting = existing
          ? existing.status === "active" || withinWindow
          : false;

        // --- Investigation linking logic ---
        let investigationId: string | null = null;
        if (db) {
          investigationId = findOpenInvestigationForAlertContext(db, {
            source: action.source,
            ruleType: action.ruleType,
          });
          if (!investigationId) {
            // Create a new investigation
            investigationId = `INV-${action.source}-${action.ruleType}-${stationId ?? "_"}-${nowMs}`;
            const invTitle = `Investigation for ${action.source} ${action.ruleType} ${stationId ?? ""}`;
            const invSummary = action.detail || action.title;
            const invState = "Watch";
            const invConfidence = 50;
            const stmt = db.prepare(
              `INSERT INTO investigations (id, title, summary, state, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
            );
            if (!stmt || typeof stmt.run !== "function") throw new Error("Failed to prepare investigation insert statement or .run is not a function");
            stmt.run(
              investigationId,
              invTitle,
              invSummary,
              invState,
              invConfidence,
              timestamp,
              timestamp
            );
            // Record case_opened event
            recordInvestigationEvent && recordInvestigationEvent({
              investigationId,
              eventType: "case_opened",
              source: "alert-service",
              actor: "System",
              summary: invTitle,
              detail: invSummary,
              confidence: invConfidence,
            });
          }
        }

        // Always create a new alert if no deduped active alert exists
        if (!existing || !shouldUpdateExisting) {
          const alertId = `alert-${action.source}-${action.ruleType}-${stationId ?? "_"}-${nowMs}`;
          const record: OperationalAlert = {
            id: alertId,
            source: action.source,
            stationId,
            ruleType: action.ruleType,
            severity: action.severity,
            status: "active",
            lifecycleStatus: "open",
            title: action.title,
            detail: action.detail ?? null,
            metadataJson: JSON.stringify({
              stationId,
              lifecycleStatus: "open",
              occurrenceCount: 1,
              dedupeWindowMs: ONE_HOUR_MS,
            }),
            detectedAt: nowMs,
            resolvedAt: null,
            occurrenceCount: 1,
            windowStartedAt: nowMs,
            windowEndsAt: nowMs + ONE_HOUR_MS,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          alertStore.setAlert(record, key);
          createdIds.push(alertId);
          // Link alert to investigation
          if (db && investigationId) {
            linkOperationalAlertToInvestigation(db, alertId, investigationId);
          }
          continue;
        }

        // Otherwise, update existing alert
        const nextSeverity = escalateSeverity(existing.severity, action.severity);
        const refreshedWindowStartedAt = existing.status === "active" && !withinWindow
          ? nowMs
          : existing.windowStartedAt;
        const updated: OperationalAlert = {
          ...existing,
          source: action.source,
          stationId,
          severity: nextSeverity,
          status: "active",
          lifecycleStatus: "ongoing",
          title: action.title,
          detail: action.detail ?? existing.detail,
          metadataJson: JSON.stringify({
            ...parseMetadata(existing.metadataJson),
            stationId,
            lifecycleStatus: "ongoing",
            occurrenceCount: existing.occurrenceCount + 1,
            dedupeWindowMs: ONE_HOUR_MS,
          }),
          detectedAt: existing.detectedAt,
          resolvedAt: null,
          occurrenceCount: existing.occurrenceCount + 1,
          windowStartedAt: refreshedWindowStartedAt,
          windowEndsAt: nowMs + ONE_HOUR_MS,
          updatedAt: timestamp,
        };
        alertStore.setAlert(updated, key);
        createdIds.push(existing.id);
        // Escalate investigation if needed
        if (db && investigationId) {
          linkOperationalAlertToInvestigation(db, existing.id, investigationId);
          if (updated.occurrenceCount > 1) {
            // Escalate investigation state and record event
            const stmt = db.prepare(
              `UPDATE investigations SET state = ? , updated_at = ? WHERE id = ?`
            );
            if (!stmt || typeof stmt.run !== "function") throw new Error("Failed to prepare investigation escalation update statement or .run is not a function");
            stmt.run("Escalated", timestamp, investigationId);
            recordInvestigationEvent && recordInvestigationEvent({
              investigationId,
              eventType: "track_escalated",
              source: "alert-service",
              actor: "System",
              summary: `Alert escalation for ${action.source} ${action.ruleType}`,
              detail: action.detail || action.title,
              confidence: 80,
            });
          }
        }
      }
      if (action.type === "resolve") {
        const stationId = normalizeStationId(action.source, action.stationId);
        const key = alertKey(action.source, action.ruleType, stationId);
        const existingId = alertStore.getAlertIdByKey(key);
        const existing = existingId ? alertStore.getAlertById(existingId) : null;
        if (!existing || existing.status === "resolved") {
          continue;
        }
        const resolved: OperationalAlert = {
          ...existing,
          status: "resolved",
          lifecycleStatus: "resolved",
          resolvedAt: nowMs,
          updatedAt: timestamp,
          metadataJson: JSON.stringify({
            ...parseMetadata(existing.metadataJson),
            stationId,
            lifecycleStatus: "resolved",
            occurrenceCount: existing.occurrenceCount,
            dedupeWindowMs: ONE_HOUR_MS,
          }),
        };
        alertStore.setAlert(resolved, key);
        createdIds.push(existing.id);
      }
    }
    return createdIds;
  }

  function listActiveAlerts(source?: string): OperationalAlert[] {
    return alertStore
      .listAlerts({ source, status: "active" })
      .sort((left: OperationalAlert, right: OperationalAlert) => right.detectedAt - left.detectedAt);
  }

  function resolveAlertsForSource(source: string): void {
    const activeAlerts = alertStore.listAlerts({ source, status: "active" });
    const timestamp = new Date(now()).toISOString();
    const nowMs = now();
    for (const alert of activeAlerts) {
      const key = alertStore.getAlertKeyById(alert.id);
      if (!key) continue;
      const resolved: OperationalAlert = {
        ...alert,
        status: "resolved", // Always set to string literal, never investigationId or other value
        lifecycleStatus: "resolved",
        resolvedAt: nowMs,
        updatedAt: timestamp,
        metadataJson: JSON.stringify({
          ...parseMetadata(alert.metadataJson),
          stationId: alert.stationId,
          lifecycleStatus: "resolved",
          occurrenceCount: alert.occurrenceCount,
          dedupeWindowMs: ONE_HOUR_MS,
        }),
      };
      alertStore.setAlert(resolved, key);
    }
  }

  function listAlertHistory(source: string, limit: number = 50): OperationalAlert[] {
    return alertStore
      .listAlerts({ source })
      .sort((left: OperationalAlert, right: OperationalAlert) => right.detectedAt - left.detectedAt)
      .slice(0, limit);
  }

  return {
    applyAlertActions,
    listActiveAlerts,
    resolveAlertsForSource,
    listAlertHistory,
  };
}
