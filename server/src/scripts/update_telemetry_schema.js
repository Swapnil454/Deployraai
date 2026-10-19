import { createClient } from "@clickhouse/client";

const n1 = createClient({ url: "http://localhost:8123", username: "engine", password: "password", database: "default" });
const n2 = createClient({ url: "http://localhost:8124", username: "engine", password: "password", database: "default" });

async function updateSchema() {
  const addCols = `
    ALTER TABLE uptime_checks_telemetry
      ADD COLUMN IF NOT EXISTS latency_us UInt32 CODEC(T64, ZSTD(1)),
      ADD COLUMN IF NOT EXISTS status UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS err_code UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS monitor_type UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS probe_kind UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS interval_s UInt16 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS phase_kind UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS attempts UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS total_latency_us UInt32 CODEC(T64, ZSTD(1)),
      ADD COLUMN IF NOT EXISTS reused UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS did_resume UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS req_method UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS req_scheme UInt8 CODEC(ZSTD(1)),
      ADD COLUMN IF NOT EXISTS generation UInt64 CODEC(ZSTD(1))
  `;

  console.log("Altering Node 1...");
  await n1.command({ query: addCols });
  console.log("Altering Node 2...");
  await n2.command({ query: addCols });

  console.log("Modifying SETTING on Node 1...");
  await n1.command({ query: "ALTER TABLE uptime_checks_telemetry MODIFY SETTING replicated_deduplication_window = 5000, replicated_deduplication_window_seconds = 604800" });
  console.log("Modifying SETTING on Node 2...");
  await n2.command({ query: "ALTER TABLE uptime_checks_telemetry MODIFY SETTING replicated_deduplication_window = 5000, replicated_deduplication_window_seconds = 604800" });

  console.log("\nDone! SHOW CREATE TABLE uptime_checks_telemetry on Node 1:");
  const ddl1 = await (await n1.query({ query: "SHOW CREATE TABLE uptime_checks_telemetry", format: "TabSeparated" })).text();
  console.log(ddl1);

  console.log("\nSHOW CREATE TABLE uptime_checks_telemetry on Node 2:");
  const ddl2 = await (await n2.query({ query: "SHOW CREATE TABLE uptime_checks_telemetry", format: "TabSeparated" })).text();
  console.log(ddl2);
}

updateSchema().catch(console.error);
