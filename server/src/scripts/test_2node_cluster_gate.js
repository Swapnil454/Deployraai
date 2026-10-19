import { createClient } from "@clickhouse/client";

const node1 = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

const node2 = createClient({
  url: "http://localhost:8124",
  username: "engine",
  password: "password",
  database: "default"
});

async function runTwoNodeClusterGate() {
  console.log("================================================================================");
  console.log("          2-NODE REPLICATED CLUSTER INTEGRATION & VERIFICATION GATE             ");
  console.log("================================================================================");
  console.log("Node 1: http://localhost:8123 (replica: node1)");
  console.log("Node 2: http://localhost:8124 (replica: node2)");
  console.log("Keeper: clickhouse:9181\n");

  // Step 0: Clean previous test tables on both nodes
  console.log("[Step 0] Cleaning previous gate tables across both nodes...");
  for (const [name, client] of [["Node 1", node1], ["Node 2", node2]]) {
    await client.command({ query: "DROP TABLE IF EXISTS gate_mv SYNC" });
    await client.command({ query: "DROP TABLE IF EXISTS gate_hourly_staging SYNC" });
    await client.command({ query: "DROP TABLE IF EXISTS gate_hourly SYNC" });
    await client.command({ query: "DROP TABLE IF EXISTS gate_daily_staging SYNC" });
    await client.command({ query: "DROP TABLE IF EXISTS gate_daily SYNC" });
    await client.command({ query: "DROP TABLE IF EXISTS gate_telemetry SYNC" });
  }

  // Step 1: Create Replicated Tables & Materialized Views on both nodes
  console.log("\n[Step 1] Creating Replicated Tables on Node 1 and Node 2...");
  const createTelemetryDDL = `
    CREATE TABLE gate_telemetry (
      monitor_id UUID CODEC(ZSTD(1)),
      checked_at DateTime64(3, 'UTC') CODEC(DoubleDelta, ZSTD(1)),
      status_code UInt16 CODEC(T64, ZSTD(1)),
      success UInt8 CODEC(T64, ZSTD(1)),
      response_time_ms UInt32 CODEC(T64, ZSTD(1)),
      error_message LowCardinality(String) CODEC(ZSTD(1)),
      location LowCardinality(String) CODEC(ZSTD(1)),
      suppressed_by_window_id Nullable(UUID) CODEC(ZSTD(1))
    ) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/gate_telemetry', '{replica}')
    PARTITION BY toYYYYMMDD(checked_at)
    ORDER BY (monitor_id, checked_at)
    TTL toDateTime(checked_at) + INTERVAL 7 DAY DELETE
    SETTINGS ttl_only_drop_parts = 1;
  `;

  const createHourlyDDL = `
    CREATE TABLE gate_hourly (
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
    ) ENGINE = ReplicatedAggregatingMergeTree('/clickhouse/tables/{shard}/gate_hourly', '{replica}')
    PARTITION BY toYYYYMMDD(window_start)
    ORDER BY (monitor_id, location, window_start)
    TTL window_start + INTERVAL 90 DAY DELETE
    SETTINGS ttl_only_drop_parts = 1;
  `;

  const createMVDDL = `
    CREATE MATERIALIZED VIEW gate_mv TO gate_hourly AS
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
    FROM gate_telemetry
    GROUP BY monitor_id, location, window_start;
  `;

  for (const [name, client] of [["Node 1", node1], ["Node 2", node2]]) {
    await client.command({ query: createTelemetryDDL });
    await client.command({ query: createHourlyDDL });
    await client.command({ query: createMVDDL });
    console.log(`  - ${name}: Created gate_telemetry, gate_hourly, gate_mv.`);
  }

  // Gate 1: Replication Without Double Counting
  console.log("\n[Gate 1] Testing Replication Without Double Counting...");
  console.log("  - Inserting 50,000 raw telemetry checks exclusively into Node 1...");
  await node1.command({
    query: `
      INSERT INTO gate_telemetry
      SELECT
        toUUID(concat('00000000-0000-0000-0000-', leftPad(toString(number % 1000), 12, '0'))),
        toDateTime64(now(), 3, 'UTC') - (number % 3600),
        200,
        1,
        toUInt32(100 + (number % 50)),
        '',
        'eu-west',
        NULL
      FROM numbers(50000)
    `
  });

  // Allow replicas to sync via Keeper
  console.log("  - Waiting 3s for Keeper replication sync to Node 2...");
  await new Promise(r => setTimeout(r, 3000));

  const n1Raw = await (await node1.query({ query: "SELECT count() as c FROM gate_telemetry", format: "JSONEachRow" })).json();
  const n2Raw = await (await node2.query({ query: "SELECT count() as c FROM gate_telemetry", format: "JSONEachRow" })).json();
  const n1Roll = await (await node1.query({ query: "SELECT sum(total_checks) as c, count() as parts_cnt FROM gate_hourly", format: "JSONEachRow" })).json();
  const n2Roll = await (await node2.query({ query: "SELECT sum(total_checks) as c, count() as parts_cnt FROM gate_hourly", format: "JSONEachRow" })).json();

  console.log(`  - Node 1 Raw Checks:     ${n1Raw[0].c}`);
  console.log(`  - Node 2 Raw Checks:     ${n2Raw[0].c} (Replicated via Keeper)`);
  console.log(`  - Node 1 Rollup Checks:  ${n1Roll[0].c}`);
  console.log(`  - Node 2 Rollup Checks:  ${n2Roll[0].c} (Replicated via Keeper)`);

  if (Number(n1Roll[0].c) === 50000 && Number(n2Roll[0].c) === 50000) {
    console.log("  >>> PASS: Zero double counting! Node 2 received exactly 50,000 checks without duplicate view execution.");
  } else {
    throw new Error(`Double counting detected! n1=${n1Roll[0].c}, n2=${n2Roll[0].c}`);
  }

  // Gate 2: OPTIMIZE FINAL on Both Nodes
  console.log("\n[Gate 2] Testing OPTIMIZE TABLE FINAL on Both Nodes...");
  console.log("  - Running OPTIMIZE TABLE gate_hourly FINAL on Node 1...");
  await node1.command({ query: "OPTIMIZE TABLE gate_hourly FINAL" });
  console.log("  - Running OPTIMIZE TABLE gate_hourly FINAL on Node 2...");
  await node2.command({ query: "OPTIMIZE TABLE gate_hourly FINAL" });

  const n1Final = await (await node1.query({ query: "SELECT count() as rows_cnt, sum(total_checks) as checks FROM gate_hourly", format: "JSONEachRow" })).json();
  const n2Final = await (await node2.query({ query: "SELECT count() as rows_cnt, sum(total_checks) as checks FROM gate_hourly", format: "JSONEachRow" })).json();
  console.log(`  - Node 1 post-FINAL: ${n1Final[0].rows_cnt} merged rows, ${n1Final[0].checks} total checks.`);
  console.log(`  - Node 2 post-FINAL: ${n2Final[0].rows_cnt} merged rows, ${n2Final[0].checks} total checks.`);

  if (n1Final[0].rows_cnt === n2Final[0].rows_cnt && Number(n1Final[0].checks) === 50000 && Number(n2Final[0].checks) === 50000) {
    console.log(`  >>> PASS: OPTIMIZE FINAL succeeded identically on both nodes with ${n1Final[0].rows_cnt} merged rows and identical 50,000 checks!`);
  } else {
    throw new Error(`OPTIMIZE FINAL mismatch between replicas: n1=${n1Final[0].rows_cnt}, n2=${n2Final[0].rows_cnt}`);
  }

  // Gate 3: REPLACE PARTITION from Replicated Staging (Hourly and Daily)
  console.log("\n[Gate 3] Testing REPLACE PARTITION from Replicated Staging...");
  
  // 3A. Hourly Replicated Staging
  console.log("  [3A] Creating Replicated Hourly Staging table on both nodes...");
  const createHourlyStagingDDL = `
    CREATE TABLE gate_hourly_staging (
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
    ) ENGINE = ReplicatedAggregatingMergeTree('/clickhouse/tables/{shard}/gate_hourly_staging', '{replica}')
    PARTITION BY toYYYYMMDD(window_start)
    ORDER BY (monitor_id, location, window_start);
  `;
  await node1.command({ query: createHourlyStagingDDL });
  await node2.command({ query: createHourlyStagingDDL });

  console.log("  - Inserting 5,000 replacement checks into staging on Node 1...");
  await node1.command({
    query: `
      INSERT INTO gate_hourly_staging
      SELECT
        toUUID(concat('00000000-0000-0000-0000-', leftPad(toString(number % 100), 12, '0'))),
        'eu-west',
        toStartOfHour(now()),
        toUInt64(50),
        toUInt64(50),
        toUInt64(0),
        toUInt32(120),
        toUInt32(150),
        toUInt64(6500),
        map(toUInt16(120), toUInt64(50))
      FROM numbers(100)
    `
  });

  const partRes = await (await node1.query({ query: "SELECT toYYYYMMDD(now()) as p", format: "JSONEachRow" })).json();
  const currentPart = partRes[0].p;

  console.log(`  - Executing ALTER TABLE gate_hourly REPLACE PARTITION ${currentPart} FROM gate_hourly_staging on Node 1...`);
  await node1.command({ query: `ALTER TABLE gate_hourly REPLACE PARTITION ${currentPart} FROM gate_hourly_staging` });

  console.log("  - Waiting 3s for Keeper to propagate partition replacement to Node 2...");
  await new Promise(r => setTimeout(r, 3000));

  const n1Replaced = await (await node1.query({ query: "SELECT sum(total_checks) as c FROM gate_hourly", format: "JSONEachRow" })).json();
  const n2Replaced = await (await node2.query({ query: "SELECT sum(total_checks) as c FROM gate_hourly", format: "JSONEachRow" })).json();
  console.log(`  - Node 1 post-replace checks: ${n1Replaced[0].c}`);
  console.log(`  - Node 2 post-replace checks: ${n2Replaced[0].c}`);

  if (Number(n1Replaced[0].c) === 5000 && Number(n2Replaced[0].c) === 5000) {
    console.log("  >>> PASS [3A]: Hourly REPLACE PARTITION from Replicated staging succeeded atomically across both cluster nodes!");
  } else {
    throw new Error(`Hourly REPLACE PARTITION failed: n1=${n1Replaced[0].c}, n2=${n2Replaced[0].c}`);
  }

  // 3B. Daily Replicated Staging
  console.log("\n  [3B] Creating Replicated Daily Table and Staging on both nodes...");
  const createDailyDDL = (tbl) => `
    CREATE TABLE ${tbl} (
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
    ) ENGINE = ReplicatedAggregatingMergeTree('/clickhouse/tables/{shard}/${tbl}', '{replica}')
    PARTITION BY toYYYYMMDD(date)
    ORDER BY (monitor_id, location, date)
    TTL date + INTERVAL 365 DAY DELETE
    SETTINGS ttl_only_drop_parts = 1;
  `;
  await node1.command({ query: createDailyDDL("gate_daily") });
  await node2.command({ query: createDailyDDL("gate_daily") });
  await node1.command({ query: createDailyDDL("gate_daily_staging") });
  await node2.command({ query: createDailyDDL("gate_daily_staging") });

  console.log("  - Populating daily staging from hourly table on Node 1...");
  await node1.command({
    query: `
      INSERT INTO gate_daily_staging
      SELECT
        monitor_id,
        location,
        toDate(window_start) AS date,
        sum(total_checks),
        sum(successful_checks),
        sum(suppressed_failed_checks),
        min(min_response_time_ms),
        max(max_response_time_ms),
        sum(response_time_sum),
        sumMap(latency_bucketsMap)
      FROM gate_hourly
      GROUP BY monitor_id, location, date
    `
  });

  console.log(`  - Executing ALTER TABLE gate_daily REPLACE PARTITION ${currentPart} FROM gate_daily_staging on Node 1...`);
  await node1.command({ query: `ALTER TABLE gate_daily REPLACE PARTITION ${currentPart} FROM gate_daily_staging` });

  console.log("  - Waiting 3s for Keeper to propagate daily partition replacement to Node 2...");
  await new Promise(r => setTimeout(r, 3000));

  const n1Daily = await (await node1.query({ query: "SELECT sum(total_checks) as c FROM gate_daily", format: "JSONEachRow" })).json();
  const n2Daily = await (await node2.query({ query: "SELECT sum(total_checks) as c FROM gate_daily", format: "JSONEachRow" })).json();
  console.log(`  - Node 1 Daily Checks: ${n1Daily[0].c}`);
  console.log(`  - Node 2 Daily Checks: ${n2Daily[0].c}`);

  if (Number(n1Daily[0].c) === 5000 && Number(n2Daily[0].c) === 5000) {
    console.log("  >>> PASS [3B]: Daily REPLACE PARTITION from Replicated staging succeeded atomically across both cluster nodes!");
  } else {
    throw new Error(`Daily REPLACE PARTITION failed: n1=${n1Daily[0].c}, n2=${n2Daily[0].c}`);
  }

  // Gate 4: The Retry Case (Block Deduplication in Replicated Tables)
  console.log("\n[Gate 4] Testing Retry Case (ClickHouse Keeper Block Deduplication)...");
  console.log("  - Attempting to replay an identical INSERT block with dedup token 'retry_token_abc'...");
  
  // First insert
  await node1.command({
    query: `
      INSERT INTO gate_telemetry
      SETTINGS insert_deduplication_token = 'retry_token_abc'
      VALUES (
        toUUID('ffffffff-ffff-ffff-ffff-ffffffffffff'),
        toDateTime64(now(), 3, 'UTC'),
        200, 1, 150, '', 'eu-west', NULL
      )
    `
  });

  // Replay of the exact same insert (simulating network retry after client timeout)
  console.log("  - Replaying identical insert with same deduplication token 'retry_token_abc'...");
  await node1.command({
    query: `
      INSERT INTO gate_telemetry
      SETTINGS insert_deduplication_token = 'retry_token_abc'
      VALUES (
        toUUID('ffffffff-ffff-ffff-ffff-ffffffffffff'),
        toDateTime64(now(), 3, 'UTC'),
        200, 1, 150, '', 'eu-west', NULL
      )
    `
  });

  await new Promise(r => setTimeout(r, 2000));
  const dedupRes = await (await node1.query({
    query: "SELECT count() as c FROM gate_telemetry WHERE monitor_id = toUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')",
    format: "JSONEachRow"
  })).json();

  console.log(`  - Rows with retry_token_abc in telemetry: ${dedupRes[0].c}`);
  if (Number(dedupRes[0].c) === 1) {
    console.log("  >>> PASS [Gate 4]: ClickHouse Keeper block deduplication succeeded! Replayed insert was safely ignored.");
  } else {
    throw new Error(`Deduplication failed! Expected 1 row, got ${dedupRes[0].c}`);
  }

  console.log("\n================================================================================");
  console.log("              ALL 4 GATES PASSED ON 2-NODE REPLICATED CLUSTER!                  ");
  console.log("================================================================================\n");
}

runTwoNodeClusterGate().catch(err => {
  console.error("Cluster gate failure:", err);
  process.exit(1);
});
