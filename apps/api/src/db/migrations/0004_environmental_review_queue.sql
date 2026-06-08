-- HutchStack Phase 3: operator review queue for human review burn-in

CREATE TABLE IF NOT EXISTS environmental_review_queue (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  signal_id TEXT,
  alert_id TEXT,
  root_event_id TEXT,
  parent_event_id TEXT,
  queue_status TEXT NOT NULL,
  annotation TEXT,
  actor TEXT,
  review_event_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status_updated
  ON environmental_review_queue (queue_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_queue_subject
  ON environmental_review_queue (subject_type, subject_id);
