-- HutchStack Phase 4: environmental signal root lineage on persisted public signal tables

ALTER TABLE observations ADD COLUMN signal_id TEXT;
ALTER TABLE observations ADD COLUMN root_event_id TEXT;
ALTER TABLE observations ADD COLUMN source_ingestion_event_id TEXT;
ALTER TABLE observations ADD COLUMN verification_event_id TEXT;
ALTER TABLE observations ADD COLUMN provenance_hash TEXT;

ALTER TABLE derived_signals ADD COLUMN harness_signal_id TEXT;
ALTER TABLE derived_signals ADD COLUMN root_event_id TEXT;
ALTER TABLE derived_signals ADD COLUMN source_ingestion_event_id TEXT;
ALTER TABLE derived_signals ADD COLUMN verification_event_id TEXT;
ALTER TABLE derived_signals ADD COLUMN provenance_hash TEXT;

ALTER TABLE station_metrics ADD COLUMN harness_signal_id TEXT;
ALTER TABLE station_metrics ADD COLUMN root_event_id TEXT;
ALTER TABLE station_metrics ADD COLUMN source_ingestion_event_id TEXT;
ALTER TABLE station_metrics ADD COLUMN verification_event_id TEXT;
ALTER TABLE station_metrics ADD COLUMN provenance_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_observations_signal_id ON observations (signal_id);
CREATE INDEX IF NOT EXISTS idx_derived_signals_harness_signal_id ON derived_signals (harness_signal_id);
CREATE INDEX IF NOT EXISTS idx_station_metrics_harness_signal_id ON station_metrics (harness_signal_id);
