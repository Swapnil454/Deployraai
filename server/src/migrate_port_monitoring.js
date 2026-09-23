import { uptimeDb } from "./uptime-cron/db.js";

async function runMigration() {
  console.log("Starting Port Monitoring database migration...");

  try {
    // 1. Add new columns
    console.log("Adding new columns...");
    await uptimeDb.query(`
      ALTER TABLE uptime_monitors
        ADD COLUMN IF NOT EXISTS target_port INTEGER,
        ADD COLUMN IF NOT EXISTS connect_timeout INTEGER;
    `);
    console.log("Columns added (if not exists).");

    // 2. Drop the old constraint
    console.log("Updating monitor_type constraint to include 'port'...");
    await uptimeDb.query(`
      ALTER TABLE uptime_monitors DROP CONSTRAINT IF EXISTS uptime_monitors_monitor_type_check;
    `);

    // 3. Re-add the constraint with 'port'
    await uptimeDb.query(`
      ALTER TABLE uptime_monitors ADD CONSTRAINT uptime_monitors_monitor_type_check CHECK (monitor_type IN ('http', 'keyword', 'ping', 'port'));
    `);
    console.log("Constraint updated successfully.");

    console.log("Migration complete!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
