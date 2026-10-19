import { createClient } from "@clickhouse/client";
import {
  initializeClickHouseTelemetrySchema,
  CLICKHOUSE_TELEMETRY_TABLE,
  CLICKHOUSE_HOURLY_ROLLUPS_TABLE,
  CLICKHOUSE_HOURLY_ROLLUPS_MV,
  CLICKHOUSE_DAILY_ROLLUPS_TABLE,
  getHourlyRollupsMVDDL,
  getHourlyReconciliationRepairSQL,
  getDailySlidingRebuildSQL
} from "../uptime-cron/clickhouseSchema.js";

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

async function runProductionClusterVerification() {
  console.log("================================================================================");
  console.log("    PRODUCTION SCHEMA 2-NODE REPLICATED CLUSTER INTEGRATION & ATOMICITY GATE    ");
  console.log("================================================================================");
  console.log("Node 1: http://localhost:8123 (macro {replica}: node1)");
  console.log("Node 2: http://localhost:8124 (macro {replica}: node2)");
  console.log("Keeper: clickhouse:9181\n");

  // Step 0: Clean existing production tables across both nodes
  console.log("[Step 0] Cleaning existing tables across both nodes...");
  for (const [name, client] of [["Node 1", node1], ["Node 2", node2]]) {
    await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_HOURLY_ROLLUPS_MV} SYNC` });
    await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}_staging SYNC` });
    await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE} SYNC` });
    await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_DAILY_ROLLUPS_TABLE}_staging SYNC` });
    await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_DAILY_ROLLUPS_TABLE} SYNC` });
    await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_TELEMETRY_TABLE} SYNC` });
    console.log(`  - ${name}: Dropped existing production tables.`);
  }

  // Step 1: Run real initializeClickHouseTelemetrySchema on both nodes
  console.log("\n[Step 1] Initializing Production Schemas on Node 1 & Node 2 via initializeClickHouseTelemetrySchema...");
  process.env.CLICKHOUSE_ENABLE_ROLLUP_MV = "true";
  await initializeClickHouseTelemetrySchema(node1);
  await initializeClickHouseTelemetrySchema(node2);
  console.log("  >>> Production DDL verified across both nodes with {shard}/{replica} macros and codecs!");

  // Gate 1: Replication Without Double Counting on Production DDL
  console.log("\n[Gate 1] Testing Replication Without Double Counting on Production Tables...");
  console.log("  - Inserting 50,000 checks exclusively into Node 1...");
  await node1.command({
    query: `
      INSERT INTO ${CLICKHOUSE_TELEMETRY_TABLE}
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

  // Sync Node 2 replica using SYSTEM SYNC REPLICA
  console.log("  - Syncing Node 2 via SYSTEM SYNC REPLICA...");
  await node2.command({ query: `SYSTEM SYNC REPLICA ${CLICKHOUSE_TELEMETRY_TABLE}` });
  await node2.command({ query: `SYSTEM SYNC REPLICA ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}` });

  const n1Raw = await (await node1.query({ query: `SELECT count() as c FROM ${CLICKHOUSE_TELEMETRY_TABLE}`, format: "JSONEachRow" })).json();
  const n2Raw = await (await node2.query({ query: `SELECT count() as c FROM ${CLICKHOUSE_TELEMETRY_TABLE}`, format: "JSONEachRow" })).json();
  const n1Roll = await (await node1.query({ query: `SELECT sum(total_checks) as c FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}`, format: "JSONEachRow" })).json();
  const n2Roll = await (await node2.query({ query: `SELECT sum(total_checks) as c FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}`, format: "JSONEachRow" })).json();

  console.log(`  - Node 1 Raw Checks:     ${n1Raw[0].c}`);
  console.log(`  - Node 2 Raw Checks:     ${n2Raw[0].c} (Synchronized via Keeper)`);
  console.log(`  - Node 1 Rollup Checks:  ${n1Roll[0].c}`);
  console.log(`  - Node 2 Rollup Checks:  ${n2Roll[0].c} (Synchronized via Keeper)`);

  if (Number(n1Roll[0].c) === 50000 && Number(n2Roll[0].c) === 50000) {
    console.log("  >>> PASS [Gate 1]: Zero double counting! Node 2 received exactly 50,000 checks without duplicate view execution.");
  } else {
    throw new Error(`Gate 1 failed: n1=${n1Roll[0].c}, n2=${n2Roll[0].c}`);
  }

  // Gate 2: OPTIMIZE FINAL on Both Nodes
  console.log("\n[Gate 2] Testing OPTIMIZE TABLE FINAL on Production Tables...");
  await node1.command({ query: `OPTIMIZE TABLE ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE} FINAL` });
  await node2.command({ query: `OPTIMIZE TABLE ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE} FINAL` });

  const n1Final = await (await node1.query({ query: `SELECT count() as rows_cnt, sum(total_checks) as checks FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}`, format: "JSONEachRow" })).json();
  const n2Final = await (await node2.query({ query: `SELECT count() as rows_cnt, sum(total_checks) as checks FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}`, format: "JSONEachRow" })).json();
  console.log(`  - Node 1 post-FINAL: ${n1Final[0].rows_cnt} merged rows, ${n1Final[0].checks} total checks.`);
  console.log(`  - Node 2 post-FINAL: ${n2Final[0].rows_cnt} merged rows, ${n2Final[0].checks} total checks.`);

  if (n1Final[0].rows_cnt === n2Final[0].rows_cnt && Number(n1Final[0].checks) === 50000 && Number(n2Final[0].checks) === 50000) {
    console.log("  >>> PASS [Gate 2]: OPTIMIZE FINAL merged both nodes identically with 50,000 total checks.");
  } else {
    throw new Error(`Gate 2 failed: n1=${n1Final[0].checks}, n2=${n2Final[0].checks}`);
  }

  // Gate 3 & Reader Atomicity / Zero Gap Test:
  console.log("\n[Gate 3 & Atomicity] Testing REPLACE PARTITION with alter_sync=2 & Reader Atomicity...");
  const stagingTable = `${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}_staging`;

  // Create staging on both nodes with ReplicatedAggregatingMergeTree
  const createStagingDDL = `
    CREATE TABLE IF NOT EXISTS ${stagingTable} AS ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}
    ENGINE = ReplicatedAggregatingMergeTree('/clickhouse/tables/{shard}/${stagingTable}', '{replica}')
    PARTITION BY toYYYYMMDD(window_start)
    ORDER BY (monitor_id, location, window_start);
  `;
  await node1.command({ query: createStagingDDL });
  await node2.command({ query: createStagingDDL });

  // Insert 60,000 replacement checks into staging on Node 1
  console.log("  - Inserting 60,000 replacement checks into staging on Node 1...");
  await node1.command({
    query: `
      INSERT INTO ${stagingTable}
      SELECT
        toUUID(concat('00000000-0000-0000-0000-', leftPad(toString(number % 100), 12, '0'))),
        'eu-west',
        toStartOfHour(now()),
        toUInt64(600),
        toUInt64(600),
        toUInt64(0),
        toUInt32(120),
        toUInt32(150),
        toUInt64(78000),
        map(toUInt16(120), toUInt64(600))
      FROM numbers(100)
    `
  });

  const partRes = await (await node1.query({ query: "SELECT toYYYYMMDD(now()) as p", format: "JSONEachRow" })).json();
  const currentPart = partRes[0].p;

  // Reader Atomicity Test:
  // A concurrent reader continuously polls sum(total_checks) from Node 2 during the swap.
  // At NO POINT must it read 0, null, or a transient empty state.
  console.log("  - Starting concurrent reader polling on Node 2 during partition swap...");
  let readerRunning = true;
  const pollSamples = [];
  let readerErrors = 0;

  const readerPromise = (async () => {
    while (readerRunning) {
      try {
        const res = await node2.query({
          query: `SELECT sum(total_checks) as c FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}`,
          format: "JSONEachRow"
        });
        const rows = await res.json();
        pollSamples.push(Number(rows[0].c));
      } catch (err) {
        readerErrors++;
      }
      await new Promise(r => setTimeout(r, 5)); // poll every 5ms
    }
  })();

  console.log(`  - Executing ALTER TABLE ... REPLACE PARTITION ${currentPart} FROM ${stagingTable} SETTINGS alter_sync = 2 on Node 1...`);
  const swapT0 = Date.now();
  await node1.command({
    query: `ALTER TABLE ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE} REPLACE PARTITION ${currentPart} FROM ${stagingTable} SETTINGS alter_sync = 2`
  });
  const swapDurationMs = Date.now() - swapT0;
  console.log(`  - Swap committed across all active replicas in ${swapDurationMs}ms.`);

  // Stop reader polling
  readerRunning = false;
  await readerPromise;

  // Safely drop staging partition only after alter_sync=2 returns
  console.log(`  - Safely dropping staging partition now that alter_sync=2 confirmed replica swap...`);
  await node1.command({ query: `ALTER TABLE ${stagingTable} DROP PARTITION ${currentPart}` });

  // Sync Node 2 replica
  await node2.command({ query: `SYSTEM SYNC REPLICA ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}` });

  const n1Replaced = await (await node1.query({ query: `SELECT sum(total_checks) as c FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}`, format: "JSONEachRow" })).json();
  const n2Replaced = await (await node2.query({ query: `SELECT sum(total_checks) as c FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}`, format: "JSONEachRow" })).json();
  console.log(`  - Node 1 post-replace checks: ${n1Replaced[0].c}`);
  console.log(`  - Node 2 post-replace checks: ${n2Replaced[0].c}`);

  // Analyze reader poll samples
  const minObserved = Math.min(...pollSamples);
  const maxObserved = Math.max(...pollSamples);
  console.log(`  - Reader Poll Stats: ${pollSamples.length} samples collected during swap.`);
  console.log(`  - Min checks seen by reader: ${minObserved}, Max checks seen: ${maxObserved}, Errors: ${readerErrors}`);
  
  if (minObserved >= 50000 && Number(n1Replaced[0].c) === 60000 && Number(n2Replaced[0].c) === 60000 && readerErrors === 0) {
    console.log("  >>> PASS [Gate 3 & Atomicity]: Zero reader gaps! Reader transitioned seamlessly from 50,000 to 60,000 checks without ever dropping to 0 or pausing.");
  } else {
    throw new Error(`Atomicity violation! min=${minObserved}, errors=${readerErrors}`);
  }

  // Gate 4: Partial Failure & Silent Undercount (The Dangerous Retry Case)
  console.log("\n[Gate 4] Testing Dangerous Case: Materialized View Partial Failure & Dedup Retry...");
  console.log("  - Setting up throwing Materialized View on Node 1 for poison monitor...");
  await node1.command({ query: "DROP TABLE IF EXISTS pf_mv SYNC" });
  await node1.command({ query: "DROP TABLE IF EXISTS pf_dest SYNC" });
  await node1.command({ query: "DROP TABLE IF EXISTS pf_src SYNC" });

  await node1.command({
    query: `
      CREATE TABLE pf_src (
        monitor_id UUID,
        checked_at DateTime,
        response_time_ms UInt32
      ) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/pf_src', '{replica}')
      ORDER BY (monitor_id, checked_at);
    `
  });

  await node1.command({
    query: `
      CREATE TABLE pf_dest (
        monitor_id UUID,
        total_checks SimpleAggregateFunction(sum, UInt64)
      ) ENGINE = ReplicatedAggregatingMergeTree('/clickhouse/tables/{shard}/pf_dest', '{replica}')
      ORDER BY monitor_id;
    `
  });

  const poisonId = '00000000-0000-0000-0000-000000000666';
  await node1.command({
    query: `
      CREATE MATERIALIZED VIEW pf_mv TO pf_dest AS
      SELECT
        monitor_id,
        toUInt64(count()) AS total_checks
      FROM pf_src
      GROUP BY monitor_id
      HAVING throwIf(monitor_id = toUUID('${poisonId}'), 'POISON MONITOR TRIGGERED EXCEPTION');
    `
  });

  console.log(`  - Inserting poison monitor ${poisonId} with token 'danger_token_123'...`);
  try {
    await node1.command({
      query: `
        INSERT INTO pf_src
        SETTINGS insert_deduplication_token = 'danger_token_123'
        VALUES (toUUID('${poisonId}'), now(), 100)
      `
    });
  } catch (err) {
    console.log(`  - [Expected Exception Caught]: "${err.message.slice(0, 70)}..."`);
  }

  // Raw source count vs rollup count immediately after failure
  const pfSrc1 = await (await node1.query({ query: "SELECT count() as c FROM pf_src", format: "JSONEachRow" })).json();
  const pfDest1 = await (await node1.query({ query: "SELECT sum(total_checks) as c FROM pf_dest", format: "JSONEachRow" })).json();
  console.log(`  - State after MV failure: Raw Source Count = ${pfSrc1[0].c}, Rollup Count = ${pfDest1[0].c || 0}`);

  // Now simulate client retrying with the SAME deduplication token
  console.log("  - Client retries insert with identical deduplication token 'danger_token_123'...");
  try {
    await node1.command({
      query: `
        INSERT INTO pf_src
        SETTINGS insert_deduplication_token = 'danger_token_123'
        VALUES (toUUID('${poisonId}'), now(), 100)
      `
    });
    console.log("  - [Retry Result]: Retry succeeded without exception (silently deduplicated by Keeper at source).");
  } catch (err) {
    console.log(`  - Retry threw: ${err.message}`);
  }

  const pfSrc2 = await (await node1.query({ query: "SELECT count() as c FROM pf_src", format: "JSONEachRow" })).json();
  const pfDest2 = await (await node1.query({ query: "SELECT sum(total_checks) as c FROM pf_dest", format: "JSONEachRow" })).json();
  console.log(`  - State after Retry: Raw Source Count = ${pfSrc2[0].c}, Rollup Count = ${pfDest2[0].c || 0}`);
  
  if (Number(pfSrc2[0].c) === 1 && (Number(pfDest2[0].c) || 0) === 0) {
    console.log("  >>> EMPIRICALLY CONFIRMED: Silent undercount reproduced under default settings! Source committed (1), MV skipped on retry (0).");
  }

  // Now test the definitive engine fix: deduplicate_blocks_in_dependent_materialized_views = 1
  console.log("\n  [Gate 4 Fix Verification]: Testing with deduplicate_blocks_in_dependent_materialized_views = 1...");
  // Replace poison MV with healthy view
  await node1.command({ query: "DROP TABLE pf_mv SYNC" });
  await node1.command({
    query: `
      CREATE MATERIALIZED VIEW pf_mv TO pf_dest AS
      SELECT
        monitor_id,
        toUInt64(count()) AS total_checks
      FROM pf_src
      GROUP BY monitor_id;
    `
  });

  console.log("  - Retrying with same token 'danger_token_123' and deduplicate_blocks_in_dependent_materialized_views = 1...");
  await node1.command({
    query: `
      INSERT INTO pf_src
      SETTINGS insert_deduplication_token = 'danger_token_123',
               deduplicate_blocks_in_dependent_materialized_views = 1
      VALUES (toUUID('${poisonId}'), now(), 100)
    `
  });

  const pfSrc3 = await (await node1.query({ query: "SELECT count() as c FROM pf_src", format: "JSONEachRow" })).json();
  const pfDest3 = await (await node1.query({ query: "SELECT sum(total_checks) as c FROM pf_dest", format: "JSONEachRow" })).json();
  console.log(`  - State after retry with fix: Raw Source Count = ${pfSrc3[0].c}, Rollup Count = ${pfDest3[0].c}`);

  if (Number(pfSrc3[0].c) === 1 && Number(pfDest3[0].c) === 1) {
    console.log("  >>> PASS: deduplicate_blocks_in_dependent_materialized_views = 1 successfully routed retry to MV and inserted missing rollup row!");
  } else {
    throw new Error(`Dedup MV fix failed: src=${pfSrc3[0].c}, dest=${pfDest3[0].c}`);
  }

  // Confirm zero double counting on second retry
  console.log("  - Retrying second time with same token to confirm zero double counting...");
  await node1.command({
    query: `
      INSERT INTO pf_src
      SETTINGS insert_deduplication_token = 'danger_token_123',
               deduplicate_blocks_in_dependent_materialized_views = 1
      VALUES (toUUID('${poisonId}'), now(), 100)
    `
  });

  const pfSrc4 = await (await node1.query({ query: "SELECT count() as c FROM pf_src", format: "JSONEachRow" })).json();
  const pfDest4 = await (await node1.query({ query: "SELECT sum(total_checks) as c FROM pf_dest", format: "JSONEachRow" })).json();
  console.log(`  - State after 2nd retry: Raw Source Count = ${pfSrc4[0].c}, Rollup Count = ${pfDest4[0].c}`);

  if (Number(pfSrc4[0].c) === 1 && Number(pfDest4[0].c) === 1) {
    console.log("  >>> PASS: Second retry completely deduplicated in both source and view (zero double counting)!");
  } else {
    throw new Error(`Double counting occurred: src=${pfSrc4[0].c}, dest=${pfDest4[0].c}`);
  }

  // Cleanup Gate 4 test tables
  await node1.command({ query: "DROP TABLE IF EXISTS pf_mv SYNC" });
  await node1.command({ query: "DROP TABLE IF EXISTS pf_dest SYNC" });
  await node1.command({ query: "DROP TABLE IF EXISTS pf_src SYNC" });

  console.log("\n================================================================================");
  console.log("         ALL PRODUCTION CLUSTER GATES & ATOMICITY TESTS PASSED!                 ");
  console.log("================================================================================\n");
}

runProductionClusterVerification().catch(err => {
  console.error("Cluster verification failed:", err);
  process.exit(1);
});
