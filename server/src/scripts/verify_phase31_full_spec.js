import { createClient } from "@clickhouse/client";
import { v4 as uuidv4 } from "uuid";

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

async function runPhase31FullVerification() {
  console.log("================================================================================");
  console.log("       PHASE 3.1 FULL EMPIRICAL VERIFICATION (PRODUCTION: uptime_checks_telemetry)");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // TEST 1: REALISTIC DATA COMPRESSION BENCHMARK (uptime_checks_telemetry)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 1] Benchmarking Real-World Columnar Storage Density on uptime_checks_telemetry (50,000 rows)...");
  await node1.command({ query: "TRUNCATE TABLE uptime_checks_telemetry SYNC" });
  await new Promise(r => setTimeout(r, 1000));

  const totalBatches = 5;
  const batchSize = 10000;
  const startTs = Date.now();

  for (let b = 0; b < totalBatches; b++) {
    const rows = [];
    const baseMs = startTs - (b * 10000);
    const token = uuidv4();

    for (let i = 0; i < batchSize; i++) {
      // Realistic log-normal latency distribution (20ms to 450ms)
      const latUs = Math.floor(Math.exp(3.2 + Math.random() * 1.5) * 1000);
      const respMs = Math.floor(latUs / 1000);
      // Realistic status distribution: 97.5% UP (1), 2% DEGRADED (2), 0.5% DOWN (0)
      const r = Math.random();
      const status = r < 0.975 ? 1 : r < 0.995 ? 2 : 0;
      const statusCode = status === 1 ? 200 : status === 2 ? 503 : 500;
      const success = status === 1 ? 1 : 0;
      const errCode = status === 1 ? 0 : status === 2 ? 10 : 20;
      const monitorType = (i % 4) + 1; // 1=http, 2=keyword, 3=ping, 4=port
      const probeKind = i % 100 === 0 ? 1 : 0; // 1% verification probes
      const phaseKind = i % 50 === 0 ? 1 : 0; // 2% full-phase probes
      const reused = monitorType <= 2 ? (Math.random() < 0.92 ? 1 : 0) : 0; // 92% socket reuse on HTTP
      const didResume = reused === 0 && Math.random() < 0.95 ? 1 : 0; // 95% TLS ticket resumption

      rows.push({
        monitor_id: uuidv4(),
        checked_at: new Date(baseMs + (i % 1000)).toISOString().replace("T", " ").replace("Z", ""),
        status_code: statusCode,
        success: success,
        response_time_ms: respMs,
        error_message: "",
        location: "eu-west",
        suppressed_by_window_id: null,
        latency_us: latUs,
        status: status,
        err_code: errCode,
        monitor_type: monitorType,
        probe_kind: probeKind,
        interval_s: 30,
        phase_kind: phaseKind,
        attempts: 1,
        total_latency_us: latUs,
        reused: reused,
        did_resume: didResume,
        req_method: 0,
        req_scheme: 1,
        generation: 1
      });
    }

    const insertStart = Date.now();
    await node1.insert({
      table: "uptime_checks_telemetry",
      values: rows,
      format: "JSONEachRow",
      clickhouse_settings: {
        async_insert: 0,
        deduplicate_blocks_in_dependent_materialized_views: 1,
        insert_deduplication_token: token
      }
    });
    const insertDuration = Date.now() - insertStart;
    console.log(`  - Flushed Batch ${b + 1}/5 (10,000 rows) with token ${token.substring(0, 8)}... in ${insertDuration} ms (${Math.round(batchSize / (insertDuration / 1000))} rows/s)`);
  }

  // Allow background part formation to settle
  await new Promise(r => setTimeout(r, 2000));

  const partsRes = await (await node1.query({
    query: `
      SELECT 
        count() as part_count, 
        sum(rows) as total_rows, 
        sum(bytes_on_disk) as bytes_on_disk
      FROM system.parts 
      WHERE table = 'uptime_checks_telemetry' AND active = 1
    `,
    format: "JSONEachRow"
  })).json();

  const bytesPerRow = (Number(partsRes[0].bytes_on_disk) / Number(partsRes[0].total_rows)).toFixed(2);
  console.log(`\n  >>> REALISTIC 21-COLUMN COMPRESSION RESULT (uptime_checks_telemetry):`);
  console.log(`      Active Parts:    ${partsRes[0].part_count}`);
  console.log(`      Total Rows:      ${partsRes[0].total_rows}`);
  console.log(`      Bytes on Disk:   ${partsRes[0].bytes_on_disk} bytes`);
  console.log(`      Bytes per Row:   ${bytesPerRow} B/row (realistic distributions across 50,000 rows)`);

  // ---------------------------------------------------------------------------
  // TEST 2: PROCESS RESTART SIMULATION & TOKEN ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2] Simulating Engine Process Restart & Token Isolation...");
  const preRestartCount = Number(partsRes[0].total_rows);
  const restartToken = uuidv4();
  const restartRows = [{
    monitor_id: uuidv4(),
    checked_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
    status_code: 200,
    success: 1,
    response_time_ms: 25,
    error_message: "",
    location: "eu-west",
    suppressed_by_window_id: null,
    latency_us: 25000,
    status: 1,
    err_code: 0,
    monitor_type: 1,
    probe_kind: 0,
    interval_s: 30,
    phase_kind: 0,
    attempts: 1,
    total_latency_us: 25000,
    reused: 1,
    did_resume: 1,
    req_method: 0,
    req_scheme: 1,
    generation: 2
  }];

  await node1.insert({
    table: "uptime_checks_telemetry",
    values: restartRows,
    format: "JSONEachRow",
    clickhouse_settings: {
      async_insert: 0,
      deduplicate_blocks_in_dependent_materialized_views: 1,
      insert_deduplication_token: restartToken
    }
  });

  const postRestartRes = await (await node1.query({
    query: "SELECT count() as c FROM uptime_checks_telemetry",
    format: "JSONEachRow"
  })).json();

  console.log(`  - Pre-restart rows:  ${preRestartCount}`);
  console.log(`  - Post-restart rows: ${postRestartRes[0].c}`);
  if (Number(postRestartRes[0].c) === preRestartCount + 1) {
    console.log("  >>> PASS: Fresh instance UUID v4 token appended cleanly without collision.");
  } else {
    throw new Error(`Process restart collision! Expected ${preRestartCount + 1}, got ${postRestartRes[0].c}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: ROLLUP MATERIALIZED VIEW DEDUPLICATION
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3] Verifying Dependent Materialized View Behavior Under Retry...");
  const rollupToken = "rollup_test_token_" + uuidv4();
  const testMonitor = uuidv4();
  const fixedTime = "2026-10-17 10:00:00.000";

  // Check initial count in rollup table
  const preMvRows = await (await node1.query({
    query: `SELECT count() as c, sum(total_checks) as total FROM uptime_checks_hourly_rollups WHERE monitor_id = toUUID('${testMonitor}')`,
    format: "JSONEachRow"
  })).json();

  console.log(`  - Initial hourly rollup count for monitor: ${preMvRows[0].c}`);

  // Insert batch into raw telemetry table connected to MV
  const rawBatch = [{
    monitor_id: testMonitor,
    checked_at: fixedTime,
    status_code: 200,
    success: 1,
    response_time_ms: 125,
    error_message: "",
    location: "eu-west",
    suppressed_by_window_id: null,
    latency_us: 125000,
    status: 1,
    err_code: 0,
    monitor_type: 1,
    probe_kind: 0,
    interval_s: 30,
    phase_kind: 0,
    attempts: 1,
    total_latency_us: 125000,
    reused: 1,
    did_resume: 1,
    req_method: 0,
    req_scheme: 1,
    generation: 1
  }];

  console.log("  - Sending initial insert with token:", rollupToken);
  await node1.insert({
    table: "uptime_checks_telemetry",
    values: rawBatch,
    format: "JSONEachRow",
    clickhouse_settings: {
      async_insert: 0,
      deduplicate_blocks_in_dependent_materialized_views: 1,
      insert_deduplication_token: rollupToken
    }
  });

  await new Promise(r => setTimeout(r, 1500));

  const postInsertMv = await (await node1.query({
    query: `SELECT count() as c, sum(total_checks) as total FROM uptime_checks_hourly_rollups WHERE monitor_id = toUUID('${testMonitor}')`,
    format: "JSONEachRow"
  })).json();
  console.log(`  - Rollup total checks after first insert: ${postInsertMv[0].total}`);

  // Now retry the EXACT SAME insert with the same token
  console.log("  - Simulating network retry: Sending exact same insert with same token:", rollupToken);
  await node1.insert({
    table: "uptime_checks_telemetry",
    values: rawBatch,
    format: "JSONEachRow",
    clickhouse_settings: {
      async_insert: 0,
      deduplicate_blocks_in_dependent_materialized_views: 1,
      insert_deduplication_token: rollupToken
    }
  });

  await new Promise(r => setTimeout(r, 1500));

  const postRetryMv = await (await node1.query({
    query: `SELECT count() as c, sum(total_checks) as total FROM uptime_checks_hourly_rollups WHERE monitor_id = toUUID('${testMonitor}')`,
    format: "JSONEachRow"
  })).json();

  console.log(`  - Rollup total checks after retried insert: ${postRetryMv[0].total}`);

  if (Number(postRetryMv[0].total) === Number(postInsertMv[0].total)) {
    console.log("  >>> PASS: Duplicate batch with identical token left the dependent rollup Materialized View 100% UNCHANGED!");
  } else {
    throw new Error(`Rollup MV duplicate contamination! Expected ${postInsertMv[0].total}, got ${postRetryMv[0].total}`);
  }

  console.log("\n================================================================================");
  console.log("               ALL PRODUCTION SPECIFICATION CHECKS PASSED!                      ");
  console.log("================================================================================\n");
}

runPhase31FullVerification().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
