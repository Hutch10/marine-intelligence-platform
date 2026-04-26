import { NextResponse } from "next/server";
import { requireMarineIntelligenceAdminSession } from "../../marine-intelligence/_utils";

export async function POST(request: Request) {
  void request;
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }
  return NextResponse.json(
    {
      code: "api_key_admin_disabled",
      message: "Admin API key provisioning is disabled in this deployment.",
      retryable: false,
    },
    { status: 503 },
  );
}
