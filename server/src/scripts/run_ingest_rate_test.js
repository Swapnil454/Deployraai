import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function runIngestRateTest(durationSeconds = 60) {
  console.log(`=== ClickHouse Ingest Rate Test (33,333 rows/sec for ${durationSeconds}s) ===`);

  await client.command({ query: "DROP TABLE IF EXISTS t_mv_rate" });
  await client.command({ query: "DROP TABLE IF EXISTS t_roll_rate" });
  await client.command({ query: "DROP TABLE IF EXISTS t_src_rate" });

  await client.command({
    query: `
      CREATE TABLE t_src_rate (
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

  await client.command({
    query: `
      CREATE TABLE t_roll_rate (
        monitor_id UUID,
        location LowCardinality(String),
        window_start DateTime('UTC') CODEC(DoubleDelta, ZSTD(1)),
        total_checks SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        successful_checks SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        suppressed_failed_checks SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        min_response_time_ms SimpleAggregateFunction(min, UInt32) CODEC(T64, ZSTD(1)),
        max_response_time_ms SimpleAggregateFunction(max, UInt32) CODEC(T64, ZSTD(1)),
        response_time_sum SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)),
        latency_bucketsMap SimpleAggregateFunction(sumMap, Map(UInt16, UInt64)) CODEC(ZSTD(3))
      ) ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMMDD(window_start)
      ORDER BY (monitor_id, location, window_start)
      SETTINGS min_bytes_for_wide_part = 0;
    `
  });

  await client.command({
    query: `
      CREATE MATERIALIZED VIEW t_mv_rate TO t_roll_rate AS
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
      FROM t_src_rate
      GROUP BY monitor_id, location, window_start;
    `
  });

  console.log("Starting 1-second cadence micro-batches (33,333 checks/batch)...");
  const metrics = [];

  for (let s = 1; s <= durationSeconds; s++) {
    const tStart = Date.now();
    // Insert 33,333 checks simulating 1 second of production traffic
    await client.command({
      query: `
        INSERT INTO t_src_rate
        SELECT
          toUUID(concat('00000000-0000-0000-0000-', leftPad(toString(number % 20000), 12, '0'))),
          'eu-west',
          toDateTime64('2026-01-01 00:00:00', 3, 'UTC') + ${s},
          if(rand() % 1000 = 0, 500, 200),
          if(rand() % 1000 = 0, 0, 1),
          toUInt32(greatest(1, (20 + cityHash64(number % 20000) % 2000) * exp((0.1 + (cityHash64(number % 20000, 1) % 80) / 100.0) * randNormal(0, 1)))),
          '',
          if(rand() % 500 = 0, toUUID('11111111-1111-1111-1111-111111111111'), NULL)
        FROM numbers(33333)
      `,
      clickhouse_settings: { max_execution_time: 30 }
    });
    const insertDuration = Date.now() - tStart;

    // Check parts in rollup table
    const partsRes = await client.query({
      query: `SELECT count() AS active_parts, sum(rows) AS total_rows FROM system.parts WHERE table = 't_roll_rate' AND active`,
      format: "JSONEachRow"
    });
    const partsData = (await partsRes.json())[0];

    // Check merge backlog / active merges
    const mergesRes = await client.query({
      query: `SELECT count() AS active_merges FROM system.merges WHERE table = 't_roll_rate'`,
      format: "JSONEachRow"
    });
    const mergesData = (await mergesRes.json())[0];

    metrics.push({
      second: s,
      insert_ms: insertDuration,
      active_parts: Number(partsData.active_parts),
      rollup_rows: Number(partsData.total_rows),
      active_merges: Number(mergesData.active_merges)
    });

    if (s % 10 === 0 || s === durationSeconds) {
      console.log(`[t = ${s}s] Insert: ${insertDuration}ms | Active Parts: ${partsData.active_parts} | Rollup Rows: ${partsData.total_rows} | Active Merges: ${mergesData.active_merges}`);
    }

    const elapsed = Date.now() - tStart;
    if (elapsed < 1000) {
      await new Promise(r => setTimeout(r, 1000 - elapsed));
    }
  }

  console.log("\nSummary of Part Count Dynamics:");
  const initialParts = metrics[0].active_parts;
  const maxParts = Math.max(...metrics.map(m => m.active_parts));
  const finalParts = metrics[metrics.length - 1].active_parts;
  const avgInsertMs = (metrics.reduce((acc, m) => acc + m.insert_ms, 0) / metrics.length).toFixed(1);
  console.log(`Duration: ${durationSeconds}s | 33,333 checks/s (${durationSeconds * 33333} total checks)`);
  console.log(`Average Insert Latency (Raw + MV execution): ${avgInsertMs} ms`);
  console.log(`Rollup Active Parts: Initial=${initialParts}, Peak=${maxParts}, Final=${finalParts}`);
}

const dur = process.argv[2] ? parseInt(process.argv[2], 10) : 60;
runIngestRateTest(dur).catch(err => {
  console.error("Ingest rate test error:", err);
  process.exit(1);
});
