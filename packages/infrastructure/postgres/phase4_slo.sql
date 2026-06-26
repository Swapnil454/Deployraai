-- SLO Table
CREATE TABLE IF NOT EXISTS service_level_objectives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric          TEXT NOT NULL, -- 'uptime', 'success_rate', 'latency'
  target_percent  NUMERIC NOT NULL, -- e.g., 99.9
  window_days     INTEGER NOT NULL DEFAULT 30,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX slo_project ON service_level_objectives(project_id);
