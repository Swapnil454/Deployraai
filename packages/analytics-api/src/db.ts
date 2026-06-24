import { Pool } from 'pg';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
});

// Basic connection test
db.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});
