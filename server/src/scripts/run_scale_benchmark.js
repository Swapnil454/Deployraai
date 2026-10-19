import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function runScaleBenchmark() {
  console.log("=== ClickHouse Production Scale Benchmark (AggregatingMergeTree) ===");

  await client.command({ query: "DROP TABLE IF EXISTS t_mv_scale" });
  await client.command({ query: "DROP TABLE IF EXISTS t_roll_scale" });
  await client.command({ query: "DROP TABLE IF EXISTS t_src_scale" });

  // 1. Raw Telemetry Table with Production Types
  await client.command({
    query: `
      CREATE TABLE t_src_scale (
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
      ORDER BY (monitor_id, checked_at)
      SETTINGS min_bytes_for_wide_part = 0;
    `
  });

  // 2. Rollup Table with AggregatingMergeTree and SimpleAggregateFunction
  await client.command({
    query: `
      CREATE TABLE t_roll_scale (
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
      ORDER BY (monitor_id, location, window_start)
      SETTINGS min_bytes_for_wide_part = 0;
    `
  });

  // 3. Materialized View with Geometric Buckets (ratio 1.04) and Sentinel minIf
  await client.command({
    query: `
      CREATE MATERIALIZED VIEW t_mv_scale TO t_roll_scale AS
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
      FROM t_src_scale
      GROUP BY monitor_id, location, window_start;
    `
  });

  // 4. Insert 5,000 monitors x 120 checks/hour = 600,000 checks per hour across 3 hours (1.8M checks)
  for (let h = 0; h < 3; h++) {
    console.log(`Inserting hour ${h}: 5,000 monitors x 120 checks (600,000 rows)...`);
    const t0 = Date.now();
    await client.command({
      query: `
        INSERT INTO t_src_scale
        SELECT
          toUUID(concat('00000000-0000-0000-0000-', leftPad(toString(m), 12, '0'))),
          'eu-west',
          toDateTime64('2026-01-01 00:00:00', 3, 'UTC') + (${h} * 3600) + (c * 30),
          if(rand() % 1000 = 0, 500, 200),
          if(rand() % 1000 = 0, 0, 1),
          toUInt32(exp(log(120) + 0.4 * randNormal(0, 1))),
          '',
          if(rand() % 500 = 0, toUUID('11111111-1111-1111-1111-111111111111'), NULL)
        FROM (SELECT number AS m FROM numbers(5000)) AS a CROSS JOIN (SELECT number AS c FROM numbers(120)) AS b
      `,
      clickhouse_settings: { max_execution_time: 300 }
    });
    console.log(`Hour ${h} inserted in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  }

  // 5. Optimize Rollup Table to Final Form
  console.log("Running OPTIMIZE TABLE t_roll_scale FINAL...");
  await client.command({ query: "OPTIMIZE TABLE t_roll_scale FINAL" });

  // 6. Check Rows in Rollup Table
  const rowCountRes = await client.query({
    query: "SELECT count() as cnt FROM t_roll_scale",
    format: "JSONEachRow"
  });
  console.log(`Rollup table final row count: ${(await rowCountRes.json())[0].cnt} rows (5,000 monitors x 3 hours).`);

  // 7. Measure Per-Column Compressed Storage
  console.log("\n=== Measured Column Data Compressed Bytes (Wide Format) ===");
  const colRes = await client.query({
    query: `
      SELECT
        column,
        sum(column_data_compressed_bytes) AS compressed_bytes,
        sum(column_data_uncompressed_bytes) AS uncompressed_bytes,
        sum(rows) AS total_rows,
        round(sum(column_data_compressed_bytes) / sum(rows), 3) AS bytes_per_row
      FROM system.parts_columns
      WHERE table = 't_roll_scale' AND active
      GROUP BY column
      ORDER BY column ASC
    `,
    format: "JSONEachRow"
  });
  const cols = await colRes.json();
  console.table(cols);

  const totalCompressed = cols.reduce((sum, c) => sum + Number(c.compressed_bytes), 0);
  const totalRows = Number(cols[0]?.total_rows || 1);
  console.log(`\nTOTAL COMPRESSED BYTES PER ROLLUP ROW: ${(totalCompressed / totalRows).toFixed(3)} B/row`);
}

runScaleBenchmark().catch(err => {
  console.error("Scale benchmark error:", err);
  process.exit(1);
});
