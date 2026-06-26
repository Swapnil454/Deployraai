CREATE TABLE IF NOT EXISTS service_level_objectives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,           -- "API Availability"
  metric        TEXT NOT NULL,           -- 'availability' | 'latency_p99'
  target_pct    NUMERIC NOT NULL,        -- 99.9 (meaning 99.9%)
  latency_ms    INTEGER,                 -- only for latency SLOs: "p99 under 500ms"
  window_days   INTEGER NOT NULL DEFAULT 30,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slo_burn_rate_daily (
  slo_id            UUID NOT NULL REFERENCES service_level_objectives(id),
  day               DATE NOT NULL,
  good_minutes      INTEGER NOT NULL,
  total_minutes     INTEGER NOT NULL,
  budget_consumed   NUMERIC NOT NULL,    -- cumulative % of monthly budget consumed
  burn_rate         NUMERIC NOT NULL,    -- current burn rate (1.0 = consuming at exact target rate)
  PRIMARY KEY (slo_id, day)
);
