import "dotenv/config";
import { uptimeDb } from "./uptime-cron/db.js";

async function run() {
  try {
    console.log("Starting migration: Add Keyword Monitoring fields");
    const res = await uptimeDb.query(`
      ALTER TABLE uptime_monitors
      ADD COLUMN IF NOT EXISTS monitor_type VARCHAR(20) DEFAULT 'http',
      ADD COLUMN IF NOT EXISTS keyword TEXT,
      ADD COLUMN IF NOT EXISTS keyword_condition VARCHAR(20),
      ADD COLUMN IF NOT EXISTS case_sensitive BOOLEAN DEFAULT false;
    `);
    console.log("Migration successful!");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    process.exit(0);
  }
}

run();
