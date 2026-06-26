// scripts/run-migrations.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://admin:secret@localhost:5432/observability' });

const migrations = [
  'infrastructure/postgres/migrations/add_region_to_synthetic_checks.sql',
  'infrastructure/postgres/migrations/add_slo_tables.sql',
];

async function run() {
  for (const file of migrations) {
    const sql = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    console.log(`Running: ${file}`);
    try {
      await pool.query(sql);
      console.log(`✓ Done: ${file}`);
    } catch (err) {
      if (err.code === '42701' || err.code === '42P07') { // duplicate_column or duplicate_table
        console.log(`⚠ Skipped (already applied): ${file}`);
      } else {
        console.error(`✗ Failed: ${file}`, err.message);
        process.exit(1); 
      }
    }
  }
  await pool.end();
}

run();
