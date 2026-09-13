const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

async function run() {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 60 * 1000);
    const query = `
        SELECT stack_trace, sum(value) as total_value
        FROM profiles
        WHERE project_id = $1
          AND service_name = $2
          AND profile_type = $3
          AND timestamp >= $4
          AND timestamp <= $5
        GROUP BY stack_trace
        ORDER BY total_value DESC
        LIMIT 5000
    `;
    const res = await pool.query(query, [
        '6aa6c88d397c2ec071a05583',
        'go-profiler-test',
        'cpu',
        start.toISOString(),
        end.toISOString()
    ]);
    console.log(`Query returned ${res.rowCount} rows`);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
