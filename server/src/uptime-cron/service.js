import { uptimeDb } from "./db.js";
import { runHttpCheck } from "./checker.js";
import { runPingCheck } from "./pingChecker.js";
import { runPortCheck } from "./portChecker.js";
import { runDnsCheck } from "./dnsChecker.js";

const TICK_MS = 15_000;
let scheduler;
let running = false;

async function claimDueMonitors() {
  const { rows } = await uptimeDb.query(
    "WITH due AS ("
    + " SELECT id FROM uptime_monitors"
    + " WHERE is_paused = FALSE"
    + " AND monitor_type != 'heartbeat'"
    + " AND (checking_at IS NULL OR checking_at < NOW() - INTERVAL '2 minutes')"
    + " AND (last_checked_at IS NULL OR last_checked_at + (interval_seconds * INTERVAL '1 second') <= NOW())"
    + " ORDER BY last_checked_at NULLS FIRST LIMIT 20 FOR UPDATE SKIP LOCKED"
    + " ) UPDATE uptime_monitors monitor"
    + " SET checking_at = NOW(), last_checked_at = NOW(), updated_at = NOW()"
    + " FROM due WHERE monitor.id = due.id RETURNING monitor.*",
  );
  return rows;
}

/**
 * Log activity entry — best-effort, OUTSIDE main transaction.
 * If the uptime_incident_activity table doesn't exist yet we silently skip.
 */
async function logActivity(incidentId, checkLogId, eventType, message, statusCode, responseTimeMs, location) {
  try {
    await uptimeDb.query(
      `INSERT INTO uptime_incident_activity
         (incident_id, check_log_id, event_type, message, status_code, response_time_ms, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [incidentId, checkLogId, eventType, message, statusCode, responseTimeMs, location ?? "default"],
    );
  } catch {
    // Table may not exist yet — activity logging is non-critical
  }
}

async function persistCheck(monitor, result) {
  const client = await uptimeDb.connect();
  let checkLogId = null;
  let newIncidentId = null;
  let resolvedIncidentId = null;
  let resolvedSlowIncidentId = null;
  let newSlowIncidentId = null;
  let updatedIncidentId = null;

  try {
    await client.query("BEGIN");

    // ── Slow-response flag ─────────────────────────────────────────────────────
    const isSlow = (
      result.success
      && monitor.slow_response_alert_enabled
      && monitor.slow_response_threshold_ms > 0
      && result.responseTimeMs > monitor.slow_response_threshold_ms
    );

    // ── 1. Log the check row ───────────────────────────────────────────────────
    const { rows: logRows } = await client.query(
      `INSERT INTO uptime_checks_log
         (monitor_id, success, status_code, response_time_ms, error_message, location, is_slow)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        monitor.id,
        result.success,
        result.statusCode,
        result.responseTimeMs,
        result.errorMessage,
        monitor.location ?? "default",
        isSlow,
      ],
    );
    checkLogId = logRows[0].id;

    // ── 2. Core incident management (ONE incident per downtime span) ───────────
    const nextStatus = result.success ? "up" : "down";

    if (!result.success) {
      // Look for any OPEN non-slow incident for this monitor
      const { rows: open } = await client.query(
        `SELECT id FROM uptime_incidents
         WHERE monitor_id = $1
           AND resolved_at IS NULL
           AND cause != 'slow_response'
         ORDER BY started_at DESC LIMIT 1`,
        [monitor.id],
      );

      if (open.length === 0) {
        // ── First failure: open ONE new incident ─────────────────────────────
        const { rows: inc } = await client.query(
          `INSERT INTO uptime_incidents
             (monitor_id, cause, first_error_message, affected_checks)
           VALUES ($1, $2, $3, 1)
           RETURNING id`,
          [monitor.id, result.cause, result.errorMessage],
        );
        newIncidentId = inc[0].id;
      } else {
        // ── Continued failure: increment counter, do NOT create new incident ──
        updatedIncidentId = open[0].id;
        await client.query(
          `UPDATE uptime_incidents
           SET affected_checks = COALESCE(affected_checks, 1) + 1,
               last_checked_at = NOW()
           WHERE id = $1`,
          [updatedIncidentId],
        );
      }
    }

    if (result.success && monitor.status !== "up") {
      // ── Recovery: resolve open downtime incident ───────────────────────────
      const { rows: resolved } = await client.query(
        `UPDATE uptime_incidents
         SET resolved_at = NOW()
         WHERE monitor_id = $1
           AND resolved_at IS NULL
           AND cause != 'slow_response'
         RETURNING id`,
        [monitor.id],
      );
      if (resolved.length > 0) resolvedIncidentId = resolved[0].id;
    }

    // ── 3. Slow-response incident management ──────────────────────────────────
    if (isSlow) {
      const { rows: openSlow } = await client.query(
        `SELECT id FROM uptime_incidents
         WHERE monitor_id = $1 AND cause = 'slow_response' AND resolved_at IS NULL LIMIT 1`,
        [monitor.id],
      );
      if (openSlow.length === 0) {
        const { rows: slowInc } = await client.query(
          `INSERT INTO uptime_incidents
             (monitor_id, cause, first_error_message, affected_checks)
           VALUES ($1, 'slow_response', $2, 1)
           RETURNING id`,
          [monitor.id, `${result.responseTimeMs}ms exceeded ${monitor.slow_response_threshold_ms}ms threshold`],
        );
        newSlowIncidentId = slowInc[0].id;
      } else {
        await client.query(
          `UPDATE uptime_incidents
           SET affected_checks = COALESCE(affected_checks, 1) + 1
           WHERE id = $1`,
          [openSlow[0].id],
        );
      }
    } else if (result.success && monitor.slow_response_alert_enabled) {
      const { rows: resolvedSlow } = await client.query(
        `UPDATE uptime_incidents
         SET resolved_at = NOW()
         WHERE monitor_id = $1 AND cause = 'slow_response' AND resolved_at IS NULL
         RETURNING id`,
        [monitor.id],
      );
      if (resolvedSlow.length > 0) resolvedSlowIncidentId = resolvedSlow[0].id;
    }

    // ── 4. Update monitor status ──────────────────────────────────────────────
    await client.query(
      "UPDATE uptime_monitors SET status = $2, checking_at = NULL, updated_at = NOW() WHERE id = $1",
      [monitor.id, nextStatus],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Uptime Cron] persistCheck error:", error.message);
    throw error;
  } finally {
    client.release();
  }

  // ── 5. Activity logging — AFTER commit, best-effort, never blocks ──────────
  const loc = monitor.location ?? "default";
  if (newIncidentId) {
    await logActivity(newIncidentId, checkLogId, "failure_detected",
      result.errorMessage ?? `${result.cause} detected`,
      result.statusCode, result.responseTimeMs, loc);
  }
  if (updatedIncidentId) {
    await logActivity(updatedIncidentId, checkLogId, "failure_confirmed",
      result.errorMessage ?? `${result.cause} confirmed`,
      result.statusCode, result.responseTimeMs, loc);
  }
  if (resolvedIncidentId) {
    await logActivity(resolvedIncidentId, checkLogId, "resolved",
      "Incident resolved — monitor is back up",
      result.statusCode, result.responseTimeMs, loc);
  }
  if (newSlowIncidentId) {
    await logActivity(newSlowIncidentId, checkLogId, "slow_detected",
      `${result.responseTimeMs}ms exceeded ${monitor.slow_response_threshold_ms}ms threshold`,
      result.statusCode, result.responseTimeMs, loc);
  }
  if (resolvedSlowIncidentId) {
    await logActivity(resolvedSlowIncidentId, checkLogId, "slow_resolved",
      "Response time returned to normal",
      result.statusCode, result.responseTimeMs, loc);
  }
}

export async function runUptimeCronTick() {
  if (running) return;
  running = true;
  try {
    const monitors = await claimDueMonitors();
    await Promise.allSettled(monitors.map(async (monitor) => {
      let result;
      if (monitor.monitor_type === "ping") {
        result = await runPingCheck(monitor);
      } else if (monitor.monitor_type === "port") {
        result = await runPortCheck(monitor);
      } else if (monitor.monitor_type === "dns") {
        result = await runDnsCheck(monitor);
      } else {
        result = await runHttpCheck(monitor);
      }
      return persistCheck(monitor, result);
    }));
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
