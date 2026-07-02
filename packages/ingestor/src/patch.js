import { Pool } from 'pg';

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
});

async function runPatch() {
  try {
    console.log('Running patch...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

        fingerprint TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        exception_type TEXT,
        severity TEXT NOT NULL DEFAULT 'error',

        status TEXT NOT NULL DEFAULT 'open',
        assignee_id UUID,

        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        status_changed_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        ignored_at TIMESTAMPTZ,

        event_count INTEGER DEFAULT 1,
        affected_users INTEGER DEFAULT 0,

        latest_stacktrace TEXT,
        latest_deobfuscated_stacktrace TEXT,
        latest_span_id TEXT,
        latest_trace_id TEXT,

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(project_id, fingerprint),

        CHECK (status IN ('open', 'resolved', 'ignored', 'regressed')),
        CHECK (severity IN ('info', 'warning', 'error', 'critical'))
      );

      CREATE TABLE IF NOT EXISTS issue_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

        span_id TEXT,
        trace_id TEXT,
        user_id TEXT,
        environment TEXT,
        release TEXT,
        deploy_id TEXT,

        message TEXT,
        stacktrace TEXT,
        deobfuscated_stacktrace TEXT,

        occurred_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS issue_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        user_id UUID,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE alert_events
      ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES issues(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS issues_project_status_idx ON issues(project_id, status, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS issues_project_fingerprint_idx ON issues(project_id, fingerprint);
      CREATE INDEX IF NOT EXISTS issue_events_issue_time_idx ON issue_events(issue_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS issue_events_project_time_idx ON issue_events(project_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS issue_comments_issue_time_idx ON issue_comments(issue_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS alert_events_issue_id_idx ON alert_events(issue_id);
    `);
    console.log('Patch complete.');
  } catch (err) {
    console.error('Patch failed', err);
  } finally {
    await db.end();
  }
}

runPatch();
