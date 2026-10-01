import { uptimeDb } from "./db.js";

// Run detection every 10 seconds
const DETECT_INTERVAL_MS = 10_000;

let isShuttingDown = false;
let timeoutId = null;

async function detectMisses() {
  if (isShuttingDown) return;

  try {
    // Find all heartbeat monitors that have exceeded their expected window and are currently marked 'up'
    const { rows: misses } = await uptimeDb.query(`
      SELECT id, user_id, url
      FROM uptime_monitors 
      WHERE monitor_type = 'heartbeat' 
        AND next_expected_at IS NOT NULL
        AND next_expected_at < NOW() 
        AND status = 'up'
        AND is_paused = false
    `);

    for (const monitor of misses) {
      // 1. Atomic Compare-and-Swap Update
      // If a ping arrives EXACTLY now, it will set next_expected_at > NOW() and status = 'up'.
      // This query ensures we only transition to 'down' if it's STILL late.
      const { rowCount } = await uptimeDb.query(`
        UPDATE uptime_monitors 
        SET status = 'down' 
        WHERE id = $1 
          AND next_expected_at < NOW() 
          AND status = 'up'
          AND is_paused = false
        RETURNING id
      `, [monitor.id]);

      // If 0 rows were updated, a ping beat us to it (or it was paused/deleted). Skip incident creation.
      if (rowCount === 0) continue;

      // 2. Create the Incident
      const incidentRes = await uptimeDb.query(`
        INSERT INTO uptime_incidents (monitor_id, cause, first_error_message, started_at)
        VALUES ($1, 'timeout', 'Expected heartbeat ping was not received in time.', NOW())
        RETURNING id
      `, [monitor.id]);
      const incidentId = incidentRes.rows[0].id;

      // 3. Log a synthetic failure check
      const checkRes = await uptimeDb.query(`
        INSERT INTO uptime_checks_log (monitor_id, success, status_code, response_time_ms, checked_at)
        VALUES ($1, false, 0, 0, NOW())
        RETURNING id
      `, [monitor.id]);
      const checkLogId = checkRes.rows[0].id;

      // 4. Log the incident activity
      await uptimeDb.query(`
        INSERT INTO uptime_incident_activity (incident_id, check_log_id, event_type, message, status_code, response_time_ms, occurred_at)
        VALUES ($1, $2, 'down', 'Heartbeat window expired. No ping received.', 0, 0, NOW())
      `, [incidentId, checkLogId]);
      
      console.log(`[HeartbeatDetector] Marked monitor ${monitor.id} DOWN (Missed ping).`);
    }

  } catch (error) {
    console.error("[HeartbeatDetector] Error running detection cycle:", error);
  }

  if (!isShuttingDown) {
    timeoutId = setTimeout(detectMisses, DETECT_INTERVAL_MS);
  }
}

export function startHeartbeatDetector() {
  console.log("[HeartbeatDetector] Starting heartbeat detection loop...");
  timeoutId = setTimeout(detectMisses, DETECT_INTERVAL_MS);
}

export function stopHeartbeatDetector() {
  isShuttingDown = true;
  if (timeoutId) clearTimeout(timeoutId);
  console.log("[HeartbeatDetector] Stopped heartbeat detection loop.");
}
