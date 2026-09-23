import { uptimeDb } from "./uptime-cron/db.js";

async function runMigration() {
  try {
    console.log("Starting Heartbeat Monitoring DB migration...");

    await uptimeDb.query(`
      ALTER TABLE uptime_monitors
        ADD COLUMN IF NOT EXISTS heartbeat_token TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS heartbeat_token_previous TEXT,
        ADD COLUMN IF NOT EXISTS grace_period_seconds INTEGER,
        ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS next_expected_at TIMESTAMPTZ;
    `);
    console.log("Added heartbeat columns to uptime_monitors.");

    await uptimeDb.query(`
      DO $$
      BEGIN
        ALTER TABLE uptime_monitors DROP CONSTRAINT IF EXISTS uptime_monitors_monitor_type_check;
      EXCEPTION
        WHEN undefined_object THEN null;
      END $$;
      ALTER TABLE uptime_monitors ADD CONSTRAINT uptime_monitors_monitor_type_check CHECK (monitor_type IN ('http', 'keyword', 'ping', 'port', 'heartbeat'));
    `);
    console.log("Updated monitor_type check constraint.");

    await uptimeDb.query(`
      CREATE INDEX IF NOT EXISTS uptime_monitors_heartbeat_idx ON uptime_monitors (monitor_type, next_expected_at);
      CREATE INDEX IF NOT EXISTS uptime_monitors_heartbeat_token_prev_idx ON uptime_monitors (heartbeat_token_previous);
    `);
    console.log("Created indexes for Heartbeat.");

    console.log("Migration complete!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
