import type { AlertStore } from "./alert-store";
import type { OperationalAlert, OperationalAlertRuleType } from "./operational-alerts";
import type { SqliteDatabaseLike } from "../db/client";

export class DbAlertStore implements AlertStore {
  constructor(private db: SqliteDatabaseLike) {}

  // Helper: reconstructs the dedupe key
  private alertKey(source: string, ruleType: string, stationId: string | null): string {
    return [source, ruleType, stationId ?? ""].join("|");
  }

  getAlertById(id: string): OperationalAlert | undefined {
    const norm = (v: any) => v === undefined ? null : v;
    const row = this.db.prepare("SELECT * FROM operational_alerts WHERE id = ?").all(norm(id))[0] as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getAlertIdByKey(key: string): string | undefined {
    // Key is source|ruleType|stationId
    const norm = (v: any) => v === undefined ? null : v;
    const [source, ruleType, stationId] = key.split("|");
    const row = this.db.prepare(
      "SELECT id FROM operational_alerts WHERE source = ? AND rule_type = ? AND (station_id IS ? OR station_id = ?) ORDER BY detected_at DESC, id DESC LIMIT 1"
    ).all(norm(source), norm(ruleType), norm(stationId) || null, norm(stationId) || null)[0] as { id: string } | undefined;
    return row ? String(row.id) : undefined;
  }

  getAlertKeyById(id: string): string | undefined {
    const norm = (v: any) => v === undefined ? null : v;
    const row = this.db.prepare("SELECT source, rule_type, station_id FROM operational_alerts WHERE id = ?").all(norm(id))[0] as { source: string; rule_type: string; station_id: string | null } | undefined;
    if (!row) return undefined;
    return this.alertKey(String(row.source), String(row.rule_type), row.station_id == null ? null : String(row.station_id));
  }

  setAlert(alert: OperationalAlert, key: string): void {
    const norm = (v: any) => v === undefined ? null : v;
    // Instrument all SQL and param usage
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
      norm(String(alert.id)),
      norm(alert.source != null ? String(alert.source) : null),
      norm(alert.stationId != null ? String(alert.stationId) : null),
      norm(alert.ruleType != null ? String(alert.ruleType) : null),
      norm(alert.severity != null ? String(alert.severity) : null),
      norm(alert.status != null ? String(alert.status) : null),
      norm(alert.lifecycleStatus != null ? String(alert.lifecycleStatus) : null),
      norm(alert.title != null ? String(alert.title) : null),
      norm(alert.detail != null ? String(alert.detail) : null),
      norm(alert.metadataJson !== undefined && alert.metadataJson !== null
        ? (typeof alert.metadataJson === "string" ? alert.metadataJson : JSON.stringify(alert.metadataJson))
        : null),
      norm(alert.detectedAt),
      norm(alert.resolvedAt === undefined || alert.resolvedAt === null
        ? null
        : typeof alert.resolvedAt === "number" || typeof alert.resolvedAt === "string"
          ? alert.resolvedAt
          : Number(alert.resolvedAt)),
      norm(alert.occurrenceCount),
      norm(alert.windowStartedAt),
      norm(alert.windowEndsAt),
      norm(typeof alert.createdAt === "string" ? alert.createdAt : new Date(alert.createdAt).toISOString()),
      norm(typeof alert.updatedAt === "string" ? alert.updatedAt : new Date(alert.updatedAt).toISOString())
    ];
    // 1. Lookup by key
    const [source, ruleType, stationId] = key.split("|");
    const lookupSql = "SELECT id FROM operational_alerts WHERE source = ? AND rule_type = ? AND (station_id IS ? OR station_id = ?) AND id != ?";
    const lookupParams = [norm(source), norm(ruleType), norm(stationId) || null, norm(stationId) || null, norm(alert.id)];
    // eslint-disable-next-line no-console
    console.error("[DEBUG][DbAlertStore] STEP: lookup by key");
    console.error("[DEBUG][DbAlertStore] SQL:", lookupSql);
    console.error("[DEBUG][DbAlertStore] Params:", lookupParams);
    console.error("[DEBUG][DbAlertStore] Param types:", lookupParams.map((v, i) => `#${i+1}: ${typeof v}`));
    let existing: any[] = [];
    try {
      existing = this.db.prepare(lookupSql).all(...lookupParams);
    } catch (e) {
      console.error("[DEBUG][DbAlertStore] lookup by key FAILED:", e);
      throw e;
    }
    // 2. Delete/rekey step
    for (const row of existing) {
      const delSql = "DELETE FROM operational_alerts WHERE id = ?";
      const delParams = [row.id];
      // eslint-disable-next-line no-console
      console.error("[DEBUG][DbAlertStore] STEP: delete/rekey");
      console.error("[DEBUG][DbAlertStore] SQL:", delSql);
      console.error("[DEBUG][DbAlertStore] Params:", delParams);
      console.error("[DEBUG][DbAlertStore] Param types:", delParams.map((v, i) => `#${i+1}: ${typeof v}`));
      try {
        this.db.prepare(delSql).run!(...delParams.map(norm));
      } catch (e) {
        console.error("[DEBUG][DbAlertStore] delete/rekey FAILED:", e);
        throw e;
      }
    }
    // 3. Upsert (replace by id)
    // eslint-disable-next-line no-console
    console.error("[DEBUG][DbAlertStore] STEP: upsert");
    console.error("[DEBUG][DbAlertStore] SQL:", sql);
    console.error("[DEBUG][DbAlertStore] Params:", params);
    console.error("[DEBUG][DbAlertStore] Param types:", params.map((v, i) => `#${i+1}: ${typeof v}`));
    try {
      this.db.prepare(sql).run!(...params);
    } catch (e) {
      console.error("[DEBUG][DbAlertStore] upsert FAILED:", e);
      throw e;
    }
    // 4. Manual direct insert for debug
    if (process.env.DIRECT_INSERT_DEBUG === "1") {
      const stmt = this.db.prepare(sql);
      try {
        stmt.run!(...params);
        // eslint-disable-next-line no-console
        console.error("[DEBUG][DbAlertStore] direct stmt.run(...params) succeeded");
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[DEBUG][DbAlertStore] direct stmt.run(...params) failed:", e);
      }
    }
  }

  deleteAlert(id: string, key: string): void {
    const norm = (v: any) => v === undefined ? null : v;
    this.db.prepare("DELETE FROM operational_alerts WHERE id = ?").run!(norm(id));
  }

  listAlerts(filter?: { source?: string; status?: string }): OperationalAlert[] {
    const norm = (v: any) => v === undefined ? null : v;
    let sql = "SELECT * FROM operational_alerts";
    const params: unknown[] = [];
    const conds: string[] = [];
    if (filter?.source) {
      conds.push("source = ?");
      params.push(norm(filter.source));
    }
    if (filter?.status) {
      conds.push("status = ?");
      params.push(norm(filter.status));
    }
    if (conds.length) {
      sql += " WHERE " + conds.join(" AND ");
    }
    sql += " ORDER BY detected_at ASC, id ASC";
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row: any) => this.mapRow(row as Record<string, unknown>));
  }

  clear(): void {
    this.db.prepare("DELETE FROM operational_alerts").run!();
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
