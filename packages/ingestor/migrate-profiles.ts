import { Pool } from 'pg';
import { createClient } from '@clickhouse/client';

const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'default'
});

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability',
});

async function migrateProfiles() {
  console.log('Connecting to Postgres...');
  const client = await db.connect();
  
  try {
    console.log('Fetching profiles from Postgres...');
    const result = await client.query('SELECT project_id, service_name, profile_type, timestamp, stack_trace, value FROM profiles');
    const rows = result.rows;
    console.log(`Found ${rows.length} rows to migrate.`);
    
    if (rows.length > 0) {
      console.log('Inserting into ClickHouse...');
      await clickhouse.insert({
        table: 'profiles',
        values: rows.map(r => ({
          project_id: r.project_id,
          service_name: r.service_name,
          profile_type: r.profile_type,
          timestamp: new Date(r.timestamp).getTime(),
          stack_trace: r.stack_trace,
          value: Number(r.value)
        })),
        format: 'JSONEachRow'
      });
      console.log('Migration complete!');
    }
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await db.end();
    await clickhouse.close();
  }
}

migrateProfiles();
