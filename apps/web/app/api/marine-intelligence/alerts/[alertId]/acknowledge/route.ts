import { NextResponse } from "next/server";
import type { MarineWorkflowAlertActionResponse } from "@marine/shared";
import {
  buildMarineIntelligenceProxyHeaders,
  requireMarineIntelligenceAdminSession,
  resolveMarineIntelligenceApiOrigin,
} from "../../../_utils";

interface RouteContext {
  params: {
    alertId: string;
  };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  const origin = resolveMarineIntelligenceApiOrigin(_request);

  if (!origin) {
    return NextResponse.json({ message: "Marine intelligence API origin is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(new URL(`/marine-intelligence/alerts/${encodeURIComponent(params.alertId)}/acknowledge`, origin), {
      method: "POST",
      headers: buildMarineIntelligenceProxyHeaders(authResult.auth, "application/json"),
      body: JSON.stringify({ alertId: params.alertId }),
      cache: "no-store",
    });
    const payload = await response.json() as MarineWorkflowAlertActionResponse | { message?: string };

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Marine alert request failed.",
        },
        { status: response.status || 502 },
      );
    }

    if (payload && typeof payload === "object" && "alert" in payload && payload.alert) {
      return NextResponse.json({ ok: true, alert: payload.alert });
    }
  } catch {
    return NextResponse.json({ message: "Marine alert request failed." }, { status: 502 });
  }

  return NextResponse.json({ message: "Marine alert service returned an invalid payload." }, { status: 502 });
}
