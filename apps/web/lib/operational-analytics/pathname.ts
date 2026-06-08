import type { OperationalAnalyticsEventType } from "@marine/shared";

export interface OperationalAnalyticsBeaconPayload {
  eventType: OperationalAnalyticsEventType;
  dimension?: string;
}

/**
 * Maps a URL pathname to a coarse analytics bucket — never includes dynamic ids.
 */
export function classifyPathnameForAnalytics(pathname: string): OperationalAnalyticsBeaconPayload {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/";

  if (path === "/") {
    return { eventType: "page_view", dimension: "dashboard" };
  }
  if (path === "/investigations") {
    return { eventType: "page_view", dimension: "investigations_list" };
  }
  if (path.startsWith("/investigations/")) {
    return { eventType: "page_view", dimension: "investigation_detail" };
  }
  if (path === "/operator") {
    return { eventType: "page_view", dimension: "operator" };
  }
  if (path.startsWith("/operator/lineage")) {
    return { eventType: "page_view", dimension: "operator_lineage" };
  }
  if (path === "/operational-alerts") {
    return { eventType: "page_view", dimension: "operational_alerts" };
  }
  if (path === "/replay") {
    return { eventType: "page_view", dimension: "replay" };
  }
  if (path === "/about") {
    return { eventType: "page_view", dimension: "about" };
  }
  if (path.startsWith("/v1/risk")) {
    return { eventType: "page_view", dimension: "risk" };
  }
  if (path.startsWith("/v1/regions")) {
    return { eventType: "page_view", dimension: "region_risk" };
  }
  if (path.startsWith("/admin")) {
    return { eventType: "page_view", dimension: "admin" };
  }

  return { eventType: "page_view", dimension: "other" };
}
