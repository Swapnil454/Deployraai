const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

async function run() {
  try {
    const res = await pool.query("UPDATE profiles SET service_name = 'go-profiler-test' WHERE service_name = 'go-profiler-test (Demo)'");
    console.log(`Updated ${res.rowCount} rows`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
