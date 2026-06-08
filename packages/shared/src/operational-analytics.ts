/**
 * Privacy-first operational analytics — aggregate counts only.
 * No accounts, sessions, IPs, or resource identifiers.
 */

export const OPERATIONAL_ANALYTICS_EVENT_TYPES = [
  "page_view",
  "investigation_open",
  "lineage_open",
  "export",
  "operator_usage",
] as const;

export type OperationalAnalyticsEventType = (typeof OPERATIONAL_ANALYTICS_EVENT_TYPES)[number];

export interface OperationalAnalyticsRecordRequest {
  eventType: OperationalAnalyticsEventType;
  /** Coarse bucket only (e.g. dashboard, scientific_csv). Never an id or station. */
  dimension?: string;
  surface?: "web" | "api";
}

export interface OperationalAnalyticsDailyBucket {
  day: string;
  eventType: OperationalAnalyticsEventType;
  dimension: string;
  count: number;
}

export interface OperationalAnalyticsSummary {
  generatedAt: string;
  privacy: {
    accounts: false;
    personalIdentifiers: false;
    advertisingAnalytics: false;
    aggregation: "daily_counts_only";
    note: string;
  };
  totalsByEventType: Record<OperationalAnalyticsEventType, number>;
  last30Days: OperationalAnalyticsDailyBucket[];
}
