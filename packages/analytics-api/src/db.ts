import { Pool } from 'pg';

console.log('Using DATABASE_URL:', process.env.DATABASE_URL);

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
  // Pool sizing for production load
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => {
  // Log but don't exit — pool will auto-reconnect
  console.error('Unexpected error on idle DB client (will auto-reconnect):', err.message);
});
