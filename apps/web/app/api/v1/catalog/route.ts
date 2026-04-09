import type { PublicApiRouteCatalogResponse } from "@marine/shared";
import { PUBLIC_API_ROUTE_CATALOG } from "../_catalog";
import { logApiUsageSafely, requireApiKeyAuth } from "../_auth";
import { jsonPublicApiResponse } from "../_responses";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  const payload: PublicApiRouteCatalogResponse = {
    version: "v1",
    generatedAt: new Date().toISOString(),
    routes: PUBLIC_API_ROUTE_CATALOG,
  };

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/catalog",
    statusCode: 200,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  return jsonPublicApiResponse(payload, {
    status: 200,
    rateLimit: authResult.rateLimit,
  });
}
