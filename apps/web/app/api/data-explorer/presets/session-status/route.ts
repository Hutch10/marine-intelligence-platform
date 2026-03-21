import { NextResponse } from "next/server";
import { resolvePresetSessionStatus } from "../scope";

export async function GET() {
  try {
    const status = await resolvePresetSessionStatus();

    return NextResponse.json({
      ok: true,
      status,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: null,
        reason: "read_failed",
        error: "Preset session status unavailable.",
      },
      { status: 503 },
    );
  }
}
