-- Teams & RBAC
CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID REFERENCES teams(id),
  user_id     TEXT, -- Legacy column
  name        TEXT NOT NULL,
  platform    TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Error Groups — Fingerprinting AI cache and deploy diff
CREATE TABLE IF NOT EXISTS error_groups (
  fingerprint         TEXT PRIMARY KEY,
  project_id          UUID NOT NULL REFERENCES projects(id),
  exception_type      TEXT NOT NULL,
  sample_stack_trace  TEXT NOT NULL,
  deploy_id           TEXT NOT NULL,
  first_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrence_count    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX error_groups_project_last_seen ON error_groups (project_id, last_seen DESC);

-- Spans — one row per OTEL span
CREATE TABLE IF NOT EXISTS spans (
  id              BIGSERIAL PRIMARY KEY,
  project_id      UUID NOT NULL REFERENCES projects(id),
  deploy_id       TEXT NOT NULL,
  trace_id        TEXT NOT NULL,
  span_id         TEXT NOT NULL UNIQUE,
  parent_span_id  TEXT,
  name            TEXT NOT NULL,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  duration_ms     INTEGER NOT NULL,
  status_code     SMALLINT NOT NULL DEFAULT 0,
  attributes      JSONB NOT NULL DEFAULT '{}',
  events          JSONB NOT NULL DEFAULT '[]',
  fingerprint     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX spans_project_time ON spans (project_id, start_time DESC);
CREATE INDEX spans_trace ON spans (trace_id);
CREATE INDEX spans_status ON spans (project_id, status_code) WHERE status_code = 2;
CREATE INDEX spans_attrs ON spans USING GIN (attributes);
CREATE INDEX spans_project_fingerprint_time_idx ON spans (project_id, fingerprint, created_at DESC);

-- Logs — one row per log line from the drain
CREATE TABLE IF NOT EXISTS logs (
  id          BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id),
  deploy_id   TEXT,
  timestamp   TIMESTAMPTZ NOT NULL,
  level       TEXT NOT NULL DEFAULT 'info', -- error|warn|info|debug
  message     TEXT NOT NULL,
  request_id  TEXT,
  region      TEXT,
  source      TEXT NOT NULL, -- 'vercel'|'netlify'|'render'
  raw         JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX logs_project_time ON logs (project_id, timestamp DESC);
CREATE INDEX logs_level ON logs (project_id, level) WHERE level = 'error';
CREATE INDEX logs_request ON logs (request_id) WHERE request_id IS NOT NULL;
-- Full text search on log messages
CREATE INDEX logs_message_fts ON logs USING GIN (to_tsvector('english', message));

-- Pre-aggregated metrics — updated by ingestor after every span batch
CREATE TABLE IF NOT EXISTS metrics_minutely (
  project_id      UUID NOT NULL REFERENCES projects(id),
  deploy_id       TEXT NOT NULL,
  bucket          TIMESTAMPTZ NOT NULL, -- truncated to minute
  route           TEXT NOT NULL,
  method          TEXT NOT NULL,
  request_count   INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,
  total_duration_ms BIGINT NOT NULL DEFAULT 0,
  p99_duration_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, bucket, route, method)
);

CREATE INDEX metrics_project_time ON metrics_minutely (project_id, bucket DESC);

-- Synthetic health check results
CREATE TABLE IF NOT EXISTS synthetic_checks (
  id            BIGSERIAL PRIMARY KEY,
  project_id    UUID NOT NULL REFERENCES projects(id),
  url           TEXT NOT NULL,
  status_code   SMALLINT,
  latency_ms    INTEGER,
  error         TEXT,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  region        TEXT NOT NULL DEFAULT 'us-east-1'
);

CREATE INDEX synthetic_project_time ON synthetic_checks (project_id, checked_at DESC);

-- Alert rules defined by the user
CREATE TABLE IF NOT EXISTS alert_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  enabled     BOOLEAN DEFAULT TRUE,
  event_type  TEXT NOT NULL DEFAULT 'exception',
  severity    TEXT NOT NULL DEFAULT 'any',
  threshold   INTEGER NOT NULL DEFAULT 1,
  window_minutes INTEGER NOT NULL DEFAULT 5,
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  route_type  TEXT NOT NULL DEFAULT 'dashboard',
  route_target TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CHECK (threshold > 0),
  CHECK (window_minutes > 0),
  CHECK (cooldown_minutes >= 0),
  CHECK (route_type IN ('dashboard', 'email', 'slack_webhook', 'webhook'))
);

CREATE INDEX alert_rules_project_enabled_idx ON alert_rules(project_id, enabled);

-- Alert firings to prevent duplicate notifications
CREATE TABLE IF NOT EXISTS alert_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_id      UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  fingerprint  TEXT,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  severity     TEXT NOT NULL,
  route_type   TEXT NOT NULL,
  route_target TEXT,
  status       TEXT DEFAULT 'queued',
  error_message TEXT,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  CHECK (status IN ('queued', 'sent', 'failed', 'suppressed'))
);

CREATE INDEX alert_events_project_rule_time_idx ON alert_events(project_id, rule_id, triggered_at DESC);
CREATE INDEX alert_events_fingerprint_time_idx ON alert_events(fingerprint, triggered_at DESC);

-- Custom Dashboards layout persistence
CREATE TABLE IF NOT EXISTS custom_dashboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  layout_json JSONB NOT NULL DEFAULT '[]',
  widgets_json JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX custom_dashboards_project ON custom_dashboards (project_id);

-- Status Pages (Step 4)
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

-- Service Level Objectives (Step 4)
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

-- Source Maps for JS Deobfuscation
CREATE TABLE IF NOT EXISTS sourcemaps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  deploy_id   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  source_url  TEXT,
  size_bytes  BIGINT,
  map_content TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, deploy_id, file_name)
);

CREATE INDEX sourcemaps_project_deploy ON sourcemaps(project_id, deploy_id);

-- Issues (Step 3)
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  exception_type TEXT,
  severity TEXT NOT NULL DEFAULT 'error',

  status TEXT NOT NULL DEFAULT 'open',
  assignee_id UUID,

  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  ignored_at TIMESTAMPTZ,

  event_count INTEGER DEFAULT 1,
  affected_users INTEGER DEFAULT 0,

  latest_stacktrace TEXT,
  latest_deobfuscated_stacktrace TEXT,
  latest_span_id TEXT,
  latest_trace_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id, fingerprint),

  CHECK (status IN ('open', 'resolved', 'ignored', 'regressed')),
  CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

CREATE TABLE IF NOT EXISTS issue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  span_id TEXT,
  trace_id TEXT,
  user_id TEXT,
  environment TEXT,
  release TEXT,
  deploy_id TEXT,

  message TEXT,
  stacktrace TEXT,
  deobfuscated_stacktrace TEXT,

  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issue_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE alert_events
ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES issues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS issues_project_status_idx ON issues(project_id, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS issues_project_fingerprint_idx ON issues(project_id, fingerprint);
CREATE INDEX IF NOT EXISTS issue_events_issue_time_idx ON issue_events(issue_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS issue_events_project_time_idx ON issue_events(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS issue_comments_issue_time_idx ON issue_comments(issue_id, created_at ASC);
CREATE INDEX IF NOT EXISTS alert_events_issue_id_idx ON alert_events(issue_id);

-- Step 6: AI Root Cause Analysis

CREATE TABLE IF NOT EXISTS issue_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  suggested_fix TEXT NOT NULL,
  fix_pr_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(issue_id)
);
