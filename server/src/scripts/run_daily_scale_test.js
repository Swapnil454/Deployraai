import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function runDailyScaleTest() {
  console.log("=== ClickHouse Daily Rollup Scale Test & P95 Verification ===");

  await client.command({ query: "DROP TABLE IF EXISTS t_daily_real" });

  // 1. Daily Rollup Table DDL
  await client.command({
    query: `
      CREATE TABLE t_daily_real (
        monitor_id UUID,
        location LowCardinality(String),
        date Date CODEC(DoubleDelta, ZSTD(1)),
        total_checks SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        successful_checks SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        suppressed_failed_checks SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        min_response_time_ms SimpleAggregateFunction(min, UInt32) CODEC(T64, ZSTD(1)),
        max_response_time_ms SimpleAggregateFunction(max, UInt32) CODEC(T64, ZSTD(1)),
        response_time_sum SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        latency_bucketsMap SimpleAggregateFunction(sumMap, Map(UInt16, UInt64)) CODEC(ZSTD(3))
      ) ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMM(date)
      ORDER BY (monitor_id, location, date)
      SETTINGS min_bytes_for_wide_part = 0;
    `
  });

  // 2. Aggregate from Hourly Rollup table t_roll_real (48 hours = 2 days per monitor)
  console.log("Aggregating hourly rollups into daily rollups...");
  await client.command({
    query: `
      INSERT INTO t_daily_real
      SELECT
        monitor_id,
        location,
        toDate(window_start) AS date,
        sum(total_checks) AS total_checks,
        sum(successful_checks) AS successful_checks,
        sum(suppressed_failed_checks) AS suppressed_failed_checks,
        min(min_response_time_ms) AS min_response_time_ms,
        max(max_response_time_ms) AS max_response_time_ms,
        sum(response_time_sum) AS response_time_sum,
        sumMap(latency_bucketsMap) AS latency_bucketsMap
      FROM t_roll_real
      GROUP BY monitor_id, location, date;
    `
  });

  await client.command({ query: "OPTIMIZE TABLE t_daily_real FINAL" });

  const rowCountRes = await client.query({
    query: "SELECT count() as cnt FROM t_daily_real",
    format: "JSONEachRow"
  });
  const totalRows = (await rowCountRes.json())[0].cnt;
  console.log(`Daily table row count: ${totalRows} rows (20,000 monitors x 2 days).`);

  // 3. Measure Per-Column Compressed Storage for Daily Table
  console.log("\n=== Measured Daily Column Data Compressed Bytes (Wide Format) ===");
  const colRes = await client.query({
    query: `
      SELECT
        column,
        sum(column_data_compressed_bytes) AS compressed_bytes,
        sum(column_data_uncompressed_bytes) AS uncompressed_bytes,
        sum(rows) AS total_rows,
        round(sum(column_data_compressed_bytes) / sum(rows), 3) AS bytes_per_row
      FROM system.parts_columns
      WHERE table = 't_daily_real' AND active
      GROUP BY column
      ORDER BY column ASC
    `,
    format: "JSONEachRow"
  });
  const cols = await colRes.json();
  console.table(cols);

  const totalCompressed = cols.reduce((sum, c) => sum + Number(c.compressed_bytes), 0);
  const measuredBytesPerRow = (totalCompressed / totalRows).toFixed(3);
  console.log(`\nTOTAL COMPRESSED BYTES PER DAILY ROW: ${measuredBytesPerRow} B/row`);

  // 4. Test Read-Time Linear P95 Interpolation from Daily Table
  console.log("\n=== Testing Read-Time P95 Linear Interpolation Query ===");
  const p95Res = await client.query({
    query: `
      WITH
        sumMap(latency_bucketsMap) AS hist,
        mapKeys(hist) AS raw_keys,
        arraySort(raw_keys) AS sorted_keys,
        arrayMap(k -> hist[k], sorted_keys) AS counts,
        arrayCumSum(counts) AS cum_counts,
        sum(successful_checks) AS total_successful,
        toUInt64(ceil(0.95 * total_successful)) AS rank_target,
        arrayFirstIndex(c -> c >= rank_target, cum_counts) AS target_idx,
        sorted_keys[target_idx] AS target_bucket_key,
        counts[target_idx] AS bucket_count,
        if(target_idx > 1, cum_counts[target_idx - 1], toUInt64(0)) AS prev_cum_count,
        floor(pow(1.04, toFloat64(target_bucket_key - 1))) AS lower_bound,
        ceil(pow(1.04, toFloat64(target_bucket_key))) AS upper_bound,
        lower_bound + ((rank_target - prev_cum_count) / toFloat64(greatest(bucket_count, 1))) * (upper_bound - lower_bound) AS interpolated_p95
      SELECT
        monitor_id,
        total_successful,
        rank_target,
        target_bucket_key,
        lower_bound,
        upper_bound,
        bucket_count,
        prev_cum_count,
        round(interpolated_p95, 2) AS p95_ms
      FROM t_daily_real
      WHERE monitor_id = toUUID('00000000-0000-0000-0000-000000000001')
      GROUP BY monitor_id;
    `,
    format: "JSONEachRow"
  });
  const p95Data = await p95Res.json();
  console.log("P95 Read-Time Result for Sample Monitor:");
  console.table(p95Data);
}

runDailyScaleTest().catch(err => {
  console.error("Daily scale test error:", err);
  process.exit(1);
});
