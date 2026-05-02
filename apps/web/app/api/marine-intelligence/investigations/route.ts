import { NextResponse } from "next/server";
import type { MarineWorkflowCreateInvestigationResponse } from "@marine/shared";
import {
  buildMarineIntelligenceProxyHeaders,
  requireMarineIntelligenceAdminSession,
  resolveMarineIntelligenceApiOrigin,
} from "../_utils";

interface CreateInvestigationBody {
  eventId?: unknown;
  title?: unknown;
  sourceType?: unknown;
  stationId?: unknown;
  region?: unknown;
  detectedAt?: unknown;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDetectedAt(value: unknown): string | undefined {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

export async function POST(request: Request) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: CreateInvestigationBody = {};

  try {
    body = (await request.json()) as CreateInvestigationBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const sourceType = body.sourceType === "signal" || body.sourceType === "anomaly"
    ? body.sourceType
    : undefined;
  const stationId = normalizeOptionalText(body.stationId);
  const region = normalizeOptionalText(body.region);
  const detectedAt = normalizeDetectedAt(body.detectedAt);

  if (!eventId || !title) {
    return NextResponse.json({ message: "eventId and title are required" }, { status: 400 });
  }

  const origin = resolveMarineIntelligenceApiOrigin(request);

  if (!origin) {
    return NextResponse.json({ message: "Marine intelligence API origin is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(new URL("/marine-intelligence/investigations", origin), {
      method: "POST",
      headers: buildMarineIntelligenceProxyHeaders(authResult.auth, "application/json"),
      body: JSON.stringify({
        eventId,
        title,
        ownerId: authResult.auth.actorId,
        sourceType,
        stationId,
        region,
        detectedAt,
      }),
      cache: "no-store",
    });
    const payload = await response.json() as MarineWorkflowCreateInvestigationResponse | { message?: string };

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Marine investigation request failed.",
        },
        { status: response.status || 502 },
      );
    }

    if (payload && typeof payload === "object" && "investigation" in payload && payload.investigation) {
      return NextResponse.json({ ok: true, investigation: payload.investigation });
    }
  } catch {
    return NextResponse.json({ message: "Marine investigation request failed." }, { status: 502 });
  }

  return NextResponse.json({ message: "Marine investigation service returned an invalid payload." }, { status: 502 });
}
