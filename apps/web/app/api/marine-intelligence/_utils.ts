import { NextResponse } from "next/server";
import type { OceanStationAdminAuthContext } from "@marine/shared";
import { apiClient } from "@/lib/api/client";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";

function trimHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const firstValue = value.split(",")[0]?.trim() ?? "";
  return firstValue || null;
}

export function resolveMarineIntelligenceApiOrigin(request: Request): string | null {
  const configuredOrigin = process.env.MARINE_API_BASE_URL?.trim().replace(/\/$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedOrigin = trimHeaderValue(request.headers.get("x-marine-api-origin"));

  if (forwardedOrigin) {
    return forwardedOrigin.replace(/\/$/, "");
  }

  return null;
}

export async function requireMarineIntelligenceAdminSession(): Promise<
  | { ok: true; auth: OceanStationAdminAuthContext }
  | { ok: false; response: NextResponse<{ message: string }> }
> {
  const sessionId = getStationAdminSessionCookie();

  if (!sessionId) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Session required" }, { status: 401 }),
    };
  }

  const auth = await apiClient.stationAdminAuth.getSession(sessionId);

  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Session required" }, { status: 401 }),
    };
  }

  if (!auth.permissions.includes("station.view_admin")) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Missing permission: station.view_admin" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, auth };
}

export function buildMarineIntelligenceProxyHeaders(
  auth: OceanStationAdminAuthContext | undefined,
  contentType?: string,
): HeadersInit {
  const internalApiKey = process.env.MARINE_INTERNAL_API_KEY?.trim();

  return {
    Accept: "application/json",
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(internalApiKey ? { "X-API-Key": internalApiKey } : {}),
    ...(auth
      ? {
          "x-marine-actor-id": auth.actorId,
          "x-marine-csrf-token": auth.csrfToken,
          "x-marine-role": auth.role,
          "x-marine-permissions": auth.permissions.join(","),
        }
      : {}),
  };
}
