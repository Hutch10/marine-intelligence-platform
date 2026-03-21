import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";
import { checkStationAdminOrigin } from "@/lib/api/origin-guard";

interface VerifyEnrollBody {
  csrfToken?: unknown;
  totpCode?: unknown;
  sessionId?: unknown;
}

export async function POST(request: Request) {
  const originError = checkStationAdminOrigin(request);
  if (originError) return originError;

  let body: VerifyEnrollBody = {};

  try {
    body = (await request.json()) as VerifyEnrollBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const csrfToken = typeof body.csrfToken === "string" ? body.csrfToken.trim() : "";
  const totpCode = typeof body.totpCode === "string" ? body.totpCode.trim() : "";
  const explicitSessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const sessionId = explicitSessionId || getStationAdminSessionCookie() || "";

  if (!sessionId || !csrfToken || !totpCode) {
    return NextResponse.json({ message: "sessionId, csrfToken, and totpCode are required" }, { status: 400 });
  }

  const result = await apiClient.stationAdminMfa.enrollVerify(sessionId, csrfToken, totpCode);

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json(
    { result: "enrolled", mfa: result.mfa, recoveryCodes: result.recoveryCodes },
    { status: 200 },
  );
}
