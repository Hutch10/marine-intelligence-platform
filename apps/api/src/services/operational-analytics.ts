import {
  OPERATIONAL_ANALYTICS_EVENT_TYPES,
  type OperationalAnalyticsEventType,
  type OperationalAnalyticsRecordRequest,
} from "@marine/shared";

const PAGE_VIEW_DIMENSIONS = new Set([
  "dashboard",
  "investigations_list",
  "investigation_detail",
  "operational_alerts",
  "operator",
  "operator_lineage",
  "replay",
  "about",
  "risk",
  "region_risk",
  "admin",
  "other",
]);

const LINEAGE_DIMENSIONS = new Set(["form_view", "lookup"]);
const EXPORT_DIMENSIONS = new Set([
  "scientific_csv",
  "scientific_json",
  "explorer_csv",
  "explorer_json",
  "explorer_observations",
]);
const OPERATOR_DIMENSIONS = new Set(["console", "lineage", "status_fetch"]);

const FORBIDDEN_BODY_KEYS = new Set([
  "userid",
  "user_id",
  "email",
  "ip",
  "ipaddress",
  "sessionid",
  "session_id",
  "investigationid",
  "investigation_id",
  "recordid",
  "record_id",
  "stationid",
  "station_id",
  "clientid",
  "client_id",
  "fingerprint",
  "useragent",
  "user_agent",
]);

export function normalizeOperationalAnalyticsDimension(value: string | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 64);
  return normalized;
}

export function validateOperationalAnalyticsDimension(
  eventType: OperationalAnalyticsEventType,
  dimension: string,
): string | null {
  if (!dimension) {
    if (eventType === "investigation_open") {
      return null;
    }
    return "dimension is required for this event type";
  }

  switch (eventType) {
    case "page_view":
      return PAGE_VIEW_DIMENSIONS.has(dimension) ? null : "dimension is not allowed for page_view";
    case "lineage_open":
      return LINEAGE_DIMENSIONS.has(dimension) ? null : "dimension is not allowed for lineage_open";
    case "export":
      return EXPORT_DIMENSIONS.has(dimension) ? null : "dimension is not allowed for export";
    case "operator_usage":
      return OPERATOR_DIMENSIONS.has(dimension) ? null : "dimension is not allowed for operator_usage";
    case "investigation_open":
      return dimension ? "investigation_open does not accept dimensions" : null;
    default:
      return "eventType is invalid";
  }
}

export function validateOperationalAnalyticsRequest(
  body: Record<string, unknown>,
): { ok: true; input: OperationalAnalyticsRecordRequest } | { ok: false; error: string } {
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_BODY_KEYS.has(key.trim().toLowerCase())) {
      return { ok: false, error: `Field ${key} is not permitted in operational analytics` };
    }
  }

  const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
  if (!OPERATIONAL_ANALYTICS_EVENT_TYPES.includes(eventType as OperationalAnalyticsEventType)) {
    return { ok: false, error: "eventType is invalid" };
  }

  const dimension = normalizeOperationalAnalyticsDimension(
    typeof body.dimension === "string" ? body.dimension : undefined,
  );
  const dimensionError = validateOperationalAnalyticsDimension(
    eventType as OperationalAnalyticsEventType,
    dimension,
  );
  if (dimensionError) {
    return { ok: false, error: dimensionError };
  }

  const surface = body.surface === "api" ? "api" : "web";

  return {
    ok: true,
    input: {
      eventType: eventType as OperationalAnalyticsEventType,
      ...(dimension ? { dimension } : {}),
      surface,
    },
  };
}

export function assertOperationalAnalyticsRecordAuthorized(
  headers: Record<string, string | undefined>,
): { ok: true } | { ok: false; status: 403; message: string } {
  const requiredKey = process.env.OPERATIONAL_ANALYTICS_RECORD_KEY?.trim();
  if (!requiredKey) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 403,
        message: "Operational analytics recording is not configured",
      };
    }
    return { ok: true };
  }

  const provided = headers["x-operational-analytics-key"]?.trim()
    ?? headers["x-operational-analytics-key".toLowerCase()]?.trim();

  if (!provided || provided !== requiredKey) {
    return { ok: false, status: 403, message: "Operational analytics record key is invalid" };
  }

  return { ok: true };
}
