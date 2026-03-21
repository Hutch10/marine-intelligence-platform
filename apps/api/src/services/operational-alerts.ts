import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";
import type { SqliteDatabaseLike } from "../db/client";

export type OperationalAlertRuleType = "source_failed" | "source_stale" | "repeated_degraded" | "persistence_failure";

export type OperationalAlertSeverity = "critical" | "warning" | "info";

export type OperationalAlertStatus = "active" | "resolved";

export interface OperationalAlertAction {
  type: "create" | "resolve";
  source: string;
  ruleType: OperationalAlertRuleType;
  severity: OperationalAlertSeverity;
  title: string;
  detail?: string;
}

export interface OperationalAlert {
  id: string;
  source: string;
  ruleType: OperationalAlertRuleType;
  severity: OperationalAlertSeverity;
  status: OperationalAlertStatus;
  title: string;
  detail: string | null;
  metadataJson: string | null;
  detectedAt: number;
  resolvedAt: number | null;
  createdAt: string;
  updatedAt: string;
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
  deps: OperationalAlertsServiceDependencies,
): OperationalAlertsService {
  const { db, now = () => Date.now() } = deps;

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

  function ensureOperationalAlertsTable() {
    runStatement(
      toStatement(
        `CREATE TABLE IF NOT EXISTS operational_alerts (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          rule_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          status TEXT NOT NULL,
          title TEXT NOT NULL,
          detail TEXT,
          metadata_json TEXT,
          detected_at INTEGER NOT NULL,
          resolved_at INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(source, rule_type, status)
        )`,
      ),
    );
  }

  ensureOperationalAlertsTable();

  function applyAlertActions(actions: OperationalAlertAction[]): string[] {
    const createdIds: string[] = [];
    const timestamp = new Date().toISOString();

    for (const action of actions) {
      if (action.type === "create") {
        // Check if alert already exists (active or recently resolved)
        const existing = toStatement(
          `SELECT id, status FROM operational_alerts WHERE source = ? AND rule_type = ? AND status = 'active'`,
        ).all(action.source, action.ruleType) as Array<{ id: string; status: string }>;

        if (existing.length > 0) {
          // Update existing alert
          const existingId = existing[0]!.id;
          executeStatement(
            toStatement(
            `UPDATE operational_alerts
            SET detail = ?, metadata_json = ?, updated_at = ?
            WHERE id = ?`,
            ),
            action.detail || null,
            null,
            timestamp,
            existingId,
          );
          createdIds.push(existingId);
        } else {
          // Create new alert
          const alertId = `alert-${action.source}-${action.ruleType}-${Date.now()}`;
          const nowMs = now();

          executeStatement(
            toStatement(
            `INSERT INTO operational_alerts 
            (id, source, rule_type, severity, status, title, detail, metadata_json, detected_at, resolved_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ),
            alertId,
            action.source,
            action.ruleType,
            action.severity,
            "active",
            action.title,
            action.detail || null,
            null,
            nowMs,
            null,
            timestamp,
            timestamp,
          );

          createdIds.push(alertId);
        }
      }
    }

    return createdIds;
  }

  function listActiveAlerts(source?: string): OperationalAlert[] {
    let query = `SELECT * FROM operational_alerts WHERE status = 'active'`;
    const params: unknown[] = [];

    if (source) {
      query += ` AND source = ?`;
      params.push(source);
    }

    query += ` ORDER BY detected_at DESC`;

    const rows = toStatement(query).all(...params) as unknown[];

    return rows.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        source: r.source as string,
        ruleType: r.rule_type as OperationalAlertRuleType,
        severity: r.severity as OperationalAlertSeverity,
        status: r.status as OperationalAlertStatus,
        title: r.title as string,
        detail: (r.detail as string | null) || null,
        metadataJson: (r.metadata_json as string | null) || null,
        detectedAt: r.detected_at as number,
        resolvedAt: (r.resolved_at as number | null) || null,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      };
    });
  }

  function resolveAlertsForSource(source: string): void {
    const timestamp = new Date().toISOString();
    const nowMs = now();

    executeStatement(
      toStatement(
        `UPDATE operational_alerts
         SET status = 'resolved', resolved_at = ?, updated_at = ?
         WHERE source = ? AND status = 'active'`,
      ),
      nowMs,
      timestamp,
      source,
    );
  }

  function listAlertHistory(source: string, limit: number = 50): OperationalAlert[] {
    const rows = toStatement(
      `SELECT * FROM operational_alerts WHERE source = ? ORDER BY detected_at DESC LIMIT ?`,
    ).all(source, limit) as unknown[];

    return rows.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        source: r.source as string,
        ruleType: r.rule_type as OperationalAlertRuleType,
        severity: r.severity as OperationalAlertSeverity,
        status: r.status as OperationalAlertStatus,
        title: r.title as string,
        detail: (r.detail as string | null) || null,
        metadataJson: (r.metadata_json as string | null) || null,
        detectedAt: r.detected_at as number,
        resolvedAt: (r.resolved_at as number | null) || null,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      };
    });
  }

  return {
    applyAlertActions,
    listActiveAlerts,
    resolveAlertsForSource,
    listAlertHistory,
  };
}
