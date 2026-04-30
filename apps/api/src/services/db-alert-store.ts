import type { AlertStore } from "./alert-store";
import type { OperationalAlert, OperationalAlertRuleType } from "./operational-alerts";
import type { AsyncDbAdapter } from "../db/async-client";

export class DbAlertStore implements AlertStore {
  constructor(private adapter: AsyncDbAdapter) {}

  // Helper: reconstructs the dedupe key
  private alertKey(source: string, ruleType: string, stationId: string | null): string {
    return [source, ruleType, stationId ?? ""].join("|");
  }

  async getAlertById(id: string): Promise<OperationalAlert | undefined> {
    const rows = (await this.adapter.execute("SELECT * FROM operational_alerts WHERE id = ?", [id])) as Array<Record<string, unknown>>;
    const row = rows[0];
    return row ? this.mapRow(row) : undefined;
  }

  async getAlertIdByKey(key: string): Promise<string | undefined> {
    const [source, ruleType, stationId] = key.split("|");
    const rows = (await this.adapter.execute(
      "SELECT id FROM operational_alerts WHERE source = ? AND rule_type = ? AND (station_id IS ? OR station_id = ?) ORDER BY detected_at DESC, id DESC LIMIT 1",
      [source, ruleType, stationId || null, stationId || null]
    )) as Array<{ id: string }>;
    const row = rows[0];
    return row ? String(row.id) : undefined;
  }

  async getAlertKeyById(id: string): Promise<string | undefined> {
    const rows = (await this.adapter.execute("SELECT source, rule_type, station_id FROM operational_alerts WHERE id = ?", [id])) as Array<{ source: string; rule_type: string; station_id: string | null }>;
    const row = rows[0];
    if (!row) return undefined;
    return this.alertKey(String(row.source), String(row.rule_type), row.station_id == null ? null : String(row.station_id));
  }

  async setAlert(alert: OperationalAlert, key: string): Promise<void> {
    const sql = `INSERT INTO operational_alerts (
      id, source, station_id, rule_type, severity, status, lifecycle_status, title, detail, metadata_json,
      detected_at, resolved_at, occurrence_count, window_started_at, window_ends_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source=excluded.source,
        station_id=excluded.station_id,
        rule_type=excluded.rule_type,
        severity=excluded.severity,
        status=excluded.status,
        lifecycle_status=excluded.lifecycle_status,
        title=excluded.title,
        detail=excluded.detail,
        metadata_json=excluded.metadata_json,
        detected_at=excluded.detected_at,
        resolved_at=excluded.resolved_at,
        occurrence_count=excluded.occurrence_count,
        window_started_at=excluded.window_started_at,
        window_ends_at=excluded.window_ends_at,
        created_at=excluded.created_at,
        updated_at=excluded.updated_at
    `;

    const params = [
      alert.id,
      alert.source,
      alert.stationId,
      alert.ruleType,
      alert.severity,
      alert.status,
      alert.lifecycleStatus,
      alert.title,
      alert.detail,
      alert.metadataJson !== undefined && alert.metadataJson !== null
        ? (typeof alert.metadataJson === "string" ? alert.metadataJson : JSON.stringify(alert.metadataJson))
        : null,
      alert.detectedAt,
      alert.resolvedAt ?? null,
      alert.occurrenceCount,
      alert.windowStartedAt,
      alert.windowEndsAt,
      typeof alert.createdAt === "string" ? alert.createdAt : new Date(alert.createdAt).toISOString(),
      typeof alert.updatedAt === "string" ? alert.updatedAt : new Date(alert.updatedAt).toISOString()
    ];

    // 1. Lookup by key
    const [source, ruleType, stationId] = key.split("|");
    const lookupSql = "SELECT id FROM operational_alerts WHERE source = ? AND rule_type = ? AND (station_id IS ? OR station_id = ?) AND id != ?";
    const lookupParams = [source, ruleType, stationId || null, stationId || null, alert.id];
    
    const existing = (await this.adapter.execute(lookupSql, lookupParams)) as Array<{ id: string }>;

    // 2. Delete/rekey step
    for (const row of existing) {
      await this.adapter.execute("DELETE FROM operational_alerts WHERE id = ?", [row.id]);
    }

    // 3. Upsert (replace by id)
    await this.adapter.execute(sql, params);
  }

  async deleteAlert(id: string, _key: string): Promise<void> {
    await this.adapter.execute("DELETE FROM operational_alerts WHERE id = ?", [id]);
  }

  async listAlerts(filter?: { source?: string; status?: string }): Promise<OperationalAlert[]> {
    let sql = "SELECT * FROM operational_alerts";
    const params: unknown[] = [];
    const conds: string[] = [];
    if (filter?.source) {
      conds.push("source = ?");
      params.push(filter.source);
    }
    if (filter?.status) {
      conds.push("status = ?");
      params.push(filter.status);
    }
    if (conds.length) {
      sql += " WHERE " + conds.join(" AND ");
    }
    sql += " ORDER BY detected_at ASC, id ASC";
    const rows = (await this.adapter.execute(sql, params)) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapRow(row));
  }

  async clear(): Promise<void> {
    await this.adapter.execute("DELETE FROM operational_alerts", []);
  }

  // Helper: convert DB row to OperationalAlert
  private mapRow(row: Record<string, unknown>): OperationalAlert {
    return {
      id: String(row.id),
      source: String(row.source),
      stationId: row.station_id == null ? null : String(row.station_id),
      ruleType: row.rule_type as OperationalAlertRuleType,
      severity: row.severity as any,
      status: row.status as any,
      lifecycleStatus: (row.lifecycle_status as any) ?? "open",
      title: String(row.title),
      detail: row.detail == null ? null : String(row.detail),
      metadataJson: row.metadata_json == null ? null : String(row.metadata_json),
      detectedAt: Number(row.detected_at ?? 0),
      resolvedAt: row.resolved_at == null ? null : Number(row.resolved_at),
      occurrenceCount: Number(row.occurrence_count ?? 1) || 1,
      windowStartedAt: Number(row.window_started_at ?? 0),
      windowEndsAt: Number(row.window_ends_at ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
