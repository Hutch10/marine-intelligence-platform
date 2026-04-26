import { NextResponse } from "next/server";

export async function GET(_request: Request) {
  return NextResponse.json(
    { error: { code: "usage_summary_unavailable", message: "Usage summary is disabled in this deployment." } },
    { status: 503 }
  );
}
