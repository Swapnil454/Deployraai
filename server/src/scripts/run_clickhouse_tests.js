import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function runProductionTypeTest() {
  console.log("=== ClickHouse AggregatingMergeTree Test with Production Column Types ===");

  await client.command({ query: "DROP TABLE IF EXISTS t_mv" });
  await client.command({ query: "DROP TABLE IF EXISTS t_roll" });
  await client.command({ query: "DROP TABLE IF EXISTS t_src" });

  // 1. Source Table with exact production column types
  await client.command({
    query: `
      CREATE TABLE t_src (
        monitor_id UUID CODEC(ZSTD(1)),
        location LowCardinality(String) CODEC(ZSTD(1)),
        checked_at DateTime64(3, 'UTC') CODEC(DoubleDelta, ZSTD(1)),
        status_code UInt16 CODEC(T64, ZSTD(1)),
        success UInt8 CODEC(T64, ZSTD(1)),
        response_time_ms UInt32 CODEC(T64, ZSTD(1)),
        error_message LowCardinality(String) CODEC(ZSTD(1)),
        suppressed_by_window_id Nullable(UUID) CODEC(ZSTD(1))
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMMDD(checked_at)
      ORDER BY (monitor_id, checked_at);
    `
  });

  // 2. Destination Rollup Table with exact production AggregatingMergeTree schema
  await client.command({
    query: `
      CREATE TABLE t_roll (
        monitor_id UUID,
        location LowCardinality(String),
        window_start DateTime('UTC') CODEC(DoubleDelta, ZSTD(1)),
        total_checks SimpleAggregateFunction(sum, UInt64),
        successful_checks SimpleAggregateFunction(sum, UInt64),
        suppressed_failed_checks SimpleAggregateFunction(sum, UInt64),
        min_response_time_ms SimpleAggregateFunction(min, UInt32),
        max_response_time_ms SimpleAggregateFunction(max, UInt32),
        response_time_sum SimpleAggregateFunction(sum, UInt64),
        latency_bucketsMap SimpleAggregateFunction(sumMap, Map(UInt16, UInt64)) CODEC(ZSTD(3))
      ) ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMMDD(window_start)
      ORDER BY (monitor_id, location, window_start);
    `
  });

  // 3. Materialized View with exact production expressions
  await client.command({
    query: `
      CREATE MATERIALIZED VIEW t_mv TO t_roll AS
      SELECT
        monitor_id,
        location,
        toStartOfHour(checked_at) AS window_start,
        toUInt64(count()) AS total_checks,
        toUInt64(countIf(success = 1)) AS successful_checks,
        toUInt64(countIf(success = 0 AND suppressed_by_window_id IS NOT NULL)) AS suppressed_failed_checks,
        if(countIf(success = 1) = 0, toUInt32(4294967295), toUInt32(minIf(response_time_ms, success = 1))) AS min_response_time_ms,
        maxIf(response_time_ms, success = 1) AS max_response_time_ms,
        sumIf(toUInt64(response_time_ms), success = 1) AS response_time_sum,
        sumMap(
          if(success = 1,
            map(toUInt16(least(ceil(log(greatest(response_time_ms, 1)) / log(1.04)), 281)), toUInt64(1)),
            map()
          )
        ) AS latency_bucketsMap
      FROM t_src
      GROUP BY monitor_id, location, window_start;
    `
  });

  console.log("=== Inserting 3 checks into t_src (DateTime64) ===");
  await client.command({ query: "INSERT INTO t_src VALUES ('00000000-0000-0000-0000-000000000001', 'eu-west', '2026-01-01 10:00:01.123', 200, 1, 100, '', NULL)" });
  await client.command({ query: "INSERT INTO t_src VALUES ('00000000-0000-0000-0000-000000000001', 'eu-west', '2026-01-01 10:00:31.456', 500, 0, 0, 'Connection refused', NULL)" });
  await client.command({ query: "INSERT INTO t_src VALUES ('00000000-0000-0000-0000-000000000001', 'eu-west', '2026-01-01 10:01:01.789', 200, 1, 300, '', NULL)" });

  console.log("\n=== 1. SELECT * FROM t_roll BEFORE OPTIMIZE (3 partial rows) ===");
  const resBefore = await client.query({ query: "SELECT * FROM t_roll", format: "JSONEachRow" });
  console.log(JSON.stringify(await resBefore.json(), null, 2));

  console.log("\n=== 2. Running OPTIMIZE TABLE t_roll FINAL ===");
  await client.command({ query: "OPTIMIZE TABLE t_roll FINAL" });

  console.log("\n=== 3. SELECT * FROM t_roll AFTER OPTIMIZE FINAL (1 merged row) ===");
  const resAfter = await client.query({ query: "SELECT * FROM t_roll", format: "JSONEachRow" });
  console.log(JSON.stringify(await resAfter.json(), null, 2));
}

runProductionTypeTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
