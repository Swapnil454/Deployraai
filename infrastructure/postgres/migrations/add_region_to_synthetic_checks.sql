ALTER TABLE synthetic_checks ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'us-east-1';
CREATE INDEX IF NOT EXISTS synthetic_region ON synthetic_checks (project_id, region, checked_at DESC);
