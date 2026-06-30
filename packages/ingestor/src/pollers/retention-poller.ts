import { db } from '../db.js';

const SLEEP_MS = 2000;
const DELETE_CHUNK_SIZE = 5000;

const RETENTION_POLICIES = [
  { table: 'synthetic_checks', timeColumn: 'checked_at', daysToKeep: 14 },
  { table: 'metrics_minutely', timeColumn: 'bucket', daysToKeep: 30 },
  { table: 'custom_events', timeColumn: 'created_at', daysToKeep: 30 },
  { table: 'rum_events', timeColumn: 'created_at', daysToKeep: 30 },
  { table: 'sourcemaps', timeColumn: 'created_at', daysToKeep: 90 },
  { table: 'alert_events', timeColumn: 'triggered_at', daysToKeep: 90 },
  { table: 'error_groups', timeColumn: 'last_seen', daysToKeep: 90 }
];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runRetentionPoller() {
  let client;
  try {
    client = await db.connect();
    const { rows } = await client.query('SELECT pg_try_advisory_lock(2002) as locked');
    if (!rows[0].locked) {
      console.log('[RetentionPoller] Another replica is running retention, aborting.');
      return;
    }

    console.log('[RetentionPoller] Lock acquired, starting retention pruning...');

    for (const policy of RETENTION_POLICIES) {
      try {
        console.log(`[RetentionPoller] Pruning ${policy.table} older than ${policy.daysToKeep} days...`);
      
      let rowsDeleted = 0;
      let hasMore = true;

      while (hasMore) {
        // Use a CTE with CTID for fast chunked deletion in PostgreSQL
        const res = await db.query(`
          WITH cte AS (
            SELECT ctid
            FROM ${policy.table}
            WHERE ${policy.timeColumn} < NOW() - INTERVAL '${policy.daysToKeep} days'
            LIMIT ${DELETE_CHUNK_SIZE}
          )
          DELETE FROM ${policy.table}
          WHERE ctid IN (SELECT ctid FROM cte);
        `);

        const deletedCount = res.rowCount ?? 0;
        rowsDeleted += deletedCount;

        if (deletedCount < DELETE_CHUNK_SIZE) {
          hasMore = false; // We've deleted all rows that match the criteria
        } else {
          // Sleep between chunks to avoid I/O spikes and allow other queries to execute
          await sleep(SLEEP_MS);
        }
      }

      console.log(`[RetentionPoller] Finished pruning ${policy.table}. Deleted ${rowsDeleted} rows.`);
    } catch (err: any) {
      console.error(`[RetentionPoller] Error pruning ${policy.table}:`, err.message);
    }
    
    // Stagger pruning between different tables
    await sleep(SLEEP_MS * 2);
  }

    console.log('[RetentionPoller] Retention pruning complete.');
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock(2002)');
      client.release();
      console.log('[RetentionPoller] Lock released.');
    }
  }
}
