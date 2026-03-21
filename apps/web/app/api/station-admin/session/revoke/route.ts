import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { buildStationAdminRequestMetadata } from "@/lib/api/request-metadata";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";
import { checkStationAdminOrigin } from "@/lib/api/origin-guard";

interface RevokeBody {
  csrfToken?: unknown;
  targetSessionId?: unknown;
}

export async function POST(request: Request) {
  const originError = checkStationAdminOrigin(request);
  if (originError) return originError;

  const sessionId = getStationAdminSessionCookie();

  if (!sessionId) {
    return NextResponse.json({ message: "Session required" }, { status: 401 });
  }

  let body: RevokeBody = {};

  try {
    body = (await request.json()) as RevokeBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken.trim() : "";
  const targetSessionId = typeof body.targetSessionId === "string"
    ? body.targetSessionId.trim()
    : "";

  if (!csrfToken || !targetSessionId) {
    return NextResponse.json({ message: "csrfToken and targetSessionId are required" }, { status: 400 });
  }

  const requestMetadata = buildStationAdminRequestMetadata(request, "POST /api/station-admin/session/revoke");
  const revoked = await apiClient.stationAdminAuth.revokeSession(
    sessionId,
    csrfToken,
    targetSessionId,
    requestMetadata,
  );

  if (!revoked.ok) {
    if (revoked.mfaRequired) {
      return NextResponse.json(
        {
          mfaRequired: true,
          challenge: revoked.challenge,
        },
        { status: 401 },
      );
    }

    return NextResponse.json({ message: revoked.message }, { status: revoked.status || 403 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
