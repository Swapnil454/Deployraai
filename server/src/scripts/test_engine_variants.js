import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function testVariantB_AggregatingMergeTree() {
  console.log("\n=== Testing Variant B: AggregatingMergeTree with SimpleAggregateFunction ===");

  await client.command({ query: "DROP TABLE IF EXISTS t_mv_agg" });
  await client.command({ query: "DROP TABLE IF EXISTS t_roll_agg" });
  await client.command({ query: "DROP TABLE IF EXISTS t_src_agg" });

  await client.command({
    query: `
      CREATE TABLE t_src_agg (
        monitor_id UUID,
        location LowCardinality(String),
        checked_at DateTime('UTC'),
        success UInt8,
        response_time_ms UInt32,
        suppressed_by_window_id Nullable(UUID)
      ) ENGINE = MergeTree() ORDER BY (monitor_id, checked_at);
    `
  });

  await client.command({
    query: `
      CREATE TABLE t_roll_agg (
        monitor_id UUID,
        location LowCardinality(String),
        window_start DateTime('UTC'),
        total_checks SimpleAggregateFunction(sum, UInt64),
        successful_checks SimpleAggregateFunction(sum, UInt64),
        suppressed_checks SimpleAggregateFunction(sum, UInt64),
        min_response_time_ms SimpleAggregateFunction(min, UInt32),
        max_response_time_ms SimpleAggregateFunction(max, UInt32),
        response_time_sum SimpleAggregateFunction(sum, UInt64),
        latency_bucketsMap SimpleAggregateFunction(sumMap, Map(UInt16, UInt64))
      ) ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMMDD(window_start)
      ORDER BY (monitor_id, location, window_start);
    `
  });

  await client.command({
    query: `
      CREATE MATERIALIZED VIEW t_mv_agg TO t_roll_agg AS
      SELECT
        monitor_id,
        location,
        toStartOfHour(checked_at) AS window_start,
        toUInt64(count()) AS total_checks,
        toUInt64(countIf(success = 1)) AS successful_checks,
        toUInt64(countIf(suppressed_by_window_id IS NOT NULL)) AS suppressed_checks,
        if(countIf(success = 1) = 0, toUInt32(4294967295), toUInt32(minIf(response_time_ms, success = 1))) AS min_response_time_ms,
        maxIf(response_time_ms, success = 1) AS max_response_time_ms,
        sumIf(toUInt64(response_time_ms), success = 1) AS response_time_sum,
        sumMap(
          if(success = 1,
            map(
              toUInt16(least(ceil(log(greatest(response_time_ms, 1)) / log(1.04)), 281)),
              toUInt64(1)
            ),
            map()
          )
        ) AS latency_bucketsMap
      FROM t_src_agg
      GROUP BY monitor_id, location, window_start;
    `
  });

  await client.command({ query: "INSERT INTO t_src_agg VALUES ('00000000-0000-0000-0000-000000000001', 'eu-west', '2026-01-01 10:00:01', 1, 100, NULL)" });
  await client.command({ query: "INSERT INTO t_src_agg VALUES ('00000000-0000-0000-0000-000000000001', 'eu-west', '2026-01-01 10:00:31', 0, 0, NULL)" });
  await client.command({ query: "INSERT INTO t_src_agg VALUES ('00000000-0000-0000-0000-000000000001', 'eu-west', '2026-01-01 10:01:01', 1, 300, NULL)" });

  console.log("Running OPTIMIZE FINAL on t_roll_agg...");
  await client.command({ query: "OPTIMIZE TABLE t_roll_agg FINAL" });

  const res = await client.query({ query: "SELECT * FROM t_roll_agg", format: "JSONEachRow" });
  console.log("Result after OPTIMIZE FINAL:", JSON.stringify(await res.json(), null, 2));
}

testVariantB_AggregatingMergeTree().catch(console.error);
