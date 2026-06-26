-- Manual DB Patch for Step 6

CREATE TABLE IF NOT EXISTS issue_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  suggested_fix TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(issue_id)
);
