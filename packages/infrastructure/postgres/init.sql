-- Projects table (reference — main app owns this, ingestor just reads it)
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  platform    TEXT NOT NULL, -- 'vercel' | 'netlify' | 'render' | 'railway'
  token_hash  TEXT NOT NULL, -- bcrypt hash of the project token
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

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
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX spans_project_time ON spans (project_id, start_time DESC);
CREATE INDEX spans_trace ON spans (trace_id);
CREATE INDEX spans_status ON spans (project_id, status_code) WHERE status_code = 2;
CREATE INDEX spans_attrs ON spans USING GIN (attributes);

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
  project_id  UUID NOT NULL REFERENCES projects(id),
  metric      TEXT NOT NULL, -- 'error_rate'|'p99_latency'|'uptime'
  operator    TEXT NOT NULL, -- 'gt'|'lt'
  threshold   NUMERIC NOT NULL,
  window_mins INTEGER NOT NULL DEFAULT 5,
  channels    JSONB NOT NULL DEFAULT '[]', -- [{type:'slack', url:'...'}, ...]
  enabled     BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Alert firings to prevent duplicate notifications
CREATE TABLE IF NOT EXISTS alert_firings (
  id           BIGSERIAL PRIMARY KEY,
  rule_id      UUID NOT NULL REFERENCES alert_rules(id),
  project_id   UUID NOT NULL REFERENCES projects(id),
  metric_value NUMERIC NOT NULL,
  fired_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX alert_firings_rule_time ON alert_firings (rule_id, fired_at DESC);
