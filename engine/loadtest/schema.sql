CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS uptime_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'mock',
    monitor_type TEXT NOT NULL DEFAULT 'http' CHECK (monitor_type IN ('http', 'keyword', 'ping', 'port', 'heartbeat', 'dns', 'api', 'udp')),
    target_host TEXT,
    url TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    interval_seconds INTEGER NOT NULL,
    timeout_seconds INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('up', 'down', 'paused', 'pending')),
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    managed_by TEXT NOT NULL DEFAULT 'node',
    last_checked_at TIMESTAMPTZ,
    current_interval_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS uptime_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    cause TEXT NOT NULL,
    first_error_message TEXT,
    notifications_sent INTEGER NOT NULL DEFAULT 0,
    affected_checks INTEGER NOT NULL DEFAULT 1,
    last_checked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS uptime_incidents_open_idx ON uptime_incidents (monitor_id) WHERE resolved_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uptime_incidents_one_open ON uptime_incidents (monitor_id) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS uptime_daily_metrics (
    monitor_id UUID REFERENCES uptime_monitors(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_checks INTEGER NOT NULL DEFAULT 0,
    successful_checks INTEGER NOT NULL DEFAULT 0,
    total_response_time_ms BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (monitor_id, date)
);
