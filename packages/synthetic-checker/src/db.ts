import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => {
  // Log but don't exit — pool will auto-reconnect
  console.error('Unexpected error on idle DB client (will auto-reconnect):', err.message);
});
