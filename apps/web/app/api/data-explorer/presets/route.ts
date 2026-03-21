import { NextResponse } from "next/server";
import { loadDataExplorerPresets, upsertDataExplorerPreset } from "@/lib/server/data-explorer-preset-store";
import type { DataExplorerPresetFilters, DataExplorerPresetScope } from "@/lib/persistence/types";
import { resolvePresetScopeContext } from "./scope";

interface UpsertBody {
  id?: string;
  name?: string;
  scope?: DataExplorerPresetScope;
  filters?: Partial<DataExplorerPresetFilters>;
}

function toStatusCode(reason?: string): number {
  switch (reason) {
    case "validation":
      return 400;
    case "duplicate_name":
      return 409;
    case "not_found":
      return 404;
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

export async function GET(request: Request) {
  const scopeContext = await resolvePresetScopeContext(request);

  if (!scopeContext.ok) {
    return NextResponse.json(scopeContext.result, {
      status: scopeContext.status,
    });
  }

  const result = loadDataExplorerPresets(scopeContext.context);

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}

export async function POST(request: Request) {
  let body: UpsertBody = {};

  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        presets: [],
        reason: "validation",
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const scopeContext = await resolvePresetScopeContext(request, body.scope, { includeActor: true });

  if (!scopeContext.ok) {
    return NextResponse.json(scopeContext.result, {
      status: scopeContext.status,
    });
  }

  const result = upsertDataExplorerPreset({
    id: typeof body.id === "string" ? body.id : undefined,
    name: typeof body.name === "string" ? body.name : "",
    scope: body.scope,
    ownerId: scopeContext.context.ownerId,
    actor: scopeContext.context.actor,
    filters: body.filters ?? {},
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
