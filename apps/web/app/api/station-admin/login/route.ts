import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { buildStationAdminRequestMetadata } from "@/lib/api/request-metadata";
import { setStationAdminSessionCookie } from "@/lib/api/session-cookies";
import { checkStationAdminOrigin } from "@/lib/api/origin-guard";

interface LoginBody {
  actorId?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const originError = checkStationAdminOrigin(request);
  if (originError) return originError;

  let body: LoginBody = {};

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const actorId = typeof body.actorId === "string" ? body.actorId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!actorId || !password) {
    return NextResponse.json({ message: "actorId and password are required" }, { status: 400 });
  }

  const requestMetadata = buildStationAdminRequestMetadata(request, "POST /api/station-admin/login");
  const loginResult = await apiClient.stationAdminAuth.login(actorId, password, requestMetadata);

  if (!loginResult.ok) {
    return NextResponse.json({ message: loginResult.message }, { status: loginResult.status });
  }

  if ("result" in loginResult.data && loginResult.data.result === "pending_mfa") {
    return NextResponse.json(
      {
        result: "pending_mfa",
        actorId: loginResult.data.actorId,
        role: loginResult.data.role,
        challenge: loginResult.data.challenge,
        mfa: loginResult.data.mfa,
      },
      { status: 202 },
    );
  }

  if (!("sessionId" in loginResult.data)) {
    return NextResponse.json({ message: "Authentication failed" }, { status: 401 });
  }

  setStationAdminSessionCookie(loginResult.data.sessionId, loginResult.data.expiresAt);

  return NextResponse.json(
    {
      actorId: loginResult.data.actorId,
      role: loginResult.data.role,
      permissions: loginResult.data.permissions,
      csrfToken: loginResult.data.csrfToken,
      expiresAt: loginResult.data.expiresAt,
      mfa: loginResult.data.mfa,
    },
    { status: 200 },
  );
}
