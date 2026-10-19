import { uptimeDb } from "./db.js";

// Run detection every 10 seconds
const DETECT_INTERVAL_MS = 10_000;
const BATCH_SIZE = 2000;
const BOOT_GRACE_PERIOD_MS = 60_000;

const processStartTime = Date.now();
let isShuttingDown = false;
let timeoutId = null;

let isAnomalyHoldActive = false;

async function detectMisses() {
  if (isShuttingDown) return;

  try {
    // 1. Startup Guard: Do not mark monitors DOWN within the first 60 seconds of process boot
    // Allows ingestion buffers, network tunnels, and connection pools to stabilize.
    if (Date.now() - processStartTime < BOOT_GRACE_PERIOD_MS) {
      console.log("[HeartbeatDetector] System within 60s boot grace period; skipping expiry sweep.");
      return;
    }

    // 2. Ingestion Anomaly Guard: DB-derived fleet arrival measurement (~25ms scan)
    // Compares recent arrivals against mathematically expected arrivals across all active monitors.
    // If recent arrivals drop below 50% of expected, hold the sweep to protect against false DOWN storms.
    const { rows: healthCheck } = await uptimeDb.query(`
      SELECT 
        count(*) FILTER (WHERE last_ping_at > now() - interval '60 seconds') AS recent,
        sum(least(1, 60.0 / interval_seconds)) AS expected
      FROM uptime_heartbeat_state 
      WHERE status = 'up' AND NOT is_paused;
    `);

    const recent = parseFloat(healthCheck[0]?.recent || "0");
    const expected = parseFloat(healthCheck[0]?.expected || "0");

    if (expected > 50 && recent < (0.5 * expected)) {
      if (!isAnomalyHoldActive) {
        console.warn(`[HeartbeatDetector][ALERT] Ingestion anomaly detected: received ${recent} pings vs ${Math.round(expected)} expected in last 60s (<50%). Activating fleet hold to prevent false DOWN transitions.`);
      }
      isAnomalyHoldActive = true;
      return;
    }

    // 11. Hold-to-Release Deadline Push:
    // If we were holding due to an outage and network/traffic has now recovered,
    // push expired deadlines forward once so monitors whose intervals lapsed during the outage are not falsely flipped DOWN.
    if (isAnomalyHoldActive) {
      console.log("[HeartbeatDetector][INFO] Fleet arrival rate normalized. Ingestion recovered after outage hold. Pushing lapsed deadlines forward once.");
      await uptimeDb.query(`
        UPDATE uptime_heartbeat_state
        SET next_expected_at = now() + make_interval(secs => interval_seconds + grace_period_seconds)
        WHERE status = 'up' AND NOT is_paused AND next_expected_at < now();
      `);
      isAnomalyHoldActive = false;
      return; // Skip this tick to allow incoming traffic to settle
    }

    // 3. Atomic Resilient Sweep via Narrow State Table (Single 2,000-row batch in one transaction)
    // Uses LIMIT 2000 FOR UPDATE SKIP LOCKED to prevent lock contention, transaction exhaustion,
    // and enable safe concurrent execution across multiple HA Node.js instances.
    const client = await uptimeDb.connect();

    try {
      await client.query("BEGIN;");

      const { rows: batch } = await client.query(`
        WITH due AS (
          SELECT id 
          FROM uptime_heartbeat_state
          WHERE next_expected_at < NOW() 
            AND status = 'up' 
            AND NOT is_paused
          ORDER BY next_expected_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE uptime_heartbeat_state h
        SET status = 'down'
        FROM due
        WHERE h.id = due.id
        RETURNING h.id, h.user_id, h.url;
      `, [BATCH_SIZE]);

      if (batch.length > 0) {
        const monitorIds = batch.map(m => m.id);

        // Sync status to main uptime_monitors table in a single batch statement
        await client.query(`
          UPDATE uptime_monitors 
          SET status = 'down', updated_at = NOW() 
          WHERE id = ANY($1::uuid[])
        `, [monitorIds]);

        // Batch Insert Incidents:
        // Uses ON CONFLICT (monitor_id) WHERE resolved_at IS NULL DO NOTHING
        // to prevent duplicate key crashes when an incident (e.g. slow_response) is already open!
        const { rows: incidents } = await client.query(`
          INSERT INTO uptime_incidents (monitor_id, cause, first_error_message, started_at)
          SELECT id, 'timeout', 'Expected heartbeat ping was not received in time.', NOW()
          FROM unnest($1::uuid[]) AS id
          ON CONFLICT (monitor_id) WHERE resolved_at IS NULL DO NOTHING
          RETURNING id, monitor_id;
        `, [monitorIds]);

        if (incidents.length < batch.length) {
          console.log(`[HeartbeatDetector] Note: ${batch.length - incidents.length} monitors already had an active incident open; duplicate incident creation safely suppressed.`);
        }

        // Batch Insert Check Logs for the entire batch
        const { rows: checkLogs } = await client.query(`
          INSERT INTO uptime_checks_log (monitor_id, success, status_code, response_time_ms, checked_at)
          SELECT id, false, 0, 0, NOW()
          FROM unnest($1::uuid[]) AS id
          RETURNING id, monitor_id;
        `, [monitorIds]);

        // Map check logs to incident IDs for activity recording ONLY for newly opened incidents
        if (incidents.length > 0) {
          const incidentMap = new Map(incidents.map(inc => [inc.monitor_id, inc.id]));
          const incidentActivityData = checkLogs.map(log => ({
            incidentId: incidentMap.get(log.monitor_id),
            checkLogId: log.id
          })).filter(item => item.incidentId);

          if (incidentActivityData.length > 0) {
            await client.query(`
              INSERT INTO uptime_incident_activity (incident_id, check_log_id, event_type, message, status_code, response_time_ms, occurred_at)
              SELECT a.incident_id, a.check_log_id, 'down', 'Heartbeat window expired. No ping received.', 0, 0, NOW()
              FROM unnest($1::uuid[], $2::uuid[]) AS a(incident_id, check_log_id);
            `, [
              incidentActivityData.map(a => a.incidentId),
              incidentActivityData.map(a => a.checkLogId)
            ]);
          }
        }

        console.log(`[HeartbeatDetector] Sweep complete: ${batch.length} heartbeat monitors transitioned to DOWN (${incidents.length} new incidents).`);
      }

      await client.query("COMMIT;");
    } catch (txError) {
      await client.query("ROLLBACK;").catch(() => {});
      throw txError;
    } finally {
      client.release();
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
