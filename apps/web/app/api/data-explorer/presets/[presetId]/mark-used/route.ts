import { NextResponse } from "next/server";
import { markDataExplorerPresetUsed } from "@/lib/server/data-explorer-preset-store";
import { resolvePresetScopeContext } from "../../scope";

function toStatusCode(reason?: string): number {
  switch (reason) {
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

export async function POST(
  request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  const { presetId } = await context.params;

  if (!presetId) {
    return NextResponse.json(
      {
        ok: false,
        presets: [],
        reason: "validation",
        error: "Preset id is required.",
      },
      { status: 400 },
    );
  }

  const scopeContext = await resolvePresetScopeContext(request, undefined, { includeActor: true });

  if (!scopeContext.ok) {
    return NextResponse.json(scopeContext.result, {
      status: scopeContext.status,
    });
  }

  const result = markDataExplorerPresetUsed(presetId, scopeContext.context);

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
