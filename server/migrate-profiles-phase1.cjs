const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { pool } = require('./src/config/postgres.js');

/**
 * Enterprise Database Migration
 * 
 * Phase 1: Database Hardening
 *  1a - Alter timestamp column to TIMESTAMP WITH TIME ZONE (timestamptz)
 *  1b - Drop old B-Tree index and create a BRIN (Block Range Index) for O(1) time-series queries
 *  1c - Add composite index on (project_id, service_name, profile_type) for fast multi-tenant lookups
 */
async function migrate() {
  const client = await pool.connect();
  try {
    console.log('[Migration] Starting enterprise database hardening...\n');
    await client.query('BEGIN');

    // Phase 1a: Fix timezone drift bug permanently
    console.log('[Phase 1a] Altering timestamp column to TIMESTAMP WITH TIME ZONE...');
    await client.query(`
      ALTER TABLE profiles 
      ALTER COLUMN timestamp TYPE TIMESTAMPTZ 
      USING timestamp AT TIME ZONE 'UTC';
    `);
    console.log('[Phase 1a] ✓ Done. All timestamps are now timezone-aware (UTC).\n');

    // Phase 1b: Drop the old inefficient B-Tree index on (project_id, service_name, timestamp)
    // BRIN is orders of magnitude smaller and faster for append-only time-series data.
    console.log('[Phase 1b] Dropping old B-Tree index...');
    await client.query(`DROP INDEX IF EXISTS idx_profiles_project_time;`);
    
    console.log('[Phase 1b] Creating BRIN index on timestamp for time-window queries...');
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_ts_brin
      ON profiles USING BRIN (timestamp)
      WITH (pages_per_range = 64);
    `);
    console.log('[Phase 1b] ✓ Done. BRIN time index created.\n');

    // Phase 1c: Add composite B-Tree index for multi-tenant fast lookups
    // This is the primary index for the flamegraph query's WHERE clause.
    console.log('[Phase 1c] Creating composite B-Tree index for multi-tenant routing...');
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_tenant_lookup
      ON profiles (project_id, service_name, profile_type);
    `);
    console.log('[Phase 1c] ✓ Done. Composite tenant lookup index created.\n');

    await client.query('COMMIT');
    console.log('[Migration] ✅ All database migrations committed successfully.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] ❌ Migration failed! Rolling back transaction...');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
