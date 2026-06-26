-- Manual DB Patch for Step 5

CREATE TABLE IF NOT EXISTS status_page_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  current_status TEXT NOT NULL DEFAULT 'operational',
  position INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (current_status IN ('operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance')),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS status_page_components_project_idx
ON status_page_components(project_id, position ASC);

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'investigating',
  severity TEXT NOT NULL DEFAULT 'minor',

  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  CHECK (severity IN ('minor', 'major', 'critical'))
);

CREATE INDEX IF NOT EXISTS incidents_project_status_idx
ON incidents(project_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS incidents_project_started_idx
ON incidents(project_id, started_at DESC);

CREATE TABLE IF NOT EXISTS incident_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,

  message TEXT NOT NULL,
  new_status TEXT NOT NULL,
  created_by UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (new_status IN ('investigating', 'identified', 'monitoring', 'resolved'))
);

CREATE INDEX IF NOT EXISTS incident_updates_incident_time_idx
ON incident_updates(incident_id, created_at ASC);

CREATE TABLE IF NOT EXISTS incident_components (
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (incident_id, component_id)
);

CREATE INDEX IF NOT EXISTS incident_components_component_idx
ON incident_components(component_id);
