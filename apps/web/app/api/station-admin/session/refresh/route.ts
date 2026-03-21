import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { buildStationAdminRequestMetadata } from "@/lib/api/request-metadata";
import {
  clearStationAdminSessionCookie,
  getStationAdminSessionCookie,
  setStationAdminSessionCookie,
} from "@/lib/api/session-cookies";
import { checkStationAdminOrigin } from "@/lib/api/origin-guard";

interface RefreshBody {
  csrfToken?: unknown;
}

export async function POST(request: Request) {
  const originError = checkStationAdminOrigin(request);
  if (originError) return originError;

  const sessionId = getStationAdminSessionCookie();

  if (!sessionId) {
    return NextResponse.json({ message: "Session required" }, { status: 401 });
  }

  let body: RefreshBody = {};

  try {
    body = (await request.json()) as RefreshBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken.trim() : "";

  if (!csrfToken) {
    return NextResponse.json({ message: "csrfToken is required" }, { status: 400 });
  }

  const requestMetadata = buildStationAdminRequestMetadata(request, "POST /api/station-admin/session/refresh");
  const refreshed = await apiClient.stationAdminAuth.refreshSession(sessionId, csrfToken, requestMetadata);

  if (!refreshed) {
    clearStationAdminSessionCookie();
    return NextResponse.json({ message: "Session expired or CSRF invalid" }, { status: 403 });
  }

  setStationAdminSessionCookie(refreshed.sessionId, refreshed.expiresAt);

  return NextResponse.json(
    {
      csrfToken: refreshed.csrfToken,
      expiresAt: refreshed.expiresAt,
    },
    { status: 200 },
  );
}
