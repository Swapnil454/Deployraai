import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});
