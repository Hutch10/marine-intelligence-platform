import { NextResponse } from "next/server";
import type { MarineWorkflowDecisionResponse } from "@marine/shared";
import {
  buildMarineIntelligenceProxyHeaders,
  requireMarineIntelligenceAdminSession,
  resolveMarineIntelligenceApiOrigin,
} from "../_utils";

interface DecisionBody {
  investigationId?: unknown;
  stationId?: unknown;
  decision?: unknown;
  rationale?: unknown;
  timestamp?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: DecisionBody = {};

  try {
    body = (await request.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const investigationId = typeof body.investigationId === "string" ? body.investigationId.trim() : "";
  const stationId = typeof body.stationId === "string" ? body.stationId.trim() : "";
  const decision = typeof body.decision === "string" ? body.decision.trim() : "";
  const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
  const timestamp = typeof body.timestamp === "string" ? body.timestamp.trim() : "";

  if (!investigationId || !stationId || !decision || !rationale || !timestamp) {
    return NextResponse.json(
      { message: "investigationId, stationId, decision, rationale, and timestamp are required" },
      { status: 400 },
    );
  }

  const origin = resolveMarineIntelligenceApiOrigin(request);

  if (!origin) {
    return NextResponse.json({ message: "Marine intelligence API origin is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(new URL("/marine-intelligence/decisions", origin), {
      method: "POST",
      headers: buildMarineIntelligenceProxyHeaders(authResult.auth, "application/json"),
      body: JSON.stringify({ investigationId, stationId, decision, rationale, timestamp }),
      cache: "no-store",
    });
    const payload = await response.json() as MarineWorkflowDecisionResponse | { message?: string };

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Marine decision request failed.",
        },
        { status: response.status || 502 },
      );
    }

    if (payload && typeof payload === "object" && "decision" in payload && payload.decision) {
      return NextResponse.json({ ok: true, decision: payload.decision });
    }
  } catch {
    return NextResponse.json({ message: "Marine decision request failed." }, { status: 502 });
  }

  return NextResponse.json({ message: "Marine decision service returned an invalid payload." }, { status: 502 });
}
