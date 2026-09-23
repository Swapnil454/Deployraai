import "dotenv/config";
import { uptimeDb } from "./uptime-cron/db.js";

async function run() {
  try {
    console.log("Starting migration: Drop old constraint and add new one for monitor_type");
    await uptimeDb.query(`
      ALTER TABLE uptime_monitors DROP CONSTRAINT IF EXISTS uptime_monitors_monitor_type_check;
      ALTER TABLE uptime_monitors ADD CONSTRAINT uptime_monitors_monitor_type_check CHECK (monitor_type IN ('http', 'keyword'));
    `);
    console.log("Migration successful!");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    process.exit(0);
  }
}

run();
