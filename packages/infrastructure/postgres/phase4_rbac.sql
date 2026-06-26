-- Phase 4 RBAC & Teams Schema Updates

-- 1. Create Teams
CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL, -- Keep TEXT for now, mapping to external auth or MongoDB ObjectId
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Team Members (RBAC)
CREATE TABLE IF NOT EXISTS team_members (
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL, -- Mapping to external auth or MongoDB ObjectId
  role        TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- 3. Modify Projects
-- Allow user_id to be null temporarily during migration
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- Optional: Create a default personal team for all existing projects if running on existing db
-- INSERT INTO teams (id, name, owner_id) SELECT gen_random_uuid(), 'Personal Team', user_id FROM projects WHERE team_id IS NULL;
-- (Note: Since this is a dev DB, we might just wipe or run a proper backfill script. For now, schema is sufficient)

-- Add index on team_id
CREATE INDEX IF NOT EXISTS projects_team_id ON projects(team_id);
