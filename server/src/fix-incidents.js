import "dotenv/config";
import { uptimeDb } from "./uptime-cron/db.js";

async function run() {
  try {
    const res = await uptimeDb.query(`
      UPDATE uptime_incidents
      SET resolved_at = NOW()
      WHERE resolved_at IS NULL
        AND cause != 'slow_response'
        AND monitor_id IN (
          SELECT id FROM uptime_monitors WHERE status = 'up'
        )
    `);
    console.log(`Fixed ${res.rowCount} stuck incidents`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
