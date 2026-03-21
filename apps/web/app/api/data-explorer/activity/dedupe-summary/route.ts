import { NextResponse } from "next/server";
import { listDataExplorerBehaviorDedupeDropSummary } from "@/lib/server/data-explorer-preset-store";
import { resolvePresetScopeContext } from "../../presets/scope";

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

function parseInteger(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}

export async function GET(request: Request) {
  const scopeContext = await resolvePresetScopeContext(request);

  if (!scopeContext.ok) {
    return NextResponse.json(
      {
        ok: false,
        summary: [],
        windowMinutes: 60,
        reason: "validation",
        error: scopeContext.result.error,
      },
      { status: scopeContext.status },
    );
  }

  const url = new URL(request.url);
  const windowMinutes = parseInteger(url.searchParams.get("windowMinutes"));
  const limit = parseInteger(url.searchParams.get("limit"));

  const result = listDataExplorerBehaviorDedupeDropSummary({
    scope: scopeContext.context.scope,
    ownerId: scopeContext.context.ownerId,
    windowMinutes,
    limit,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
