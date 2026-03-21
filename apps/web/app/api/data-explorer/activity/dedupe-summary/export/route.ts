import { NextResponse } from "next/server";
import {
  executeDataExplorerDedupeExport,
  parseDataExplorerDedupeExportQuery,
} from "@/lib/server/data-explorer-dedupe-export-service";
import { resolvePresetScopeContext } from "../../../presets/scope";

export async function GET(request: Request) {
  const scopeContext = await resolvePresetScopeContext(request, undefined, { includeActor: true });

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

  const parseResult = parseDataExplorerDedupeExportQuery(new URL(request.url));

  if (!parseResult.ok) {
    return NextResponse.json(parseResult.payload, { status: parseResult.status });
  }

  const result = executeDataExplorerDedupeExport({
    scope: scopeContext.context.scope ?? "shared",
    ownerId: scopeContext.context.ownerId,
    actor: scopeContext.context.actor,
    query: parseResult.query,
  });

  if (!result.ok) {
    return NextResponse.json(result.payload, { status: result.status });
  }

  return new NextResponse(result.content, {
    status: result.status,
    headers: {
      "content-type": result.contentType,
      "content-disposition": `attachment; filename="${result.filename}"`,
      "cache-control": "no-store",
    },
  });
}
