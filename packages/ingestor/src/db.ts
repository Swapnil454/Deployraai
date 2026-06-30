import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
  // Connection pool sizing for production load
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDb() {
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rum_events (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        sequence_num INTEGER DEFAULT 0,
        events JSONB,
        url TEXT,
        user_agent TEXT,
        duration_ms INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Add missing columns if table already exists (safe migrations)
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS sequence_num INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS url TEXT`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS user_agent TEXT`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE rum_events ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0`);
    
    // Create missing indexes for RUM events to prevent full table scans
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rum_events_project_time ON rum_events (project_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rum_events_session ON rum_events (session_id)`);
  } catch (err) {
    console.error('Failed to init RUM table', err);
  } finally {
    client.release();
  }
}

db.on('error', (err) => {
  // Log but don't exit — pg Pool will auto-reconnect on the next query
  console.error('Unexpected error on idle DB client (will auto-reconnect):', err.message);
});
