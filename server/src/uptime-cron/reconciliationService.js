import { clickhouse } from "../config/clickhouse.js";
import {
  CLICKHOUSE_TELEMETRY_TABLE,
  CLICKHOUSE_HOURLY_ROLLUPS_TABLE,
  CLICKHOUSE_DAILY_ROLLUPS_TABLE,
  getHourlyReconciliationRepairSQL,
  getDailySlidingRebuildSQL,
  ADVISORY_LOCKS
} from "./clickhouseSchema.js";
import { uptimeDb } from "./db.js";

/**
 * ClickHouse Reconciliation & Sliding Rebuild Service (Algorithms 8 & 9)
 * 
 * Provides:
 * 1. Hourly Reconciliation: Scans completed hours in the last 24h comparing raw telemetry
 *    vs hourly rollups to detect and atomically repair any undercounts caused by MV exceptions or dropped retries.
 * 2. Daily Sliding Rebuild: Runs nightly across sliding window (D-3 through D-1) to aggregate
 *    hourly rollups into daily rollups using REPLACE PARTITION with alter_sync=2.
 */

/**
 * Checks for discrepancies between raw telemetry and hourly rollups for completed hours.
 * Repartition-rebuilds any mismatched date partitions atomically.
 */
export async function runHourlyReconciliation(client = clickhouse) {
  let pgClient;
  let lockAcquired = false;

  try {
    pgClient = await uptimeDb.connect();
    const { rows: lockRows } = await pgClient.query(
      "SELECT pg_try_advisory_lock($1) as locked",
      [ADVISORY_LOCKS.HOURLY_RECONCILIATION]
    );
    if (!lockRows[0].locked) {
      console.log("[Reconciliation] Another instance holds lock 1007. Skipping run.");
      return { skipped: true, reason: "LOCK_HELD" };
    }
    lockAcquired = true;

    console.log("[Reconciliation] Auditing completed hours in raw telemetry vs hourly rollups across 7-day retention window...");
    
    // Check for discrepancy between raw telemetry count and hourly rollup sum across 7-day retention
    const query = `
      WITH
        today_utc AS (
          SELECT toYYYYMMDD(now('UTC')) AS today_val
        ),
        raw_hourly AS (
          SELECT
            toStartOfHour(checked_at) AS window_start,
            count() AS raw_total
          FROM ${CLICKHOUSE_TELEMETRY_TABLE}
          WHERE checked_at >= now('UTC') - INTERVAL 7 DAY AND checked_at < toStartOfHour(now('UTC'))
          GROUP BY window_start
        ),
        roll_hourly AS (
          SELECT
            window_start,
            sum(total_checks) AS roll_total
          FROM ${CLICKHOUSE_HOURLY_ROLLUPS_TABLE}
          WHERE window_start >= now('UTC') - INTERVAL 7 DAY AND window_start < toStartOfHour(now('UTC'))
          GROUP BY window_start
        )
      SELECT
        toYYYYMMDD(raw.window_start) AS part_date,
        raw.window_start AS window_start,
        raw.raw_total AS raw_total,
        coalesce(roll.roll_total, 0) AS roll_total,
        abs(toInt64(raw.raw_total) - toInt64(coalesce(roll.roll_total, 0))) AS discrepancy,
        toYYYYMMDD(raw.window_start) >= today_utc.today_val AS is_open_day
      FROM raw_hourly raw
      CROSS JOIN today_utc
      LEFT JOIN roll_hourly roll ON raw.window_start = roll.window_start
      WHERE raw.raw_total != coalesce(roll.roll_total, 0)
      ORDER BY window_start ASC;
    `;

    const res = await client.query({ query, format: "JSONEachRow" });
    const mismatches = await res.json();

    if (mismatches.length === 0) {
      console.log("[Reconciliation] Parity verified: Zero undercounts detected across all completed hours.");
      return { success: true, repairedPartitions: 0, openDayDrifts: 0, mismatches: [] };
    }

    // Separate open day mismatches from completed past days
    const openDayMismatches = mismatches.filter(m => m.is_open_day === 1 || m.is_open_day === true);
    const completedDayMismatches = mismatches.filter(m => m.is_open_day === 0 || m.is_open_day === false);

    if (openDayMismatches.length > 0) {
      const openDrift = openDayMismatches.reduce((sum, m) => sum + Number(m.discrepancy), 0);
      console.warn(`[Reconciliation:Alert] Active open-day drift detected (${openDayMismatches.length} hour(s), ${openDrift} checks). Partition replacement deferred until day completes at UTC midnight to protect in-flight live writes.`);
    }

    const completedDatesToRepair = [...new Set(completedDayMismatches.map(m => m.part_date))];
    for (const partDate of completedDatesToRepair) {
      console.log(`[Reconciliation] Executing atomic repair for COMPLETED date partition ${partDate} (alter_sync = 2)...`);
      const repairSql = getHourlyReconciliationRepairSQL({
        targetDateYYYYMMDD: partDate,
        sourceRawTable: CLICKHOUSE_TELEMETRY_TABLE,
        targetHourlyTable: CLICKHOUSE_HOURLY_ROLLUPS_TABLE,
        isReplicated: true
      });

      const statements = repairSql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        await client.command({ query: stmt });
      }
      console.log(`[Reconciliation] Repaired hourly rollups partition ${partDate} successfully with alter_sync=2.`);

      // Also rebuild the daily rollups table for this completed day to maintain immediate cross-tier sync
      console.log(`[Reconciliation] Rebuilding daily rollups partition for completed day ${partDate} (alter_sync = 2)...`);
      const dailyRebuildSql = getDailySlidingRebuildSQL({
        targetDateYYYYMMDD: partDate,
        sourceHourlyTable: CLICKHOUSE_HOURLY_ROLLUPS_TABLE,
        targetDailyTable: CLICKHOUSE_DAILY_ROLLUPS_TABLE,
        isReplicated: true
      });
      const dailyStmts = dailyRebuildSql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith("--"));
      for (const stmt of dailyStmts) {
        await client.command({ query: stmt });
      }
      console.log(`[Reconciliation] Synchronized daily rollups partition ${partDate}.`);
    }

    return {
      success: true,
      repairedPartitions: completedDatesToRepair.length,
      openDayDrifts: openDayMismatches.length,
      mismatches
    };
  } catch (err) {
    console.error("[Reconciliation] Fatal error during reconciliation run:", err);
    throw err;
  } finally {
    if (pgClient) {
      if (lockAcquired) {
        await pgClient.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCKS.HOURLY_RECONCILIATION]);
      }
      pgClient.release();
    }
  }
}

/**
 * Runs nightly sliding daily rollups rebuild for days D-3 through D-1.
 * Ensures idempotency and captures any late-arriving checks or repaired hourly rollups.
 */
export async function runDailySlidingRebuild(client = clickhouse) {
  let pgClient;
  let lockAcquired = false;

  try {
    pgClient = await uptimeDb.connect();
    const { rows: lockRows } = await pgClient.query(
      "SELECT pg_try_advisory_lock($1) as locked",
      [ADVISORY_LOCKS.DAILY_ROLLUPS_REBUILD]
    );
    if (!lockRows[0].locked) {
      console.log("[Daily Rebuild] Another instance holds lock 1006. Skipping run.");
      return { skipped: true, reason: "LOCK_HELD" };
    }
    lockAcquired = true;

    console.log("[Daily Rebuild] Starting sliding window rebuild for days D-3 through D-1...");
    const rebuiltDays = [];

    for (let d = 3; d >= 1; d--) {
      const targetDate = new Date();
      targetDate.setUTCDate(targetDate.getUTCDate() - d);
      const yyyymmdd = targetDate.toISOString().slice(0, 10).replace(/-/g, "");

      console.log(`[Daily Rebuild] Rebuilding daily rollups for D-${d} (${yyyymmdd}) with alter_sync=2...`);
      const rebuildSql = getDailySlidingRebuildSQL({
        targetDateYYYYMMDD: yyyymmdd,
        sourceHourlyTable: CLICKHOUSE_HOURLY_ROLLUPS_TABLE,
        targetDailyTable: CLICKHOUSE_DAILY_ROLLUPS_TABLE,
        isReplicated: true
      });

      const statements = rebuildSql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        await client.command({ query: stmt });
      }
      rebuiltDays.push(yyyymmdd);
      console.log(`[Daily Rebuild] Successfully rebuilt daily partition ${yyyymmdd}.`);
    }

    return { success: true, rebuiltDays };
  } catch (err) {
    console.error("[Daily Rebuild] Fatal error during sliding rebuild:", err);
    throw err;
  } finally {
    if (pgClient) {
      if (lockAcquired) {
        await pgClient.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCKS.DAILY_ROLLUPS_REBUILD]);
      }
      pgClient.release();
    }
  }
}
