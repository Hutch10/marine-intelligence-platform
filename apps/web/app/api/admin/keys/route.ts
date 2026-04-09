import { NextResponse } from "next/server";
import { generatePublicApiKey } from "@/lib/server/public-api-store";
import { requireMarineIntelligenceAdminSession } from "../../marine-intelligence/_utils";
import { buildPublicApiError } from "../../v1/_responses";

interface CreateApiKeyBody {
  name?: unknown;
  tier?: unknown;
  billingAccountId?: unknown;
}

const VALID_TIERS = new Set(["free", "pro", "enterprise"]);

export async function POST(request: Request) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: CreateApiKeyBody = {};

  try {
    body = (await request.json()) as CreateApiKeyBody;
  } catch {
    return NextResponse.json(buildPublicApiError("invalid_json", "Invalid JSON body"), { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const tier = typeof body.tier === "string" ? body.tier.trim() : "";
  const billingAccountId = typeof body.billingAccountId === "string" ? body.billingAccountId.trim() : "";

  if (!name) {
    return NextResponse.json(buildPublicApiError("api_key_name_required", "name is required"), { status: 400 });
  }

  if (!tier) {
    return NextResponse.json(buildPublicApiError("api_key_tier_required", "tier is required"), { status: 400 });
  }

  if (!VALID_TIERS.has(tier)) {
    return NextResponse.json(buildPublicApiError("api_key_tier_invalid", "tier is invalid"), { status: 400 });
  }

  const provisioned = await generatePublicApiKey({
    name,
    tier,
    billingAccountId: billingAccountId || null,
  });

  if (!provisioned.ok) {
    return NextResponse.json(
      buildPublicApiError("api_key_storage_unavailable", provisioned.message, { retryable: true }),
      { status: 503 },
    );
  }

  console.info("[api/admin/keys] provisioned API key", {
    actorId: authResult.auth.actorId,
    keyId: provisioned.key.id,
    tier: provisioned.key.tier,
  });

  return NextResponse.json(
    {
      keyId: provisioned.key.id,
      prefix: provisioned.key.prefix,
      rawKey: provisioned.rawKey,
      tier: provisioned.key.tier,
      billingAccountId: provisioned.key.billingAccountId ?? null,
    },
    { status: 201 },
  );
}
