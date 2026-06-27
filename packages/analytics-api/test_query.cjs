require('dotenv').config({ path: './.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function test() {
  try {
    const res = await pool.query(`
      SELECT
        date_trunc('minute', start_time) as bucket,
        COUNT(*) as volume,
        AVG(duration_ms) as avg_latency,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) as p90,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
        SUM(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) as errors
      FROM spans
      WHERE project_id = $1 AND (parent_span_id IS NULL OR parent_span_id = '') AND start_time > NOW() - INTERVAL '1 hour'
      GROUP BY bucket
      ORDER BY bucket ASC
    `, ['6a2c3b57d3a51ae19d6450da']);
    console.log(res.rows);
  } catch(e) {
    console.error('ERROR:', e);
  } finally {
    pool.end();
  }
}
test();
