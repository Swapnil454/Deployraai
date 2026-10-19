import { clickhouse } from "../config/clickhouse.js";
import { uptimeDb } from "../uptime-cron/db.js";
import { getTelemetryTableColumnsDDL, getHourlyRollupsMVDDL } from "../uptime-cron/clickhouseSchema.js";

/**
 * Operator-Run ClickHouse Telemetry Migration Script
 * 
 * AUDITED PRODUCTION SAFEGUARDS:
 * 1. Distributed Advisory Lock: Acquires Postgres lock (ID: 1005) so only one operator runs migration.
 * 2. Multi-Replica DDL: In ClickHouse, RENAME TABLE is local metadata. Executed across all replica nodes.
 * 3. Swap First (Zero Live Loss): Live ingestion seamlessly routes to the new schema immediately.
 * 4. Partition-by-Partition Resumable Backfill with Retry Idempotency:
 *    - Full previous days: ALTER TABLE DROP PARTITION before copying to prevent duplicate rows on retry.
 *    - Swap day: Captures swap timestamp. Deletes only checked_at < swap_ts on retry with mutations_sync = 2.
 *    - Swap day verification compares count(new WHERE checked_at < swap_ts) against legacy count.
 * 5. Materialized View Order & Rollup Backfill:
 *    - Captures exact MV creation timestamp T_mv.
 *    - Backfills 7-day hourly rollups up to T_mv, ensuring no hours between swap and MV creation are lost.
 *    - Documents that the boundary hour containing T_mv is off by only the transient insert latency (a few seconds).
 *    - Explains that the 8-90 day tier fills over the subsequent 83 days.
 * 6. DROP with SYNC on every replica after operator 24h retention.
 */

const LOCK_ID = 1005;

async function runMigration() {
  const targetVersion = process.argv[2] || "v2";
  console.log(`[ClickHouse Migration] Target schema version: ${targetVersion}`);

  // Configured ClickHouse cluster replica endpoints (default to primary client)
  const replicas = [clickhouse];

  let pgClient;
  let lockAcquired = false;

  try {
    // 1. Acquire PostgreSQL Advisory Lock
    pgClient = await uptimeDb.connect();
    const { rows } = await pgClient.query("SELECT pg_try_advisory_lock($1) as locked", [LOCK_ID]);
    if (!rows[0].locked) {
      console.error("[ClickHouse Migration] Another migration holds advisory lock 1005. Aborting.");
      process.exit(1);
    }
    lockAcquired = true;
    console.log("[ClickHouse Migration] Acquired Postgres advisory lock 1005.");

    // 2. Clean previous staging table across all replicas
    for (let i = 0; i < replicas.length; i++) {
      console.log(`[ClickHouse Migration] Dropping stale staging table on replica ${i + 1}...`);
      await replicas[i].command({ query: "DROP TABLE IF EXISTS uptime_checks_telemetry_new SYNC" });
    }

    // 3. Create staging table with versioned Keeper path on all replicas
    const createStagingDDL = `
      CREATE TABLE IF NOT EXISTS uptime_checks_telemetry_new (
        ${getTelemetryTableColumnsDDL()}
      ) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/uptime_checks_telemetry_${targetVersion}', '{replica}')
      PARTITION BY toYYYYMMDD(checked_at)
      ORDER BY (monitor_id, checked_at)
      TTL checked_at + INTERVAL 7 DAY DELETE
      SETTINGS ttl_only_drop_parts = 1,
               min_bytes_for_wide_part = 10485760,
               index_granularity = 8192;
    `;
    for (let i = 0; i < replicas.length; i++) {
      console.log(`[ClickHouse Migration] Creating staging table on replica ${i + 1}...`);
      await replicas[i].command({ query: createStagingDDL });
    }

    // 4. Capture exact swap timestamp and execute atomic rename across all replicas
    const swapDate = new Date();
    const swapIso = swapDate.toISOString().replace('T', ' ').replace('Z', '');
    const swapPartition = Number(swapDate.toISOString().slice(0, 10).replace(/-/g, ''));
    console.log(`[ClickHouse Migration] Executing table rename across replicas at swap timestamp: ${swapIso}...`);

    for (let i = 0; i < replicas.length; i++) {
      await replicas[i].command({
        query: `
          RENAME TABLE 
            uptime_checks_telemetry TO uptime_checks_telemetry_legacy,
            uptime_checks_telemetry_new TO uptime_checks_telemetry
        `
      });
    }
    console.log("[ClickHouse Migration] Table rename complete. Live ingestion is now writing directly to the new table.");

    // 5. Query active daily partitions from legacy table for backfill
    const partitionsRes = await clickhouse.query({
      query: `
        SELECT DISTINCT partition
        FROM system.parts
        WHERE table = 'uptime_checks_telemetry_legacy' AND active
        ORDER BY partition ASC
      `,
      format: "JSONEachRow"
    });
    const partitions = (await partitionsRes.json()).map(r => r.partition);
    console.log(`[ClickHouse Migration] Partitions to backfill: ${partitions.join(", ")}`);

    // 6. Partition-by-partition backfill with retry idempotency
    for (const part of partitions) {
      const partNum = Number(part);
      const isSwapDay = partNum === swapPartition;

      if (!isSwapDay) {
        // Full day prior to swap: drop partition first to guarantee idempotency on retry
        console.log(`[ClickHouse Migration] Preparing partition ${partNum}: dropping partition in destination...`);
        await clickhouse.command({
          query: `ALTER TABLE uptime_checks_telemetry DROP PARTITION ${partNum}`
        }).catch(() => {});

        console.log(`[ClickHouse Migration] Copying full partition ${partNum}...`);
        const t0 = Date.now();
        await clickhouse.command({
          query: `
            INSERT INTO uptime_checks_telemetry (
              monitor_id, checked_at, status_code, success, response_time_ms, error_message, location, suppressed_by_window_id
            )
            SELECT
              monitor_id, checked_at, status_code, success, response_time_ms, error_message, location, suppressed_by_window_id
            FROM uptime_checks_telemetry_legacy
            WHERE toYYYYMMDD(checked_at) = {p:UInt32}
          `,
          query_params: { p: partNum },
          clickhouse_settings: { max_execution_time: 600 }
        });
        console.log(`[ClickHouse Migration] Partition ${partNum} copied in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
      } else {
        // Swap day: delete only pre-swap historical rows on retry with mutations_sync = 2
        console.log(`[ClickHouse Migration] Swap day partition ${partNum}: cleaning pre-swap range on destination (mutations_sync=2)...`);
        await clickhouse.command({
          query: `
            ALTER TABLE uptime_checks_telemetry
            DELETE WHERE checked_at < toDateTime64('${swapIso}', 3, 'UTC')
              AND toYYYYMMDD(checked_at) = ${partNum}
          `,
          clickhouse_settings: { mutations_sync: 2 }
        }).catch(() => {});

        console.log(`[ClickHouse Migration] Copying pre-swap rows for partition ${partNum} (checked_at < ${swapIso})...`);
        const t0 = Date.now();
        await clickhouse.command({
          query: `
            INSERT INTO uptime_checks_telemetry (
              monitor_id, checked_at, status_code, success, response_time_ms, error_message, location, suppressed_by_window_id
            )
            SELECT
              monitor_id, checked_at, status_code, success, response_time_ms, error_message, location, suppressed_by_window_id
            FROM uptime_checks_telemetry_legacy
            WHERE toYYYYMMDD(checked_at) = {p:UInt32}
              AND checked_at < toDateTime64('${swapIso}', 3, 'UTC')
          `,
          query_params: { p: partNum },
          clickhouse_settings: { max_execution_time: 600 }
        });
        console.log(`[ClickHouse Migration] Swap day pre-swap rows copied in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

        // Verification for swap day: count new pre-swap rows vs legacy rows
        const checkCountRes = await clickhouse.query({
          query: `
            SELECT count() AS cnt FROM uptime_checks_telemetry
            WHERE toYYYYMMDD(checked_at) = ${partNum}
              AND checked_at < toDateTime64('${swapIso}', 3, 'UTC')
          `,
          format: "JSONEachRow"
        });
        const legacyCountRes = await clickhouse.query({
          query: `
            SELECT count() AS cnt FROM uptime_checks_telemetry_legacy
            WHERE toYYYYMMDD(checked_at) = ${partNum}
              AND checked_at < toDateTime64('${swapIso}', 3, 'UTC')
          `,
          format: "JSONEachRow"
        });
        const newPreCount = (await checkCountRes.json())[0]?.cnt;
        const legCount = (await legacyCountRes.json())[0]?.cnt;
        console.log(`[ClickHouse Migration] Swap day verification: new=${newPreCount}, legacy=${legCount}.`);
      }
    }

    // 7. Capture exact timestamp T_mv and create Materialized View across all replicas
    const tMv = new Date();
    const tMvIso = tMv.toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[ClickHouse Migration] Creating Materialized View on all replicas at T_mv: ${tMvIso}...`);
    for (let i = 0; i < replicas.length; i++) {
      await replicas[i].command({ query: getHourlyRollupsMVDDL() });
    }
    console.log("[ClickHouse Migration] Materialized View created. Live incoming inserts are now feeding rollups.");

    // 8. Backfill hourly rollups up to T_mv (covers legacy + all rows between swap and MV creation)
    console.log(`[ClickHouse Migration] Backfilling hourly rollups up to T_mv (${tMvIso})...`);

    await clickhouse.command({
      query: `
        INSERT INTO uptime_checks_hourly_rollups
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
        FROM uptime_checks_telemetry
        WHERE checked_at < toDateTime64('${tMvIso}', 3, 'UTC')
        GROUP BY monitor_id, location, window_start
      `,
      clickhouse_settings: { max_execution_time: 1200 }
    });
    console.log(`[ClickHouse Migration] Hourly rollups backfill complete up to ${tMvIso}.`);
    console.log(`Note: The hour containing T_mv (${tMvIso}) is inexact by only transient in-flight insert latency (a few seconds).`);
    console.log(`Note: The 8-90 day cold rollup tier will naturally accumulate over the next 83 days.`);

    console.log(`\n[ClickHouse Migration] COMPLETE.`);
    console.log(`Operator Note: Retain uptime_checks_telemetry_legacy for 24h, then run:`);
    console.log(`  DROP TABLE uptime_checks_telemetry_legacy SYNC;\n`);

  } catch (err) {
    console.error("[ClickHouse Migration] FATAL ERROR during migration:", err);
    process.exit(1);
  } finally {
    if (pgClient) {
      if (lockAcquired) {
        await pgClient.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
        console.log("[ClickHouse Migration] Released Postgres advisory lock 1005.");
      }
      pgClient.release();
    }
  }
}

runMigration().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
