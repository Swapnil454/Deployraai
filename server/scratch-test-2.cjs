const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

async function run() {
  try {
    const query = `
        SELECT stack_trace, sum(value) as total_value, min(timestamp) as min_ts, max(timestamp) as max_ts
        FROM profiles
        WHERE project_id = $1
          AND service_name = $2
          AND profile_type = $3
        GROUP BY stack_trace
        ORDER BY total_value DESC
        LIMIT 5
    `;
    const res = await pool.query(query, [
        '6aa6c88d397c2ec071a05583',
        'go-profiler-test',
        'cpu'
    ]);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
