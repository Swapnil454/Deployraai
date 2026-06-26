-- Manual DB Patch for Step 4

CREATE TABLE IF NOT EXISTS status_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  enabled BOOLEAN DEFAULT FALSE,
  slug TEXT UNIQUE,
  title TEXT,
  description TEXT,

  show_uptime_history BOOLEAN DEFAULT TRUE,
  show_incidents BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS status_pages_project_idx ON status_pages(project_id);
CREATE INDEX IF NOT EXISTS status_pages_slug_idx ON status_pages(slug);

DROP TABLE IF EXISTS service_level_objectives CASCADE;

CREATE TABLE IF NOT EXISTS service_level_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  type TEXT NOT NULL,
  target_percentage NUMERIC(5,2) NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 30,

  metric_source TEXT NOT NULL DEFAULT 'synthetic_checks',
  latency_threshold_ms INTEGER,

  enabled BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (type IN ('uptime', 'success_rate', 'latency')),
  CHECK (target_percentage > 0 AND target_percentage <= 100),
  CHECK (window_days > 0)
);

CREATE INDEX IF NOT EXISTS slos_project_enabled_idx ON service_level_objectives(project_id, enabled);
