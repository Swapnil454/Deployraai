import { uptimeDb } from "./db.js";
import { runHttpCheck } from "./checker.js";

const TICK_MS = 15_000;
let scheduler;
let running = false;

async function claimDueMonitors() {
  const { rows } = await uptimeDb.query(
    "WITH due AS ("
    + " SELECT id FROM uptime_monitors"
    + " WHERE is_paused = FALSE"
    + " AND (checking_at IS NULL OR checking_at < NOW() - INTERVAL '2 minutes')"
    + " AND (last_checked_at IS NULL OR last_checked_at + (interval_seconds * INTERVAL '1 second') <= NOW())"
    + " ORDER BY last_checked_at NULLS FIRST LIMIT 20 FOR UPDATE SKIP LOCKED"
    + " ) UPDATE uptime_monitors monitor"
    + " SET checking_at = NOW(), last_checked_at = NOW(), updated_at = NOW()"
    + " FROM due WHERE monitor.id = due.id RETURNING monitor.*",
  );
  return rows;
}

async function persistCheck(monitor, result) {
  const client = await uptimeDb.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO uptime_checks_log (monitor_id, success, status_code, response_time_ms, error_message, location) VALUES ($1, $2, $3, $4, $5, $6)",
      [monitor.id, result.success, result.statusCode, result.responseTimeMs, result.errorMessage, monitor.location],
    );
    const nextStatus = result.success ? "up" : "down";
    if (!result.success && monitor.status !== "down") {
      await client.query("INSERT INTO uptime_incidents (monitor_id, cause, first_error_message) VALUES ($1, $2, $3)", [monitor.id, result.cause, result.errorMessage]);
    }
    if (result.success && monitor.status === "down") {
      await client.query("UPDATE uptime_incidents SET resolved_at = NOW() WHERE monitor_id = $1 AND resolved_at IS NULL", [monitor.id]);
    }
    await client.query("UPDATE uptime_monitors SET status = $2, checking_at = NULL, updated_at = NOW() WHERE id = $1", [monitor.id, nextStatus]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runUptimeCronTick() {
  if (running) return;
  running = true;
  try {
    const monitors = await claimDueMonitors();
    await Promise.allSettled(monitors.map(async (monitor) => persistCheck(monitor, await runHttpCheck(monitor))));
  } finally {
    running = false;
  }
}

export function startUptimeCronScheduler() {
  if (scheduler) return;
  void runUptimeCronTick();
  scheduler = setInterval(() => void runUptimeCronTick(), TICK_MS);
  console.log("[Uptime Cron] Scheduler started (15-second tick).");
}
