import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";
import { checkStationAdminOrigin } from "@/lib/api/origin-guard";

interface RegenerateBody {
  csrfToken?: unknown;
  sessionId?: unknown;
}

export async function POST(request: Request) {
  const originError = checkStationAdminOrigin(request);
  if (originError) return originError;

  let body: RegenerateBody = {};

  try {
    body = (await request.json()) as RegenerateBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken.trim() : "";
  const explicitSessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const sessionId = explicitSessionId || getStationAdminSessionCookie() || "";

  if (!sessionId || !csrfToken) {
    return NextResponse.json({ message: "sessionId and csrfToken are required" }, { status: 400 });
  }

  const result = await apiClient.stationAdminMfa.recoveryRegenerate(sessionId, csrfToken);

  if (!result.ok) {
    if (result.mfaRequired && result.challenge) {
      return NextResponse.json({ mfaRequired: true, challenge: result.challenge }, { status: 401 });
    }

    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json(
    { result: "regenerated", mfa: result.mfa, recoveryCodes: result.recoveryCodes },
    { status: 200 },
  );
}
