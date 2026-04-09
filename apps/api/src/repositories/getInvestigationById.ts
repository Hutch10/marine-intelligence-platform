
import { openReadOnlyDatabase, resolveDatabasePath, hasDatabasePath } from "../db/client";
import type { InvestigationAnalysisTrack, SignalDetection } from "@marine/shared";

export async function getInvestigationById(id: string): Promise<
  (InvestigationAnalysisTrack & {
    signals: Array<{
      id: string;
      type: string;
      confidence: number | null;
      timestamp: string;
      stationId: string | null;
      source: string;
    }>;
    lastUpdated: string | null;
  }) | null
> {
  const dbPath = resolveDatabasePath();
  if (!hasDatabasePath(dbPath)) return null;
  const db = openReadOnlyDatabase(dbPath);
  try {

    const row = db.prepare(
      `SELECT id, title, summary, state, confidence FROM investigations WHERE id = ?`
    ).all(id)[0] as any;
    if (!row || !row.id) return null;

    // Fetch all real signals linked to this investigation
    const signalRows = db.prepare(
      `SELECT id, signal_type, severity, confidence, source_type, source_id, region, station_id,
              title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id
         FROM signal_detections
         WHERE linked_investigation_id = ?`
    ).all(id) as any[];

    // Map to required fields for the enriched response
    const signals = signalRows.map((s) => {
      return {
        id: s.id,
        type: s.signal_type,
        confidence: typeof s.confidence === 'number' ? s.confidence : Number(s.confidence),
        timestamp: new Date(typeof s.detected_at === 'number' ? s.detected_at : Number(s.detected_at)).toISOString(),
        stationId: s.station_id ?? null,
        source: s.source_type,
      };
    });

    // lastUpdated: most recent signal timestamp, or null if none
    let lastUpdated: string | null = null;
    if (signals.length > 0) {
      const maxTs = Math.max(...signals.map((s) => new Date(s.timestamp).getTime()));
      lastUpdated = new Date(maxTs).toISOString();
    }

    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      confidence: row.confidence ?? 50,
      state: row.state,
      signals,
      lastUpdated,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
