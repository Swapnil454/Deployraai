CREATE TABLE IF NOT EXISTS custom_dashboards (
  id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  layout_json JSONB NOT NULL DEFAULT '[]',
  widgets_json JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS custom_dashboards_project ON custom_dashboards (project_id);

CREATE TABLE IF NOT EXISTS custom_events (
  id          BIGSERIAL PRIMARY KEY,
  project_id  VARCHAR(36) NOT NULL REFERENCES projects(id),
  trace_id    TEXT,
  event_name  TEXT NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS custom_events_project_name_time
  ON custom_events (project_id, event_name, created_at DESC);
