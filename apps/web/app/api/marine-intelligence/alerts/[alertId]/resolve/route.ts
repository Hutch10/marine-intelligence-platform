import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";

interface RouteContext {
  params: {
    alertId: string;
  };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const sessionId = getStationAdminSessionCookie();

  if (!sessionId) {
    return NextResponse.json({ message: "Session required" }, { status: 401 });
  }

  const auth = await apiClient.stationAdminAuth.getSession(sessionId);

  if (!auth) {
    return NextResponse.json({ message: "Session required" }, { status: 401 });
  }

  if (!auth.permissions.includes("station.view_admin")) {
    return NextResponse.json({ message: "Missing permission: station.view_admin" }, { status: 403 });
  }

  const result = await apiClient.marineIntelligence.resolveAlert(params.alertId, auth);

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, alert: result.alert });
}