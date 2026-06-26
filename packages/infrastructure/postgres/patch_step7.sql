-- Manual DB Patch for Step 7

ALTER TABLE issue_analysis 
ADD COLUMN IF NOT EXISTS fix_pr_url TEXT;
