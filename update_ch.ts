import { clickhouse } from './packages/analytics-api/src/clickhouse.js';

async function run() {
  try {
    console.log("Adding TTL to logs...");
    await clickhouse.command({ query: "ALTER TABLE logs MODIFY TTL toDateTime(timestamp) + INTERVAL 30 DAY" });
    
    console.log("Adding TTL to spans...");
    await clickhouse.command({ query: "ALTER TABLE spans MODIFY TTL toDateTime(start_time) + INTERVAL 30 DAY" });

    console.log("Adding bloom filter index to spans...");
    await clickhouse.command({ query: "ALTER TABLE spans ADD INDEX IF NOT EXISTS trace_id_idx trace_id TYPE bloom_filter GRANULARITY 4" });
    
    console.log("Materializing index (may take time on large tables, but table is small)...");
    await clickhouse.command({ query: "ALTER TABLE spans MATERIALIZE INDEX trace_id_idx" });

    console.log("Done!");
  } catch (err) {
    console.error(err);
  }
}
run();
