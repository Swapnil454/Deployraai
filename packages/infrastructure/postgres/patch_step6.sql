-- Create rum_events table for session replays
CREATE TABLE IF NOT EXISTS rum_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL,
  sequence_num INTEGER NOT NULL DEFAULT 0,
  events       JSONB NOT NULL,
  url          TEXT,
  user_agent   TEXT,
  duration_ms  INTEGER,
  error_count  INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Composite index for fetching all batches of a session IN ORDER
CREATE INDEX IF NOT EXISTS idx_rum_session ON rum_events (project_id, session_id, sequence_num);

-- Index for listing sessions (the sessions list page)
CREATE INDEX IF NOT EXISTS idx_rum_project_time ON rum_events (project_id, created_at DESC);

-- Add public write key for RUM
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rum_write_key TEXT;
