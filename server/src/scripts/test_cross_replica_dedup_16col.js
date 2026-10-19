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

async function runCrossReplicaDedupTest() {
  console.log("================================================================================");
  console.log("   CROSS-REPLICA RETRY DEDUPLICATION TEST (PRODUCTION TABLE: uptime_checks_telemetry) ");
  console.log("================================================================================");
  console.log("Node 1: http://localhost:8123");
  console.log("Node 2: http://localhost:8124");

  const testMonitorID = "99999999-9999-9999-9999-999999999999";
  const token = "cross_replica_prod_token_" + Date.now();

  // Clean any existing rows for this monitor ID
  await node1.command({ query: `ALTER TABLE uptime_checks_telemetry DELETE WHERE monitor_id = toUUID('${testMonitorID}')` });
  await new Promise(r => setTimeout(r, 2000));

  console.log("\n[Step 1] Inserting 21-column batch into NODE 1 with token:", token);
  await node1.command({
    query: `
      INSERT INTO uptime_checks_telemetry (
        monitor_id, checked_at, status_code, success, response_time_ms,
        error_message, location, suppressed_by_window_id,
        latency_us, status, err_code, monitor_type,
        probe_kind, interval_s, phase_kind, attempts, total_latency_us,
        reused, did_resume, req_method, req_scheme, generation
      )
      SETTINGS async_insert = 0, deduplicate_blocks_in_dependent_materialized_views = 1, insert_deduplication_token = '${token}'
      VALUES (
        toUUID('${testMonitorID}'),
        '2026-10-17 12:00:00.000',
        200, 1, 14,
        '', 'eu-west', NULL,
        14500, 1, 0, 1,
        0, 30, 0, 1, 14500,
        1, 1, 0, 1, 42
      )
    `
  });

  console.log("[Step 2] Waiting 2s for Keeper replication to propagate to Node 2...");
  await new Promise(r => setTimeout(r, 2000));

  const n1Count = await (await node1.query({
    query: `SELECT count() as c FROM uptime_checks_telemetry WHERE monitor_id = toUUID('${testMonitorID}')`,
    format: "JSONEachRow"
  })).json();

  const n2Count = await (await node2.query({
    query: `SELECT count() as c FROM uptime_checks_telemetry WHERE monitor_id = toUUID('${testMonitorID}')`,
    format: "JSONEachRow"
  })).json();

  console.log(`  - Node 1 count: ${n1Count[0].c}`);
  console.log(`  - Node 2 count: ${n2Count[0].c}`);
  if (n1Count[0].c !== "1" || n2Count[0].c !== "1") {
    throw new Error(`Replication failed: Node1=${n1Count[0].c}, Node2=${n2Count[0].c}`);
  }

  console.log("\n[Step 3] Simulating Network Failure & Retrying the INSERT to NODE 2 (The Other Replica) with the SAME TOKEN...");
  await node2.command({
    query: `
      INSERT INTO uptime_checks_telemetry (
        monitor_id, checked_at, status_code, success, response_time_ms,
        error_message, location, suppressed_by_window_id,
        latency_us, status, err_code, monitor_type,
        probe_kind, interval_s, phase_kind, attempts, total_latency_us,
        reused, did_resume, req_method, req_scheme, generation
      )
      SETTINGS async_insert = 0, deduplicate_blocks_in_dependent_materialized_views = 1, insert_deduplication_token = '${token}'
      VALUES (
        toUUID('${testMonitorID}'),
        '2026-10-17 12:00:00.000',
        200, 1, 14,
        '', 'eu-west', NULL,
        14500, 1, 0, 1,
        0, 30, 0, 1, 14500,
        1, 1, 0, 1, 42
      )
    `
  });

  console.log("[Step 4] Checking counts after cross-replica retry...");
  await new Promise(r => setTimeout(r, 2000));

  const n1Post = await (await node1.query({
    query: `SELECT count() as c FROM uptime_checks_telemetry WHERE monitor_id = toUUID('${testMonitorID}')`,
    format: "JSONEachRow"
  })).json();

  const n2Post = await (await node2.query({
    query: `SELECT count() as c FROM uptime_checks_telemetry WHERE monitor_id = toUUID('${testMonitorID}')`,
    format: "JSONEachRow"
  })).json();

  console.log(`  - Node 1 count after retry: ${n1Post[0].c}`);
  console.log(`  - Node 2 count after retry: ${n2Post[0].c}`);

  if (n1Post[0].c === "1" && n2Post[0].c === "1") {
    console.log("\n>>> SUCCESS: Keeper Block Deduplication across replicas SUCCEEDED on uptime_checks_telemetry!");
    console.log("    Retry sent to Node 2 was recognized as duplicate via Keeper and silently ignored.");
  } else {
    throw new Error(`DEDUPLICATION FAILED! Expected count 1, got Node1=${n1Post[0].c}, Node2=${n2Post[0].c}`);
  }
}

runCrossReplicaDedupTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
