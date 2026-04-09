import { NextResponse } from "next/server";
import type { PublicApiErrorResponse, PublicApiQuotaStatus, PublicApiRateLimitStatus } from "@marine/shared";

function buildRateLimitHeaders(rateLimit: PublicApiRateLimitStatus | null | undefined): Headers {
  const headers = new Headers();

  if (!rateLimit) {
    return headers;
  }

  headers.set("x-ratelimit-tier", rateLimit.tier);
  headers.set("x-ratelimit-limit", String(rateLimit.limit));
  headers.set("x-ratelimit-remaining", String(rateLimit.remaining));
  headers.set("x-ratelimit-requests-used", String(rateLimit.requestsUsed));
  headers.set("x-ratelimit-window-seconds", String(rateLimit.windowSeconds));
  headers.set("x-ratelimit-reset-at", rateLimit.resetAt);

  return headers;
}

export function buildPublicApiError(
  code: string,
  message: string,
  options: {
    retryable?: boolean;
    rateLimit?: PublicApiRateLimitStatus | null;
    quota?: PublicApiQuotaStatus | null;
  } = {},
): PublicApiErrorResponse {
  return {
    code,
    message,
    retryable: options.retryable ?? false,
    ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
    ...(options.quota ? { quota: options.quota } : {}),
  };
}

export function jsonPublicApiError(
  status: number,
  code: string,
  message: string,
  options: {
    retryable?: boolean;
    rateLimit?: PublicApiRateLimitStatus | null;
    quota?: PublicApiQuotaStatus | null;
  } = {},
) {
  return NextResponse.json(
    buildPublicApiError(code, message, options),
    {
      status,
      headers: buildRateLimitHeaders(options.rateLimit),
    },
  );
}

export function jsonPublicApiResponse<T>(
  body: T,
  options: {
    status?: number;
    rateLimit?: PublicApiRateLimitStatus | null;
  } = {},
) {
  return NextResponse.json(body, {
    status: options.status ?? 200,
    headers: buildRateLimitHeaders(options.rateLimit),
  });
}
