# Step10 Modified Files

## apps/api/src/db/schema.ts
```ts
export type DatabaseColumnType = "text" | "integer" | "real" | "boolean" | "json" | "timestamp";

export interface DatabaseColumnReference {
  table: string;
  column: string;
}

export interface DatabaseColumnSchema {
  name: string;
  type: DatabaseColumnType;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string;
  references?: DatabaseColumnReference;
}

export interface DatabaseTableSchema {
  name: string;
  columns: DatabaseColumnSchema[];
}

const timestampColumns = [
  {
    name: "created_at",
    type: "timestamp",
    defaultValue: "CURRENT_TIMESTAMP",
  },
  {
    name: "updated_at",
    type: "timestamp",
    defaultValue: "CURRENT_TIMESTAMP",
  },
] as const satisfies DatabaseColumnSchema[];

export const databaseSchema: DatabaseTableSchema[] = [
  {
    name: "data_sources",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "priority", type: "integer", defaultValue: "0" },
      { name: "base_url", type: "text", nullable: true },
      { name: "active", type: "boolean", defaultValue: "1" },
      ...timestampColumns,
    ],
  },
  {
    name: "regions",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "status", type: "text" },
      { name: "summary", type: "text" },
      { name: "geometry", type: "json", nullable: true },
      { name: "buoy_count", type: "integer", nullable: true },
      { name: "nearest_buoy_label", type: "text", nullable: true },
      { name: "thermal_anomaly_label", type: "text", nullable: true },
      { name: "current_direction_label", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "ingestion_runs",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "source", type: "text" },
      { name: "status", type: "text" },
      { name: "station_count", type: "integer", defaultValue: "0" },
      { name: "inserted_rows", type: "integer", defaultValue: "0" },
      { name: "rejected_rows", type: "integer", defaultValue: "0" },
      { name: "started_at", type: "integer" },
      { name: "finished_at", type: "integer", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "observations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text" },
      { name: "source", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "sea_surface_temp_c", type: "real", nullable: true },
      { name: "wave_height_m", type: "real", nullable: true },
      { name: "wind_speed_mps", type: "real", nullable: true },
      { name: "pressure_hpa", type: "real", nullable: true },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "raw_line", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "provenance_records",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source", type: "text" },
      { name: "source_station_id", type: "text" },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "record_type", type: "text" },
      { name: "record_id", type: "text" },
      { name: "payload_json", type: "json" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "station_metrics",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", nullable: true, references: { table: "stations", column: "id" } },
      { name: "region_key", type: "text" },
      { name: "metric_type", type: "text" },
      { name: "metric_value", type: "real", nullable: true },
      { name: "metric_unit", type: "text", nullable: true },
      { name: "source", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "derived_signals",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", nullable: true, references: { table: "stations", column: "id" } },
      { name: "region_key", type: "text" },
      { name: "signal_type", type: "text" },
      { name: "signal_value", type: "real", nullable: true },
      { name: "signal_label", type: "text", nullable: true },
      { name: "severity", type: "text", nullable: true },
      { name: "source", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "ingestion_run_id", type: "text", references: { table: "ingestion_runs", column: "id" } },
      { name: "source_timestamp", type: "text" },
      { name: "source_reference", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "live_ingestion_worker_runs",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "status", type: "text" },
      { name: "started_at", type: "integer" },
      { name: "completed_at", type: "integer" },
      { name: "duration_ms", type: "integer" },
      { name: "inserted_count", type: "integer", defaultValue: "0" },
      { name: "rejected_count", type: "integer", defaultValue: "0" },
      { name: "rejection_reasons_json", type: "json" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "live_ingestion_reports",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "worker_run_id", type: "text", references: { table: "live_ingestion_worker_runs", column: "id" } },
      { name: "source", type: "text" },
      { name: "started_at", type: "integer" },
      { name: "completed_at", type: "integer" },
      { name: "duration_ms", type: "integer" },
      { name: "inserted_count", type: "integer", defaultValue: "0" },
      { name: "rejected_count", type: "integer", defaultValue: "0" },
      { name: "rejection_reasons_json", type: "json" },
      { name: "status", type: "text" },
      { name: "run_id", type: "text", nullable: true },
      { name: "error", type: "text", nullable: true },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "operational_alerts",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "source", type: "text" },
      { name: "rule_type", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "title", type: "text" },
      { name: "detail", type: "text", nullable: true },
      { name: "metadata_json", type: "json", nullable: true },
      { name: "detected_at", type: "integer" },
      { name: "resolved_at", type: "integer", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "datasets",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "category", type: "text" },
      { name: "region_id", type: "text", references: { table: "regions", column: "id" } },
      { name: "status", type: "text" },
      { name: "record_count", type: "integer", nullable: true },
      { name: "refreshed_at", type: "timestamp", nullable: true },
      { name: "metadata", type: "json", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "data_explorer_presets",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "scope", type: "text", defaultValue: "'shared'" },
      { name: "owner_id", type: "text", nullable: true },
      { name: "filters_json", type: "json" },
      { name: "created_at", type: "timestamp" },
      { name: "updated_at", type: "timestamp" },
      { name: "last_used_at", type: "timestamp", nullable: true },
      { name: "use_count", type: "integer", defaultValue: "0" },
    ],
  },
  {
    name: "data_explorer_preset_audit_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "preset_id", type: "text", nullable: true },
      { name: "preset_name", type: "text" },
      { name: "scope", type: "text" },
      { name: "action", type: "text" },
      { name: "actor_id", type: "text", nullable: true },
      { name: "actor_type", type: "text" },
      { name: "owner_id", type: "text", nullable: true },
      { name: "outcome", type: "text" },
      { name: "reason", type: "text", nullable: true },
      { name: "created_at", type: "timestamp" },
      { name: "metadata_json", type: "json", nullable: true },
    ],
  },
  {
    name: "investigations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "state", type: "text" },
      { name: "region_id", type: "text", nullable: true, references: { table: "regions", column: "id" } },
      { name: "owner", type: "text", nullable: true },
      { name: "confidence", type: "integer", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "investigation_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "investigation_id", type: "text", references: { table: "investigations", column: "id" } },
      { name: "event_type", type: "text" },
      { name: "source", type: "text" },
      { name: "actor", type: "text", nullable: true },
      { name: "summary", type: "text" },
      { name: "detail", type: "text", nullable: true },
      { name: "confidence", type: "integer", nullable: true },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "signal_detections",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "signal_type", type: "text" },
      { name: "severity", type: "text" },
      { name: "confidence", type: "integer" },
      { name: "source_type", type: "text" },
      { name: "source_id", type: "text" },
      { name: "region", type: "text" },
      { name: "station_id", type: "text", nullable: true, references: { table: "stations", column: "id" } },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "detail", type: "text" },
      { name: "status", type: "text" },
      { name: "detected_at", type: "integer" },
      { name: "created_at", type: "integer" },
      { name: "updated_at", type: "integer" },
      { name: "linked_investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
    ],
  },
  {
    name: "species",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "common_name", type: "text" },
      { name: "scientific_name", type: "text" },
      { name: "conservation_status", type: "text" },
      { name: "habitat_region", type: "text" },
      { name: "summary", type: "text" },
      { name: "created_at", type: "integer" },
      { name: "updated_at", type: "integer" },
    ],
  },
  {
    name: "species_sightings",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "species_id", type: "text", references: { table: "species", column: "id" } },
      { name: "station_id", type: "text", nullable: true },
      { name: "region", type: "text" },
      { name: "observed_at", type: "integer" },
      { name: "latitude", type: "text" },
      { name: "longitude", type: "text" },
      { name: "count", type: "integer" },
      { name: "source", type: "text" },
      { name: "summary", type: "text" },
      { name: "verification_status", type: "text", defaultValue: "'pending'" },
      { name: "verified_at", type: "integer", nullable: true },
      { name: "verified_by", type: "text", nullable: true },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "species_movement_signals",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "species_id", type: "text", references: { table: "species", column: "id" } },
      { name: "signal_id", type: "text", nullable: true, references: { table: "signal_detections", column: "id" } },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "movement_type", type: "text" },
      { name: "confidence", type: "integer" },
      { name: "summary", type: "text" },
      { name: "created_at", type: "integer" },
    ],
  },
  {
    name: "ai_analyses",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "prompt", type: "text" },
      { name: "summary", type: "text", nullable: true },
      { name: "result_payload", type: "json", nullable: true },
      { name: "confidence_label", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "alerts",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "title", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "region_id", type: "text", nullable: true, references: { table: "regions", column: "id" } },
      { name: "dataset_id", type: "text", nullable: true, references: { table: "datasets", column: "id" } },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "detail", type: "text", nullable: true },
      { name: "detected_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "reports",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "title", type: "text" },
      { name: "report_type", type: "text" },
      { name: "status", type: "text" },
      { name: "region_id", type: "text", nullable: true, references: { table: "regions", column: "id" } },
      { name: "investigation_id", type: "text", nullable: true, references: { table: "investigations", column: "id" } },
      { name: "author", type: "text", nullable: true },
      { name: "published_at", type: "timestamp", nullable: true },
      { name: "content", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "map_layers",
    columns: [
      { name: "label", type: "text", primaryKey: true },
      { name: "description", type: "text" },
      { name: "active", type: "boolean" },
      { name: "accent", type: "text" },
      { name: "sort_order", type: "integer" },
      ...timestampColumns,
    ],
  },
  {
    name: "stations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "name", type: "text" },
      { name: "slug", type: "text", unique: true },
      { name: "region_id", type: "text", references: { table: "regions", column: "id" } },
      { name: "status", type: "text" },
      { name: "summary", type: "text" },
      { name: "location_label", type: "text" },
      { name: "depth_m", type: "integer", nullable: true },
      { name: "latitude", type: "text", nullable: true },
      { name: "longitude", type: "text", nullable: true },
      { name: "last_reported_at", type: "timestamp", nullable: true },
      { name: "hero_metric", type: "text", nullable: true },
      { name: "sponsor_name", type: "text", nullable: true },
      { name: "operator_name", type: "text", nullable: true },
      { name: "logo_url", type: "text", nullable: true },
      { name: "logo_label", type: "text", nullable: true },
      { name: "exhibit_title", type: "text", nullable: true },
      { name: "accent_color", type: "text", nullable: true },
      { name: "public_description", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_page_views",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "view_type", type: "text" },
      { name: "viewed_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_species",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "name", type: "text" },
      { name: "status", type: "text" },
      { name: "population_trend", type: "text", nullable: true },
      { name: "observed_at", type: "timestamp", nullable: true },
      { name: "notes", type: "text", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_sensors",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "name", type: "text" },
      { name: "category", type: "text" },
      { name: "value", type: "text" },
      { name: "unit", type: "text", nullable: true },
      { name: "status", type: "text" },
      { name: "sampled_at", type: "timestamp", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_alerts",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "title", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "detail", type: "text", nullable: true },
      { name: "detected_at", type: "timestamp", nullable: true },
      { name: "acknowledged_at", type: "timestamp", nullable: true },
      { name: "acknowledged_by", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_timelines",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "label", type: "text" },
      { name: "phase", type: "text" },
      { name: "detail", type: "text" },
      { name: "happened_at", type: "timestamp", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_content",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "content_type", type: "text" },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "href", type: "text", nullable: true },
      { name: "published_at", type: "timestamp", nullable: true },
      { name: "sort_order", type: "integer", defaultValue: "0" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_sessions",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "actor_id", type: "text" },
      { name: "actor_role", type: "text" },
      { name: "permissions", type: "json", nullable: true },
      { name: "csrf_token", type: "text" },
      { name: "issued_at", type: "timestamp" },
      { name: "expires_at", type: "timestamp" },
      { name: "last_active_at", type: "timestamp", nullable: true },
      { name: "revoked_at", type: "timestamp", nullable: true },
      { name: "metadata", type: "json", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_credentials",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "actor_role", type: "text" },
      { name: "password_hash", type: "text" },
      { name: "salt", type: "text" },
      { name: "mfa_enabled", type: "boolean", defaultValue: "0" },
      { name: "mfa_secret", type: "text", nullable: true },
      { name: "mfa_recovery_codes", type: "json", nullable: true },
      { name: "mfa_enrolled_at", type: "timestamp", nullable: true },
      { name: "mfa_last_verified_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_mfa_challenges",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "actor_id", type: "text" },
      { name: "challenge_purpose", type: "text" },
      { name: "session_id", type: "text", nullable: true, references: { table: "station_admin_sessions", column: "id" } },
      { name: "expires_at", type: "timestamp" },
      { name: "attempts_remaining", type: "integer", defaultValue: "5" },
      { name: "consumed_at", type: "timestamp", nullable: true },
      { name: "metadata", type: "json", nullable: true },
      { name: "created_at", type: "timestamp", defaultValue: "CURRENT_TIMESTAMP" },
    ],
  },
  {
    name: "station_admin_auth_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_type", type: "text" },
      { name: "actor_id", type: "text", nullable: true },
      { name: "session_id", type: "text", nullable: true },
      { name: "occurred_at", type: "timestamp" },
      { name: "metadata", type: "json", nullable: true },
      { name: "created_at", type: "timestamp", defaultValue: "CURRENT_TIMESTAMP" },
    ],
  },
  {
    name: "station_events",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "event_type", type: "text" },
      { name: "severity", type: "text" },
      { name: "status", type: "text" },
      { name: "title", type: "text" },
      { name: "summary", type: "text" },
      { name: "detected_at", type: "timestamp" },
      { name: "resolved_at", type: "timestamp", nullable: true },
      { name: "investigation_id", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_evidence",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "source", type: "text" },
      { name: "kind", type: "text" },
      { name: "captured_at", type: "timestamp" },
      { name: "detail", type: "text" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_notes",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "author_id", type: "text" },
      { name: "body", type: "text" },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_actions",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "label", type: "text" },
      { name: "actor_id", type: "text" },
      { name: "performed_at", type: "timestamp" },
      { name: "detail", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_event_history",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "event_id", type: "text", references: { table: "station_events", column: "id" } },
      { name: "from_status", type: "text", nullable: true },
      { name: "to_status", type: "text" },
      { name: "changed_by", type: "text" },
      { name: "changed_at", type: "timestamp" },
      { name: "reason", type: "text", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_investigations",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "title", type: "text" },
      { name: "description", type: "text", nullable: true },
      { name: "status", type: "text" },
      { name: "owner", type: "text", nullable: true },
      { name: "opened_at", type: "timestamp" },
      { name: "closed_at", type: "timestamp", nullable: true },
      ...timestampColumns,
    ],
  },
  {
    name: "station_admin_audits",
    columns: [
      { name: "id", type: "text", primaryKey: true },
      { name: "station_id", type: "text", references: { table: "stations", column: "id" } },
      { name: "actor_id", type: "text" },
      { name: "actor_role", type: "text" },
      { name: "area", type: "text" },
      { name: "changed_fields", type: "json" },
      { name: "changed_at", type: "timestamp" },
      ...timestampColumns,
    ],
  },
];

export const databaseTables = Object.fromEntries(
  databaseSchema.map((table) => [table.name, table]),
) as Record<DatabaseTableSchema["name"], DatabaseTableSchema>;
```

## apps/api/src/repositories/data-explorer-presets.ts
```ts
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import {
  DATA_EXPLORER_ALLOWED_DIRECTIONS,
  DATA_EXPLORER_ALLOWED_SORTS,
  DATA_EXPLORER_DEFAULT_PRESET_FILTERS,
  type DataExplorerPresetFilters,
  type DataExplorerPresetMutationReason,
  type DataExplorerPresetMutationResult,
  type DataExplorerPresetRecord,
  type DataExplorerPresetScope,
} from "../../../web/lib/persistence/types";
import {
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";

const PRESET_TABLE_NAME = "data_explorer_presets";
const PRESET_AUDIT_TABLE_NAME = "data_explorer_preset_audit_events";
const SHARED_SCOPE = "shared";
const PERSONAL_SCOPE = "personal";
const STORAGE_SCHEMA_VERSION = 2 as const;
const LEGACY_SCHEMA_VERSION = 1 as const;
const LEGACY_STORE_DEFAULT_PATH = resolve(process.cwd(), ".data", "data-explorer-presets.shared.json");

const DEFAULT_SCOPE: DataExplorerPresetScope = SHARED_SCOPE;

interface PresetDbRow {
  id: string;
  name: string;
  scope: string;
  filters_json: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  use_count: number | null;
}

interface PresetStorageEnvelopeV2 {
  version: typeof STORAGE_SCHEMA_VERSION;
  presets: DataExplorerPresetRecord[];
}

interface PresetStorageEnvelopeV1 {
  version: typeof LEGACY_SCHEMA_VERSION;
  presets: Array<{
    id?: string;
    name?: string;
    filters?: unknown;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

interface UpsertSharedPresetDraft {
  id?: string;
  name: string;
  filters: Partial<DataExplorerPresetFilters>;
}

export interface DataExplorerPresetScopeContext {
  scope?: DataExplorerPresetScope;
  ownerId?: string;
  actor?: DataExplorerPresetActorContext;
}

export type DataExplorerPresetActorContext = {
  actorId: string | null;
  actorType: "station_admin" | "unknown";
};

type DataExplorerPresetAuditAction = "created" | "updated" | "deleted" | "marked_used";

interface DataExplorerPresetAuditEventInput {
  presetId: string | null;
  presetName: string;
  scope: DataExplorerPresetScope;
  action: DataExplorerPresetAuditAction;
  actorId: string | null;
  actorType: DataExplorerPresetActorContext["actorType"];
  ownerId: string | null;
  outcome: "success" | "failure";
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface DataExplorerPresetUpsertInput extends UpsertSharedPresetDraft, DataExplorerPresetScopeContext {}

interface StoreReadResult {
  ok: boolean;
  presets: DataExplorerPresetRecord[];
  reason?: DataExplorerPresetMutationReason;
}

function createPresetAuditEventId(timestamp: string): string {
  return `preset-audit-${timestamp}-${createPresetId()}`;
}

function normalizeActorContext(context?: DataExplorerPresetActorContext): DataExplorerPresetActorContext {
  if (!context) {
    return {
      actorId: null,
      actorType: "unknown",
    };
  }

  const actorId = normalizeOptionalString(context.actorId) ?? null;
  const actorType = actorId
    ? "station_admin"
    : "unknown";

  return {
    actorId,
    actorType,
  };
}

function normalizeAuditPresetName(value: string): string {
  const normalized = value.trim();
  return normalized || "(unnamed preset)";
}

function toFilterSummary(filters: DataExplorerPresetFilters): Record<string, unknown> {
  return {
    q: filters.q,
    category: filters.category,
    region: filters.region,
    status: filters.status,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    pageSize: filters.pageSize,
  };
}

function summarizeChangedFields(
  previous: DataExplorerPresetRecord,
  next: DataExplorerPresetRecord,
): string[] {
  const changedFields: string[] = [];

  if (previous.name !== next.name) {
    changedFields.push("name");
  }

  if (previous.filters.q !== next.filters.q) {
    changedFields.push("filters.q");
  }

  if (previous.filters.category !== next.filters.category) {
    changedFields.push("filters.category");
  }

  if (previous.filters.region !== next.filters.region) {
    changedFields.push("filters.region");
  }

  if (previous.filters.status !== next.filters.status) {
    changedFields.push("filters.status");
  }

  if (previous.filters.sortBy !== next.filters.sortBy) {
    changedFields.push("filters.sortBy");
  }

  if (previous.filters.sortDir !== next.filters.sortDir) {
    changedFields.push("filters.sortDir");
  }

  if (previous.filters.pageSize !== next.filters.pageSize) {
    changedFields.push("filters.pageSize");
  }

  return changedFields;
}

function toStatement(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
  return db.prepare(sql);
}

function runStatement(statement: SqliteStatementLike, ...params: unknown[]) {
  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

function allStatement<T>(statement: SqliteStatementLike, ...params: unknown[]): T[] {
  return statement.all(...params) as T[];
}

function getLegacyStorePath(): string {
  if (process.env.MARINE_SHARED_DATA_EXPLORER_PRESETS_PATH) {
    return resolve(process.env.MARINE_SHARED_DATA_EXPLORER_PRESETS_PATH);
  }

  return LEGACY_STORE_DEFAULT_PATH;
}

function sortPresets(presets: DataExplorerPresetRecord[]): DataExplorerPresetRecord[] {
  return [...presets].sort((left, right) => left.name.localeCompare(right.name));
}

function sanitizePresetFilters(filters: Partial<DataExplorerPresetFilters>): DataExplorerPresetFilters {
  return {
    q: typeof filters.q === "string" ? filters.q : "",
    category: typeof filters.category === "string" ? filters.category : "",
    region: typeof filters.region === "string" ? filters.region : "",
    status: typeof filters.status === "string" ? filters.status : "",
    sortBy: DATA_EXPLORER_ALLOWED_SORTS.includes(filters.sortBy ?? "updated")
      ? (filters.sortBy ?? "updated")
      : DATA_EXPLORER_DEFAULT_PRESET_FILTERS.sortBy,
    sortDir: DATA_EXPLORER_ALLOWED_DIRECTIONS.includes(filters.sortDir ?? "desc")
      ? (filters.sortDir ?? "desc")
      : DATA_EXPLORER_DEFAULT_PRESET_FILTERS.sortDir,
    pageSize:
      typeof filters.pageSize === "number" && Number.isFinite(filters.pageSize) && filters.pageSize > 0
        ? filters.pageSize
        : DATA_EXPLORER_DEFAULT_PRESET_FILTERS.pageSize,
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function createPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const runtimeRequire = eval("require") as NodeRequire;
  const cryptoModule = runtimeRequire("node:crypto") as {
    randomUUID?: () => string;
  };

  if (typeof cryptoModule.randomUUID === "function") {
    return cryptoModule.randomUUID();
  }

  return `preset-${Date.now().toString(16)}-${Math.floor(Math.random() * 1_000_000_000).toString(16)}`;
}

function normalizePresetScope(value: unknown): DataExplorerPresetScope {
  return value === PERSONAL_SCOPE ? PERSONAL_SCOPE : DEFAULT_SCOPE;
}

function normalizeOwnerId(value: unknown): string | null {
  return normalizeOptionalString(value) ?? null;
}

function createScopeContext(
  context?: DataExplorerPresetScopeContext,
): { scope: DataExplorerPresetScope; ownerId: string | null; validation?: DataExplorerPresetMutationResult } {
  const scope = normalizePresetScope(context?.scope);
  const ownerId = scope === PERSONAL_SCOPE
    ? normalizeOwnerId(context?.ownerId)
    : null;

  if (scope === PERSONAL_SCOPE && !ownerId) {
    return {
      scope,
      ownerId,
      validation: {
        ok: false,
        presets: [],
        reason: "validation",
        error: "Personal preset scope requires an owner key.",
      },
    };
  }

  return { scope, ownerId };
}

function normalizePresetRecord(value: unknown, fallbackTimestamp: string): DataExplorerPresetRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = normalizeOptionalString(record.name);

  if (!name) {
    return null;
  }

  return {
    id: normalizeOptionalString(record.id) ?? createPresetId(),
    name,
    scope: normalizePresetScope(record.scope),
    filters: sanitizePresetFilters((record.filters as Partial<DataExplorerPresetFilters>) ?? {}),
    createdAt: isIsoTimestamp(record.createdAt) ? record.createdAt : fallbackTimestamp,
    updatedAt: isIsoTimestamp(record.updatedAt) ? record.updatedAt : fallbackTimestamp,
    lastUsedAt: record.lastUsedAt === null
      ? null
      : (isIsoTimestamp(record.lastUsedAt) ? record.lastUsedAt : null),
    useCount:
      typeof record.useCount === "number" && Number.isFinite(record.useCount) && record.useCount >= 0
        ? Math.floor(record.useCount)
        : 0,
  };
}

function dedupePresetsByName(presets: DataExplorerPresetRecord[]): DataExplorerPresetRecord[] {
  const selected = new Map<string, DataExplorerPresetRecord>();

  for (const preset of presets) {
    const key = preset.name.toLowerCase();
    const existing = selected.get(key);

    if (!existing || preset.updatedAt > existing.updatedAt) {
      selected.set(key, preset);
    }
  }

  return [...selected.values()];
}

function migrateEnvelopeToCurrent(parsed: unknown): PresetStorageEnvelopeV2 | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const rawPresets = Array.isArray(record.presets) ? record.presets : null;

  if (!rawPresets) {
    return null;
  }

  const version = typeof record.version === "number"
    ? record.version
    : LEGACY_SCHEMA_VERSION;

  if (version !== LEGACY_SCHEMA_VERSION && version !== STORAGE_SCHEMA_VERSION) {
    return null;
  }

  const fallbackTimestamp = new Date().toISOString();
  const sourcePresets = version === LEGACY_SCHEMA_VERSION
    ? (record as unknown as PresetStorageEnvelopeV1).presets
    : (record as unknown as PresetStorageEnvelopeV2).presets;

  const normalizedPresets = sourcePresets
    .map((preset) => normalizePresetRecord(preset, fallbackTimestamp))
    .filter((preset): preset is DataExplorerPresetRecord => preset !== null);

  return {
    version: STORAGE_SCHEMA_VERSION,
    presets: sortPresets(dedupePresetsByName(normalizedPresets)),
  };
}

function readLegacyStore(): StoreReadResult {
  const path = getLegacyStorePath();

  try {
    if (!existsSync(path)) {
      return {
        ok: true,
        presets: [],
      };
    }

    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateEnvelopeToCurrent(parsed);

    if (!migrated) {
      return {
        ok: false,
        presets: [],
        reason: "invalid_schema",
      };
    }

    return {
      ok: true,
      presets: migrated.presets,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        presets: [],
        reason: "corrupt_json",
      };
    }

    return {
      ok: false,
      presets: [],
      reason: "read_failed",
    };
  }
}

function ensureDatabaseDirectory(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function ensurePresetTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS ${PRESET_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'shared',
        owner_id TEXT,
        filters_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        use_count INTEGER NOT NULL DEFAULT 0
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `DROP INDEX IF EXISTS idx_${PRESET_TABLE_NAME}_scope_name_ci`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_${PRESET_TABLE_NAME}_scope_name_ci
       ON ${PRESET_TABLE_NAME} (scope, COALESCE(owner_id, ''), LOWER(name))`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_TABLE_NAME}_scope_last_used
       ON ${PRESET_TABLE_NAME} (scope, owner_id, last_used_at DESC, use_count DESC)`,
    ),
  );
}

function ensurePresetAuditTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS ${PRESET_AUDIT_TABLE_NAME} (
        id TEXT PRIMARY KEY,
        preset_id TEXT,
        preset_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT NOT NULL,
        owner_id TEXT,
        outcome TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        metadata_json TEXT
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_AUDIT_TABLE_NAME}_preset_time
       ON ${PRESET_AUDIT_TABLE_NAME} (preset_id, created_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_AUDIT_TABLE_NAME}_scope_time
       ON ${PRESET_AUDIT_TABLE_NAME} (scope, owner_id, created_at DESC)`,
    ),
  );

  runStatement(
    toStatement(
      db,
      `CREATE INDEX IF NOT EXISTS idx_${PRESET_AUDIT_TABLE_NAME}_actor_time
       ON ${PRESET_AUDIT_TABLE_NAME} (actor_id, created_at DESC)`,
    ),
  );
}

function appendPresetAuditEvent(
  db: SqliteDatabaseLike,
  event: DataExplorerPresetAuditEventInput,
) {
  try {
    ensurePresetAuditTable(db);
    const timestamp = event.createdAt ?? new Date().toISOString();
    const metadataJson = event.metadata ? JSON.stringify(event.metadata) : null;

    runStatement(
      toStatement(
        db,
        `INSERT INTO ${PRESET_AUDIT_TABLE_NAME} (
          id,
          preset_id,
          preset_name,
          scope,
          action,
          actor_id,
          actor_type,
          owner_id,
          outcome,
          reason,
          created_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      createPresetAuditEventId(timestamp),
      event.presetId,
      normalizeAuditPresetName(event.presetName),
      event.scope,
      event.action,
      event.actorId,
      event.actorType,
      event.ownerId,
      event.outcome,
      event.reason ?? null,
      timestamp,
      metadataJson,
    );
  } catch {
    // Audit writes are best-effort and must not block user mutations.
  }
}

function openPresetDatabase(): SqliteDatabaseLike {
  const path = resolveDatabasePath();
  ensureDatabaseDirectory(path);
  return openWritableDatabase(path);
}

function normalizePresetRow(row: PresetDbRow): DataExplorerPresetRecord | null {
  let parsedFilters: unknown;

  try {
    parsedFilters = JSON.parse(row.filters_json);
  } catch {
    return null;
  }

  return normalizePresetRecord(
    {
      id: row.id,
      name: row.name,
      scope: row.scope,
      filters: parsedFilters,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      useCount: row.use_count,
    },
    new Date().toISOString(),
  );
}

function readPresetsFromDatabase(
  db: SqliteDatabaseLike,
  context: { scope: DataExplorerPresetScope; ownerId: string | null },
): DataExplorerPresetRecord[] {
  const scopeSql = context.ownerId === null
    ? `scope = ? AND owner_id IS NULL`
    : `scope = ? AND owner_id = ?`;
  const scopeParams = context.ownerId === null
    ? [context.scope]
    : [context.scope, context.ownerId];
  const rows = allStatement<PresetDbRow>(
    toStatement(
      db,
      `SELECT id, name, scope, filters_json, created_at, updated_at, last_used_at, use_count
       FROM ${PRESET_TABLE_NAME}
       WHERE ${scopeSql}
       ORDER BY LOWER(name) ASC, created_at ASC`,
    ),
    ...scopeParams,
  );

  return sortPresets(
    rows
      .map((row) => normalizePresetRow(row))
      .filter((preset): preset is DataExplorerPresetRecord => preset !== null),
  );
}

function migrateLegacyStoreIfNeeded(db: SqliteDatabaseLike): { ok: boolean; reason?: DataExplorerPresetMutationReason } {
  const countRows = allStatement<Array<{ total: number }> extends never ? never : { total: number }>(
    toStatement(db, `SELECT COUNT(*) AS total FROM ${PRESET_TABLE_NAME} WHERE scope = ? AND owner_id IS NULL`),
    SHARED_SCOPE,
  );

  if ((countRows[0]?.total ?? 0) > 0) {
    return { ok: true };
  }

  const legacyStore = readLegacyStore();

  if (!legacyStore.ok) {
    return {
      ok: false,
      reason: legacyStore.reason,
    };
  }

  if (legacyStore.presets.length === 0) {
    return { ok: true };
  }

  const insertStatement = toStatement(
    db,
    `INSERT OR REPLACE INTO ${PRESET_TABLE_NAME} (
      id,
      name,
      scope,
      owner_id,
      filters_json,
      created_at,
      updated_at,
      last_used_at,
      use_count
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  );

  for (const preset of dedupePresetsByName(legacyStore.presets)) {
    runStatement(
      insertStatement,
      preset.id,
      preset.name,
      SHARED_SCOPE,
      JSON.stringify(sanitizePresetFilters(preset.filters)),
      preset.createdAt,
      preset.updatedAt,
      preset.lastUsedAt ?? null,
      Math.max(0, Math.floor(preset.useCount ?? 0)),
    );
  }

  return { ok: true };
}

function createResult(
  ok: boolean,
  presets: DataExplorerPresetRecord[],
  reason?: DataExplorerPresetMutationReason,
  error?: string,
): DataExplorerPresetMutationResult {
  return {
    ok,
    presets,
    reason,
    error,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export function loadDataExplorerPresets(context?: DataExplorerPresetScopeContext): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(context);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch {
    return createResult(false, [], "read_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function upsertDataExplorerPreset(input: DataExplorerPresetUpsertInput): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(input);
  const actorContext = normalizeActorContext(input.actor);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    const currentPresets = readPresetsFromDatabase(db, scopeContext);
    const name = input.name.trim();

    if (!name) {
      appendPresetAuditEvent(db, {
        presetId: input.id ?? null,
        presetName: input.name,
        scope: scopeContext.scope,
        action: input.id ? "updated" : "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "validation",
        metadata: {
          message: "Preset name is required.",
        },
      });
      return createResult(false, currentPresets, "validation", "Preset name is required.");
    }

    const existing = input.id
      ? currentPresets.find((preset) => preset.id === input.id)
      : undefined;
    const duplicate = currentPresets.some((preset) => {
      if (existing && preset.id === existing.id) {
        return false;
      }

      return preset.name.toLowerCase() === name.toLowerCase();
    });

    if (duplicate) {
      appendPresetAuditEvent(db, {
        presetId: input.id ?? null,
        presetName: name,
        scope: scopeContext.scope,
        action: existing ? "updated" : "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "duplicate_name",
      });
      return createResult(false, currentPresets, "duplicate_name", "Preset name already exists.");
    }

    const timestamp = new Date().toISOString();
    const nextPreset: DataExplorerPresetRecord = existing
      ? {
        ...existing,
        name,
        scope: scopeContext.scope,
        filters: sanitizePresetFilters(input.filters),
        updatedAt: timestamp,
      }
      : {
        id: input.id ?? createPresetId(),
        name,
        scope: scopeContext.scope,
        filters: sanitizePresetFilters(input.filters),
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUsedAt: null,
        useCount: 0,
      };

    if (existing) {
      runStatement(
        toStatement(
          db,
          `UPDATE ${PRESET_TABLE_NAME}
           SET name = ?,
               filters_json = ?,
               updated_at = ?,
               last_used_at = ?,
               use_count = ?
           WHERE id = ? AND scope = ? AND ${scopeContext.ownerId === null ? "owner_id IS NULL" : "owner_id = ?"}`,
        ),
        nextPreset.name,
        JSON.stringify(nextPreset.filters),
        nextPreset.updatedAt,
        nextPreset.lastUsedAt ?? null,
        nextPreset.useCount ?? 0,
        nextPreset.id,
        scopeContext.scope,
        ...(scopeContext.ownerId === null ? [] : [scopeContext.ownerId]),
      );

      appendPresetAuditEvent(db, {
        presetId: nextPreset.id,
        presetName: nextPreset.name,
        scope: scopeContext.scope,
        action: "updated",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "success",
        metadata: {
          changedFields: summarizeChangedFields(existing, nextPreset),
          filters: toFilterSummary(nextPreset.filters),
        },
      });
    } else {
      runStatement(
        toStatement(
          db,
          `INSERT INTO ${PRESET_TABLE_NAME} (
            id,
            name,
            scope,
            owner_id,
            filters_json,
            created_at,
            updated_at,
            last_used_at,
            use_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        ),
        nextPreset.id,
        nextPreset.name,
        scopeContext.scope,
        scopeContext.ownerId,
        JSON.stringify(nextPreset.filters),
        nextPreset.createdAt,
        nextPreset.updatedAt,
        nextPreset.lastUsedAt ?? null,
        nextPreset.useCount ?? 0,
      );

      appendPresetAuditEvent(db, {
        presetId: nextPreset.id,
        presetName: nextPreset.name,
        scope: scopeContext.scope,
        action: "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "success",
        metadata: {
          filters: toFilterSummary(nextPreset.filters),
        },
      });
    }

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      if (db) {
        appendPresetAuditEvent(db, {
          presetId: input.id ?? null,
          presetName: input.name,
          scope: scopeContext.scope,
          action: input.id ? "updated" : "created",
          actorId: actorContext.actorId,
          actorType: actorContext.actorType,
          ownerId: scopeContext.ownerId,
          outcome: "failure",
          reason: "duplicate_name",
        });
      }
      const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
      return createResult(false, presets, "duplicate_name", "Preset name already exists.");
    }

    if (db) {
      appendPresetAuditEvent(db, {
        presetId: input.id ?? null,
        presetName: input.name,
        scope: scopeContext.scope,
        action: input.id ? "updated" : "created",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "write_failed",
      });
    }

    const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
    return createResult(false, presets, "write_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function deleteDataExplorerPresetById(
  presetId: string,
  context?: DataExplorerPresetScopeContext,
): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(context);
  const actorContext = normalizeActorContext(context?.actor);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    const currentPresets = readPresetsFromDatabase(db, scopeContext);
    const existingPreset = currentPresets.find((preset) => preset.id === presetId);

    if (!existingPreset) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "deleted",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "not_found",
      });
      return createResult(false, currentPresets, "not_found", "Preset not found.");
    }

    runStatement(
      toStatement(
        db,
        `DELETE FROM ${PRESET_TABLE_NAME} WHERE id = ? AND scope = ? AND ${scopeContext.ownerId === null ? "owner_id IS NULL" : "owner_id = ?"}`,
      ),
      presetId,
      scopeContext.scope,
      ...(scopeContext.ownerId === null ? [] : [scopeContext.ownerId]),
    );

    appendPresetAuditEvent(db, {
      presetId,
      presetName: existingPreset.name,
      scope: scopeContext.scope,
      action: "deleted",
      actorId: actorContext.actorId,
      actorType: actorContext.actorType,
      ownerId: scopeContext.ownerId,
      outcome: "success",
      metadata: {
        useCount: existingPreset.useCount,
      },
    });

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch {
    if (db) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "deleted",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "write_failed",
      });
    }
    const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
    return createResult(false, presets, "write_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function markDataExplorerPresetUsed(
  presetId: string,
  context?: DataExplorerPresetScopeContext,
): DataExplorerPresetMutationResult {
  const scopeContext = createScopeContext(context);
  const actorContext = normalizeActorContext(context?.actor);

  if (scopeContext.validation) {
    return scopeContext.validation;
  }

  let db: SqliteDatabaseLike | null = null;

  try {
    db = openPresetDatabase();
    ensurePresetTable(db);

    const migration = migrateLegacyStoreIfNeeded(db);

    if (!migration.ok) {
      return createResult(false, [], migration.reason, "Shared preset store unavailable.");
    }

    const currentPresets = readPresetsFromDatabase(db, scopeContext);
    const existingPreset = currentPresets.find((preset) => preset.id === presetId);

    if (!existingPreset) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "marked_used",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "not_found",
      });
      return createResult(false, currentPresets, "not_found", "Preset not found.");
    }

    const timestamp = new Date().toISOString();
    runStatement(
      toStatement(
        db,
        `UPDATE ${PRESET_TABLE_NAME}
         SET updated_at = ?,
             last_used_at = ?,
             use_count = COALESCE(use_count, 0) + 1
         WHERE id = ? AND scope = ? AND ${scopeContext.ownerId === null ? "owner_id IS NULL" : "owner_id = ?"}`,
      ),
      timestamp,
      timestamp,
      presetId,
      scopeContext.scope,
      ...(scopeContext.ownerId === null ? [] : [scopeContext.ownerId]),
    );

    appendPresetAuditEvent(db, {
      presetId,
      presetName: existingPreset.name,
      scope: scopeContext.scope,
      action: "marked_used",
      actorId: actorContext.actorId,
      actorType: actorContext.actorType,
      ownerId: scopeContext.ownerId,
      outcome: "success",
      createdAt: timestamp,
      metadata: {
        previousUseCount: existingPreset.useCount,
        nextUseCount: (existingPreset.useCount ?? 0) + 1,
      },
    });

    return createResult(true, readPresetsFromDatabase(db, scopeContext));
  } catch {
    if (db) {
      appendPresetAuditEvent(db, {
        presetId,
        presetName: "(unknown preset)",
        scope: scopeContext.scope,
        action: "marked_used",
        actorId: actorContext.actorId,
        actorType: actorContext.actorType,
        ownerId: scopeContext.ownerId,
        outcome: "failure",
        reason: "write_failed",
      });
    }
    const presets = db ? readPresetsFromDatabase(db, scopeContext) : [];
    return createResult(false, presets, "write_failed", "Shared preset store unavailable.");
  } finally {
    db?.close();
  }
}

export function loadSharedDataExplorerPresets(): DataExplorerPresetMutationResult {
  return loadDataExplorerPresets({ scope: SHARED_SCOPE });
}

export function upsertSharedDataExplorerPreset(draft: UpsertSharedPresetDraft): DataExplorerPresetMutationResult {
  return upsertDataExplorerPreset({ ...draft, scope: SHARED_SCOPE });
}

export function deleteSharedDataExplorerPresetById(presetId: string): DataExplorerPresetMutationResult {
  return deleteDataExplorerPresetById(presetId, { scope: SHARED_SCOPE });
}

export function markSharedDataExplorerPresetUsed(presetId: string): DataExplorerPresetMutationResult {
  return markDataExplorerPresetUsed(presetId, { scope: SHARED_SCOPE });
}

export function clearSharedDataExplorerPresetStoreForTests() {
  if (process.env.NODE_ENV !== "test") {
    return;
  }

  const dbPath = resolveDatabasePath();
  const legacyStorePath = getLegacyStorePath();

  for (const path of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`, legacyStorePath]) {
    try {
      rmSync(path, { force: true });
    } catch {
      // Ignore cleanup failures in tests.
    }
  }
}
```

## apps/web/app/api/data-explorer/presets/scope.ts
```ts
import type { DataExplorerPresetScope } from "@/lib/persistence/types";
import { apiClient } from "@/lib/api/client";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";
import type {
  DataExplorerPresetActorContext,
  DataExplorerPresetScopeContext,
} from "../../../../../api/src/repositories/data-explorer-presets";

export const DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR =
  "Personal preset scope requires an authenticated station admin session.";

interface PresetScopeResolutionSuccess {
  ok: true;
  context: DataExplorerPresetScopeContext;
}

interface PresetScopeResolutionFailure {
  ok: false;
  status: 401;
  result: {
    ok: false;
    presets: [];
    reason: "validation";
    error: typeof DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR;
  };
}

export type PresetScopeResolution = PresetScopeResolutionSuccess | PresetScopeResolutionFailure;

function parsePresetScope(value: string | null | undefined): DataExplorerPresetScope {
  return value === "personal" ? "personal" : "shared";
}

function getStationAdminSessionId(): string | null {
  const cookieSessionId = getStationAdminSessionCookie();

  if (cookieSessionId) {
    return cookieSessionId;
  }

  if (process.env.NODE_ENV !== "production") {
    const devSessionId = process.env.STATION_ADMIN_DEV_SESSION_ID?.trim() ?? "";
    return devSessionId || null;
  }

  return null;
}

async function resolvePresetActorContext(): Promise<DataExplorerPresetActorContext> {
  const sessionId = getStationAdminSessionId();
  const auth = sessionId ? await apiClient.stationAdminAuth.getSession(sessionId) : null;
  const actorId = auth?.actorId?.trim() ?? "";

  if (!actorId) {
    return {
      actorId: null,
      actorType: "unknown",
    };
  }

  return {
    actorId,
    actorType: "station_admin",
  };
}

export async function resolvePresetScopeContext(
  request: Request,
  fallbackScope?: string | null,
  options?: { includeActor?: boolean },
): Promise<PresetScopeResolution> {
  const url = new URL(request.url);
  const scope = parsePresetScope(url.searchParams.get("scope") ?? fallbackScope);

  if (scope !== "personal") {
    if (options?.includeActor) {
      const actor = await resolvePresetActorContext();
      return {
        ok: true,
        context: {
          scope,
          actor,
        },
      };
    }

    return {
      ok: true,
      context: {
        scope,
      },
    };
  }

  const actor = await resolvePresetActorContext();

  if (!actor.actorId) {
    return {
      ok: false,
      status: 401,
      result: {
        ok: false,
        presets: [],
        reason: "validation",
        error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
      },
    };
  }

  return {
    ok: true,
    context: {
      scope,
      ownerId: actor.actorId,
      actor,
    },
  };
}
```

## apps/web/app/api/data-explorer/presets/route.ts
```ts
import { NextResponse } from "next/server";
import { loadDataExplorerPresets, upsertDataExplorerPreset } from "@/lib/server/data-explorer-preset-store";
import type { DataExplorerPresetFilters, DataExplorerPresetScope } from "@/lib/persistence/types";
import { resolvePresetScopeContext } from "./scope";

interface UpsertBody {
  id?: string;
  name?: string;
  scope?: DataExplorerPresetScope;
  filters?: Partial<DataExplorerPresetFilters>;
}

function toStatusCode(reason?: string): number {
  switch (reason) {
    case "validation":
      return 400;
    case "duplicate_name":
      return 409;
    case "not_found":
      return 404;
    case "read_failed":
    case "write_failed":
    case "storage_unavailable":
    case "invalid_schema":
    case "corrupt_json":
    case "unsupported_version":
      return 503;
    default:
      return 500;
  }
}

export async function GET(request: Request) {
  const scopeContext = await resolvePresetScopeContext(request);

  if (!scopeContext.ok) {
    return NextResponse.json(scopeContext.result, {
      status: scopeContext.status,
    });
  }

  const result = loadDataExplorerPresets(scopeContext.context);

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}

export async function POST(request: Request) {
  let body: UpsertBody = {};

  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        presets: [],
        reason: "validation",
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const scopeContext = await resolvePresetScopeContext(request, body.scope, { includeActor: true });

  if (!scopeContext.ok) {
    return NextResponse.json(scopeContext.result, {
      status: scopeContext.status,
    });
  }

  const result = upsertDataExplorerPreset({
    id: typeof body.id === "string" ? body.id : undefined,
    name: typeof body.name === "string" ? body.name : "",
    scope: body.scope,
    ownerId: scopeContext.context.ownerId,
    actor: scopeContext.context.actor,
    filters: body.filters ?? {},
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
```

## apps/web/app/api/data-explorer/presets/[presetId]/route.ts
```ts
import { NextResponse } from "next/server";
import { deleteDataExplorerPresetById } from "@/lib/server/data-explorer-preset-store";
import { resolvePresetScopeContext } from "../scope";

function toStatusCode(reason?: string): number {
  switch (reason) {
    case "not_found":
      return 404;
    case "read_failed":
    case "write_failed":
    case "storage_unavailable":
    case "invalid_schema":
    case "corrupt_json":
    case "unsupported_version":
      return 503;
    default:
      return 500;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  const { presetId } = await context.params;

  if (!presetId) {
    return NextResponse.json(
      {
        ok: false,
        presets: [],
        reason: "validation",
        error: "Preset id is required.",
      },
      { status: 400 },
    );
  }

  const scopeContext = await resolvePresetScopeContext(request, undefined, { includeActor: true });

  if (!scopeContext.ok) {
    return NextResponse.json(scopeContext.result, {
      status: scopeContext.status,
    });
  }

  const result = deleteDataExplorerPresetById(presetId, scopeContext.context);

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
```

## apps/web/app/api/data-explorer/presets/[presetId]/mark-used/route.ts
```ts
import { NextResponse } from "next/server";
import { markDataExplorerPresetUsed } from "@/lib/server/data-explorer-preset-store";
import { resolvePresetScopeContext } from "../../scope";

function toStatusCode(reason?: string): number {
  switch (reason) {
    case "not_found":
      return 404;
    case "read_failed":
    case "write_failed":
    case "storage_unavailable":
    case "invalid_schema":
    case "corrupt_json":
    case "unsupported_version":
      return 503;
    default:
      return 500;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ presetId: string }> },
) {
  const { presetId } = await context.params;

  if (!presetId) {
    return NextResponse.json(
      {
        ok: false,
        presets: [],
        reason: "validation",
        error: "Preset id is required.",
      },
      { status: 400 },
    );
  }

  const scopeContext = await resolvePresetScopeContext(request, undefined, { includeActor: true });

  if (!scopeContext.ok) {
    return NextResponse.json(scopeContext.result, {
      status: scopeContext.status,
    });
  }

  const result = markDataExplorerPresetUsed(presetId, scopeContext.context);

  return NextResponse.json(result, {
    status: result.ok ? 200 : toStatusCode(result.reason),
  });
}
```

## apps/web/components/data-explorer/data-explorer-workspace.tsx
```ts
"use client";

import {
  BellDot,
  Bot,
  Database,
  Download,
  Eye,
  FileSearch,
  Filter,
  Layers3,
  Play,
  Search,
  Sparkles,
  Table2,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiClient } from "@/lib/api/client";
import type {
  DataExplorerDatasetDetail,
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
  DataExplorerFetchMeta,
  DataExplorerPageInfo,
  DataExplorerDatasetRow,
  DataExplorerMetadataItem,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsPageInfo,
  DataExplorerRelatedRecordsQuery,
  DataExplorerRelatedRecordSortBy,
  DataExplorerSortDirection,
  DataExplorerWorkspaceData,
  ExplorerAction,
} from "@/lib/api/types";
import {
  deleteDataExplorerPresetById,
  loadDataExplorerPresets,
  markDataExplorerPresetUsed,
  saveDataExplorerPreset,
  upsertDataExplorerPreset,
} from "@/lib/persistence/data-explorer-presets";
import type {
  DataExplorerPresetMutationReason,
  DataExplorerPresetRecord,
  DataExplorerPresetScope,
} from "@/lib/persistence/types";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDataExplorerPresetUsageMeta,
  isDataExplorerPresetInSync,
  selectDataExplorerPresetById,
  selectSortedDataExplorerPresets,
  toDataExplorerPresetFilterSnapshot,
} from "@/components/data-explorer/preset-presentation";

const STATUS_STYLES = {
  Curated: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  Live: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  Draft: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const TONE_STYLES = {
  cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const ACTION_ICONS: Record<ExplorerAction["icon"], LucideIcon> = {
  play: Play,
  download: Download,
  layers: Layers3,
};

const EMPTY_FILTERS: Required<DataExplorerDatasetFilters> = {
  q: "",
  category: "",
  region: "",
  status: "",
  sortBy: "updated",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
};

const EMPTY_RECORD_FILTERS: Required<DataExplorerRelatedRecordsQuery> = {
  sortBy: "updated",
  sortDir: "desc",
  page: 1,
  pageSize: 5,
};

type DetailStatus = "idle" | "loading" | "not_found" | "error";
type RecordsStatus = "idle" | "loading" | "empty" | "not_found" | "error";
type ListStatus = "idle" | "loading" | "empty" | "error";
type PresetStatus = "idle" | "error";

const SHOW_DEBUG = process.env.NODE_ENV !== "production";

interface DataExplorerWorkspaceProps {
  data: DataExplorerWorkspaceData;
  initialMeta?: DataExplorerFetchMeta | null;
}

function formatFallbackReasonLabel(
  fallbackReason: DataExplorerFetchMeta["fallbackReason"],
): string {
  if (fallbackReason === "db_path_missing") {
    return "DB path missing";
  }

  if (fallbackReason === "db_open_failed") {
    return "DB open failed";
  }

  if (fallbackReason === "db_query_failed") {
    return "DB query failed";
  }

  return "Backend unavailable";
}

function buildFallbackDetail(dataset: DataExplorerDatasetRow | undefined, metadata: DataExplorerMetadataItem[]) {
  if (!dataset) {
    return null;
  }

  return {
    id: dataset.id,
    name: dataset.name,
    category: dataset.category,
    region: dataset.region,
    updated: dataset.updated,
    records: dataset.records,
    status: dataset.status,
    metadata: Object.fromEntries(metadata.map((item) => [item.label, item.value])),
  } satisfies DataExplorerDatasetDetail;
}

function toMetadataItems(detail: DataExplorerDatasetDetail | null): DataExplorerMetadataItem[] {
  if (!detail?.metadata) {
    return [];
  }

  return Object.entries(detail.metadata).map(([label, value]) => ({
    label,
    value: value == null ? "Unavailable" : String(value),
  }));
}

function normalizeFilters(filters: Required<DataExplorerDatasetFilters>): DataExplorerDatasetFilters {
  return {
    q: filters.q.trim() || undefined,
    category: filters.category || undefined,
    region: filters.region || undefined,
    status: filters.status || undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

function formatDebugMeta(meta: DataExplorerFetchMeta | null): string {
  if (!meta) {
    return "No diagnostics yet";
  }

  const parts = [
    meta.section,
    meta.state,
    meta.delivery ?? "delivery-unknown",
    meta.source ?? "unknown",
    `${meta.durationMs}ms`,
  ];

  if (meta.fallbackReason) {
    parts.push(meta.fallbackReason);
  }

  if (meta.datasetId) {
    parts.push(meta.datasetId);
  }

  return parts.join(" · ");
}

function shouldFallbackToLocalPresetStore(reason: DataExplorerPresetMutationReason | undefined): boolean {
  return reason === "storage_unavailable"
    || reason === "read_failed"
    || reason === "write_failed"
    || reason === "invalid_schema"
    || reason === "corrupt_json"
    || reason === "unsupported_version";
}

function canUseLocalPresetFallback(
  scope: DataExplorerPresetScope,
  reason: DataExplorerPresetMutationReason | undefined,
): boolean {
  return scope === "shared" && shouldFallbackToLocalPresetStore(reason);
}

function formatPresetScopeLabel(scope: DataExplorerPresetScope): string {
  return scope === "personal" ? "Personal" : "Shared";
}

function formatPresetScopeDescription(scope: DataExplorerPresetScope): string {
  return scope === "personal"
    ? "Personal scope follows the active station admin session and stays unavailable if that session cannot be verified. Preset mutations are audit logged with that session actor."
    : "Shared scope uses the repository-backed preset catalog and can fall back to this browser if the repository path is unavailable. Preset mutations are audit logged when repository storage is available.";
}

function DebugBadge({ meta, label }: { meta: DataExplorerFetchMeta | null; label: string }) {
  if (!SHOW_DEBUG) {
    return null;
  }

  return (
    <div
      data-testid={`debug-${label}`}
      className="rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] text-slate-400"
    >
      <span className="font-medium uppercase tracking-[0.18em] text-cyan-400">{label}</span>
      <span className="ml-2">{formatDebugMeta(meta)}</span>
    </div>
  );
}

export function DataExplorerWorkspace({ data, initialMeta = null }: DataExplorerWorkspaceProps) {
  const { actions, datasets: initialDatasets, previewSeries, metadata, summarySignals } = data;
  const [datasets, setDatasets] = useState(initialDatasets);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [presetName, setPresetName] = useState("");
  const [presetScope, setPresetScope] = useState<DataExplorerPresetScope>("shared");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [savedPresets, setSavedPresets] = useState<DataExplorerPresetRecord[]>([]);
  const [presetStatus, setPresetStatus] = useState<PresetStatus>("idle");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<DataExplorerDatasetFilters>({});
  const [pageInfo, setPageInfo] = useState<DataExplorerPageInfo>(
    data.pageInfo ?? {
      page: 1,
      pageSize: Math.max(initialDatasets.length, 1),
      totalItems: initialDatasets.length,
      totalPages: initialDatasets.length > 0 ? 1 : 0,
      sortBy: "updated",
      sortDir: "desc",
    },
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(initialDatasets[0]?.id ?? null);
  const [selectedDetail, setSelectedDetail] = useState<DataExplorerDatasetDetail | null>(
    buildFallbackDetail(initialDatasets[0], metadata),
  );
  const [listMeta, setListMeta] = useState<DataExplorerFetchMeta | null>(initialMeta);
  const [detailMeta, setDetailMeta] = useState<DataExplorerFetchMeta | null>(null);
  const [recordsMeta, setRecordsMeta] = useState<DataExplorerFetchMeta | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>(initialDatasets[0] ? "loading" : "idle");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [relatedRecords, setRelatedRecords] = useState<DataExplorerRelatedRecord[]>([]);
  const [recordFilters, setRecordFilters] = useState(EMPTY_RECORD_FILTERS);
  const [recordsPageInfo, setRecordsPageInfo] = useState<DataExplorerRelatedRecordsPageInfo>({
    page: 1,
    pageSize: EMPTY_RECORD_FILTERS.pageSize,
    totalItems: 0,
    totalPages: 0,
    sortBy: EMPTY_RECORD_FILTERS.sortBy,
    sortDir: EMPTY_RECORD_FILTERS.sortDir,
  });
  const [recordsStatus, setRecordsStatus] = useState<RecordsStatus>(initialDatasets[0] ? "loading" : "idle");
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<ListStatus>(initialDatasets.length > 0 ? "idle" : "empty");
  const [listError, setListError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const maxValue = Math.max(1, ...previewSeries.map((item) => item.value));

  const categoryOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.category))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const regionOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.region))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const statusOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.status))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const sortedPresets = useMemo(() => selectSortedDataExplorerPresets(savedPresets), [savedPresets]);
  const selectedPreset = useMemo(
    () => selectDataExplorerPresetById(sortedPresets, selectedPresetId),
    [sortedPresets, selectedPresetId],
  );
  const selectedPresetInSync = useMemo(() => {
    if (!selectedPreset) {
      return false;
    }

    return isDataExplorerPresetInSync(selectedPreset, draftFilters);
  }, [selectedPreset, draftFilters]);

  useEffect(() => {
    setSelectedPresetId("");
    setSavedPresets(presetScope === "shared" ? loadDataExplorerPresets(presetScope) : []);
    setPresetStatus("idle");
    setPresetError(null);

    let cancelled = false;

    void apiClient.dataExplorer.listPresets(presetScope).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (canUseLocalPresetFallback(presetScope, result.reason)) {
          return;
        }

        setSavedPresets([]);
        setPresetStatus("error");
        setPresetError(result.error ?? "Unable to load presets right now.");
        return;
      }

      setSavedPresets(result.presets);
      setPresetStatus("idle");
      setPresetError(null);
    }).catch(() => {
      if (cancelled || presetScope === "shared") {
        return;
      }

      setSavedPresets([]);
      setPresetStatus("error");
      setPresetError("Unable to load personal presets right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [presetScope]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setSelectedDetail(null);
      setDetailStatus("idle");
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailStatus("loading");
    setDetailError(null);

    void apiClient.dataExplorer.getDatasetDetail(selectedDatasetId).then(({ data: detail, meta }) => {
      if (cancelled) return;
      setDetailMeta(meta);
      if (!detail) {
        setDetailStatus(meta.state === "error" ? "error" : "not_found");
        if (meta.state === "error") {
          setDetailError(meta.errorMessage ?? "Unable to load dataset detail right now.");
        }
        return;
      }
      setSelectedDetail(detail);
      setDetailStatus("idle");
    }).catch(() => {
      if (cancelled) return;
      setDetailStatus("error");
      setDetailError("Unable to load dataset detail right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setRelatedRecords([]);
      setRecordsPageInfo({
        page: 1,
        pageSize: recordFilters.pageSize,
        totalItems: 0,
        totalPages: 0,
        sortBy: recordFilters.sortBy,
        sortDir: recordFilters.sortDir,
      });
      setRecordsStatus("idle");
      setRecordsError(null);
      return;
    }

    let cancelled = false;
    setRecordsStatus("loading");
    setRecordsError(null);
    setRelatedRecords([]);

    void apiClient.dataExplorer.getDatasetRecords(selectedDatasetId, recordFilters).then(({ data: result, meta }) => {
      if (cancelled) return;
      setRecordsMeta(meta);
      if (!result) {
        setRecordsStatus(meta.state === "error" ? "error" : "not_found");
        if (meta.state === "error") {
          setRecordsError(meta.errorMessage ?? "Unable to load related records right now.");
        }
        return;
      }
      setRelatedRecords(result.records);
      setRecordsPageInfo(
        result.pageInfo ?? {
          page: recordFilters.page,
          pageSize: recordFilters.pageSize,
          totalItems: result.records.length,
          totalPages: result.records.length > 0 ? 1 : 0,
          sortBy: recordFilters.sortBy,
          sortDir: recordFilters.sortDir,
        },
      );
      setRecordsStatus(result.records.length > 0 ? "idle" : "empty");
    }).catch(() => {
      if (cancelled) return;
      setRecordsStatus("error");
      setRecordsError("Unable to load related records right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [recordFilters, selectedDatasetId]);

  function prepareSelection(dataset: DataExplorerDatasetRow | undefined) {
    setSelectedDatasetId(dataset?.id ?? null);
    setSelectedDetail(buildFallbackDetail(dataset, metadata));
    setDetailStatus(dataset ? "loading" : "idle");
    setDetailError(null);
    setDetailMeta(null);
    setRecordFilters(EMPTY_RECORD_FILTERS);
    setRelatedRecords([]);
    setRecordsPageInfo({
      page: 1,
      pageSize: EMPTY_RECORD_FILTERS.pageSize,
      totalItems: 0,
      totalPages: 0,
      sortBy: EMPTY_RECORD_FILTERS.sortBy,
      sortDir: EMPTY_RECORD_FILTERS.sortDir,
    });
    setRecordsStatus(dataset ? "loading" : "idle");
    setRecordsError(null);
    setRecordsMeta(null);
  }

  async function applyFilters(filters: Required<DataExplorerDatasetFilters>) {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const normalized = normalizeFilters(filters);

    setListStatus("loading");
    setListError(null);

    try {
      const response = await apiClient.dataExplorer.getWorkspace(normalized);

      if (requestSequence.current !== requestId) {
        return;
      }

      setListMeta(response.meta);
      setDatasets(response.data.datasets);
      setActiveFilters(normalized);
      setPageInfo(
        response.data.pageInfo ?? {
          page: normalized.page ?? 1,
          pageSize: normalized.pageSize ?? 25,
          totalItems: response.data.datasets.length,
          totalPages: response.data.datasets.length > 0 ? 1 : 0,
          sortBy: normalized.sortBy ?? "updated",
          sortDir: normalized.sortDir ?? "desc",
        },
      );

      if (response.data.datasets.length === 0) {
        setListStatus("empty");
        prepareSelection(undefined);
        return;
      }

      setListStatus("idle");

      if (selectedDatasetId && response.data.datasets.some((dataset) => dataset.id === selectedDatasetId)) {
        return;
      }

      prepareSelection(response.data.datasets[0]);
    } catch {
      if (requestSequence.current !== requestId) {
        return;
      }
      setListStatus("error");
      setListError("Unable to refresh datasets right now.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void applyFilters(draftFilters);
  }

  function handleResetFilters() {
    setDraftFilters(EMPTY_FILTERS);
    void applyFilters(EMPTY_FILTERS);
  }

  async function handleSavePreset() {
    const draft = {
      name: presetName,
      scope: presetScope,
      filters: {
        q: draftFilters.q,
        category: draftFilters.category,
        region: draftFilters.region,
        status: draftFilters.status,
        sortBy: draftFilters.sortBy,
        sortDir: draftFilters.sortDir,
        pageSize: draftFilters.pageSize,
      },
    };

    const sharedResult = await apiClient.dataExplorer.upsertPreset(draft);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      const savedPreset = sharedResult.presets.find((preset) => preset.name === presetName.trim());
      setSelectedPresetId(savedPreset?.id ?? "");
      setPresetName("");
      setPresetStatus("idle");
      setPresetError(null);
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to save ${presetScope} presets right now.`);
      return;
    }

    const result = saveDataExplorerPreset(draft);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to save presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    const savedPreset = result.presets.find((preset) => preset.name === presetName.trim());
    setSelectedPresetId(savedPreset?.id ?? "");
    setPresetName("");
    setPresetStatus("idle");
    setPresetError(null);
  }

  function handleApplyPreset() {
    const preset = savedPresets.find((item) => item.id === selectedPresetId);

    if (!preset) {
      return;
    }

    const nextFilters: Required<DataExplorerDatasetFilters> = {
      ...EMPTY_FILTERS,
      ...preset.filters,
      page: 1,
    };

    setDraftFilters(nextFilters);
    setPresetStatus("idle");
    setPresetError(null);

    // Usage tracking is best-effort and should never block preset application.
    void apiClient.dataExplorer.markPresetUsed(preset.id, presetScope).then((result) => {
      if (result.ok) {
        setSavedPresets(result.presets);
        return;
      }

      if (!canUseLocalPresetFallback(presetScope, result.reason)) {
        return;
      }

      const markUsedResult = markDataExplorerPresetUsed(preset.id, presetScope);

      if (markUsedResult.ok) {
        setSavedPresets(markUsedResult.presets);
      }
    }).catch(() => {
      if (presetScope !== "shared") {
        return;
      }

      const markUsedResult = markDataExplorerPresetUsed(preset.id, presetScope);

      if (markUsedResult.ok) {
        setSavedPresets(markUsedResult.presets);
      }
    });

    void applyFilters(nextFilters);
  }

  async function handleUpdatePreset() {
    const preset = selectDataExplorerPresetById(savedPresets, selectedPresetId);

    if (!preset) {
      return;
    }

    const draft = {
      id: preset.id,
      name: preset.name,
      scope: presetScope,
      filters: toDataExplorerPresetFilterSnapshot(draftFilters),
    };

    const sharedResult = await apiClient.dataExplorer.upsertPreset(draft);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      setSelectedPresetId(preset.id);
      setPresetStatus("idle");
      setPresetError(null);
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to update ${presetScope} presets right now.`);
      return;
    }

    const result = upsertDataExplorerPreset(draft);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to update presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    setSelectedPresetId(preset.id);
    setPresetStatus("idle");
    setPresetError(null);
  }

  async function handleDeletePreset() {
    if (!selectedPresetId) {
      return;
    }

    const sharedResult = await apiClient.dataExplorer.deletePreset(selectedPresetId, presetScope);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      setSelectedPresetId("");
      setPresetStatus("idle");
      setPresetError(null);
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to delete ${presetScope} presets right now.`);
      return;
    }

    const result = deleteDataExplorerPresetById(selectedPresetId, presetScope);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to update presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    setSelectedPresetId("");
    setPresetStatus("idle");
    setPresetError(null);
  }

  const detailMetadata = toMetadataItems(selectedDetail);
  const filtersApplied = Boolean(activeFilters.q || activeFilters.category || activeFilters.region || activeFilters.status);
  const canGoToPreviousPage = pageInfo.page > 1;
  const canGoToNextPage = pageInfo.totalPages > 0 && pageInfo.page < pageInfo.totalPages;
  const canGoToPreviousRecordsPage = recordsPageInfo.page > 1;
  const canGoToNextRecordsPage =
    recordsPageInfo.totalPages > 0 && recordsPageInfo.page < recordsPageInfo.totalPages;
  const workspaceDegraded = listMeta?.state === "success" && listMeta.source === "mock";
  const workspaceDegradedReason = workspaceDegraded
    ? formatFallbackReasonLabel(listMeta?.fallbackReason)
    : null;
  const recordsDegraded = recordsMeta?.state === "success" && recordsMeta.source === "mock";
  const recordsDegradedReason = recordsDegraded
    ? formatFallbackReasonLabel(recordsMeta?.fallbackReason)
    : null;

  function handleSortByChange(value: DataExplorerDatasetSortBy) {
    const next = { ...draftFilters, sortBy: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handleSortDirChange(value: DataExplorerSortDirection) {
    const next = { ...draftFilters, sortDir: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handlePageSizeChange(value: number) {
    const next = { ...draftFilters, pageSize: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handlePageChange(nextPage: number) {
    const next = { ...draftFilters, page: nextPage };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handleRecordSortByChange(value: DataExplorerRelatedRecordSortBy) {
    setRecordFilters((current) => ({ ...current, sortBy: value, page: 1 }));
  }

  function handleRecordSortDirChange(value: DataExplorerSortDirection) {
    setRecordFilters((current) => ({ ...current, sortDir: value, page: 1 }));
  }

  function handleRecordPageSizeChange(value: number) {
    setRecordFilters((current) => ({ ...current, pageSize: value, page: 1 }));
  }

  function handleRecordPageChange(nextPage: number) {
    setRecordFilters((current) => ({ ...current, page: nextPage }));
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">Data Explorer</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">Research dataset access and rapid preview workspace</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Search across active marine datasets, inspect structure and freshness, and review AI-assisted
          summaries before exporting or joining with other feeds.
        </p>
      </div>

      <Panel
        title="Search and Actions"
        subtitle="Refine the active catalog without leaving the platform shell."
        action={
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Database size={12} className="text-cyan-400" />
            {pageInfo.totalItems} indexed matches
          </div>
        }
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <form className="flex flex-1 flex-col gap-3" onSubmit={handleSubmit}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_160px]">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={draftFilters.q}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))}
                  className="w-full rounded-xl border border-surface-borderSubtle bg-ocean-850 py-2.5 pl-9 pr-4 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                  aria-label="Dataset search"
                  placeholder="Search by dataset name or category"
                />
              </div>
              <select value={draftFilters.category} onChange={(event) => setDraftFilters((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset category filter">
                <option value="">All categories</option>
                {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={draftFilters.region} onChange={(event) => setDraftFilters((current) => ({ ...current, region: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset region filter">
                <option value="">All regions</option>
                {regionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset status filter">
                <option value="">All statuses</option>
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="grid gap-3 lg:grid-cols-[180px_160px_160px_minmax(0,1fr)]">
              <select value={draftFilters.sortBy} onChange={(event) => handleSortByChange(event.target.value as DataExplorerDatasetSortBy)} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset sort field">
                <option value="updated">Sort: Updated</option>
                <option value="name">Sort: Name</option>
                <option value="records">Sort: Records</option>
                <option value="status">Sort: Status</option>
              </select>
              <select value={draftFilters.sortDir} onChange={(event) => handleSortDirChange(event.target.value as DataExplorerSortDirection)} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset sort direction">
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
              <select value={draftFilters.pageSize} onChange={(event) => handlePageSizeChange(Number.parseInt(event.target.value, 10))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset page size">
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
              </select>
              <div className="flex items-center justify-end text-[11px] text-slate-500">
                Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page} of {pageInfo.totalPages}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
              <select
                value={presetScope}
                onChange={(event) => setPresetScope(event.target.value as DataExplorerPresetScope)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Preset scope"
              >
                <option value="shared">Shared preset scope</option>
                <option value="personal">Personal preset scope</option>
              </select>
              <div
                data-testid="preset-scope-description"
                className="flex items-center rounded-xl border border-surface-borderSubtle bg-ocean-900/60 px-3 py-2.5 text-[11px] leading-relaxed text-slate-400"
              >
                {formatPresetScopeDescription(presetScope)}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <input
                type="text"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Preset name"
                placeholder="Save current search as..."
              />
              <select
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Saved presets"
              >
                <option value="">Saved presets</option>
                {sortedPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  void handleSavePreset();
                }}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
              >
                Save preset
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  disabled={!selectedPresetId}
                  className="inline-flex items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleUpdatePreset();
                  }}
                  disabled={!selectedPresetId || selectedPresetInSync}
                  className="inline-flex items-center justify-center rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Update preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeletePreset();
                  }}
                  disabled={!selectedPresetId}
                  className="inline-flex items-center justify-center rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-rose-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500" data-testid="saved-preset-usage-meta">
              {selectedPreset
                ? formatDataExplorerPresetUsageMeta(selectedPreset)
                : "Select a preset to view usage metadata."}
            </div>
            <div className="text-[11px] text-slate-500" data-testid="selected-preset-scope">
              Scope: {formatPresetScopeLabel(selectedPreset?.scope ?? presetScope)}
            </div>
            {selectedPreset && (
              <div className="text-[11px] text-slate-500" data-testid="saved-preset-sync-status">
                {selectedPresetInSync
                  ? "Preset is in sync with current filters."
                  : "Current filters differ from selected preset."}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={listStatus === "loading"} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:cursor-wait disabled:opacity-70">
                <Filter size={13} />
                {listStatus === "loading" ? "Filtering..." : "Apply Filters"}
              </button>
              <button type="button" onClick={handleResetFilters} className="inline-flex items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100">
                <X size={13} className="text-slate-400" />
                Reset
              </button>

              {(listStatus === "loading" || listStatus === "error" || presetStatus === "error" || filtersApplied || workspaceDegraded) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {listStatus === "loading" && <StatusBadge label="Refreshing dataset list" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />}
                  {listStatus === "error" && listError && <StatusBadge label={listError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                  {presetStatus === "error" && presetError && <StatusBadge label={presetError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                  {filtersApplied && <StatusBadge label="Filters active" className="border-amber-500/25 bg-amber-500/10 text-amber-300" />}
                  {workspaceDegraded && (
                    <StatusBadge
                      label={`Fallback data mode (${workspaceDegradedReason})`}
                      className="border-amber-500/25 bg-amber-500/10 text-amber-300"
                    />
                  )}
                </div>
              )}
            </div>

            <DebugBadge label="list" meta={listMeta} />
          </form>

          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.icon];
              return (
                <button
                  key={action.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                    action.tone === "primary"
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15"
                      : "border-surface-borderSubtle bg-ocean-850 text-slate-300 hover:border-cyan-500/30 hover:text-slate-100",
                  )}
                >
                  <Icon size={13} className={action.tone === "primary" ? "text-cyan-400" : "text-slate-400"} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <div className="space-y-6">
          <Panel title="Dataset Catalog" subtitle="A focused list view for recent data products relevant to the current case." action={<div className="flex items-center gap-2 text-[11px] text-slate-500"><Table2 size={13} className="text-cyan-400" />List view</div>}>
            {workspaceDegraded && (
              <div
                data-testid="workspace-degraded-state"
                className="mb-3 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-3"
              >
                <p className="text-xs font-medium text-slate-100">Backend degraded mode</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Showing fallback dataset output because the live repository is unavailable ({workspaceDegradedReason}).
                </p>
              </div>
            )}
            {listStatus === "empty" ? (
              <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/60 p-6">
                <p className="text-sm font-medium text-slate-100">
                  {workspaceDegraded ? "Live dataset catalog unavailable" : "No datasets match the current filters"}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {workspaceDegraded
                    ? `The backend is currently degraded (${workspaceDegradedReason}). Retry after recovery to access live dataset rows.`
                    : "Adjust the search or clear one of the category, region, or status filters to restore results."}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-borderSubtle">
                <div className="grid grid-cols-[120px_minmax(0,1.4fr)_110px_120px_90px_96px] gap-3 bg-ocean-850 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>Dataset</span><span>Name</span><span>Category</span><span>Region</span><span>Records</span><span>Status</span>
                </div>
                <div className="divide-y divide-surface-borderSubtle">
                  {datasets.map((dataset) => {
                    const selected = dataset.id === selectedDatasetId;
                    return (
                      <button key={dataset.id} type="button" onClick={() => prepareSelection(dataset)} className={cn("grid w-full grid-cols-[120px_minmax(0,1.4fr)_110px_120px_90px_96px] gap-3 px-4 py-4 text-left transition-colors", selected ? "bg-cyan-500/8" : "bg-ocean-900/70 hover:bg-ocean-850/70")}>
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] text-slate-500">{dataset.id}</span>
                          <span className="text-[10px] text-slate-600">{dataset.updated}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">{dataset.name}</p>
                          <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><FileSearch size={11} className="text-cyan-400" />Indexed for investigation joins and anomaly review</p>
                        </div>
                        <span className="text-xs text-slate-300">{dataset.category}</span>
                        <span className="text-xs text-slate-400">{dataset.region}</span>
                        <span className="font-mono text-xs text-slate-300">{dataset.records}</span>
                        <div className="flex items-start justify-start"><StatusBadge label={dataset.status} className={STATUS_STYLES[dataset.status]} /></div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-borderSubtle bg-ocean-900/70 px-4 py-3 text-[11px] text-slate-500">
                  <span>
                    Showing {datasets.length === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1}
                    {" "}-{" "}
                    {Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.totalItems)} of {pageInfo.totalItems}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePageChange(pageInfo.page - 1)}
                      disabled={!canGoToPreviousPage || listStatus === "loading"}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="font-mono text-[10px] text-slate-500">
                      Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page}/{pageInfo.totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePageChange(pageInfo.page + 1)}
                      disabled={!canGoToNextPage || listStatus === "loading"}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Dataset Preview" subtitle="A fast look at the currently selected feed before deeper analysis." action={<button className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"><Eye size={12} />Open full preview</button>}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_280px]">
              <div className="rounded-2xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_rgba(2,13,24,0)_38%),linear-gradient(180deg,rgba(6,27,48,0.94),rgba(4,20,37,0.96))] p-5">
                {selectedDetail ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-400">Selected Dataset</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-100">{selectedDetail.name}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">Live blended observations tracking thermal front intensity across the reef boundary, optimized for fast anomaly checks and cross-feed joins.</p>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span>{selectedDetail.category}</span><span className="text-slate-700">•</span><span>{selectedDetail.region}</span><span className="text-slate-700">•</span><span>{selectedDetail.records} records</span>
                        </div>
                      </div>
                      <StatusBadge label={selectedDetail.status} className={STATUS_STYLES[selectedDetail.status]} />
                    </div>

                    {(detailStatus === "loading" || detailStatus === "not_found" || detailStatus === "error") && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                        {detailStatus === "loading" && <StatusBadge label="Loading dataset detail" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />}
                        {detailStatus === "not_found" && <StatusBadge label="Dataset not found" className="border-amber-500/25 bg-amber-500/10 text-amber-300" />}
                        {detailStatus === "error" && detailError && <StatusBadge label={detailError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                      </div>
                    )}

                    <div className="mt-4">
                      <DebugBadge label="detail" meta={detailMeta} />
                    </div>

                    <div className="mt-6">
                      {detailStatus === "not_found" ? (
                        <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-5">
                          <p className="text-sm font-medium text-slate-100">Dataset detail unavailable</p>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">The selected dataset is no longer available in the current detail catalog.</p>
                        </div>
                      ) : (
                        <div className="flex h-48 items-end gap-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-4">
                          {previewSeries.map((point) => (
                            <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                              <div className="flex h-full w-full items-end">
                                <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-cyan-300" style={{ height: `${(point.value / maxValue) * 100}%` }} />
                              </div>
                              <span className="font-mono text-[10px] text-slate-500">{point.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/70 p-5">
                    <p className="text-sm font-medium text-slate-100">No dataset selected</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Adjust the filters or select a dataset from the catalog to load detail.</p>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Preview Metrics</p>
                  <div className="mt-3 space-y-3">
                    <div><p className="text-2xl font-semibold text-slate-100">97.4%</p><p className="text-[11px] text-slate-500">Completeness across active window</p></div>
                    <div><p className="text-2xl font-semibold text-slate-100">5 min</p><p className="text-[11px] text-slate-500">Median ingestion lag</p></div>
                    <div><p className="text-2xl font-semibold text-slate-100">14 grids</p><p className="text-[11px] text-slate-500">High-priority anomaly cells surfaced</p></div>
                  </div>
                </div>

                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Related Records</p>
                    <BellDot size={14} className="text-cyan-400" />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_110px]">
                    <select
                      value={recordFilters.sortBy}
                      onChange={(event) =>
                        handleRecordSortByChange(event.target.value as DataExplorerRelatedRecordSortBy)
                      }
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records sort field"
                    >
                      <option value="updated">Sort: Updated</option>
                      <option value="title">Sort: Title</option>
                      <option value="status">Sort: Status</option>
                      <option value="type">Sort: Type</option>
                    </select>
                    <select
                      value={recordFilters.sortDir}
                      onChange={(event) => handleRecordSortDirChange(event.target.value as DataExplorerSortDirection)}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records sort direction"
                    >
                      <option value="desc">Desc</option>
                      <option value="asc">Asc</option>
                    </select>
                    <select
                      value={recordFilters.pageSize}
                      onChange={(event) => handleRecordPageSizeChange(Number.parseInt(event.target.value, 10))}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records page size"
                    >
                      <option value="2">2 / page</option>
                      <option value="5">5 / page</option>
                      <option value="10">10 / page</option>
                    </select>
                  </div>
                  <div className="mt-3">
                    <DebugBadge label="records" meta={recordsMeta} />
                  </div>
                  {recordsStatus === "loading" && <div className="mt-3"><StatusBadge label="Loading related records" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" /></div>}
                  {recordsStatus === "not_found" && <div className="mt-3 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-4"><p className="text-xs font-medium text-slate-100">Dataset not found</p><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Related records are unavailable because the selected dataset detail no longer exists.</p></div>}
                  {recordsStatus === "error" && <div className="mt-3 rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-4"><p className="text-xs font-medium text-slate-100">Related records unavailable</p><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{recordsError ?? "The related records request failed. Try selecting the dataset again."}</p></div>}
                  {recordsStatus === "empty" && (
                    <div className="mt-3 rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/60 p-4">
                      <p className="text-xs font-medium text-slate-100">
                        {recordsDegraded ? "Related records unavailable in degraded mode" : "No related records yet"}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        {recordsDegraded
                          ? `The related-record repository is currently degraded (${recordsDegradedReason}).`
                          : "No linked records were returned for the currently selected dataset."}
                      </p>
                    </div>
                  )}
                  {recordsStatus === "idle" && relatedRecords.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {relatedRecords.map((record) => (
                        <div key={record.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-[10px] text-slate-500">{record.id}</p>
                              <p className="mt-1 text-xs font-medium text-slate-100">{record.title}</p>
                            </div>
                            <StatusBadge label={record.status} className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span>{record.type}</span><span className="text-slate-700">•</span><span>{record.updated}</span></div>
                          {record.summary && <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{record.summary}</p>}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-[11px] text-slate-500">
                        <span>
                          Showing {relatedRecords.length === 0 ? 0 : (recordsPageInfo.page - 1) * recordsPageInfo.pageSize + 1}
                          {" "}-{" "}
                          {Math.min(recordsPageInfo.page * recordsPageInfo.pageSize, recordsPageInfo.totalItems)} of {recordsPageInfo.totalItems}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRecordPageChange(recordsPageInfo.page - 1)}
                            disabled={!canGoToPreviousRecordsPage}
                            className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Previous records
                          </button>
                          <span className="font-mono text-[10px] text-slate-500">
                            Page {recordsPageInfo.totalPages === 0 ? 0 : recordsPageInfo.page}/{recordsPageInfo.totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRecordPageChange(recordsPageInfo.page + 1)}
                            disabled={!canGoToNextRecordsPage}
                            className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Next records
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Waves size={16} className="mt-0.5 text-cyan-400" />
                    <div>
                      <p className="text-xs font-medium text-slate-200">Suggested next step</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Compare this feed against dissolved oxygen outliers before promoting it to the investigation evidence stack.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Metadata" subtitle="Operational context for the selected dataset." action={<Database size={14} className="text-cyan-400" />} className="h-fit">
            <div className="space-y-3">
              {detailStatus === "not_found" ? (
                <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-4">
                  <p className="text-xs font-medium text-slate-100">Dataset not found</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Metadata could not be loaded because the selected dataset detail no longer exists.</p>
                </div>
              ) : detailStatus === "error" ? (
                <div className="rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-4">
                  <p className="text-xs font-medium text-slate-100">Detail unavailable</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{detailError ?? "The dataset detail request failed. Try selecting the dataset again."}</p>
                </div>
              ) : detailMetadata.length > 0 ? (
                detailMetadata.map((item) => (
                  <div key={item.label} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-200">{item.value}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-4">
                  <p className="text-xs font-medium text-slate-100">No metadata available</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Select a dataset to inspect operational context.</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="AI Summary" subtitle="Machine-assisted readout of the active dataset." action={<Bot size={14} className="text-violet-400" />} className="h-fit">
            <div className="space-y-3">
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
                <div className="flex items-center gap-2"><Sparkles size={14} className="text-violet-400" /><p className="text-xs font-medium text-slate-100">OceanGPT assistant</p></div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">This dataset is a strong candidate for anomaly triage and temporal comparison because it combines stable cadence with high cross-source agreement.</p>
              </div>
              {summarySignals.map((signal) => (
                <div key={signal.title} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-100">{signal.title}</p>
                    <StatusBadge label="Active" className={TONE_STYLES[signal.tone]} />
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{signal.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
```

## apps/web/lib/server/data-explorer-preset-store.test.ts
```ts
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  clearSharedDataExplorerPresetStoreForTests,
  deleteDataExplorerPresetById,
  deleteSharedDataExplorerPresetById,
  loadDataExplorerPresets,
  loadSharedDataExplorerPresets,
  markDataExplorerPresetUsed,
  markSharedDataExplorerPresetUsed,
  upsertDataExplorerPreset,
  upsertSharedDataExplorerPreset,
} from "@/lib/server/data-explorer-preset-store";
import { openReadOnlyDatabase, openWritableDatabase } from "../../../api/src/db/client";

let tempDir: string;
let sharedPresetPath: string;

interface PresetAuditEventRow {
  id: string;
  preset_id: string | null;
  preset_name: string;
  scope: string;
  action: string;
  actor_id: string | null;
  actor_type: string;
  owner_id: string | null;
  outcome: string;
  reason: string | null;
  metadata_json: string | null;
  created_at: string;
}

function readPresetAuditEvents(): PresetAuditEventRow[] {
  const db = openReadOnlyDatabase();

  try {
    const statement = db.prepare(`
      SELECT id, preset_id, preset_name, scope, action, actor_id, actor_type, owner_id, outcome, reason, metadata_json, created_at
      FROM data_explorer_preset_audit_events
      ORDER BY created_at ASC
    `);
    return statement.all() as PresetAuditEventRow[];
  } finally {
    db.close();
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "marine-presets-"));
  sharedPresetPath = join(tempDir, "shared-presets.json");
  vi.stubEnv(
    "MARINE_SHARED_DATA_EXPLORER_PRESETS_PATH",
    sharedPresetPath,
  );
  vi.stubEnv("MARINE_DB_PATH", join(tempDir, "marine.sqlite"));
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  clearSharedDataExplorerPresetStoreForTests();
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

test("shared preset store returns empty set when store does not exist", () => {
  const result = loadSharedDataExplorerPresets();

  expect(result.ok).toBe(true);
  expect(result.presets).toEqual([]);
});

test("shared preset store upserts and rejects case-insensitive duplicate names", () => {
  const createResult = upsertSharedDataExplorerPreset({
    name: "Thermal Live",
    filters: {
      q: "thermal",
      status: "Live",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(createResult.ok).toBe(true);
  expect(createResult.presets).toHaveLength(1);

  const duplicateResult = upsertSharedDataExplorerPreset({
    name: "thermal live",
    filters: {
      q: "thermal",
    },
  });

  expect(duplicateResult.ok).toBe(false);
  expect(duplicateResult.reason).toBe("duplicate_name");
});

test("shared preset store mark-used updates usage metadata", () => {
  const createResult = upsertSharedDataExplorerPreset({
    name: "Usage Target",
    filters: {
      q: "usage",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(createResult.ok).toBe(true);
  const presetId = createResult.presets[0]?.id;
  expect(presetId).toBeDefined();

  const markResult = markSharedDataExplorerPresetUsed(presetId ?? "");

  expect(markResult.ok).toBe(true);
  expect(markResult.presets[0]?.useCount).toBe(1);
  expect(markResult.presets[0]?.lastUsedAt).not.toBeNull();
});

test("shared preset store deletes persisted presets by id", () => {
  const createResult = upsertSharedDataExplorerPreset({
    name: "Delete Target",
    filters: {
      q: "cleanup",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(createResult.ok).toBe(true);
  const presetId = createResult.presets[0]?.id;

  const deleteResult = deleteSharedDataExplorerPresetById(presetId ?? "");

  expect(deleteResult.ok).toBe(true);
  expect(deleteResult.presets).toEqual([]);
  expect(loadSharedDataExplorerPresets().presets).toEqual([]);
});

test("shared preset store migrates legacy shared JSON into sqlite-backed storage", () => {
  writeFileSync(
    sharedPresetPath,
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Migrated Thermal",
          filters: {
            q: "thermal",
            region: "north-atlantic",
          },
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z",
        },
      ],
    }),
    "utf8",
  );

  const loaded = loadSharedDataExplorerPresets();

  expect(loaded.ok).toBe(true);
  expect(loaded.presets).toHaveLength(1);
  expect(loaded.presets[0]).toMatchObject({
    name: "Migrated Thermal",
    createdAt: "2026-03-10T00:00:00.000Z",
    updatedAt: "2026-03-11T00:00:00.000Z",
    filters: {
      q: "thermal",
      region: "north-atlantic",
      category: "",
      status: "",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  rmSync(sharedPresetPath, { force: true });

  const reloaded = loadSharedDataExplorerPresets();

  expect(reloaded.ok).toBe(true);
  expect(reloaded.presets).toHaveLength(1);
  expect(reloaded.presets[0]?.name).toBe("Migrated Thermal");
});

test("repository-backed preset store isolates personal scope from shared scope", () => {
  const sharedResult = upsertDataExplorerPreset({
    name: "Shared Ops",
    scope: "shared",
    filters: { q: "ops" },
  });
  const personalResult = upsertDataExplorerPreset({
    name: "Personal Ops",
    scope: "personal",
    ownerId: "operator-1",
    filters: { q: "ops-personal" },
  });

  expect(sharedResult.ok).toBe(true);
  expect(personalResult.ok).toBe(true);

  expect(loadDataExplorerPresets({ scope: "shared" }).presets.map((preset) => preset.name)).toEqual(["Shared Ops"]);
  expect(
    loadDataExplorerPresets({ scope: "personal", ownerId: "operator-1" }).presets.map((preset) => preset.name),
  ).toEqual(["Personal Ops"]);
});

test("repository-backed preset store isolates personal presets per operator while shared presets stay visible to all", () => {
  upsertDataExplorerPreset({
    name: "Shared Baseline",
    scope: "shared",
    filters: { q: "shared" },
  });
  upsertDataExplorerPreset({
    name: "Operator Alpha",
    scope: "personal",
    ownerId: "operator-alpha",
    filters: { q: "alpha" },
  });
  upsertDataExplorerPreset({
    name: "Operator Bravo",
    scope: "personal",
    ownerId: "operator-bravo",
    filters: { q: "bravo" },
  });

  expect(loadDataExplorerPresets({ scope: "shared" }).presets.map((preset) => preset.name)).toEqual([
    "Shared Baseline",
  ]);
  expect(
    loadDataExplorerPresets({ scope: "personal", ownerId: "operator-alpha" }).presets.map((preset) => preset.name),
  ).toEqual(["Operator Alpha"]);
  expect(
    loadDataExplorerPresets({ scope: "personal", ownerId: "operator-bravo" }).presets.map((preset) => preset.name),
  ).toEqual(["Operator Bravo"]);
});

test("repository-backed preset store requires owner context for personal scope", () => {
  const result = loadDataExplorerPresets({ scope: "personal" });

  expect(result).toMatchObject({
    ok: false,
    reason: "validation",
    error: "Personal preset scope requires an owner key.",
  });
});

test("repository-backed preset store allows duplicate names across scopes and tracks usage within scope", () => {
  const shared = upsertDataExplorerPreset({
    name: "Thermal Watch",
    scope: "shared",
    filters: { q: "shared" },
  });
  const personal = upsertDataExplorerPreset({
    name: "Thermal Watch",
    scope: "personal",
    ownerId: "operator-2",
    filters: { q: "personal" },
  });

  expect(shared.ok).toBe(true);
  expect(personal.ok).toBe(true);

  const personalId = personal.presets[0]?.id ?? "";
  const marked = markDataExplorerPresetUsed(personalId, {
    scope: "personal",
    ownerId: "operator-2",
  });

  expect(marked.ok).toBe(true);
  expect(marked.presets.find((preset) => preset.id === personalId)).toMatchObject({
    id: personalId,
    scope: "personal",
    useCount: 1,
  });
  expect(loadDataExplorerPresets({ scope: "shared" }).presets[0]).toMatchObject({
    name: "Thermal Watch",
    scope: "shared",
    useCount: 0,
  });

  const deleted = deleteDataExplorerPresetById(personalId, {
    scope: "personal",
    ownerId: "operator-2",
  });

  expect(deleted.ok).toBe(true);
  expect(loadDataExplorerPresets({ scope: "personal", ownerId: "operator-2" }).presets).toEqual([]);
  expect(loadDataExplorerPresets({ scope: "shared" }).presets).toHaveLength(1);
});

test("repository-backed preset mutations append durable shared-scope audit events", () => {
  const created = upsertDataExplorerPreset({
    name: "Shared Audit",
    scope: "shared",
    filters: { q: "audit" },
  });
  const presetId = created.presets[0]?.id ?? "";

  const updated = upsertDataExplorerPreset({
    id: presetId,
    name: "Shared Audit Updated",
    scope: "shared",
    filters: { q: "audit-updated" },
  });
  const marked = markDataExplorerPresetUsed(presetId, { scope: "shared" });
  const deleted = deleteDataExplorerPresetById(presetId, { scope: "shared" });

  expect(created.ok).toBe(true);
  expect(updated.ok).toBe(true);
  expect(marked.ok).toBe(true);
  expect(deleted.ok).toBe(true);

  const events = readPresetAuditEvents().map((event) => ({
    action: event.action,
    outcome: event.outcome,
    actor_type: event.actor_type,
    scope: event.scope,
    preset_id: event.preset_id,
  }));

  expect(events).toEqual([
    {
      action: "created",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
    {
      action: "updated",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
    {
      action: "marked_used",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
    {
      action: "deleted",
      outcome: "success",
      actor_type: "unknown",
      scope: "shared",
      preset_id: presetId,
    },
  ]);
});

test("repository-backed personal preset mutations attribute audit events to station admin actor", () => {
  const created = upsertDataExplorerPreset({
    name: "Personal Audit",
    scope: "personal",
    ownerId: "operator-33",
    actor: {
      actorId: "operator-33",
      actorType: "station_admin",
    },
    filters: { q: "personal-audit" },
  });

  expect(created.ok).toBe(true);

  const events = readPresetAuditEvents();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    action: "created",
    outcome: "success",
    scope: "personal",
    owner_id: "operator-33",
    actor_id: "operator-33",
    actor_type: "station_admin",
  });
});

test("repository-backed preset duplicate and not-found mutations emit failure audit events", () => {
  upsertDataExplorerPreset({
    name: "Failure Baseline",
    scope: "shared",
    filters: { q: "base" },
  });

  const duplicate = upsertDataExplorerPreset({
    name: "failure baseline",
    scope: "shared",
    filters: { q: "duplicate" },
  });
  const notFoundDelete = deleteDataExplorerPresetById("missing-preset", { scope: "shared" });

  expect(duplicate.ok).toBe(false);
  expect(duplicate.reason).toBe("duplicate_name");
  expect(notFoundDelete.ok).toBe(false);
  expect(notFoundDelete.reason).toBe("not_found");

  const failureEvents = readPresetAuditEvents().filter((event) => event.outcome === "failure");

  expect(failureEvents).toHaveLength(2);
  expect(failureEvents[0]).toMatchObject({
    action: "created",
    outcome: "failure",
    reason: "duplicate_name",
  });
  expect(failureEvents[1]).toMatchObject({
    action: "deleted",
    outcome: "failure",
    reason: "not_found",
  });
});

test("repository-backed preset mutations stay successful when audit inserts fail", () => {
  const created = upsertDataExplorerPreset({
    name: "Audit Failure Tolerance",
    scope: "shared",
    filters: { q: "resilience" },
  });

  expect(created.ok).toBe(true);
  const presetId = created.presets[0]?.id ?? "";

  const db = openWritableDatabase();
  try {
    db.prepare("DROP TRIGGER IF EXISTS block_preset_audit_insert").run?.();
    db.prepare(`
      CREATE TRIGGER block_preset_audit_insert
      BEFORE INSERT ON data_explorer_preset_audit_events
      BEGIN
        SELECT RAISE(ABORT, 'blocked for test');
      END
    `).run?.();
  } finally {
    db.close();
  }

  const updated = upsertDataExplorerPreset({
    id: presetId,
    name: "Audit Failure Tolerance Updated",
    scope: "shared",
    filters: { q: "resilience-updated" },
  });

  expect(updated.ok).toBe(true);
  expect(updated.presets[0]?.name).toBe("Audit Failure Tolerance Updated");

  const cleanupDb = openWritableDatabase();
  try {
    cleanupDb.prepare("DROP TRIGGER IF EXISTS block_preset_audit_insert").run?.();
  } finally {
    cleanupDb.close();
  }
});
```

## apps/web/app/api/data-explorer/presets/route.test.ts
```ts
import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockLoadDataExplorerPresets, mockUpsertDataExplorerPreset, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockLoadDataExplorerPresets: vi.fn(),
  mockUpsertDataExplorerPreset: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  loadDataExplorerPresets: mockLoadDataExplorerPresets,
  upsertDataExplorerPreset: mockUpsertDataExplorerPreset,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "./scope";
import { GET, POST } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockLoadDataExplorerPresets.mockReset();
  mockUpsertDataExplorerPreset.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockLoadDataExplorerPresets.mockReturnValue({ ok: true, presets: [] });
  mockUpsertDataExplorerPreset.mockReturnValue({ ok: true, presets: [] });
});

test("GET rejects personal preset reads without an authenticated station admin session", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/presets?scope=personal"));

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    presets: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockLoadDataExplorerPresets).not.toHaveBeenCalled();
});

test("GET shared preset reads do not require actor-resolution session lookups", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/presets?scope=shared"));

  expect(response.status).toBe(200);
  expect(mockApiClient.stationAdminAuth.getSession).not.toHaveBeenCalled();
  expect(mockLoadDataExplorerPresets).toHaveBeenCalledWith({
    scope: "shared",
  });
});

test("POST resolves the personal preset owner from the authenticated station admin session", async () => {
  mockSessionCookie.mockReturnValue("session-42");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-42",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-42",
  });

  const response = await POST(new Request("http://localhost/api/data-explorer/presets?scope=personal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Personal Thermal",
      scope: "personal",
      filters: { q: "thermal" },
    }),
  }));

  expect(response.status).toBe(200);
  expect(mockUpsertDataExplorerPreset).toHaveBeenCalledWith(expect.objectContaining({
    name: "Personal Thermal",
    scope: "personal",
    ownerId: "operator-42",
    actor: {
      actorId: "operator-42",
      actorType: "station_admin",
    },
  }));
});

test("POST tags shared preset mutations with unknown actor when no station admin session is available", async () => {
  const response = await POST(new Request("http://localhost/api/data-explorer/presets?scope=shared", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Shared Thermal",
      scope: "shared",
      filters: { q: "thermal" },
    }),
  }));

  expect(response.status).toBe(200);
  expect(mockUpsertDataExplorerPreset).toHaveBeenCalledWith(expect.objectContaining({
    name: "Shared Thermal",
    scope: "shared",
    ownerId: undefined,
    actor: {
      actorId: null,
      actorType: "unknown",
    },
  }));
});

test("POST tags shared preset mutations with station admin actor when session exists", async () => {
  mockSessionCookie.mockReturnValue("session-10");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-10",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-10",
  });

  const response = await POST(new Request("http://localhost/api/data-explorer/presets?scope=shared", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Shared With Actor",
      scope: "shared",
      filters: { q: "shared" },
    }),
  }));

  expect(response.status).toBe(200);
  expect(mockUpsertDataExplorerPreset).toHaveBeenCalledWith(expect.objectContaining({
    name: "Shared With Actor",
    scope: "shared",
    actor: {
      actorId: "operator-10",
      actorType: "station_admin",
    },
  }));
});
```

## apps/web/app/api/data-explorer/presets/[presetId]/route.test.ts
```ts
import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockDeleteDataExplorerPresetById, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockDeleteDataExplorerPresetById: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  deleteDataExplorerPresetById: mockDeleteDataExplorerPresetById,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../scope";
import { DELETE } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockDeleteDataExplorerPresetById.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockDeleteDataExplorerPresetById.mockReturnValue({ ok: true, presets: [] });
});

test("DELETE rejects personal preset mutations without an authenticated station admin session", async () => {
  const response = await DELETE(
    new Request("http://localhost/api/data-explorer/presets/preset-1?scope=personal", { method: "DELETE" }),
    { params: Promise.resolve({ presetId: "preset-1" }) },
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    presets: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockDeleteDataExplorerPresetById).not.toHaveBeenCalled();
});

test("DELETE scopes personal preset mutations to the authenticated station admin actor", async () => {
  mockSessionCookie.mockReturnValue("session-7");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-7",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-7",
  });

  const response = await DELETE(
    new Request("http://localhost/api/data-explorer/presets/preset-7?scope=personal", { method: "DELETE" }),
    { params: Promise.resolve({ presetId: "preset-7" }) },
  );

  expect(response.status).toBe(200);
  expect(mockDeleteDataExplorerPresetById).toHaveBeenCalledWith("preset-7", {
    scope: "personal",
    ownerId: "operator-7",
    actor: {
      actorId: "operator-7",
      actorType: "station_admin",
    },
  });
});

test("DELETE tags shared preset mutations with unknown actor when session is unavailable", async () => {
  const response = await DELETE(
    new Request("http://localhost/api/data-explorer/presets/preset-shared?scope=shared", { method: "DELETE" }),
    { params: Promise.resolve({ presetId: "preset-shared" }) },
  );

  expect(response.status).toBe(200);
  expect(mockDeleteDataExplorerPresetById).toHaveBeenCalledWith("preset-shared", {
    scope: "shared",
    actor: {
      actorId: null,
      actorType: "unknown",
    },
  });
});
```

## apps/web/app/api/data-explorer/presets/[presetId]/mark-used/route.test.ts
```ts
import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockMarkDataExplorerPresetUsed, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockMarkDataExplorerPresetUsed: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  markDataExplorerPresetUsed: mockMarkDataExplorerPresetUsed,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../../scope";
import { POST } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockMarkDataExplorerPresetUsed.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockMarkDataExplorerPresetUsed.mockReturnValue({ ok: true, presets: [] });
});

test("mark-used rejects personal preset usage updates without an authenticated station admin session", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/presets/preset-1/mark-used?scope=personal", { method: "POST" }),
    { params: Promise.resolve({ presetId: "preset-1" }) },
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    presets: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockMarkDataExplorerPresetUsed).not.toHaveBeenCalled();
});

test("mark-used scopes personal preset updates to the authenticated station admin actor", async () => {
  mockSessionCookie.mockReturnValue("session-9");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-9",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-9",
  });

  const response = await POST(
    new Request("http://localhost/api/data-explorer/presets/preset-9/mark-used?scope=personal", { method: "POST" }),
    { params: Promise.resolve({ presetId: "preset-9" }) },
  );

  expect(response.status).toBe(200);
  expect(mockMarkDataExplorerPresetUsed).toHaveBeenCalledWith("preset-9", {
    scope: "personal",
    ownerId: "operator-9",
    actor: {
      actorId: "operator-9",
      actorType: "station_admin",
    },
  });
});

test("mark-used tags shared preset mutations with unknown actor when session is unavailable", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/presets/preset-shared/mark-used?scope=shared", { method: "POST" }),
    { params: Promise.resolve({ presetId: "preset-shared" }) },
  );

  expect(response.status).toBe(200);
  expect(mockMarkDataExplorerPresetUsed).toHaveBeenCalledWith("preset-shared", {
    scope: "shared",
    actor: {
      actorId: null,
      actorType: "unknown",
    },
  });
});
```

