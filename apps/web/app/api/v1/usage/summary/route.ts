import { NextRequest } from "next/server";
import type { PublicApiUsageSummaryResponse } from "@marine/shared";
import {
  getPublicBillingUsageSummary,
  getPublicApiUsageSummary,
  getPublicApiRateLimitStatus,
  getRecentPublicApiUsage,
} from "@/lib/server/public-api-store";
import { logApiUsageSafely, requireApiKeyAuth } from "../../_auth";
import { jsonPublicApiError, jsonPublicApiResponse } from "../../_responses";

function normalizeLimit(value: string | null): number {
  const parsed = value ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(50, Math.floor(parsed));
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  const sinceValue = request.nextUrl.searchParams.get("since");
  const sinceMs = sinceValue ? Date.parse(sinceValue) : Date.now() - (24 * 60 * 60 * 1000);

  if (sinceValue && !Number.isFinite(sinceMs)) {
    return jsonPublicApiError(400, "usage_summary_invalid_since", "since must be a valid ISO timestamp", {
      retryable: false,
      rateLimit: authResult.rateLimit,
    });
  }

  const nowMs = Date.now();
  const recentLimit = normalizeLimit(request.nextUrl.searchParams.get("limit"));
  const [summary, recentRequests, billingSummary] = await Promise.all([
    getPublicApiUsageSummary(authResult.key.id, sinceMs, nowMs),
    getRecentPublicApiUsage(authResult.key.id, sinceMs, nowMs, recentLimit),
    getPublicBillingUsageSummary({
      key: authResult.key,
      billingAccount: authResult.billingAccount,
      nowMs,
    }),
  ]);

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/usage/summary",
    statusCode: summary ? 200 : 503,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  if (!summary || !billingSummary) {
    return jsonPublicApiError(503, "usage_summary_unavailable", "Usage summary unavailable", {
      retryable: true,
      rateLimit: authResult.rateLimit,
      quota: authResult.quota,
    });
  }

  const currentRateLimit = await getPublicApiRateLimitStatus(authResult.key, authResult.rateLimit.requestsUsed, nowMs);
  const payload: PublicApiUsageSummaryResponse = {
    keyId: authResult.key.id,
    tier: authResult.key.tier,
    billingAccountId: authResult.billingAccount?.id ?? authResult.key.billingAccountId ?? null,
    window: {
      from: summary.from,
      to: summary.to,
    },
    summary: {
      totalRequests: summary.totalRequests,
      errorCount: summary.errorCount,
      averageDurationMs: summary.averageDurationMs,
      lastRequestAt: summary.lastRequestAt,
    },
    recentRouteUsage: summary.routeCounts,
    recentRequests: recentRequests ?? [],
    rateLimit: {
      ...currentRateLimit,
      remaining: authResult.rateLimit.remaining,
      requestsUsed: authResult.rateLimit.requestsUsed,
    },
    quota: authResult.quota,
    billing: billingSummary,
  };

  return jsonPublicApiResponse(payload, {
    status: 200,
    rateLimit: authResult.rateLimit,
  });
}
