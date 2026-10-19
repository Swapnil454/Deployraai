import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function runProductionIngestBenchmark(durationSeconds = 600) {
  console.log(`=== ClickHouse 10-Minute Production Ingest & Merge Benchmark ===`);
  console.log(`Keyspace: 1,000,000 monitors | Rate: 33,333 checks/sec | Duration: ${durationSeconds}s (${durationSeconds / 60} min)`);

  await client.command({ query: "DROP TABLE IF EXISTS t_mv_bench" });
  await client.command({ query: "DROP TABLE IF EXISTS t_roll_bench" });
  await client.command({ query: "DROP TABLE IF EXISTS t_src_bench" });

  await client.command({
    query: `
      CREATE TABLE t_src_bench (
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
      CREATE TABLE t_roll_bench (
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
      CREATE MATERIALIZED VIEW t_mv_bench TO t_roll_bench AS
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
      FROM t_src_bench
      GROUP BY monitor_id, location, window_start;
    `
  });

  // Flush logs to get a clean baseline
  await client.command({ query: "SYSTEM FLUSH LOGS" });
  const benchmarkTag = `bench_${Date.now()}`;
  const tBenchmarkStart = Date.now();
  console.log(`Starting ingest run (Tag: ${benchmarkTag})...`);

  const samples = [];

  for (let s = 1; s <= durationSeconds; s++) {
    const tStart = Date.now();
    const offset = (s - 1) * 33333;

    // Insert 33,333 checks across 1,000,000 monitors
    await client.command({
      query: `
        INSERT INTO t_src_bench /* tag:${benchmarkTag} */
        SELECT
          toUUID(concat('00000000-0000-0000-0000-', leftPad(toString((${offset} + number) % 1000000), 12, '0'))),
          'eu-west',
          toDateTime64('2026-01-01 00:00:00', 3, 'UTC') + ${s},
          if(rand() % 1000 = 0, 500, 200),
          if(rand() % 1000 = 0, 0, 1),
          toUInt32(greatest(1, (20 + cityHash64((${offset} + number) % 1000000) % 2000) * exp((0.1 + (cityHash64((${offset} + number) % 1000000, 1) % 80) / 100.0) * randNormal(0, 1)))),
          '',
          if(rand() % 500 = 0, toUUID('11111111-1111-1111-1111-111111111111'), NULL)
        FROM numbers(33333)
      `,
      clickhouse_settings: { max_execution_time: 30 }
    });
    const insertWallMs = Date.now() - tStart;

    // Sample every 10 seconds (or on first / last second)
    if (s % 10 === 0 || s === 1 || s === durationSeconds) {
      const partsRes = await client.query({
        query: `SELECT count() AS active_parts, sum(rows) AS total_physical_rows FROM system.parts WHERE table = 't_roll_bench' AND active`,
        format: "JSONEachRow"
      });
      const partsData = (await partsRes.json())[0];

      const mergesRes = await client.query({
        query: `SELECT count() AS active_merges FROM system.merges WHERE table = 't_roll_bench'`,
        format: "JSONEachRow"
      });
      const mergesData = (await mergesRes.json())[0];

      samples.push({
        second: s,
        insert_wall_ms: insertWallMs,
        active_parts: Number(partsData.active_parts || 0),
        total_physical_rows: Number(partsData.total_physical_rows || 0),
        active_merges: Number(mergesData.active_merges || 0)
      });

      console.log(`[t = ${String(s).padStart(3, ' ')}s / ${durationSeconds}s] Insert Wall: ${String(insertWallMs).padStart(3, ' ')}ms | Active Parts: ${String(partsData.active_parts).padStart(2, ' ')} | Physical Rollup Rows: ${String(partsData.total_physical_rows).padStart(8, ' ')} | Active Merges: ${partsData.active_merges}`);
    }

    const elapsed = Date.now() - tStart;
    if (elapsed < 1000) {
      await new Promise(r => setTimeout(r, 1000 - elapsed));
    }
  }

  const totalBenchmarkWallSec = (Date.now() - tBenchmarkStart) / 1000;
  console.log(`\nFlushing ClickHouse system logs...`);
  await client.command({ query: "SYSTEM FLUSH LOGS" });

  // 1. Analyze CPU utilization from system.query_log for all inserts
  const queryLogRes = await client.query({
    query: `
      SELECT
        count() AS total_queries,
        sum(ProfileEvents['UserTimeMicroseconds']) AS total_user_cpu_us,
        sum(ProfileEvents['SystemTimeMicroseconds']) AS total_sys_cpu_us,
        sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) AS total_virtual_cpu_us,
        sum(query_duration_ms) AS total_wall_ms
      FROM system.query_log
      WHERE current_database = 'default'
        AND type = 'QueryFinish'
        AND query LIKE '%tag:${benchmarkTag}%'
    `,
    format: "JSONEachRow"
  });
  const qLog = (await queryLogRes.json())[0];

  const totalUserCpuUs = Number(qLog.total_user_cpu_us || 0);
  const totalSysCpuUs = Number(qLog.total_sys_cpu_us || 0);
  const totalCpuUs = totalUserCpuUs + totalSysCpuUs;
  const totalCpuSeconds = totalCpuUs / 1_000_000;
  const effectiveInsertCores = (totalCpuSeconds / totalBenchmarkWallSec).toFixed(3);

  // 2. Analyze merge activity from system.part_log for t_roll_bench
  const partLogRes = await client.query({
    query: `
      SELECT
        count() AS total_merges,
        sum(read_rows) AS total_merge_read_rows,
        sum(rows) AS total_merge_written_rows,
        sum(read_bytes) AS total_merge_read_bytes,
        sum(size_in_bytes) AS total_merge_written_bytes,
        sum(duration_ms) AS total_merge_duration_ms,
        sum(ProfileEvents['UserTimeMicroseconds']) AS merge_user_cpu_us,
        sum(ProfileEvents['SystemTimeMicroseconds']) AS merge_sys_cpu_us
      FROM system.part_log
      WHERE database = 'default'
        AND table = 't_roll_bench'
        AND event_type = 'MergeParts'
        AND event_time >= toDateTime(${Math.floor(tBenchmarkStart / 1000)})
    `,
    format: "JSONEachRow"
  });
  const pLog = (await partLogRes.json())[0];

  const mergeCpuUs = Number(pLog.merge_user_cpu_us || 0) + Number(pLog.merge_sys_cpu_us || 0);
  const mergeCpuSeconds = mergeCpuUs / 1_000_000;
  const effectiveMergeCores = (mergeCpuSeconds / totalBenchmarkWallSec).toFixed(3);

  console.log("\n================================================================================");
  console.log("            10-MINUTE PRODUCTION INGEST BENCHMARK REPORT                         ");
  console.log("================================================================================");
  console.log(`Total Ingest Time:          ${totalBenchmarkWallSec.toFixed(1)} s`);
  console.log(`Total Checks Ingested:      ${Number(qLog.total_queries) * 33333} rows (${(Number(qLog.total_queries) * 33333 / 1_000_000).toFixed(2)}M checks)`);
  console.log(`Keyspace:                   1,000,000 distinct monitor UUIDs`);
  console.log(`Cadence:                    33,333 checks / 1.0 second`);
  console.log("--------------------------------------------------------------------------------");
  console.log("1. PART COUNT & PHYSICAL ROW DYNAMICS:");
  const initialParts = samples[0]?.active_parts;
  const peakParts = Math.max(...samples.map(s => s.active_parts));
  const finalParts = samples[samples.length - 1]?.active_parts;
  const peakRows = Math.max(...samples.map(s => s.total_physical_rows));
  const finalRows = samples[samples.length - 1]?.total_physical_rows;
  console.log(`  - Initial Active Parts:    ${initialParts}`);
  console.log(`  - Peak Active Parts:       ${peakParts}`);
  console.log(`  - Final Active Parts:      ${finalParts}`);
  console.log(`  - Peak Physical Rows:      ${peakRows.toLocaleString()} partial rows`);
  console.log(`  - Final Physical Rows:     ${finalRows.toLocaleString()} partial rows`);
  console.log("--------------------------------------------------------------------------------");
  console.log("2. INSERT CPU (system.query_log ProfileEvents):");
  console.log(`  - Total Insert Queries:    ${qLog.total_queries}`);
  console.log(`  - User CPU Time:           ${(totalUserCpuUs / 1_000_000).toFixed(2)} s`);
  console.log(`  - System CPU Time:         ${(totalSysCpuUs / 1_000_000).toFixed(2)} s`);
  console.log(`  - Total Insert CPU Time:   ${totalCpuSeconds.toFixed(2)} s`);
  console.log(`  - Effective Core Duty:     ${effectiveInsertCores} cores (${(effectiveInsertCores * 100).toFixed(1)}% of 1 core)`);
  console.log("--------------------------------------------------------------------------------");
  console.log("3. MERGE ACTIVITY (system.part_log):");
  console.log(`  - Total Completed Merges:  ${pLog.total_merges}`);
  console.log(`  - Merge Rows Read:         ${Number(pLog.total_merge_read_rows || 0).toLocaleString()} rows`);
  console.log(`  - Merge Rows Written:      ${Number(pLog.total_merge_written_rows || 0).toLocaleString()} rows`);
  console.log(`  - Merge Bytes Read:        ${((Number(pLog.total_merge_read_bytes || 0)) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - Merge Bytes Written:     ${((Number(pLog.total_merge_written_bytes || 0)) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - Merge Wall Duration:     ${(Number(pLog.total_merge_duration_ms || 0) / 1000).toFixed(2)} s`);
  console.log(`  - Merge CPU Time:          ${mergeCpuSeconds.toFixed(2)} s`);
  console.log(`  - Effective Merge Duty:    ${effectiveMergeCores} cores`);
  console.log("--------------------------------------------------------------------------------");
  console.log(`TOTAL RESOURCE OVERHEAD:     ${(Number(effectiveInsertCores) + Number(effectiveMergeCores)).toFixed(3)} cores total (Insert + Merge)`);
  console.log("================================================================================\n");
}

const dur = process.argv[2] ? parseInt(process.argv[2], 10) : 600;
runProductionIngestBenchmark(dur).catch(err => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
