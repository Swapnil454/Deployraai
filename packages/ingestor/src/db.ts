import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
  // Connection pool sizing for production load
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Create rum_events table if it doesn't exist (ingestor owns this schema)
db.on('connect', async (client) => {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rum_events (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        events JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error('Failed to init RUM table', err);
  }
});

db.on('error', (err) => {
  // Log but don't exit — pg Pool will auto-reconnect on the next query
  console.error('Unexpected error on idle DB client (will auto-reconnect):', err.message);
});
