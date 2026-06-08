import type { OperationalAnalyticsRecordRequest } from "@marine/shared";

function resolveMarineApiBaseUrl(): string {
  const configured = process.env.MARINE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MARINE_API_BASE_URL is not configured");
    }
    return "http://localhost:4000";
  }
  return configured;
}

/**
 * Server-side only — records aggregate operational analytics (no identifiers).
 */
export async function recordOperationalAnalytics(
  input: OperationalAnalyticsRecordRequest,
): Promise<void> {
  const recordKey = process.env.OPERATIONAL_ANALYTICS_RECORD_KEY?.trim();
  if (process.env.NODE_ENV === "production" && !recordKey) {
    return;
  }

  const base = resolveMarineApiBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (recordKey) {
    headers["x-operational-analytics-key"] = recordKey;
  }

  try {
    await fetch(`${base}/internal/operational-analytics/record`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        eventType: input.eventType,
        ...(input.dimension ? { dimension: input.dimension } : {}),
        surface: input.surface ?? "web",
      }),
      cache: "no-store",
    });
  } catch {
    // Analytics must never break pages or exports.
  }
}

export async function fetchOperationalAnalyticsSummary() {
  const base = resolveMarineApiBaseUrl();
  const token = process.env.OPERATOR_ACCESS_TOKEN?.trim();
  const url = new URL(`${base}/internal/operator/analytics`);
  if (token) {
    url.searchParams.set("token", token);
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  return response.json();
}
