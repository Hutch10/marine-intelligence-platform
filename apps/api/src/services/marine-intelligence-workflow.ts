import type {
  MarineAlertStatus,
  MarineEventListResult,
  MarineEventRecord,
  MarineInvestigationCreateInput,
  MarineInvestigationCreateResult,
  MarineInvestigationRecord,
} from "../marine-intelligence-types";
import {
  acknowledgeMarineAlert,
  listMarineAlerts,
  resolveMarineAlert,
  type MarineAlertsRepositoryListResult,
  type MarineAlertsRepositoryMutationResult,
} from "../repositories/marine-intelligence-alerts";
import {
  createMarineInvestigation,
  listMarineInvestigations,
  type MarineInvestigationsRepositoryCreateResult,
  type MarineInvestigationsRepositoryListResult,
} from "../repositories/marine-investigations";
import {
  listMarineEvents,
  type MarineEventsRepositoryReadResult,
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

export interface MarineWorkflowCreateInvestigationResult extends MarineInvestigationCreateResult {
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
  listEvents(filters?: MarineWorkflowEventFilters): MarineWorkflowListEventsResult;
  listInvestigations(
    filters?: MarineWorkflowInvestigationFilters,
  ): MarineWorkflowListInvestigationsResult;
  createInvestigation(
    input: MarineInvestigationCreateInput,
  ): MarineWorkflowCreateInvestigationResult;
  listAlerts(filters?: MarineWorkflowAlertFilters): MarineWorkflowListAlertsResult;
  acknowledgeAlert(alertId: string): MarineWorkflowAlertMutationResult;
  resolveAlert(alertId: string): MarineWorkflowAlertMutationResult;
}

interface MarineIntelligenceWorkflowDependencies {
  readEvents?: (filters?: MarineWorkflowEventFilters & { id?: string }) => MarineEventsRepositoryReadResult;
  readInvestigations?: (
    filters?: { eventId?: string; status?: MarineInvestigationRecord["status"]; ownerId?: string; limit?: number },
  ) => MarineInvestigationsRepositoryListResult;
  createInvestigation?: (
    input: MarineInvestigationCreateInput,
  ) => MarineInvestigationsRepositoryCreateResult;
  readAlerts?: (
    filters?: {
      eventId?: string;
      investigationId?: string;
      status?: MarineAlertStatus;
      severity?: MarineWorkflowAlertItem["severity"];
      ruleType?: MarineWorkflowAlertItem["ruleType"];
      limit?: number;
    },
  ) => MarineAlertsRepositoryListResult;
  acknowledgeAlert?: (alertId: string) => MarineAlertsRepositoryMutationResult;
  resolveAlert?: (alertId: string) => MarineAlertsRepositoryMutationResult;
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
    stationId: event?.stationId ?? null,
    region: event?.region ?? null,
    detectedAt: event?.detectedAt ?? null,
    title: investigation.title,
    status: investigation.status,
    ownerId: investigation.ownerId,
    notes: investigation.notes,
    createdAt: investigation.createdAt,
    updatedAt: investigation.updatedAt,
    acknowledgedAt: investigation.acknowledgedAt,
    resolvedAt: investigation.resolvedAt,
    dismissedAt: investigation.dismissedAt,
  };
}

function mapAlert(
  alert: MarineAlertsRepositoryListResult extends never ? never : {
    id: string;
    eventId: string;
    investigationId: string | null;
    severity: MarineWorkflowAlertItem["severity"];
    status: MarineWorkflowAlertItem["status"];
    ruleType: MarineWorkflowAlertItem["ruleType"];
    title: string;
    detail: string | null;
    detectedAt: string;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    createdAt: string;
    updatedAt: string;
  },
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
  };
}

function normalizeEventsResult(result: MarineEventsRepositoryReadResult): MarineWorkflowListEventsResult {
  if (result.source !== "db") {
    return { ok: false, events: [], fallbackReason: result.fallbackReason };
  }

  return {
    ok: result.result.ok,
    events: result.result.events
      .map(mapEvent)
      .sort((left, right) => byTimestampDescThenIdAsc(left.detectedAt, right.detectedAt, left.id, right.id)),
  };
}

function buildEventMap(readEvents: (filters?: MarineWorkflowEventFilters & { id?: string }) => MarineEventsRepositoryReadResult) {
  return (filters: MarineWorkflowEventFilters & { id?: string } = {}) => {
    const result = readEvents(filters);
    if (result.source !== "db") {
      return {
        ok: false,
        fallbackReason: result.fallbackReason,
        byId: new Map<string, MarineEventRecord>(),
        events: [] as MarineEventRecord[],
      };
    }

    const events = result.result.events.slice().sort((left, right) =>
      byTimestampDescThenIdAsc(left.detectedAt, right.detectedAt, left.id, right.id),
    );
    return {
      ok: true,
      byId: new Map(events.map((event) => [event.id, event])),
      events,
    };
  };
}

export function createMarineIntelligenceWorkflowService(
  dependencies: MarineIntelligenceWorkflowDependencies = {},
): MarineIntelligenceWorkflowService {
  const readEvents = dependencies.readEvents ?? ((filters) => listMarineEvents(filters));
  const readInvestigations = dependencies.readInvestigations ?? ((filters) => listMarineInvestigations(filters));
  const createInvestigationInRepository =
    dependencies.createInvestigation ?? ((input) => createMarineInvestigation(input));
  const readAlerts = dependencies.readAlerts ?? ((filters) => listMarineAlerts(filters));
  const acknowledgeAlertInRepository =
    dependencies.acknowledgeAlert ?? ((alertId) => acknowledgeMarineAlert(alertId));
  const resolveAlertInRepository =
    dependencies.resolveAlert ?? ((alertId) => resolveMarineAlert(alertId));
  const readEventMap = buildEventMap(readEvents);

  function listEvents(filters: MarineWorkflowEventFilters = {}): MarineWorkflowListEventsResult {
    return normalizeEventsResult(readEvents(filters));
  }

  function listInvestigations(
    filters: MarineWorkflowInvestigationFilters = {},
  ): MarineWorkflowListInvestigationsResult {
    const investigationResult = readInvestigations({
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

    const eventLookup = readEventMap({
      stationId: filters.stationId,
      region: filters.region,
      limit: JOIN_LIMIT,
    });

    if (!eventLookup.ok) {
      return {
        ok: false,
        investigations: [],
        fallbackReason: eventLookup.fallbackReason,
      };
    }

    const allowedEventIds =
      filters.stationId || filters.region
        ? new Set(eventLookup.events.map((event) => event.id))
        : null;

    const investigations = investigationResult.result.investigations
      .filter((investigation) => !allowedEventIds || allowedEventIds.has(investigation.eventId))
      .map((investigation) => mapInvestigation(investigation, eventLookup.byId.get(investigation.eventId) ?? null))
      .sort((left, right) => byTimestampDescThenIdAsc(left.createdAt, right.createdAt, left.id, right.id));

    return { ok: true, investigations };
  }

  function createInvestigation(
    input: MarineInvestigationCreateInput,
  ): MarineWorkflowCreateInvestigationResult {
    const eventLookup = readEventMap({ id: input.eventId, limit: 1 });

    if (!eventLookup.ok) {
      return {
        ok: false,
        reason: "validation",
        error: "Marine event storage unavailable",
        investigation: null,
        fallbackReason: eventLookup.fallbackReason,
      };
    }

    const event = eventLookup.byId.get(input.eventId) ?? null;

    if (!event) {
      return {
        ok: false,
        reason: "not_found",
        error: `Marine event ${input.eventId} not found`,
        investigation: null,
      };
    }

    const createResult = createInvestigationInRepository(input);

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

  function listAlerts(filters: MarineWorkflowAlertFilters = {}): MarineWorkflowListAlertsResult {
    const alertResult = readAlerts({
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

    const eventLookup = readEventMap({
      stationId: filters.stationId,
      region: filters.region,
      limit: JOIN_LIMIT,
    });

    if (!eventLookup.ok) {
      return {
        ok: false,
        alerts: [],
        fallbackReason: eventLookup.fallbackReason,
      };
    }

    const allowedEventIds =
      filters.stationId || filters.region
        ? new Set(eventLookup.events.map((event) => event.id))
        : null;

    const alerts = alertResult.result.alerts
      .filter((alert) => !allowedEventIds || allowedEventIds.has(alert.eventId))
      .map((alert) => mapAlert(alert, eventLookup.byId.get(alert.eventId) ?? null))
      .sort((left, right) => byTimestampDescThenIdAsc(left.detectedAt, right.detectedAt, left.id, right.id));

    return { ok: true, alerts };
  }

  function mutateAlert(
    alertId: string,
    mutation: (alertId: string) => MarineAlertsRepositoryMutationResult,
  ): MarineWorkflowAlertMutationResult {
    const mutationResult = mutation(alertId);

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

    const eventLookup = readEventMap({ id: mutationResult.result.alert.eventId, limit: 1 });

    if (!eventLookup.ok) {
      return {
        ok: false,
        reason: "validation",
        error: "Marine event storage unavailable",
        alert: null,
        fallbackReason: eventLookup.fallbackReason,
      };
    }

    return {
      ok: true,
      alert: mapAlert(
        mutationResult.result.alert,
        eventLookup.byId.get(mutationResult.result.alert.eventId) ?? null,
      ),
    };
  }

  function acknowledgeAlert(alertId: string): MarineWorkflowAlertMutationResult {
    return mutateAlert(alertId, acknowledgeAlertInRepository);
  }

  function resolveAlert(alertId: string): MarineWorkflowAlertMutationResult {
    return mutateAlert(alertId, resolveAlertInRepository);
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