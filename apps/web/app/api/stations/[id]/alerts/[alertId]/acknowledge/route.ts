import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";

interface RouteContext {
  params: {
    id: string;
    alertId: string;
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  let body: { actorId?: string } = {};

  try {
    body = (await request.json()) as { actorId?: string };
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const { actorId } = body;

  if (!actorId || typeof actorId !== "string" || !actorId.trim()) {
    return NextResponse.json({ message: "actorId is required" }, { status: 400 });
  }

  const result = await apiClient.oceanStations.acknowledgeAlert(params.id, params.alertId, actorId.trim());

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true, alert: result.alert, timelineEvent: result.timelineEvent });
}
