import type { LiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";
import type { AsyncDbAdapter } from "../db/async-client";
import type { AlertStore } from "./alert-store";
import {
  linkOperationalAlertToInvestigation,
  findOpenInvestigationForAlertContext,
  ensureOperationalAlertsTable,
} from "../repositories/operational-alerts";
import { recordInvestigationEvent } from "../repositories/investigation-events";
import {
  gateAlertPublish,
  type AlertPublishVerificationContext,
} from "./environmental-harness/alert-gate";
import { auditPublication } from "./environmental-harness/audit";
import { buildSourceScopeSignalId } from "./environmental-harness/lineage";
import { buildHarnessEventId, stableContentHash } from "./environmental-harness/provenance";

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

export interface OperationalAlertHarnessLineage {
  signalId: string;
  rootEventId: string;
  verificationEventId: string;
  provenanceHash?: string | null;
}

export interface OperationalAlertAction {
  type: "create" | "resolve";
  source: string;
  ruleType: OperationalAlertRuleType;
  severity: OperationalAlertSeverity;
  title: string;
  detail?: string;
  stationId?: string | null;
  harnessLineage?: OperationalAlertHarnessLineage;
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
 */
export function evaluateFeedHealthForAlerts(
  snapshot: LiveIngestionHealthSnapshot,
  _context: OperationalAlertEvaluationContext = { now: Date.now() },
): OperationalAlertAction[] {
  const actions: OperationalAlertAction[] = [];

  for (const sourceStatus of snapshot.latestBySource) {
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
  }

  return actions;
}

/**
 * Composable alert service for database operations.
 */
export interface OperationalAlertsServiceDependencies {
  adapter: AsyncDbAdapter;
  now?: () => number;
  alertVerificationContextBySource?: Record<string, AlertPublishVerificationContext>;
}

export interface OperationalAlertsService {
  /**
   * Create or update alerts based on evaluation actions.
   * Returns IDs of alerts that were created or updated.
   */
  applyAlertActions(actions: OperationalAlertAction[]): Promise<string[]>;

  /**
   * List all active alerts, optionally filtered by source.
   */
  listActiveAlerts(source?: string): Promise<OperationalAlert[]>;

  /**
   * Resolve alerts for a source when it recovers.
   */
  resolveAlertsForSource(source: string): Promise<void>;

  /**
   * Get alert history for a source (optionally limited).
   */
  listAlertHistory(source: string, limit?: number): Promise<OperationalAlert[]>;
}

/**
 * Create a new operational alerts service with database composition.
 */
export function buildAlertVerificationContextMap(
  snapshot: LiveIngestionHealthSnapshot,
): Record<string, AlertPublishVerificationContext> {
  return Object.fromEntries(
    snapshot.latestBySource.map((sourceStatus) => [
      sourceStatus.source,
      {
        feedHealthGeneratedAt: snapshot.generatedAt,
        sourceStatus,
      },
    ]),
  );
}

export function createOperationalAlertsService(
  deps: OperationalAlertsServiceDependencies & { alertStore: AlertStore },
): OperationalAlertsService {
  const { adapter, now = () => Date.now(), alertStore, alertVerificationContextBySource = {} } = deps;
  const ONE_HOUR_MS = 60 * 60 * 1000;

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

  async function applyAlertActions(actions: OperationalAlertAction[]): Promise<string[]> {
    const createdIds: string[] = [];
    const timestamp = new Date(now()).toISOString();
    const nowMs = now();

    for (const action of actions) {
      if (action.type === "create") {
        const stationId = normalizeStationId(action.source, action.stationId);
        const key = alertKey(action.source, action.ruleType, stationId);
        const existingId = await alertStore.getAlertIdByKey(key);
        const existing = existingId ? await alertStore.getAlertById(existingId) : undefined;
        const withinWindow = existing ? nowMs <= existing.windowEndsAt : false;
        const shouldUpdateExisting = existing
          ? existing.status === "active" || withinWindow
          : false;

        let investigationId: string | null = await findOpenInvestigationForAlertContext(adapter, {
          source: action.source,
          ruleType: action.ruleType,
        });

        if (!investigationId) {
          investigationId = `INV-${action.source}-${action.ruleType}-${stationId ?? "_"}-${nowMs}`;
          const invTitle = `Investigation for ${action.source} ${action.ruleType} ${stationId ?? ""}`;
          const invSummary = action.detail || action.title;
          const invState = "Watch";
          const invConfidence = 50;

          await adapter.execute(
            `INSERT INTO investigations (id, title, summary, state, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [investigationId, invTitle, invSummary, invState, invConfidence, timestamp, timestamp]
          );

          if (recordInvestigationEvent) {
            await recordInvestigationEvent({
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

        if (!existing || !shouldUpdateExisting) {
          const verificationContext = alertVerificationContextBySource[action.source] ?? {};
          const signalId = action.harnessLineage?.signalId
            ?? buildSourceScopeSignalId(
              action.source,
              verificationContext.sourceStatus?.runId ?? null,
              verificationContext.feedHealthGeneratedAt ?? timestamp,
            );
          const alertId = `alert-${action.source}-${action.ruleType}-${stationId ?? "_"}-${nowMs}`;
          const ingestionRootEventId = action.harnessLineage?.rootEventId ?? null;
          const verificationParentEventId = action.harnessLineage?.verificationEventId ?? null;

          const gate = await gateAlertPublish({
            alertKey: key,
            alertId,
            source: action.source,
            ruleType: action.ruleType,
            signalId,
            context: verificationContext,
            lineage: {
              parentEventId: verificationParentEventId,
              rootEventId: ingestionRootEventId ?? undefined,
            },
            getAdapter: () => adapter,
          });

          if (!gate.allowed) {
            continue;
          }

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
              ...gate.metadata,
            }),
            detectedAt: nowMs,
            resolvedAt: null,
            occurrenceCount: 1,
            windowStartedAt: nowMs,
            windowEndsAt: nowMs + ONE_HOUR_MS,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await alertStore.setAlert(record, key);
          createdIds.push(alertId);
          await linkOperationalAlertToInvestigation(adapter, alertId, investigationId);

          await auditPublication({
            eventId: buildHarnessEventId(
              "publication",
              "operational_alert",
              alertId,
              stableContentHash({
                alertId,
                alertKey: key,
                signalId,
                outcome: "published",
              }),
            ),
            alertId,
            alertKey: key,
            signalId,
            lifecycleStatus: "published",
            outcome: "published",
            evaluatedAt: timestamp,
            detail: action.title,
            parentEventId: gate.validationEventId,
            rootEventId: ingestionRootEventId ?? gate.validationEventId ?? undefined,
          }, { getAdapter: () => adapter });

          continue;
        }

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
        await alertStore.setAlert(updated, key);
        createdIds.push(existing.id);
        await linkOperationalAlertToInvestigation(adapter, existing.id, investigationId);

        if (updated.occurrenceCount > 1) {
          await adapter.execute(
            `UPDATE investigations SET state = ? , updated_at = ? WHERE id = ?`,
            ["Escalated", timestamp, investigationId]
          );

          if (recordInvestigationEvent) {
            await recordInvestigationEvent({
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
      } else if (action.type === "resolve") {
        const stationId = normalizeStationId(action.source, action.stationId);
        const key = alertKey(action.source, action.ruleType, stationId);
        const existingId = await alertStore.getAlertIdByKey(key);
        const existing = existingId ? await alertStore.getAlertById(existingId) : undefined;

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
        await alertStore.setAlert(resolved, key);
        createdIds.push(existing.id);
      }
    }
    return createdIds;
  }

  async function listActiveAlerts(source?: string): Promise<OperationalAlert[]> {
    const alerts = await alertStore.listAlerts({ source, status: "active" });
    return alerts.sort((left, right) => right.detectedAt - left.detectedAt);
  }

  async function resolveAlertsForSource(source: string): Promise<void> {
    const activeAlerts = await alertStore.listAlerts({ source, status: "active" });
    const timestamp = new Date(now()).toISOString();
    const nowMs = now();

    for (const alert of activeAlerts) {
      const key = await alertStore.getAlertKeyById(alert.id);
      if (!key) continue;

      const resolved: OperationalAlert = {
        ...alert,
        status: "resolved",
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
      await alertStore.setAlert(resolved, key);
    }
  }

  async function listAlertHistory(source: string, limit: number = 50): Promise<OperationalAlert[]> {
    const alerts = await alertStore.listAlerts({ source });
    return alerts
      .sort((left, right) => right.detectedAt - left.detectedAt)
      .slice(0, limit);
  }

  return {
    applyAlertActions,
    listActiveAlerts,
    resolveAlertsForSource,
    listAlertHistory,
  };
}
