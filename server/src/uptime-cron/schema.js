import { uptimeDb } from "./db.js";

export async function initializeUptimeCronSchema() {
  await uptimeDb.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS uptime_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, name)
    );

    CREATE TABLE IF NOT EXISTS uptime_monitors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      monitor_type TEXT NOT NULL DEFAULT 'http' CHECK (monitor_type IN ('http', 'keyword', 'ping', 'port', 'heartbeat')),
      target_host TEXT,
      packet_count INTEGER,
      packet_timeout INTEGER,
      url TEXT,
      group_id UUID REFERENCES uptime_groups(id) ON DELETE SET NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      interval_seconds INTEGER NOT NULL,
      timeout_seconds INTEGER NOT NULL DEFAULT 30,
      ip_version TEXT NOT NULL DEFAULT 'auto_ipv4_priority',
      follow_redirects BOOLEAN NOT NULL DEFAULT TRUE,
      up_status_codes TEXT[] NOT NULL DEFAULT ARRAY['2xx', '3xx'],
      auth_type TEXT NOT NULL DEFAULT 'none',
      auth_username TEXT,
      auth_password TEXT,
      auth_bearer_token TEXT,
      http_method TEXT NOT NULL DEFAULT 'HEAD',
      request_body TEXT,
      send_as_json BOOLEAN NOT NULL DEFAULT FALSE,
      request_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
      meta_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      ssl_check_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ssl_error_check_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ssl_expiry_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      domain_expiry_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      slow_response_alert_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      slow_response_threshold_ms INTEGER,
      location TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('up', 'down', 'paused', 'pending')),
      is_paused BOOLEAN NOT NULL DEFAULT FALSE,
      heartbeat_token TEXT UNIQUE,
      heartbeat_token_previous TEXT,
      grace_period_seconds INTEGER,
      last_ping_at TIMESTAMPTZ,
      next_expected_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      current_interval_seconds INTEGER,
      checking_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (timeout_seconds >= 5 AND timeout_seconds <= 60),
      CHECK (slow_response_threshold_ms IS NULL OR slow_response_threshold_ms > 0)
    );

    CREATE TABLE IF NOT EXISTS uptime_checks_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      monitor_id UUID NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      success BOOLEAN NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER NOT NULL,
      error_message TEXT,
      location TEXT NOT NULL DEFAULT 'default'
    );

    CREATE TABLE IF NOT EXISTS uptime_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      monitor_id UUID NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      cause TEXT NOT NULL,
      first_error_message TEXT,
      notifications_sent INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS uptime_monitors_due_idx ON uptime_monitors (is_paused, last_checked_at);
    CREATE INDEX IF NOT EXISTS uptime_checks_monitor_time_idx ON uptime_checks_log (monitor_id, checked_at DESC);
    CREATE INDEX IF NOT EXISTS uptime_checks_success_idx ON uptime_checks_log (monitor_id, checked_at DESC) WHERE success = TRUE;
    CREATE INDEX IF NOT EXISTS uptime_checks_fail_idx ON uptime_checks_log (monitor_id, checked_at DESC) WHERE success = FALSE;
    CREATE INDEX IF NOT EXISTS uptime_incidents_open_idx ON uptime_incidents (monitor_id) WHERE resolved_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uptime_incidents_one_open ON uptime_incidents (monitor_id) WHERE resolved_at IS NULL;
    CREATE INDEX IF NOT EXISTS uptime_monitors_heartbeat_idx ON uptime_monitors (monitor_type, next_expected_at);
    CREATE INDEX IF NOT EXISTS uptime_monitors_heartbeat_token_prev_idx ON uptime_monitors (heartbeat_token_previous);
  `);

  // TTL: delete check logs older than 12 hours to protect Supabase 500MB limit
  await uptimeDb.query(
    `DELETE FROM uptime_checks_log WHERE checked_at < NOW() - INTERVAL '12 hours'`
  );

  // Safe migrations — idempotent
  await uptimeDb.query(`
    ALTER TABLE uptime_checks_log
      ADD COLUMN IF NOT EXISTS is_slow BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS suppressed_by_window_id UUID REFERENCES uptime_maintenance_windows(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS response_headers_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE uptime_incidents
      ADD COLUMN IF NOT EXISTS affected_checks INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

    ALTER TABLE uptime_monitors
      ADD COLUMN IF NOT EXISTS heartbeat_token TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS heartbeat_token_previous TEXT,
      ADD COLUMN IF NOT EXISTS grace_period_seconds INTEGER,
      ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS next_expected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS dns_hostname TEXT,
      ADD COLUMN IF NOT EXISTS dns_record_type TEXT,
      ADD COLUMN IF NOT EXISTS dns_expected_values JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS dns_match_mode TEXT,
      ADD COLUMN IF NOT EXISTS dns_resolver_mode TEXT NOT NULL DEFAULT 'authoritative',
      ADD COLUMN IF NOT EXISTS dns_custom_resolver_ip TEXT,
      ADD COLUMN IF NOT EXISTS api_assertions JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS api_assertion_logic TEXT NOT NULL DEFAULT 'all_must_pass',
      ADD COLUMN IF NOT EXISTS api_response_size_limit_kb INTEGER NOT NULL DEFAULT 512,
      ADD COLUMN IF NOT EXISTS udp_probe_type TEXT,
      ADD COLUMN IF NOT EXISTS udp_dns_query_name TEXT,
      ADD COLUMN IF NOT EXISTS udp_snmp_oid TEXT,
      ADD COLUMN IF NOT EXISTS udp_snmp_community TEXT,
      ADD COLUMN IF NOT EXISTS udp_raw_payload TEXT,
      ADD COLUMN IF NOT EXISTS udp_expect_any_response BOOLEAN,
      ADD COLUMN IF NOT EXISTS udp_raw_expected_response TEXT,
      ADD COLUMN IF NOT EXISTS udp_response_timeout_ms INTEGER;

    DO $$
    BEGIN
      ALTER TABLE uptime_monitors DROP CONSTRAINT IF EXISTS uptime_monitors_monitor_type_check;
    EXCEPTION
      WHEN undefined_object THEN null;
    END $$;

    ALTER TABLE uptime_monitors ADD CONSTRAINT uptime_monitors_monitor_type_check CHECK (monitor_type IN ('http', 'keyword', 'ping', 'port', 'heartbeat', 'dns', 'api', 'udp'));

    ALTER TABLE uptime_monitors ADD COLUMN IF NOT EXISTS managed_by TEXT NOT NULL DEFAULT 'node';

    CREATE OR REPLACE FUNCTION notify_monitor_change() RETURNS trigger AS $$
    BEGIN 
      PERFORM pg_notify('monitor_updates', json_build_object('action',TG_OP,'id',COALESCE(NEW.id,OLD.id))::text); 
      RETURN NULL; 
    END $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS monitor_cfg_insdel ON uptime_monitors;
    CREATE TRIGGER monitor_cfg_insdel AFTER INSERT OR DELETE ON uptime_monitors
    FOR EACH ROW EXECUTE FUNCTION notify_monitor_change();

    DROP TRIGGER IF EXISTS monitor_cfg_upd ON uptime_monitors;
    CREATE TRIGGER monitor_cfg_upd AFTER UPDATE ON uptime_monitors FOR EACH ROW
    WHEN (OLD.url IS DISTINCT FROM NEW.url OR OLD.interval_seconds IS DISTINCT FROM NEW.interval_seconds
       OR OLD.monitor_type IS DISTINCT FROM NEW.monitor_type OR OLD.is_paused IS DISTINCT FROM NEW.is_paused
       OR OLD.managed_by IS DISTINCT FROM NEW.managed_by OR OLD.timeout_seconds IS DISTINCT FROM NEW.timeout_seconds
       OR OLD.target_host IS DISTINCT FROM NEW.target_host)
    EXECUTE FUNCTION notify_monitor_change();

    CREATE INDEX IF NOT EXISTS uptime_checks_slow_idx
      ON uptime_checks_log (monitor_id, checked_at DESC)
      WHERE is_slow = TRUE;

    CREATE TABLE IF NOT EXISTS uptime_incident_activity (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      incident_id    UUID NOT NULL REFERENCES uptime_incidents(id) ON DELETE CASCADE,
      check_log_id   UUID REFERENCES uptime_checks_log(id) ON DELETE SET NULL,
      event_type     TEXT NOT NULL,
      message        TEXT,
      status_code    INTEGER,
      response_time_ms INTEGER,
      location       TEXT NOT NULL DEFAULT 'default',
      occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS uptime_incident_activity_incident_idx
      ON uptime_incident_activity (incident_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS uptime_status_pages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      logo_url TEXT,
      brand_color TEXT DEFAULT '#10B981',
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS uptime_status_page_monitors (
      status_page_id UUID REFERENCES uptime_status_pages(id) ON DELETE CASCADE,
      monitor_id UUID REFERENCES uptime_monitors(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (status_page_id, monitor_id)
    );

    CREATE INDEX IF NOT EXISTS idx_uptime_status_pages_user_id ON uptime_status_pages(user_id);
    CREATE INDEX IF NOT EXISTS idx_uptime_status_pages_slug ON uptime_status_pages(slug);

    CREATE TABLE IF NOT EXISTS uptime_maintenance_windows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('one_time', 'weekly')),
      start_time TEXT,
      duration_minutes INTEGER NOT NULL,
      days_of_week TEXT[],
      one_time_start_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS uptime_maintenance_window_monitors (
      window_id UUID REFERENCES uptime_maintenance_windows(id) ON DELETE CASCADE,
      monitor_id UUID REFERENCES uptime_monitors(id) ON DELETE CASCADE,
      PRIMARY KEY (window_id, monitor_id)
    );

    CREATE INDEX IF NOT EXISTS idx_uptime_maintenance_window_monitors ON uptime_maintenance_window_monitors(monitor_id);

    CREATE TABLE IF NOT EXISTS uptime_daily_metrics (
      monitor_id UUID REFERENCES uptime_monitors(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      total_checks INTEGER NOT NULL DEFAULT 0,
      successful_checks INTEGER NOT NULL DEFAULT 0,
      total_response_time_ms BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (monitor_id, date)
    );
  `);
}
