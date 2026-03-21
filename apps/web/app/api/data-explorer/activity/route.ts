import { NextResponse } from "next/server";
import {
  appendDataExplorerBehaviorEvent,
  listDataExplorerBehaviorEvents,
} from "@/lib/server/data-explorer-preset-store";
import type { DataExplorerBehaviorEventType, DataExplorerPresetScope } from "@/lib/persistence/types";
import { resolvePresetScopeContext } from "../presets/scope";

interface ActivityBody {
  eventType?: DataExplorerBehaviorEventType;
  scope?: DataExplorerPresetScope;
  presetId?: string;
  presetName?: string;
  datasetId?: string;
  datasetName?: string;
  sourceContext?: unknown;
}

const ALLOWED_EVENT_TYPES: DataExplorerBehaviorEventType[] = [
  "preset_applied",
  "dataset_selected",
  "dataset_detail_viewed",
];

function toStatusCode(reason?: string): number {
  switch (reason) {
    case "validation":
      return 400;
    case "read_failed":
    case "write_failed":
    case "storage_unavailable":
    case "invalid_schema":
    case "corrupt_json":
    case "unsupported_version":
      return 503;
    default:
      return 500;
  }
}

function isBehaviorEventType(value: unknown): value is DataExplorerBehaviorEventType {
  return typeof value === "string" && ALLOWED_EVENT_TYPES.includes(value as DataExplorerBehaviorEventType);
}

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function sanitizeSourceContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const allowedKeys = ["surface", "interaction", "listSource", "detailSource", "listDelivery", "detailDelivery"];
  const context: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    const entry = candidate[key];

    if (typeof entry === "string" && entry.trim()) {
      context[key] = entry.trim();
    }
  }

  return Object.keys(context).length > 0 ? context : undefined;
}

export async function GET(request: Request) {
  const scopeContext = await resolvePresetScopeContext(request);

  if (!scopeContext.ok) {
    return NextResponse.json(
      {
        ok: false,
        events: [],
        reason: "validation",
        error: scopeContext.result.error,
      },
      { status: scopeContext.status },
    );
  }

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  const result = listDataExplorerBehaviorEvents({
    scope: scopeContext.context.scope,
    ownerId: scopeContext.context.ownerId,
    limit,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}

export async function POST(request: Request) {
  let body: ActivityBody = {};

  try {
    body = (await request.json()) as ActivityBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        reason: "validation",
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  if (!isBehaviorEventType(body.eventType)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "validation",
        error: "Behavior event type is required.",
      },
      { status: 400 },
    );
  }

  const scopeContext = await resolvePresetScopeContext(request, body.scope, { includeActor: true });

  if (!scopeContext.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: "validation",
        error: scopeContext.result.error,
      },
      { status: scopeContext.status },
    );
  }

  const result = appendDataExplorerBehaviorEvent({
    eventType: body.eventType,
    scope: scopeContext.context.scope,
    ownerId: scopeContext.context.ownerId,
    actor: scopeContext.context.actor,
    actorLabel: scopeContext.context.actor?.actorId ?? "Unknown actor",
    presetId: body.presetId,
    presetName: body.presetName,
    datasetId: body.datasetId,
    datasetName: body.datasetName,
    sourceContext: {
      surface: "data-explorer-workspace",
      ...sanitizeSourceContext(body.sourceContext),
    },
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
