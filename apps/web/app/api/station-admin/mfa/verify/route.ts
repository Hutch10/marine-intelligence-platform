import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { buildStationAdminRequestMetadata } from "@/lib/api/request-metadata";
import { getStationAdminSessionCookie, setStationAdminSessionCookie } from "@/lib/api/session-cookies";
import { checkStationAdminOrigin } from "@/lib/api/origin-guard";

interface VerifyBody {
  challengeId?: unknown;
  code?: unknown;
  recoveryCode?: unknown;
  csrfToken?: unknown;
  sessionId?: unknown;
}

export async function POST(request: Request) {
  const originError = checkStationAdminOrigin(request);
  if (originError) return originError;

  let body: VerifyBody = {};

  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const recoveryCode = typeof body.recoveryCode === "string" ? body.recoveryCode.trim() : "";
  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken.trim() : "";
  const fallbackSessionId = getStationAdminSessionCookie();
  const explicitSessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const sessionId = explicitSessionId || fallbackSessionId || "";

  if (!challengeId || (!code && !recoveryCode)) {
    return NextResponse.json({ message: "challengeId and either code or recoveryCode are required" }, { status: 400 });
  }

  const requestMetadata = buildStationAdminRequestMetadata(request, "POST /api/station-admin/mfa/verify");
  const verifyResult = await apiClient.stationAdminAuth.verifyMfaChallenge(challengeId, {
    code: code || undefined,
    recoveryCode: recoveryCode || undefined,
    sessionId: sessionId || undefined,
    csrfToken: csrfToken || undefined,
    metadata: requestMetadata,
  });

  if (!verifyResult.ok) {
    if (verifyResult.error) {
      const response = NextResponse.json(verifyResult.error, { status: verifyResult.status });
      if (verifyResult.status === 429 && verifyResult.error.retryAfterSeconds) {
        response.headers.set("Retry-After", String(verifyResult.error.retryAfterSeconds));
      }

      return response;
    }

    return NextResponse.json({ message: verifyResult.message }, { status: verifyResult.status });
  }

  if (verifyResult.data.result === "issued") {
    setStationAdminSessionCookie(verifyResult.data.sessionId, verifyResult.data.expiresAt);
  }

  return NextResponse.json(verifyResult.data, { status: 200 });
}
