import { NextResponse } from "next/server";
import { getInvestigationById, setInvestigationOutcome } from "@/lib/server/investigations";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const investigation = await getInvestigationById(params.id);
  if (!investigation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ investigation });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const allowed = ["confirmed", "false_positive", "inconclusive", null];
  const { outcome } = typeof body === 'object' && body !== null ? (body as { outcome?: unknown }) : {};
  if (!allowed.includes(outcome as string | null)) {
    return NextResponse.json({ message: "Invalid outcome value" }, { status: 400 });
  }
  try {
    const updated = await setInvestigationOutcome(
      params.id,
      outcome as "confirmed" | "false_positive" | "inconclusive" | null
    );
    if (!updated) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ investigation: updated });
  } catch (err) {
    const error = err as Error | { message?: string };
    return NextResponse.json({ message: (typeof error === 'object' && error && 'message' in error) ? error.message : "Failed to update outcome" }, { status: 500 });
  }
}
