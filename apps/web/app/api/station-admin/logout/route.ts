import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { buildStationAdminRequestMetadata } from "@/lib/api/request-metadata";
import {
  clearStationAdminSessionCookie,
  getStationAdminSessionCookie,
} from "@/lib/api/session-cookies";
import { checkStationAdminOrigin } from "@/lib/api/origin-guard";

interface LogoutBody {
  csrfToken?: unknown;
}

export async function POST(request: Request) {
  const originError = checkStationAdminOrigin(request);
  if (originError) return originError;

  const sessionId = getStationAdminSessionCookie();

  if (!sessionId) {
    clearStationAdminSessionCookie();
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  let body: LogoutBody = {};

  try {
    body = (await request.json()) as LogoutBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken.trim() : "";

  if (!csrfToken) {
    return NextResponse.json({ message: "csrfToken is required" }, { status: 400 });
  }

  const requestMetadata = buildStationAdminRequestMetadata(request, "POST /api/station-admin/logout");
  const didLogout = await apiClient.stationAdminAuth.logout(sessionId, csrfToken, requestMetadata);

  if (!didLogout) {
    return NextResponse.json({ message: "Session not found or CSRF invalid" }, { status: 403 });
  }

  clearStationAdminSessionCookie();

  return NextResponse.json({ ok: true }, { status: 200 });
}
