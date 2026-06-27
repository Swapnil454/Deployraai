import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
});

// Basic connection test and schema init
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
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});
