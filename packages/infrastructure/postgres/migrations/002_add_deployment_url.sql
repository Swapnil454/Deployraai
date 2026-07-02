-- Migration: Add deployment_url and health_check_path to projects table
-- Run this once after the initial schema is applied.
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deployment_url TEXT,
  ADD COLUMN IF NOT EXISTS health_check_path TEXT NOT NULL DEFAULT '/';

-- Index for synthetic checker query (filters non-null URLs only)
CREATE INDEX IF NOT EXISTS projects_deployment_url_idx ON projects (deployment_url) WHERE deployment_url IS NOT NULL;
