import { NextResponse } from "next/server";
import type {
  MarineWorkflowTelemetryEventRequest,
  MarineWorkflowTelemetryEventResponse,
} from "@marine/shared";
import {
  buildMarineIntelligenceProxyHeaders,
  requireMarineIntelligenceAdminSession,
  resolveMarineIntelligenceApiOrigin,
} from "../_utils";

function isTelemetryEventType(value: unknown): value is MarineWorkflowTelemetryEventRequest["eventType"] {
  return value === "view" || value === "click" || value === "submit_decision";
}

interface TelemetryBody {
  eventType?: unknown;
  investigationId?: unknown;
  stationId?: unknown;
  decisionId?: unknown;
  timestamp?: unknown;
  details?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: TelemetryBody = {};

  try {
    body = (await request.json()) as TelemetryBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  if (!isTelemetryEventType(body.eventType)) {
    return NextResponse.json({ message: "eventType is invalid" }, { status: 400 });
  }

  const timestamp = typeof body.timestamp === "string" ? body.timestamp.trim() : "";

  if (!timestamp) {
    return NextResponse.json({ message: "timestamp is required" }, { status: 400 });
  }

  const origin = resolveMarineIntelligenceApiOrigin(request);

  if (!origin) {
    return NextResponse.json({ message: "Marine intelligence API origin is not configured." }, { status: 503 });
  }

  const payloadBody: MarineWorkflowTelemetryEventRequest = {
    eventType: body.eventType,
    timestamp,
    ...(typeof body.investigationId === "string" && body.investigationId.trim()
      ? { investigationId: body.investigationId.trim() }
      : {}),
    ...(typeof body.stationId === "string" && body.stationId.trim()
      ? { stationId: body.stationId.trim() }
      : {}),
    ...(typeof body.decisionId === "string" && body.decisionId.trim()
      ? { decisionId: body.decisionId.trim() }
      : {}),
    ...(typeof body.details === "string" && body.details.trim()
      ? { details: body.details.trim() }
      : {}),
  };

  try {
    const response = await fetch(new URL("/marine-intelligence/telemetry", origin), {
      method: "POST",
      headers: buildMarineIntelligenceProxyHeaders(authResult.auth, "application/json"),
      body: JSON.stringify(payloadBody),
      cache: "no-store",
    });
    const payload = await response.json() as MarineWorkflowTelemetryEventResponse | { message?: string };

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Marine telemetry request failed.",
        },
        { status: response.status || 502 },
      );
    }

    if (payload && typeof payload === "object" && "event" in payload && payload.event) {
      return NextResponse.json({ ok: true, event: payload.event });
    }
  } catch {
    return NextResponse.json({ message: "Marine telemetry request failed." }, { status: 502 });
  }

  return NextResponse.json({ message: "Marine telemetry service returned an invalid payload." }, { status: 502 });
}
