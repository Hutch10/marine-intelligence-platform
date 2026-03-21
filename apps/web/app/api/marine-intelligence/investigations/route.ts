import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";

interface CreateInvestigationBody {
  eventId?: unknown;
  title?: unknown;
}

export async function POST(request: Request) {
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

  let body: CreateInvestigationBody = {};

  try {
    body = (await request.json()) as CreateInvestigationBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!eventId || !title) {
    return NextResponse.json({ message: "eventId and title are required" }, { status: 400 });
  }

  const result = await apiClient.marineIntelligence.createInvestigation(
    { eventId, title, ownerId: auth.actorId },
    auth,
  );

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, investigation: result.investigation });
}