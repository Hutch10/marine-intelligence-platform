import { NextResponse } from "next/server";
import type {
  MarineWorkflowFeedbackRequest,
  MarineWorkflowFeedbackResponse,
} from "@marine/shared";
import {
  buildMarineIntelligenceProxyHeaders,
  requireMarineIntelligenceAdminSession,
  resolveMarineIntelligenceApiOrigin,
} from "../_utils";

interface FeedbackBody {
  useful?: unknown;
  note?: unknown;
  investigationId?: unknown;
  stationId?: unknown;
  decisionId?: unknown;
  evaluationId?: unknown;
  signalSnapshot?: unknown;
  timestamp?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: FeedbackBody = {};

  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.useful !== "boolean") {
    return NextResponse.json({ message: "useful must be a boolean" }, { status: 400 });
  }

  const timestamp = typeof body.timestamp === "string" ? body.timestamp.trim() : "";

  if (!timestamp) {
    return NextResponse.json({ message: "timestamp is required" }, { status: 400 });
  }

  const origin = resolveMarineIntelligenceApiOrigin(request);

  if (!origin) {
    return NextResponse.json({ message: "Marine intelligence API origin is not configured." }, { status: 503 });
  }

  const payloadBody: MarineWorkflowFeedbackRequest = {
    useful: body.useful,
    timestamp,
    ...(typeof body.note === "string" && body.note.trim() ? { note: body.note.trim() } : {}),
    ...(typeof body.investigationId === "string" && body.investigationId.trim()
      ? { investigationId: body.investigationId.trim() }
      : {}),
    ...(typeof body.stationId === "string" && body.stationId.trim()
      ? { stationId: body.stationId.trim() }
      : {}),
    ...(typeof body.decisionId === "string" && body.decisionId.trim()
      ? { decisionId: body.decisionId.trim() }
      : {}),
    ...(typeof body.evaluationId === "string" && body.evaluationId.trim()
      ? { evaluationId: body.evaluationId.trim() }
      : {}),
    ...(Array.isArray(body.signalSnapshot)
      ? {
          signalSnapshot: body.signalSnapshot
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        }
      : {}),
  };

  try {
    const response = await fetch(new URL("/marine-intelligence/feedback", origin), {
      method: "POST",
      headers: buildMarineIntelligenceProxyHeaders(authResult.auth, "application/json"),
      body: JSON.stringify(payloadBody),
      cache: "no-store",
    });
    const payload = await response.json() as MarineWorkflowFeedbackResponse | { message?: string };

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Marine feedback request failed.",
        },
        { status: response.status || 502 },
      );
    }

    if (payload && typeof payload === "object" && "feedback" in payload && payload.feedback) {
      return NextResponse.json({ ok: true, feedback: payload.feedback });
    }
  } catch {
    return NextResponse.json({ message: "Marine feedback request failed." }, { status: 502 });
  }

  return NextResponse.json({ message: "Marine feedback service returned an invalid payload." }, { status: 502 });
}
