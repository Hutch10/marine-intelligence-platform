-- HutchStack Phase 2: environmental harness event lineage for replay

ALTER TABLE environmental_harness_events ADD COLUMN parent_event_id TEXT;
ALTER TABLE environmental_harness_events ADD COLUMN root_event_id TEXT;
ALTER TABLE environmental_harness_events ADD COLUMN event_type TEXT;
ALTER TABLE environmental_harness_events ADD COLUMN signal_id TEXT;
ALTER TABLE environmental_harness_events ADD COLUMN alert_id TEXT;

CREATE INDEX IF NOT EXISTS idx_harness_events_root_created
  ON environmental_harness_events (root_event_id, created_at);

CREATE INDEX IF NOT EXISTS idx_harness_events_signal_created
  ON environmental_harness_events (signal_id, created_at);

CREATE INDEX IF NOT EXISTS idx_harness_events_alert_created
  ON environmental_harness_events (alert_id, created_at);
