-- ============================================================
-- PASTE THIS ENTIRE BLOCK INTO SUPABASE SQL EDITOR AND RUN
-- ============================================================

-- Step 1: Add missing columns safely
ALTER TABLE uptime_checks_log
  ADD COLUMN IF NOT EXISTS is_slow BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE uptime_incidents
  ADD COLUMN IF NOT EXISTS affected_checks INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS uptime_incident_activity (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id      UUID NOT NULL REFERENCES uptime_incidents(id) ON DELETE CASCADE,
  check_log_id     UUID REFERENCES uptime_checks_log(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL,
  message          TEXT,
  status_code      INTEGER,
  response_time_ms INTEGER,
  location         TEXT NOT NULL DEFAULT 'default',
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS uptime_incident_activity_idx
  ON uptime_incident_activity (incident_id, occurred_at DESC);

-- Step 2: DELETE all duplicate open incidents.
-- For each monitor: keep only the SINGLE earliest open incident, delete all others.
DELETE FROM uptime_incidents
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY monitor_id
        ORDER BY started_at ASC   -- keep the first/earliest one
      ) AS rn
    FROM uptime_incidents
    WHERE resolved_at IS NULL
  ) ranked
  WHERE rn > 1   -- delete everything after the first
);

-- Step 3: Reset affected_checks counter (clean start)
UPDATE uptime_incidents SET affected_checks = 1;

-- Step 4: Verify — should show max 1 open incident per monitor
SELECT
  m.url,
  COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL)  AS open_incidents,
  COUNT(i.id) FILTER (WHERE i.resolved_at IS NOT NULL) AS resolved_incidents
FROM uptime_monitors m
LEFT JOIN uptime_incidents i ON i.monitor_id = m.id
GROUP BY m.url
ORDER BY open_incidents DESC;
