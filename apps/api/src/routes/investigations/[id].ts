import { NextResponse } from "next/server";
import { getInvestigationById as getInvestigationByIdRepo } from "../../repositories/getInvestigationById";
// updateInvestigationOutcome is CommonJS export, require it
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { updateInvestigationOutcome } = require("../../repositories/investigations");
import { resolveDatabasePath, openWritableDatabase } from "../../db/client";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const investigation = await getInvestigationByIdRepo(params.id);
  if (!investigation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ investigation });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  const allowed = ["confirmed", "false_positive", "inconclusive", null];
  const { outcome } = body || {};
  if (!allowed.includes(outcome)) {
    return NextResponse.json({ message: "Invalid outcome value" }, { status: 400 });
  }
  // Open DB and persist
  const dbPath = resolveDatabasePath();
  let db;
  try {
    db = openWritableDatabase(dbPath);
    updateInvestigationOutcome(db, params.id, outcome);
    const updated = await getInvestigationByIdRepo(params.id);
    if (!updated) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ investigation: updated });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "Failed to update outcome" }, { status: 500 });
  } finally {
    if (db) db.close();
  }
}
