import { NextRequest } from "next/server";
import { requireApiKeyAuth } from "../../_auth";
import { jsonPublicApiResponse } from "../../_responses";
import {
  getPublicApiUsageSummary,
  getRecentPublicApiUsage,
  getPublicBillingUsageSummary,
} from "@/lib/server/public-api-store";

const SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECENT_LIMIT = 10;

export async function GET(request: NextRequest) {
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  const { key, billingAccount, rateLimit, quota } = authResult;
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_RECENT_LIMIT), 10) || DEFAULT_RECENT_LIMIT),
    100,
  );

  const nowMs = Date.now();
  const fromMs = nowMs - SUMMARY_WINDOW_MS;

  const [summary, recentRequests, billing] = await Promise.all([
    getPublicApiUsageSummary(key.id, fromMs, nowMs),
    getRecentPublicApiUsage(key.id, fromMs, nowMs, limit),
    getPublicBillingUsageSummary({ key, billingAccount }),
  ]);

  return jsonPublicApiResponse(
    {
      keyId: key.id,
      tier: rateLimit.tier,
      billingAccountId: key.billingAccountId ?? null,
      summary,
      recentRouteUsage: summary?.routeCounts ?? [],
      recentRequests: recentRequests ?? [],
      rateLimit,
      quota,
      billing,
    },
    { rateLimit },
  );
}
