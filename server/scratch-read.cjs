const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

async function run() {
  try {
    const res = await pool.query("SELECT * FROM profiles ORDER BY timestamp DESC LIMIT 5");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
