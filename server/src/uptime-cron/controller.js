import { uptimeDb } from "./db.js";
import { validateMonitorPayload } from "./validation.js";

const owner = (req) => String(req.user.userId);

async function ensureDefaultGroup(userId) {
  const { rows } = await uptimeDb.query(
    "INSERT INTO uptime_groups (user_id, name) VALUES ($1, 'Monitors (default)') ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING *",
    [userId],
  );
  return rows[0];
}

export async function listGroups(req, res) {
  const userId = owner(req);
  await ensureDefaultGroup(userId);
  const { rows } = await uptimeDb.query("SELECT * FROM uptime_groups WHERE user_id = $1 ORDER BY created_at", [userId]);
  res.json({ groups: rows });
}

export async function createGroup(req, res) {
  const name = String(req.body.name || "").trim();
  if (!name || name.length > 80) return res.status(400).json({ error: "Group name must be between 1 and 80 characters." });
  const { rows } = await uptimeDb.query(
    "INSERT INTO uptime_groups (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING *",
    [owner(req), name],
  );
  res.status(201).json({ group: rows[0] });
}

/**
 * List all monitors for the current user, enriched with:
 * - 24h uptime percentage
 * - last 90 check results as a boolean array (sparkline)
 * - last response time, status code, check time
 * - open incident count
 */
export async function listMonitors(req, res) {
  const userId = owner(req);

  const { rows } = await uptimeDb.query(
    `
    SELECT
      m.*,
      g.name AS group_name,

      -- 24-hour uptime %
      COALESCE(
        ROUND(
          100.0 * COUNT(c.id) FILTER (WHERE c.success AND c.checked_at >= NOW() - INTERVAL '24 hours')
          / NULLIF(COUNT(c.id) FILTER (WHERE c.checked_at >= NOW() - INTERVAL '24 hours'), 0),
          2
        ), NULL
      ) AS uptime_24h,

      -- Last check details
      MAX(c.checked_at) FILTER (WHERE c.checked_at IS NOT NULL) AS last_check_at,
      (ARRAY_AGG(c.response_time_ms ORDER BY c.checked_at DESC))[1] AS last_response_ms,
      (ARRAY_AGG(c.status_code ORDER BY c.checked_at DESC))[1] AS last_status_code,

      -- Open incidents count — correlated subquery, EXCLUDES slow_response (those are warnings, not outages)
      (
        SELECT COUNT(*)::int
        FROM uptime_incidents i
        WHERE i.monitor_id = m.id AND i.resolved_at IS NULL AND i.cause != 'slow_response'
      ) AS open_incidents,

      -- Slow response warning (separate from outage incidents)
      (
        SELECT COUNT(*)::int
        FROM uptime_incidents i
        WHERE i.monitor_id = m.id AND i.resolved_at IS NULL AND i.cause = 'slow_response'
      ) AS slow_warning,

      -- Last 90 checks as boolean array for sparkline (newest first)
      COALESCE(
        (
          SELECT ARRAY_AGG(sub.success ORDER BY sub.checked_at DESC)
          FROM (
            SELECT success, checked_at FROM uptime_checks_log
            WHERE monitor_id = m.id
            ORDER BY checked_at DESC
            LIMIT 90
          ) sub
        ),
        '{}'::boolean[]
      ) AS sparkline

    FROM uptime_monitors m
    LEFT JOIN uptime_groups g ON g.id = m.group_id
    LEFT JOIN uptime_checks_log c ON c.monitor_id = m.id
    WHERE m.user_id = $1
    GROUP BY m.id, g.name
    ORDER BY m.created_at DESC
    `,
    [userId],
  );

  res.json({ monitors: rows });
}

/**
 * Full monitor dashboard: status cards (24h, 7d, 30d, MTBF, up-since),
 * last 30 days of checks for the response chart, and last 20 incidents.
 */
export async function getMonitorDashboard(req, res) {
  const monitorResult = await uptimeDb.query(
    "SELECT m.*, g.name AS group_name FROM uptime_monitors m LEFT JOIN uptime_groups g ON g.id = m.group_id WHERE m.id = $1 AND m.user_id = $2",
    [req.params.monitorId, owner(req)],
  );
  const monitor = monitorResult.rows[0];
  if (!monitor) return res.status(404).json({ error: "Monitor not found." });

  const [chartChecks, incidents, summary24h, summary7d, summary30d, upSince] = await Promise.all([
    // Last 30 days of checks ordered newest-first for charting (client reverses for display)
    // We fetch up to 2000 points — the chart will thin them client-side by time window
    uptimeDb.query(
      "SELECT checked_at, success, status_code, response_time_ms, error_message FROM uptime_checks_log WHERE monitor_id = $1 AND checked_at >= NOW() - INTERVAL '30 days' ORDER BY checked_at DESC LIMIT 2000",
      [monitor.id],
    ),

    // Last 20 incidents
    uptimeDb.query(
      "SELECT * FROM uptime_incidents WHERE monitor_id = $1 ORDER BY started_at DESC LIMIT 20",
      [monitor.id],
    ),

    // 24-hour summary
    uptimeDb.query(
      `SELECT
        COUNT(*)::int AS total_checks,
        COUNT(*) FILTER (WHERE success)::int AS successful_checks,
        ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 3) AS uptime_pct,
        ROUND(AVG(response_time_ms))::int AS avg_ms,
        MIN(response_time_ms)::int AS min_ms,
        MAX(response_time_ms)::int AS max_ms,
        COUNT(*) FILTER (WHERE NOT success)::int AS incident_count
       FROM uptime_checks_log WHERE monitor_id = $1 AND checked_at >= NOW() - INTERVAL '24 hours'`,
      [monitor.id],
    ),

    // 7-day summary
    uptimeDb.query(
      `SELECT
        ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 3) AS uptime_pct,
        COUNT(*) FILTER (WHERE NOT success)::int AS incident_count,
        ROUND(AVG(response_time_ms))::int AS avg_ms
       FROM uptime_checks_log WHERE monitor_id = $1 AND checked_at >= NOW() - INTERVAL '7 days'`,
      [monitor.id],
    ),

    // 30-day summary
    uptimeDb.query(
      `SELECT
        ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 3) AS uptime_pct,
        COUNT(*) FILTER (WHERE NOT success)::int AS incident_count,
        ROUND(AVG(response_time_ms))::int AS avg_ms
       FROM uptime_checks_log WHERE monitor_id = $1 AND checked_at >= NOW() - INTERVAL '30 days'`,
      [monitor.id],
    ),

    // "Up since" — most recent incident resolved_at, or monitor creation
    uptimeDb.query(
      `SELECT COALESCE(MAX(resolved_at), $2::timestamptz) AS up_since
       FROM uptime_incidents WHERE monitor_id = $1`,
      [monitor.id, monitor.created_at],
    ),
  ]);

  // MTBF in hours
  const mtbfResult = await uptimeDb.query(
    `SELECT
       COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved_count,
       EXTRACT(EPOCH FROM (NOW() - MIN(started_at))) / 3600 AS window_hours
     FROM uptime_incidents WHERE monitor_id = $1`,
    [monitor.id],
  );
  const { resolved_count, window_hours } = mtbfResult.rows[0];
  const mtbf_hours = resolved_count > 0 ? Math.round(window_hours / resolved_count) : null;

  res.json({
    monitor,
    checks: chartChecks.rows,   // newest first, up to 30d
    incidents: incidents.rows,
    summary: {
      "24h": summary24h.rows[0],
      "7d": summary7d.rows[0],
      "30d": summary30d.rows[0],
    },
    up_since: monitor.status === "up" ? upSince.rows[0]?.up_since : null,
    mtbf_hours,
  });
}

/**
 * Paginated + filtered recent checks log.
 * Query params:
 *   filter  = all | up | down          (default: all)
 *   page    = 1-based page number      (default: 1)
 *   per_page = rows per page            (default: 15, max: 100)
 *   window  = 1h | 6h | 24h | 7d | 30d (default: all time)
 */
export async function listChecks(req, res) {
  const monitorResult = await uptimeDb.query(
    "SELECT id FROM uptime_monitors WHERE id = $1 AND user_id = $2",
    [req.params.monitorId, owner(req)],
  );
  if (!monitorResult.rowCount) return res.status(404).json({ error: "Monitor not found." });

  const filter = req.query.filter ?? "all";  // all | up | down
  const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page ?? "15", 10)));
  const window = req.query.window ?? "all";  // 1h | 6h | 24h | 7d | 30d | all

  const windowMap = { "1h": "1 hour", "6h": "6 hours", "24h": "24 hours", "7d": "7 days", "30d": "30 days" };
  const windowInterval = windowMap[window];

  // Build WHERE clause
  const conditions = ["monitor_id = $1"];
  const values = [req.params.monitorId];

  if (filter === "up") conditions.push("success = TRUE");
  else if (filter === "down") conditions.push("success = FALSE");

  if (windowInterval) {
    conditions.push(`checked_at >= NOW() - INTERVAL '${windowInterval}'`);
  }

  const where = conditions.join(" AND ");
  const offset = (page - 1) * perPage;

  const [rows, countResult] = await Promise.all([
    uptimeDb.query(
      `SELECT checked_at, success, status_code, response_time_ms, error_message
       FROM uptime_checks_log
       WHERE ${where}
       ORDER BY checked_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.monitorId, perPage, offset],
    ),
    uptimeDb.query(
      `SELECT COUNT(*)::int AS total FROM uptime_checks_log WHERE ${where}`,
      [req.params.monitorId],
    ),
  ]);

  const total = countResult.rows[0].total;

  res.json({
    checks: rows.rows,
    pagination: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    },
  });
}

export async function createMonitor(req, res) {
  try {
    const monitor = validateMonitorPayload(req.body);
    const userId = owner(req);
    const defaultGroup = await ensureDefaultGroup(userId);
    monitor.group_id ||= defaultGroup.id;
    if (monitor.group_id) {
      const group = await uptimeDb.query("SELECT id FROM uptime_groups WHERE id = $1 AND user_id = $2", [monitor.group_id, userId]);
      if (!group.rowCount) return res.status(400).json({ error: "The selected group does not belong to you." });
    }

    // Explicit positional params — avoids Object.values() order fragility.
    // JSONB columns receive JSON.stringify so pg driver never misinterprets arrays.
    const { rows } = await uptimeDb.query(
      `INSERT INTO uptime_monitors (
        user_id, url, group_id, tags,
        interval_seconds, timeout_seconds, ip_version, follow_redirects,
        up_status_codes, auth_type, auth_username, auth_password, auth_bearer_token,
        http_method, request_body, send_as_json,
        request_headers, meta_fields,
        ssl_check_enabled, ssl_error_check_enabled, ssl_expiry_reminder_enabled,
        domain_expiry_reminder_enabled, slow_response_alert_enabled, slow_response_threshold_ms,
        monitor_type, keyword, keyword_condition, case_sensitive,
        target_host, target_port, connect_timeout, packet_count, packet_timeout,
        grace_period_seconds, heartbeat_token,
        dns_hostname, dns_record_type, dns_expected_values,
        dns_match_mode, dns_resolver_mode, dns_custom_resolver_ip
      ) VALUES (
        $1,  $2,  $3,  $4,
        $5,  $6,  $7,  $8,
        $9,  $10, $11, $12, $13,
        $14, $15, $16,
        $17::jsonb, $18::jsonb,
        $19, $20, $21,
        $22, $23, $24,
        $25, $26, $27, $28,
        $29, $30, $31, $32, $33,
        $34, $35,
        $36, $37, $38::jsonb,
        $39, $40, $41
      ) RETURNING *`,
      [
        userId,
        monitor.url,
        monitor.group_id,
        monitor.tags,                                   // TEXT[]
        monitor.interval_seconds,
        monitor.timeout_seconds,
        monitor.ip_version,
        monitor.follow_redirects,
        monitor.up_status_codes,                        // TEXT[]
        monitor.auth_type,
        monitor.auth_username,
        monitor.auth_password,
        monitor.auth_bearer_token,
        monitor.http_method,
        monitor.request_body,
        monitor.send_as_json,
        JSON.stringify(monitor.request_headers),        // JSONB — must be a string
        JSON.stringify(monitor.meta_fields),            // JSONB — must be a string
        monitor.ssl_check_enabled,
        monitor.ssl_error_check_enabled,
        monitor.ssl_expiry_reminder_enabled,
        monitor.domain_expiry_reminder_enabled,
        monitor.slow_response_alert_enabled,
        monitor.slow_response_threshold_ms,
        monitor.monitor_type,
        monitor.keyword,
        monitor.keyword_condition,
        monitor.case_sensitive,
        monitor.target_host,
        monitor.target_port,
        monitor.connect_timeout,
        monitor.packet_count,
        monitor.packet_timeout,
        monitor.grace_period_seconds,
        monitor.heartbeat_token,
        monitor.dns_hostname,
        monitor.dns_record_type,
        JSON.stringify(monitor.dns_expected_values),
        monitor.dns_match_mode,
        monitor.dns_resolver_mode,
        monitor.dns_custom_resolver_ip,
      ],
    );
    res.status(201).json({ monitor: rows[0] });
  } catch (error) {
    res.status(400).json({ error: error.message || "Invalid monitor configuration." });
  }
}

export async function pauseMonitor(req, res) {
  const { rows } = await uptimeDb.query(
    "UPDATE uptime_monitors SET is_paused = $3, status = CASE WHEN $3 THEN 'paused' ELSE 'pending' END, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
    [req.params.monitorId, owner(req), Boolean(req.body.paused)],
  );
  if (!rows[0]) return res.status(404).json({ error: "Monitor not found." });
  res.json({ monitor: rows[0] });
}

export async function updateMonitor(req, res) {
  try {
    const userId = owner(req);
    const monitor = validateMonitorPayload(req.body);

    if (monitor.group_id) {
      const group = await uptimeDb.query(
        "SELECT id FROM uptime_groups WHERE id = $1 AND user_id = $2",
        [monitor.group_id, userId],
      );
      if (!group.rowCount) return res.status(400).json({ error: "The selected group does not belong to you." });
    }

    const { rows } = await uptimeDb.query(
      `UPDATE uptime_monitors SET
         url                          = $3,
         group_id                     = $4,
         tags                         = $5,
         interval_seconds             = $6,
         timeout_seconds              = $7,
         ip_version                   = $8,
         follow_redirects             = $9,
         up_status_codes              = $10,
         auth_type                    = $11,
         auth_username                = $12,
         auth_password                = $13,
         auth_bearer_token            = $14,
         http_method                  = $15,
         request_body                 = $16,
         send_as_json                 = $17,
         request_headers              = $18::jsonb,
         meta_fields                  = $19::jsonb,
         ssl_check_enabled            = $20,
         ssl_error_check_enabled      = $21,
         ssl_expiry_reminder_enabled  = $22,
         domain_expiry_reminder_enabled = $23,
         slow_response_alert_enabled  = $24,
         slow_response_threshold_ms   = $25,
         monitor_type                 = $26,
         keyword                      = $27,
         keyword_condition            = $28,
         case_sensitive               = $29,
         target_host                  = $30,
         target_port                  = $31,
         connect_timeout              = $32,
         packet_count                 = $33,
         packet_timeout               = $34,
         grace_period_seconds         = $35,
         dns_hostname                 = $36,
         dns_record_type              = $37,
         dns_expected_values          = $38::jsonb,
         dns_match_mode               = $39,
         dns_resolver_mode            = $40,
         dns_custom_resolver_ip       = $41,
         updated_at                   = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        req.params.monitorId,
        userId,
        monitor.url,
        monitor.group_id ?? null,
        monitor.tags,
        monitor.interval_seconds,
        monitor.timeout_seconds,
        monitor.ip_version,
        monitor.follow_redirects,
        monitor.up_status_codes,
        monitor.auth_type,
        monitor.auth_username,
        monitor.auth_password,
        monitor.auth_bearer_token,
        monitor.http_method,
        monitor.request_body,
        monitor.send_as_json,
        JSON.stringify(monitor.request_headers),
        JSON.stringify(monitor.meta_fields),
        monitor.ssl_check_enabled,
        monitor.ssl_error_check_enabled,
        monitor.ssl_expiry_reminder_enabled,
        monitor.domain_expiry_reminder_enabled,
        monitor.slow_response_alert_enabled,
        monitor.slow_response_threshold_ms,
        monitor.monitor_type,
        monitor.keyword,
        monitor.keyword_condition,
        monitor.case_sensitive,
        monitor.target_host,
        monitor.target_port,
        monitor.connect_timeout,
        monitor.packet_count,
        monitor.packet_timeout,
        monitor.grace_period_seconds,
        monitor.dns_hostname,
        monitor.dns_record_type,
        JSON.stringify(monitor.dns_expected_values),
        monitor.dns_match_mode,
        monitor.dns_resolver_mode,
        monitor.dns_custom_resolver_ip,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "Monitor not found." });
    res.json({ monitor: rows[0] });
  } catch (error) {
    res.status(400).json({ error: error.message || "Invalid monitor configuration." });
  }
}

export async function deleteMonitor(req, res) {
  const { rowCount } = await uptimeDb.query(
    "DELETE FROM uptime_monitors WHERE id = $1 AND user_id = $2",
    [req.params.monitorId, owner(req)],
  );
  if (!rowCount) return res.status(404).json({ error: "Monitor not found." });
  res.json({ success: true });
}

/**
 * GET /api/uptime-cron/incidents
 * Paginated list of all incidents across all monitors for the current user.
 * Query params:
 *   status  = all | ongoing | resolved   (default: all)
 *   page    = 1-based                    (default: 1)
 *   per_page = rows per page             (default: 20, max: 100)
 */
export async function listIncidents(req, res) {
  const userId = owner(req);
  const status  = req.query.status   ?? "all";   // all | ongoing | degraded | resolved
  const page    = Math.max(1, parseInt(req.query.page     ?? "1",  10));
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page ?? "20", 10)));
  const offset  = (page - 1) * perPage;

  const conditions = ["m.user_id = $1"];

  if (status === "ongoing")  conditions.push("i.resolved_at IS NULL AND i.cause != 'slow_response'");
  if (status === "degraded") conditions.push("i.resolved_at IS NULL AND i.cause = 'slow_response'");
  if (status === "resolved") conditions.push("i.resolved_at IS NOT NULL");

  const where = conditions.join(" AND ");

  const [rows, countResult, totalsResult] = await Promise.all([
    // Paginated rows — ongoing always first, then newest first within each group
    uptimeDb.query(
      `SELECT
         i.id,
         i.cause,
         i.first_error_message,
         i.started_at,
         i.resolved_at,
         i.affected_checks,
         i.last_checked_at,
         CASE 
           WHEN i.resolved_at IS NULL AND i.cause = 'slow_response' THEN 'degraded'
           WHEN i.resolved_at IS NULL THEN 'ongoing' 
           ELSE 'resolved' 
         END AS status,
         EXTRACT(EPOCH FROM COALESCE(i.resolved_at, NOW()) - i.started_at)::int AS duration_seconds,
         m.id   AS monitor_id,
         m.url  AS monitor_url,
         m.http_method,
         m.monitor_type
       FROM uptime_incidents i
       JOIN uptime_monitors m ON m.id = i.monitor_id
       WHERE ${where}
       ORDER BY
         (i.resolved_at IS NULL) DESC,   -- ongoing first
         i.started_at DESC               -- then newest first
       LIMIT $2 OFFSET $3`,
      [userId, perPage, offset],
    ),
    // Total for current filter (for pagination)
    uptimeDb.query(
      `SELECT COUNT(*)::int AS total
       FROM uptime_incidents i
       JOIN uptime_monitors m ON m.id = i.monitor_id
       WHERE ${where}`,
      [userId],
    ),
    // Absolute totals (always across ALL incidents, ignores status filter)
    // so the stats bar always shows correct numbers regardless of active filter
    uptimeDb.query(
      `SELECT
         COUNT(*) FILTER (WHERE i.resolved_at IS NULL AND i.cause != 'slow_response')::int AS ongoing_total,
         COUNT(*) FILTER (WHERE i.resolved_at IS NULL AND i.cause = 'slow_response')::int AS degraded_total,
         COUNT(*) FILTER (WHERE i.resolved_at IS NOT NULL)::int AS resolved_total,
         COUNT(*)::int AS grand_total
       FROM uptime_incidents i
       JOIN uptime_monitors m ON m.id = i.monitor_id
       WHERE m.user_id = $1`,
      [userId],
    ),
  ]);

  const total = countResult.rows[0].total;
  const { ongoing_total, degraded_total, resolved_total, grand_total } = totalsResult.rows[0];

  res.json({
    incidents: rows.rows,
    pagination: { total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) },
    totals: { ongoing: ongoing_total, degraded: degraded_total, resolved: resolved_total, grand: grand_total },
  });
}

/**
 * GET /api/uptime-cron/incidents/:incidentId
 * Full incident detail: info + activity log + request/response snapshot.
 */
export async function getIncident(req, res) {
  const userId = owner(req);

  // Fetch incident + monitor (ownership check via JOIN)
  const incResult = await uptimeDb.query(
    `SELECT
       i.*,
       CASE WHEN i.resolved_at IS NULL THEN 'ongoing' ELSE 'resolved' END AS status,
       EXTRACT(EPOCH FROM COALESCE(i.resolved_at, NOW()) - i.started_at)::int AS duration_seconds,
       m.id          AS monitor_id,
       m.url         AS monitor_url,
       m.http_method,
       m.monitor_type,
       m.auth_type,
       m.request_headers,
       m.interval_seconds
     FROM uptime_incidents i
     JOIN uptime_monitors m ON m.id = i.monitor_id
     WHERE i.id = $1 AND m.user_id = $2`,
    [req.params.incidentId, userId],
  );

  if (!incResult.rowCount) return res.status(404).json({ error: "Incident not found." });
  const incident = incResult.rows[0];

  // Activity log (newest first, max 100 entries)
  const activityResult = await uptimeDb.query(
    `SELECT
       a.id, a.event_type, a.message, a.status_code,
       a.response_time_ms, a.location, a.occurred_at,
       cl.response_headers_snapshot
     FROM uptime_incident_activity a
     LEFT JOIN uptime_checks_log cl ON cl.id = a.check_log_id
     WHERE a.incident_id = $1
     ORDER BY a.occurred_at DESC
     LIMIT 100`,
    [incident.id],
  );

  // Grab the first check's response headers for the detail panel
  const firstCheck = activityResult.rows[activityResult.rows.length - 1];
  const responseHeaders = firstCheck?.response_headers_snapshot ?? {};

  res.json({
    incident,
    activity: activityResult.rows,
    response_headers: responseHeaders,
  });
}

/**
 * GET/POST /api/uptime-cron/ping/:token
 * Public endpoint for heartbeat ingestion.
 */
export async function ingestHeartbeatPing(req, res) {
  const token = req.params.token;
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    const { rows } = await uptimeDb.query(
      `UPDATE uptime_monitors 
       SET 
         last_ping_at = NOW(),
         last_checked_at = NOW(),
         next_expected_at = NOW() + (interval_seconds + COALESCE(grace_period_seconds, 0)) * INTERVAL '1 second',
         status = 'up'
       WHERE heartbeat_token = $1 AND monitor_type = 'heartbeat'
       RETURNING id`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid token or monitor not found." });
    }

    const monitorId = rows[0].id;

    // Insert synthetic success record
    const checkRes = await uptimeDb.query(
      `INSERT INTO uptime_checks_log 
        (monitor_id, success, status_code, response_time_ms)
       VALUES ($1, true, 200, 0)
       RETURNING id`,
      [monitorId]
    );
    const checkLogId = checkRes.rows[0].id;

    // Resolve any open incidents
    const { rows: resolved } = await uptimeDb.query(
      `UPDATE uptime_incidents
       SET resolved_at = NOW()
       WHERE monitor_id = $1 AND resolved_at IS NULL AND cause != 'slow_response'
       RETURNING id`,
      [monitorId]
    );

    for (const row of resolved) {
      await uptimeDb.query(
        `INSERT INTO uptime_incident_activity (incident_id, check_log_id, event_type, message, status_code, response_time_ms, occurred_at)
         VALUES ($1, $2, 'resolved', 'Incident resolved — heartbeat ping received.', 200, 0, NOW())`,
        [row.id, checkLogId]
      );
    }

    return res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Heartbeat ingestion error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

