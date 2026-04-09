import { NextResponse } from "next/server";
import type {
  ApiKeyRecord,
  BillingAccountRecord,
  OceanStationAdminAuthContext,
  PublicApiQuotaStatus,
  PublicApiRateLimitStatus,
} from "@marine/shared";
import {
  appendPublicApiUsage,
  authenticatePublicApiKeyRequest,
  getPublicApiKeyById,
  getPublicBillingAccount,
  getPublicBillingQuotaStatus,
  recordPublicBillingUsage,
  getPublicApiRateLimitStatus,
  getPublicApiUsageSummary,
  recordPublicApiKeyLastUsed,
} from "@/lib/server/public-api-store";
import { jsonPublicApiError } from "./_responses";

interface ApiKeyAuthSuccess {
  ok: true;
  key: ApiKeyRecord;
  billingAccount: BillingAccountRecord | null;
  auth: OceanStationAdminAuthContext;
  rateLimit: PublicApiRateLimitStatus;
  quota: PublicApiQuotaStatus;
}

interface ApiKeyAuthFailure {
  ok: false;
  response: NextResponse;
}

const DEFAULT_RATE_WINDOW_SECONDS = 60;

function normalizeApiKey(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  const firstValue = rawValue.split(",")[0]?.trim() ?? "";
  return firstValue.length > 0 ? firstValue : null;
}

function buildApiKeyAuthContext(key: ApiKeyRecord): OceanStationAdminAuthContext {
  return {
    actorId: `api-key:${key.id}`,
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: `api-key:${key.prefix}`,
  };
}

export async function requireApiKeyAuth(
  request: Request,
): Promise<ApiKeyAuthSuccess | ApiKeyAuthFailure> {
  const routePath = new URL(request.url).pathname;
  const rawKey = normalizeApiKey(request.headers.get("x-api-key"));

  if (!rawKey) {
    return {
      ok: false,
      response: jsonPublicApiError(401, "api_key_required", "API key required"),
    };
  }

  const key = await authenticatePublicApiKeyRequest(rawKey);

  if (!key || key.revokedAt) {
    return {
      ok: false,
      response: jsonPublicApiError(401, "api_key_invalid", "Invalid API key"),
    };
  }

  const nowMs = Date.now();
  const billingAccount = await getPublicBillingAccount(key.billingAccountId ?? null);
  const fromMs = nowMs - (DEFAULT_RATE_WINDOW_SECONDS * 1000);
  let requestsUsed = 0;

  try {
    const usageSummary = await getPublicApiUsageSummary(key.id, fromMs, nowMs);
    requestsUsed = usageSummary?.totalRequests ?? 0;
  } catch (error) {
    console.warn("[api/v1] failed to read usage summary for rate limiting", error);
  }

  const rateLimit = await getPublicApiRateLimitStatus(key, requestsUsed, nowMs);
  const quotaState = await getPublicBillingQuotaStatus({
    key,
    billingAccount,
    nowMs,
  });

  if (requestsUsed >= rateLimit.limit) {
    const limitedStatus: PublicApiRateLimitStatus = {
      ...rateLimit,
      remaining: 0,
      requestsUsed,
    };

    await logApiUsageSafely({
      keyId: key.id,
      route: routePath,
      statusCode: 429,
      durationMs: 0,
      requestAt: nowMs,
      billable: false,
    });

    return {
      ok: false,
      response: jsonPublicApiError(
        429,
        "rate_limit_exceeded",
        `Rate limit exceeded for tier ${limitedStatus.tier}`,
        {
          retryable: true,
          rateLimit: limitedStatus,
          quota: quotaState.quota,
        },
      ),
    };
  }

  if (!quotaState.allowed) {
    await logApiUsageSafely({
      keyId: key.id,
      route: routePath,
      statusCode: 429,
      durationMs: 0,
      requestAt: nowMs,
      billable: false,
    });

    return {
      ok: false,
      response: jsonPublicApiError(
        429,
        quotaState.code ?? "quota_exceeded",
        quotaState.message ?? `Monthly quota exceeded for tier ${quotaState.quota.tier}`,
        {
          retryable: quotaState.retryable ?? false,
          rateLimit,
          quota: quotaState.quota,
        },
      ),
    };
  }

  try {
    await recordPublicApiKeyLastUsed(key.id);
  } catch (error) {
    console.warn("[api/v1] failed to record API key last-used timestamp", error);
  }

  return {
    ok: true,
    key,
    billingAccount,
    auth: buildApiKeyAuthContext(key),
    rateLimit: {
      ...rateLimit,
      requestsUsed,
      remaining: Math.max(0, rateLimit.limit - (requestsUsed + 1)),
    },
    quota: {
      ...quotaState.quota,
      requestsUsed: quotaState.quota.requestsUsed + 1,
      remainingQuota: Math.max(0, quotaState.quota.remainingQuota - 1),
    },
  };
}

export async function logApiUsageSafely(input: {
  keyId: string;
  route: string;
  statusCode: number;
  durationMs?: number | null;
  requestAt?: number;
  billable?: boolean;
}) {
  try {
    await appendPublicApiUsage(input);
  } catch (error) {
    console.warn("[api/v1] failed to append API usage log", error);
  }

  try {
    if (input.billable === false) {
      return;
    }

    const key = await getPublicApiKeyById(input.keyId);
    if (!key) {
      return;
    }

    const billingAccount = await getPublicBillingAccount(key.billingAccountId ?? null);
    await recordPublicBillingUsage({
      key,
      billingAccount,
      route: input.route,
      statusCode: input.statusCode,
      requestAt: input.requestAt,
      units: 1,
    });
  } catch (error) {
    console.warn("[api/v1] failed to append billing usage record", error);
  }
}
