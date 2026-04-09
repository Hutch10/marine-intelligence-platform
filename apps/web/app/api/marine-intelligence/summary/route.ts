import { NextResponse } from "next/server";
import type { MarineWorkflowDecisionSummaryResponse } from "@marine/shared";
import {
  buildMarineIntelligenceProxyHeaders,
  requireMarineIntelligenceAdminSession,
  resolveMarineIntelligenceApiOrigin,
} from "../_utils";

export async function GET(request: Request) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  const origin = resolveMarineIntelligenceApiOrigin(request);

  if (!origin) {
    return NextResponse.json({ message: "Marine intelligence API origin is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(new URL("/marine-intelligence/summary", origin), {
      method: "GET",
      headers: buildMarineIntelligenceProxyHeaders(authResult.auth),
      cache: "no-store",
    });
    const payload = await response.json() as MarineWorkflowDecisionSummaryResponse | { message?: string };

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Marine metrics request failed.",
        },
        { status: response.status || 502 },
      );
    }

    if (payload && typeof payload === "object" && "summary" in payload && payload.summary) {
      return NextResponse.json(payload);
    }
  } catch {
    return NextResponse.json({ message: "Marine metrics request failed." }, { status: 502 });
  }

  return NextResponse.json({ message: "Marine metrics service returned an invalid payload." }, { status: 502 });
}
