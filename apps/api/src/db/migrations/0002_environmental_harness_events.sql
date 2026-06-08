-- HutchStack Environmental Intelligence Harness audit events
-- Apply via bootstrap or Turso migration tooling

CREATE TABLE IF NOT EXISTS environmental_harness_events (
  id TEXT PRIMARY KEY,
  event_kind TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_harness_events_kind_created
  ON environmental_harness_events (event_kind, created_at);

CREATE INDEX IF NOT EXISTS idx_harness_events_subject
  ON environmental_harness_events (subject_type, subject_id);
