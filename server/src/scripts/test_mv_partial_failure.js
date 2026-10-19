import { createClient } from "@clickhouse/client";

const client = createClient({
  url: "http://localhost:8123",
  username: "engine",
  password: "password",
  database: "default"
});

async function testPartialFailure() {
  console.log("================================================================================");
  console.log("   TESTING DEDUPLICATE_BLOCKS_IN_DEPENDENT_MATERIALIZED_VIEWS=1 PARTIAL FAILURE ");
  console.log("================================================================================");

  // 1. Setup test tables
  await client.command({ query: "DROP TABLE IF EXISTS pf_mv" });
  await client.command({ query: "DROP TABLE IF EXISTS pf_dst" });
  await client.command({ query: "DROP TABLE IF EXISTS pf_src" });

  await client.command({
    query: `
      CREATE TABLE pf_src (
        id UUID,
        val UInt32,
        fail_flag UInt8
      ) ENGINE = MergeTree()
      ORDER BY id;
    `
  });

  await client.command({
    query: `
      CREATE TABLE pf_dst (
        id UUID,
        val_sum SimpleAggregateFunction(sum, UInt64)
      ) ENGINE = AggregatingMergeTree()
      ORDER BY id;
    `
  });

  // Materialized view that conditionally fails when fail_flag = 1
  await client.command({
    query: `
      CREATE MATERIALIZED VIEW pf_mv TO pf_dst AS
      SELECT
        id,
        toUInt64(sum(if(fail_flag = 1, throwIf(val > 0, 'Injected MV Failure!'), val))) AS val_sum
      FROM pf_src
      GROUP BY id;
    `
  });

  const testId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const token = "partial_fail_token_42";

  console.log("\n[Step 1] Attempting initial insert where MV will fail (fail_flag=1)...");
  let failedAsExpected = false;
  try {
    await client.insert({
      table: "pf_src",
      values: [{ id: testId, val: 100, fail_flag: 1 }],
      format: "JSONEachRow",
      clickhouse_settings: {
        async_insert: 0,
        deduplicate_blocks_in_dependent_materialized_views: 1,
        insert_deduplication_token: token
      }
    });
  } catch (err) {
    failedAsExpected = true;
    console.log("  >>> MV threw expected exception during initial insert:", err.message.substring(0, 80));
  }

  if (!failedAsExpected) {
    throw new Error("Expected initial insert to fail due to injected MV error!");
  }

  // 2. Now alter the MV or fix the condition so it succeeds, and retry with the SAME token
  console.log("\n[Step 2] Fixing MV failure condition (re-creating MV without the injected throw)...");
  await client.command({ query: "DROP TABLE pf_mv" });
  await client.command({
    query: `
      CREATE MATERIALIZED VIEW pf_mv TO pf_dst AS
      SELECT
        id,
        toUInt64(sum(val)) AS val_sum
      FROM pf_src
      GROUP BY id;
    `
  });

  console.log("\n[Step 3] Retrying insert with the EXACT SAME TOKEN with deduplicate_blocks_in_dependent_materialized_views=1...");
  await client.insert({
    table: "pf_src",
    values: [{ id: testId, val: 100, fail_flag: 0 }],
    format: "JSONEachRow",
    clickhouse_settings: {
      async_insert: 0,
      deduplicate_blocks_in_dependent_materialized_views: 1,
      insert_deduplication_token: token
    }
  });

  // 3. Check counts
  const srcRes = await (await client.query({
    query: `SELECT count() as c FROM pf_src WHERE id = toUUID('${testId}')`,
    format: "JSONEachRow"
  })).json();

  const dstRes = await (await client.query({
    query: `SELECT sum(val_sum) as total FROM pf_dst WHERE id = toUUID('${testId}')`,
    format: "JSONEachRow"
  })).json();

  console.log(`\nResults after retry with token '${token}':`);
  console.log(`  - Source table count: ${srcRes[0].c}`);
  console.log(`  - Target MV sum:      ${dstRes[0].total}`);

  if (Number(dstRes[0].total) === 100) {
    console.log("\n>>> SUCCESS: Dependent Materialized View was populated on retry despite prior failure!");
    console.log("    deduplicate_blocks_in_dependent_materialized_views=1 successfully allowed the view to catch up.");
  } else {
    throw new Error(`Target MV undercounted! Expected 100, got ${dstRes[0].total}`);
  }

  // Cleanup
  await client.command({ query: "DROP TABLE pf_mv" });
  await client.command({ query: "DROP TABLE pf_dst" });
  await client.command({ query: "DROP TABLE pf_src" });
}

testPartialFailure().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
