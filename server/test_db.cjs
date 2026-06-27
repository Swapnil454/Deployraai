require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const res = await pool.query('SELECT * FROM service_level_objectives LIMIT 1');
    console.log('SLO table rows:', res.rows.length);
  } catch(e) {
    console.error('SLO Query Error:', e);
  }
  process.exit(0);
}
run();
