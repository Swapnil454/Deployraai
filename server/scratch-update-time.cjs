const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

async function run() {
  try {
    // Update the timestamps to NOW() so they appear in the last 30 minutes query
    const res = await pool.query("UPDATE profiles SET timestamp = NOW()");
    console.log(`Updated ${res.rowCount} profile records to NOW()`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
