import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), 'packages/analytics-api/.env'), override: true });

async function run() {
  try {
    console.log("Using DATABASE_URL:", process.env.DATABASE_URL);
    const { db } = await import('./packages/analytics-api/src/db.js');
    console.log("Truncating Postgres tables...");
    await db.query("TRUNCATE TABLE rum_events RESTART IDENTITY CASCADE");
    console.log("Deleted sessions mock data from postgres");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
