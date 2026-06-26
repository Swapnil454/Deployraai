import { Pool } from 'pg';
import { createClient } from '@clickhouse/client';
import dotenv from 'dotenv';
dotenv.config();

const pg = new Pool({ connectionString: process.env.DATABASE_URL });
const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || 'tracepilot'
});

async function runBackfill() {
  console.log("Starting backfill from Postgres to ClickHouse...");

  // Fetch high-water mark from ClickHouse
  const chRes = await clickhouse.query({
    query: 'SELECT max(start_time) as max_t FROM spans',
    format: 'JSONEachRow'
  });
  const chData = await chRes.json<{max_t: string}[]>();
  const maxTime = chData[0]?.max_t && chData[0].max_t !== '1970-01-01 00:00:00' 
    ? new Date(chData[0].max_t + 'Z') 
    : new Date(0);

  console.log(`Resuming backfill for spans after ${maxTime.toISOString()}`);

  const limit = 10000;
  let totalProcessed = 0;

  while (true) {
    const res = await pg.query(`
      SELECT 
        id, project_id, deploy_id, trace_id, span_id, parent_span_id,
        name, start_time, end_time, duration_ms, status_code,
        attributes, events, created_at
      FROM spans
      WHERE start_time > $1
      ORDER BY start_time ASC, id ASC
      LIMIT $2
    `, [maxTime, limit]);

    if (res.rows.length === 0) {
      break;
    }

    const clickhouseRows = res.rows.map(r => ({
      project_id: r.project_id,
      deploy_id: r.deploy_id || '',
      trace_id: r.trace_id,
      span_id: r.span_id,
      parent_span_id: r.parent_span_id || '',
      name: r.name,
      start_time: r.start_time.toISOString().replace('T', ' ').replace('Z', ''),
      end_time: r.end_time.toISOString().replace('T', ' ').replace('Z', ''),
      duration_ms: r.duration_ms,
      status_code: r.status_code,
      http_method: r.attributes?.['http.method'] || '',
      http_route: r.attributes?.['http.route'] || '',
      attributes: JSON.stringify(r.attributes || {}),
      events: JSON.stringify(r.events || [])
    }));

    await clickhouse.insert({
      table: 'spans',
      values: clickhouseRows,
      format: 'JSONEachRow'
    });

    totalProcessed += res.rows.length;
    console.log(`Backfilled ${totalProcessed} spans...`);
    
    // Update the high-water mark for the next iteration
    maxTime.setTime(res.rows[res.rows.length - 1].start_time.getTime());
  }

  console.log("Backfill complete!");
  process.exit(0);
}

runBackfill().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
