import type {
  MarineAlertStatus,
  MarineEventRecord,
  MarineInvestigationCreateInput,
  MarineInvestigationCreateResult,
  MarineInvestigationRecord,
} from "../marine-intelligence-types";
import {
  acknowledgeMarineAlert,
  listMarineAlerts,
  resolveMarineAlert,
} from "../repositories/marine-intelligence-alerts";
import {
  createMarineInvestigation,
  listMarineInvestigations,
} from "../repositories/marine-investigations";
import {
  listMarineEvents,
} from "../repositories/marine-events";
import type {
  MarineWorkflowAlertFilters,
  MarineWorkflowAlertItem,
  MarineWorkflowEventFilters,
  MarineWorkflowEventItem,
  MarineWorkflowEventStatus,
  MarineWorkflowInvestigationFilters,
  MarineWorkflowInvestigationItem,
} from "@marine/shared";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";

const JOIN_LIMIT = 500;

export interface MarineWorkflowListEventsResult {
  ok: boolean;
  events: MarineWorkflowEventItem[];
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowListInvestigationsResult {
  ok: boolean;
  investigations: MarineWorkflowInvestigationItem[];
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowCreateInvestigationResult {
  ok: boolean;
  reason?: "validation" | "not_found" | "invalid_transition";
  error?: string;
  investigation: MarineWorkflowInvestigationItem | null;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowListAlertsResult {
  ok: boolean;
  alerts: MarineWorkflowAlertItem[];
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineWorkflowAlertMutationResult {
  ok: boolean;
  reason?: "validation" | "not_found";
  error?: string;
  alert: MarineWorkflowAlertItem | null;
  fallbackReason?: "db_path_missing" | "db_open_failed" | "db_query_failed";
}

export interface MarineIntelligenceWorkflowService {
  listEvents(filters?: MarineWorkflowEventFilters): Promise<MarineWorkflowListEventsResult>;
  listInvestigations(
    filters?: MarineWorkflowInvestigationFilters,
  ): Promise<MarineWorkflowListInvestigationsResult>;
  createInvestigation(
    input: MarineInvestigationCreateInput,
  ): Promise<MarineWorkflowCreateInvestigationResult>;
  listAlerts(filters?: MarineWorkflowAlertFilters): Promise<MarineWorkflowListAlertsResult>;
  acknowledgeAlert(alertId: string): Promise<MarineWorkflowAlertMutationResult>;
  resolveAlert(alertId: string): Promise<MarineWorkflowAlertMutationResult>;
}

export interface MarineIntelligenceWorkflowDependencies {
  getAdapter?: typeof getAsyncAdapter;
  listMarineEvents?: typeof listMarineEvents;
  listMarineInvestigations?: typeof listMarineInvestigations;
  createMarineInvestigation?: typeof createMarineInvestigation;
  listMarineAlerts?: typeof listMarineAlerts;
  acknowledgeMarineAlert?: typeof acknowledgeMarineAlert;
  resolveMarineAlert?: typeof resolveMarineAlert;
}

function byTimestampDescThenIdAsc(leftTimestamp: string, rightTimestamp: string, leftId: string, rightId: string): number {
  const leftTime = Date.parse(leftTimestamp);
  const rightTime = Date.parse(rightTimestamp);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return leftId.localeCompare(rightId);
}

function mapEvent(event: MarineEventRecord): MarineWorkflowEventItem {
  return {
    id: event.id,
    ontologyTermId: event.ontologyTermId,
    eventClass: event.eventClass,
    severity: event.severity,
    status: event.status,
    title: event.title,
    summary: event.summary,
    region: event.region,
    stationId: event.stationId,
    confidence: event.confidence,
    lineage: { ...event.lineage },
    truthPartition: event.truthPartition ?? "FIELD_TRUTH",
    detectedAt: event.detectedAt,
    resolvedAt: event.resolvedAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

function mapInvestigation(
  investigation: MarineInvestigationRecord,
  event: MarineEventRecord | null,
): MarineWorkflowInvestigationItem {
  return {
    id: investigation.id,
    eventId: investigation.eventId,
    eventTitle: event?.title ?? null,
    sourceType: investigation.sourceType,
    stationId: investigation.stationId,
    region: investigation.region,
    detectedAt: investigation.detectedAt,
    title: investigation.title,
    status: investigation.status,
    ownerId: investigation.ownerId,
    notes: investigation.notes,
    createdAt: investigation.createdAt,
    updatedAt: investigation.updatedAt,
    acknowledgedAt: investigation.acknowledgedAt,
    resolvedAt: investigation.resolvedAt,
    dismissedAt: investigation.dismissedAt,
    truthPartition: investigation.truthPartition ?? "FIELD_TRUTH",
  };
}

function mapAlert(
  alert: any,
  event: MarineEventRecord | null,
): MarineWorkflowAlertItem {
  return {
    id: alert.id,
    eventId: alert.eventId,
    eventTitle: event?.title ?? null,
    eventStatus: (event?.status ?? null) as MarineWorkflowEventStatus | null,
    stationId: event?.stationId ?? null,
    region: event?.region ?? null,
    investigationId: alert.investigationId,
    severity: alert.severity,
    status: alert.status,
    ruleType: alert.ruleType,
    title: alert.title,
    detail: alert.detail,
    detectedAt: alert.detectedAt,
    acknowledgedAt: alert.acknowledgedAt,
    resolvedAt: alert.resolvedAt,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    truthPartition: alert.truthPartition ?? "FIELD_TRUTH",
  };
}

export function createMarineIntelligenceWorkflowService(
  dependencies: MarineIntelligenceWorkflowDependencies = {},
): MarineIntelligenceWorkflowService {
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const listMarineEventsInjected = dependencies.listMarineEvents ?? listMarineEvents;
  const listMarineInvestigationsInjected = dependencies.listMarineInvestigations ?? listMarineInvestigations;
  const createMarineInvestigationInjected = dependencies.createMarineInvestigation ?? createMarineInvestigation;
  const listMarineAlertsInjected = dependencies.listMarineAlerts ?? listMarineAlerts;
  const acknowledgeMarineAlertInjected = dependencies.acknowledgeMarineAlert ?? acknowledgeMarineAlert;
  const resolveMarineAlertInjected = dependencies.resolveMarineAlert ?? resolveMarineAlert;

  async function listEvents(filters: MarineWorkflowEventFilters = {}): Promise<MarineWorkflowListEventsResult> {
    const adapter = getAdapter(true);
    try {
      const result = await listMarineEventsInjected(adapter, filters);
      return {
        ok: result.ok,
        events: result.events
          .map(mapEvent)
          .sort((left, right) => byTimestampDescThenIdAsc(left.detectedAt, right.detectedAt, left.id, right.id)),
      };
    } catch (err) {
      return { ok: false, events: [], fallbackReason: "db_query_failed" };
    } finally {
      adapter.close();
    }
  }

  async function listInvestigations(
    filters: MarineWorkflowInvestigationFilters = {},
  ): Promise<MarineWorkflowListInvestigationsResult> {
    const investigationResult = await listMarineInvestigationsInjected({
      eventId: filters.eventId,
      status: filters.status,
      ownerId: filters.ownerId,
      limit: filters.limit,
    });

    if (investigationResult.source !== "db") {
      return {
        ok: false,
        investigations: [],
        fallbackReason: investigationResult.fallbackReason,
      };
    }

    const adapter = getAdapter(true);
    try {
      const eventResult = await listMarineEventsInjected(adapter, {
        stationId: filters.stationId,
        region: filters.region,
        limit: JOIN_LIMIT,
      });

      if (!eventResult.ok) {
        return { ok: false, investigations: [], fallbackReason: "db_query_failed" };
      }

      const events = eventResult.events;
      const eventById = new Map(events.map(e => [e.id, e]));
      const allowedEventIds = (filters.stationId || filters.region) ? new Set(events.map(e => e.id)) : null;

      const investigations = investigationResult.result.investigations
        .filter((investigation) => !allowedEventIds || allowedEventIds.has(investigation.eventId))
        .map((investigation) => mapInvestigation(investigation, eventById.get(investigation.eventId) ?? null))
        .sort((left, right) => byTimestampDescThenIdAsc(left.createdAt, right.createdAt, left.id, right.id));

      return { ok: true, investigations };
    } finally {
      adapter.close();
    }
  }

  async function createInvestigation(
    input: MarineInvestigationCreateInput,
  ): Promise<MarineWorkflowCreateInvestigationResult> {
    const adapter = getAdapter(true);
    let event: MarineEventRecord | null = null;
    try {
      const eventResult = await listMarineEventsInjected(adapter, { id: input.eventId, limit: 1 });
      if (!eventResult.ok) {
        return {
          ok: false,
          reason: "validation",
          error: "Marine event storage unavailable",
          investigation: null,
          fallbackReason: "db_query_failed",
        };
      }
      event = eventResult.events[0] ?? null;
    } finally {
      adapter.close();
    }

    if (!event) {
      return {
        ok: false,
        reason: "not_found",
        error: `Marine event ${input.eventId} not found`,
        investigation: null,
      };
    }

    const createResult = await createMarineInvestigationInjected(input);

    if (createResult.source !== "db") {
      return {
        ok: false,
        reason: "validation",
        error: "Marine investigation storage unavailable",
        investigation: null,
        fallbackReason: createResult.fallbackReason,
      };
    }

    return {
      ...createResult.result,
      investigation: createResult.result.investigation
        ? mapInvestigation(createResult.result.investigation, event)
        : null,
    };
  }

  async function listAlerts(filters: MarineWorkflowAlertFilters = {}): Promise<MarineWorkflowListAlertsResult> {
    const alertResult = await listMarineAlertsInjected({
      eventId: filters.eventId,
      investigationId: filters.investigationId,
      status: filters.status,
      severity: filters.severity,
      ruleType: filters.ruleType,
      limit: filters.limit,
    });

    if (alertResult.source !== "db") {
      return {
        ok: false,
        alerts: [],
        fallbackReason: alertResult.fallbackReason,
      };
    }

    const adapter = getAdapter(true);
    try {
      const eventResult = await listMarineEventsInjected(adapter, {
        stationId: filters.stationId,
        region: filters.region,
        limit: JOIN_LIMIT,
      });

      if (!eventResult.ok) {
        return { ok: false, alerts: [], fallbackReason: "db_query_failed" };
      }

      const eventById = new Map(eventResult.events.map(e => [e.id, e]));
      const allowedEventIds = (filters.stationId || filters.region) ? new Set(eventResult.events.map(e => e.id)) : null;

      const alerts = alertResult.result.alerts
        .filter((alert) => !allowedEventIds || allowedEventIds.has(alert.eventId))
        .map((alert) => mapAlert(alert, eventById.get(alert.eventId) ?? null))
        .sort((left, right) => byTimestampDescThenIdAsc(left.detectedAt, right.detectedAt, left.id, right.id));

      return { ok: true, alerts };
    } finally {
      adapter.close();
    }
  }

  async function acknowledgeAlert(alertId: string): Promise<MarineWorkflowAlertMutationResult> {
    const mutationResult = await acknowledgeMarineAlertInjected(alertId);
    return handleAlertMutation(mutationResult);
  }

  async function resolveAlert(alertId: string): Promise<MarineWorkflowAlertMutationResult> {
    const mutationResult = await resolveMarineAlertInjected(alertId);
    return handleAlertMutation(mutationResult);
  }

  async function handleAlertMutation(mutationResult: any): Promise<MarineWorkflowAlertMutationResult> {
    if (mutationResult.source !== "db") {
      return {
        ok: false,
        reason: "validation",
        error: "Marine alert storage unavailable",
        alert: null,
        fallbackReason: mutationResult.fallbackReason,
      };
    }

    if (!mutationResult.result.ok || !mutationResult.result.alert) {
      return {
        ok: mutationResult.result.ok,
        reason: mutationResult.result.reason,
        error: mutationResult.result.error,
        alert: null,
      };
    }

    const adapter = getAdapter(true);
    try {
      const eventResult = await listMarineEventsInjected(adapter, { id: mutationResult.result.alert.eventId, limit: 1 });
      const event = eventResult.events[0] ?? null;

      return {
        ok: true,
        alert: mapAlert(mutationResult.result.alert, event),
      };
    } finally {
      adapter.close();
    }
  }

  return {
    listEvents,
    listInvestigations,
    createInvestigation,
    listAlerts,
    acknowledgeAlert,
    resolveAlert,
  };
}