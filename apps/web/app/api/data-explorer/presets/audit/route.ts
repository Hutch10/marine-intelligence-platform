import { NextResponse } from "next/server";
import { listPresetAuditEvents } from "@/lib/server/data-explorer-preset-store";
import { resolvePresetScopeContext } from "../scope";

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

  const url = new URL(request.url);
  const presetId = url.searchParams.get("presetId") ?? undefined;
  const actorId = url.searchParams.get("actorId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const limit = parseLimit(url.searchParams.get("limit"));

  const result = listPresetAuditEvents({
    scope: scopeContext.context.scope,
    ownerId: scopeContext.context.ownerId,
    presetId,
    actorId,
    action,
    limit,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
