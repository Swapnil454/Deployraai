import "dotenv/config";
import { uptimeDb } from "./uptime-cron/db.js";

async function run() {
  try {
    console.log("Starting migration: Add Ping Monitoring fields");
    
    // 1. Make url nullable
    await uptimeDb.query(`ALTER TABLE uptime_monitors ALTER COLUMN url DROP NOT NULL;`);
    console.log("Made url nullable");

    // 2. Add new fields
    await uptimeDb.query(`
      ALTER TABLE uptime_monitors 
      ADD COLUMN IF NOT EXISTS target_host TEXT,
      ADD COLUMN IF NOT EXISTS packet_count INTEGER,
      ADD COLUMN IF NOT EXISTS packet_timeout INTEGER;
    `);
    console.log("Added target_host, packet_count, packet_timeout columns");

    // 3. Update the constraint
    await uptimeDb.query(`
      ALTER TABLE uptime_monitors DROP CONSTRAINT IF EXISTS uptime_monitors_monitor_type_check;
      ALTER TABLE uptime_monitors ADD CONSTRAINT uptime_monitors_monitor_type_check CHECK (monitor_type IN ('http', 'keyword', 'ping'));
    `);
    console.log("Updated monitor_type check constraint");

    console.log("Migration successful!");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    process.exit(0);
  }
}

run();
