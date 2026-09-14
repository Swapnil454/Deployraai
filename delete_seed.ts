import { clickhouse } from './packages/analytics-api/src/clickhouse.js';

async function run() {
  try {
    console.log("Truncating ClickHouse tables...");
    await clickhouse.command({ query: "TRUNCATE TABLE metrics_minutely_mv" });
    await clickhouse.command({ query: "TRUNCATE TABLE spans" });
    console.log("Deleted seeded data from clickhouse");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
