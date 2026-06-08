import { NextResponse } from "next/server";
import {
  OPERATIONAL_ANALYTICS_EVENT_TYPES,
  type OperationalAnalyticsEventType,
} from "@marine/shared";
import { recordOperationalAnalytics } from "@/lib/server/record-operational-analytics";

const ALLOWED_DIMENSIONS: Record<OperationalAnalyticsEventType, Set<string> | null> = {
  page_view: new Set([
    "dashboard",
    "investigations_list",
    "investigation_detail",
    "operational_alerts",
    "operator",
    "operator_lineage",
    "replay",
    "about",
    "risk",
    "region_risk",
    "admin",
    "other",
  ]),
  investigation_open: null,
  lineage_open: new Set(["form_view", "lookup"]),
  export: new Set([
    "scientific_csv",
    "scientific_json",
    "explorer_csv",
    "explorer_json",
    "explorer_observations",
  ]),
  operator_usage: new Set(["console", "lineage", "status_fetch"]),
};

const FORBIDDEN_KEYS = /^(user|session|investigation|record|station|email|ip|client|fingerprint)/i;

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_KEYS.test(key)) {
      return NextResponse.json({ message: `Field ${key} is not permitted` }, { status: 400 });
    }
  }

  const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
  if (!OPERATIONAL_ANALYTICS_EVENT_TYPES.includes(eventType as OperationalAnalyticsEventType)) {
    return NextResponse.json({ message: "eventType is invalid" }, { status: 400 });
  }

  const typedEvent = eventType as OperationalAnalyticsEventType;
  const dimension = typeof body.dimension === "string"
    ? body.dimension.trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 64)
    : "";

  const allowed = ALLOWED_DIMENSIONS[typedEvent];
  if (allowed) {
    if (!dimension || !allowed.has(dimension)) {
      return NextResponse.json({ message: "dimension is invalid" }, { status: 400 });
    }
  } else if (dimension) {
    return NextResponse.json({ message: "dimension is not allowed for this event type" }, { status: 400 });
  }

  await recordOperationalAnalytics({
    eventType: typedEvent,
    ...(dimension ? { dimension } : {}),
    surface: "web",
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
