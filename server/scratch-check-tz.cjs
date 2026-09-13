const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

async function run() {
  try {
    const res = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'timestamp'");
    console.log(res.rows);
    const tz = await pool.query("SHOW timezone");
    console.log("DB Timezone:", tz.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
