import { NextResponse } from "next/server";
import type { SimilarInvestigationsResponse } from "@marine/shared";
import {
  DEMO_SIMILAR_INVESTIGATIONS,
  isInvestigationsDemoMode,
} from "@/lib/investigations/demo-mode";
import {
  buildMarineIntelligenceProxyHeaders,
  resolveMarineIntelligenceApiOrigin,
} from "../../_utils";

function buildEmptyPayload(queryId: string): SimilarInvestigationsResponse {
  return {
    investigations: [],
    queryId,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const investigationId = searchParams.get("id")?.trim() ?? "";
  const demoMode = isInvestigationsDemoMode(searchParams.get("demo") ?? undefined);
  const origin = resolveMarineIntelligenceApiOrigin(request);

  if (!investigationId) {
    return NextResponse.json(buildEmptyPayload(""));
  }

  if (demoMode) {
    return NextResponse.json({
      investigations: DEMO_SIMILAR_INVESTIGATIONS,
      queryId: investigationId,
      generatedAt: new Date().toISOString(),
    } satisfies SimilarInvestigationsResponse);
  }

  if (!origin) {
    return NextResponse.json(
      { message: "Similarity service origin is not configured." },
      { status: 503 },
    );
  }

  const upstreamUrl = new URL("/investigations/similar", origin);
  upstreamUrl.searchParams.set("id", investigationId);

  const k = searchParams.get("k")?.trim();
  const stationId = searchParams.get("stationId")?.trim();
  const windowDays = searchParams.get("windowDays")?.trim();

  if (k) {
    upstreamUrl.searchParams.set("k", k);
  }

  if (stationId) {
    upstreamUrl.searchParams.set("stationId", stationId);
  }

  if (windowDays) {
    upstreamUrl.searchParams.set("windowDays", windowDays);
  }

  try {
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: buildMarineIntelligenceProxyHeaders(undefined),
      cache: "no-store",
    });
    const payload = await response.json() as SimilarInvestigationsResponse | { message?: string };

    if (!response.ok) {
      return NextResponse.json(
        { message: "Similarity service request failed." },
        { status: response.status || 502 },
      );
    }

    if (
      payload
      && typeof payload === "object"
      && Array.isArray((payload as SimilarInvestigationsResponse).investigations)
      && typeof (payload as SimilarInvestigationsResponse).queryId === "string"
      && typeof (payload as SimilarInvestigationsResponse).generatedAt === "string"
    ) {
      return NextResponse.json(payload);
    }
  } catch {
    return NextResponse.json(
      { message: "Similarity service request failed." },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { message: "Similarity service returned an invalid payload." },
    { status: 502 },
  );
}
