import { uptimeDb } from "./db.js";
import { validateMonitorPayload } from "./validation.js";
import { isMonitorUnderMaintenance } from "./maintenanceEvaluation.js";
import { ch } from "../utils/clickhouse.js";

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
      COALESCE(hs.status, m.status) AS status,
      COALESCE(hs.last_ping_at, m.last_ping_at) AS last_ping_at,
      COALESCE(hs.next_expected_at, m.next_expected_at) AS next_expected_at,
      COALESCE(hs.last_ping_at, m.last_checked_at) AS last_checked_at,
      g.name AS group_name,

      -- 24-hour uptime % (using daily metrics)
      (
        SELECT ROUND(100.0 * SUM(successful_checks) / NULLIF(SUM(total_checks), 0), 2)
        FROM uptime_daily_metrics
        WHERE monitor_id = m.id AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '1 day'
      ) AS uptime_24h,

      -- Last check details (single LATERAL join is 3x faster than multiple subqueries)
      latest_check.checked_at AS last_check_at,
      latest_check.response_time_ms AS last_response_ms,
      latest_check.status_code AS last_status_code,

      -- Open incidents count — EXCLUDES slow_response
      (
        SELECT COUNT(*)::int
        FROM uptime_incidents i
        WHERE i.monitor_id = m.id AND i.resolved_at IS NULL AND i.cause != 'slow_response'
      ) AS open_incidents,

      -- Slow response warning
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
    LEFT JOIN uptime_heartbeat_state hs ON hs.id = m.id AND m.monitor_type = 'heartbeat'
    LEFT JOIN LATERAL (
      SELECT checked_at, response_time_ms, status_code
      FROM uptime_checks_log
      WHERE monitor_id = m.id
      ORDER BY checked_at DESC
      LIMIT 1
    ) latest_check ON true
    WHERE m.user_id = $1
    ORDER BY m.created_at DESC
    `,
    [userId],
  );

  const monitorsWithMaintenance = rows.map(m => ({
    ...m,
    under_maintenance: isMonitorUnderMaintenance(m.id)
  }));

  res.json({ monitors: monitorsWithMaintenance });
}

/**
 * Full monitor dashboard: status cards (24h, 7d, 30d, MTBF, up-since),
 * last 30 days of checks for the response chart, and last 20 incidents.
 */
export async function getMonitorDashboard(req, res) {
  const monitorResult = await uptimeDb.query(
    `SELECT m.*,
            COALESCE(hs.status, m.status) AS status,
            COALESCE(hs.last_ping_at, m.last_ping_at) AS last_ping_at,
            COALESCE(hs.next_expected_at, m.next_expected_at) AS next_expected_at,
            COALESCE(hs.last_ping_at, m.last_checked_at) AS last_checked_at,
            g.name AS group_name 
     FROM uptime_monitors m 
     LEFT JOIN uptime_groups g ON g.id = m.group_id 
     LEFT JOIN uptime_heartbeat_state hs ON hs.id = m.id AND m.monitor_type = 'heartbeat'
     WHERE m.id = $1 AND m.user_id = $2`,
    [req.params.monitorId, owner(req)],
  );
  const monitor = monitorResult.rows[0];
  if (!monitor) return res.status(404).json({ error: "Monitor not found." });

  monitor.under_maintenance = isMonitorUnderMaintenance(monitor.id);

  const [chartChecks, incidents, summary24h, summary7d, summary30d, upSince] = await Promise.all([
    // Last 12 hours of checks ordered newest-first for charting (client reverses for display)
    // We fetch up to 2000 points — the chart will thin them client-side by time window
    uptimeDb.query(
      "SELECT checked_at, success, status_code, response_time_ms, error_message, suppressed_by_window_id FROM uptime_checks_log WHERE monitor_id = $1 AND checked_at >= NOW() - INTERVAL '12 hours' ORDER BY checked_at DESC LIMIT 2000",
      [monitor.id],
    ),

    // Last 20 incidents
    uptimeDb.query(
      "SELECT * FROM uptime_incidents WHERE monitor_id = $1 ORDER BY started_at DESC LIMIT 20",
      [monitor.id],
    ),

    // 24-hour summary (Uses Daily Metrics)
    uptimeDb.query(
      `SELECT
        SUM(total_checks)::int AS total_checks,
        SUM(successful_checks)::int AS successful_checks,
        ROUND(100.0 * SUM(successful_checks) / NULLIF(SUM(total_checks), 0), 3) AS uptime_pct,
        ROUND(SUM(total_response_time_ms) / NULLIF(SUM(total_checks), 0))::int AS avg_ms,
        0 AS min_ms,
        0 AS max_ms,
        (SELECT COUNT(*) FROM uptime_incidents WHERE monitor_id = $1 AND started_at >= NOW() - INTERVAL '24 hours')::int AS incident_count
       FROM uptime_daily_metrics WHERE monitor_id = $1 AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '1 day'`,
      [monitor.id],
    ),

    // 7-day summary (Uses Daily Metrics)
    uptimeDb.query(
      `SELECT
        ROUND(100.0 * SUM(successful_checks) / NULLIF(SUM(total_checks), 0), 3) AS uptime_pct,
        (SELECT COUNT(*) FROM uptime_incidents WHERE monitor_id = $1 AND started_at >= NOW() - INTERVAL '7 days')::int AS incident_count,
        ROUND(SUM(total_response_time_ms) / NULLIF(SUM(total_checks), 0))::int AS avg_ms
       FROM uptime_daily_metrics WHERE monitor_id = $1 AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '7 days'`,
      [monitor.id],
    ),

    // 30-day summary (Uses Daily Metrics)
    uptimeDb.query(
      `SELECT
        ROUND(100.0 * SUM(successful_checks) / NULLIF(SUM(total_checks), 0), 3) AS uptime_pct,
        (SELECT COUNT(*) FROM uptime_incidents WHERE monitor_id = $1 AND started_at >= NOW() - INTERVAL '30 days')::int AS incident_count,
        ROUND(SUM(total_response_time_ms) / NULLIF(SUM(total_checks), 0))::int AS avg_ms
       FROM uptime_daily_metrics WHERE monitor_id = $1 AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '30 days'`,
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
 *   window  = 1h | 3h | 6h | 12h (default: all time)
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
  const window = req.query.window ?? "all";  // 1h | 3h | 6h | 12h | all

  const windowMap = { "1h": "1 hour", "3h": "3 hours", "6h": "6 hours", "12h": "12 hours" };
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
      `SELECT checked_at, success, status_code, response_time_ms, error_message, suppressed_by_window_id
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
        dns_match_mode, dns_resolver_mode, dns_custom_resolver_ip,
        api_assertions, api_assertion_logic, api_response_size_limit_kb,
        udp_probe_type, udp_dns_query_name, udp_snmp_oid, udp_snmp_community,
        udp_raw_payload, udp_expect_any_response, udp_raw_expected_response, udp_response_timeout_ms
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
        $39, $40, $41,
        $42::jsonb, $43, $44,
        $45, $46, $47, $48,
        $49, $50, $51, $52
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
        JSON.stringify(monitor.api_assertions),
        monitor.api_assertion_logic,
        monitor.api_response_size_limit_kb,
        monitor.udp_probe_type,
        monitor.udp_dns_query_name,
        monitor.udp_snmp_oid,
        monitor.udp_snmp_community,
        monitor.udp_raw_payload,
        monitor.udp_expect_any_response,
        monitor.udp_raw_expected_response,
        monitor.udp_response_timeout_ms,
      ],
    );
    res.status(201).json({ monitor: rows[0] });
  } catch (error) {
    res.status(400).json({ error: error.message || "Invalid monitor configuration." });
  }
}

export async function pauseMonitor(req, res) {
  const isPaused = Boolean(req.body.paused);
  const { rows } = await uptimeDb.query(
    `UPDATE uptime_monitors 
     SET is_paused = $3, 
         status = CASE WHEN $3 THEN 'paused' ELSE 'pending' END, 
         next_expected_at = CASE WHEN $3 THEN next_expected_at ELSE NOW() + make_interval(secs => interval_seconds + COALESCE(grace_period_seconds, 0)) END,
         updated_at = NOW() 
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.monitorId, owner(req), isPaused],
  );
  if (!rows[0]) return res.status(404).json({ error: "Monitor not found." });

  // Explicit sync to heartbeat state table if this is a heartbeat monitor (Item 5)
  if (rows[0].monitor_type === "heartbeat") {
    await uptimeDb.query(
      `UPDATE uptime_heartbeat_state 
       SET is_paused = $2, 
           status = CASE WHEN $2 THEN 'paused' ELSE 'pending' END,
           next_expected_at = CASE WHEN $2 THEN next_expected_at ELSE NOW() + make_interval(secs => interval_seconds + grace_period_seconds) END
       WHERE id = $1`,
      [rows[0].id, isPaused]
    );
  }

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
         api_assertions               = $42::jsonb,
         api_assertion_logic          = $43,
         api_response_size_limit_kb   = $44,
         udp_probe_type               = $45,
         udp_dns_query_name           = $46,
         udp_snmp_oid                 = $47,
         udp_snmp_community           = $48,
         udp_raw_payload              = $49,
         udp_expect_any_response      = $50,
         udp_raw_expected_response    = $51,
         udp_response_timeout_ms      = $52,
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
        JSON.stringify(monitor.api_assertions),
        monitor.api_assertion_logic,
        monitor.api_response_size_limit_kb,
        monitor.udp_probe_type,
        monitor.udp_dns_query_name,
        monitor.udp_snmp_oid,
        monitor.udp_snmp_community,
        monitor.udp_raw_payload,
        monitor.udp_expect_any_response,
        monitor.udp_raw_expected_response,
        monitor.udp_response_timeout_ms,
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
         COALESCE(m.url, m.target_host, m.dns_hostname) AS monitor_url,
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
       COALESCE(m.url, m.target_host, m.dns_hostname) AS monitor_url,
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

// In-Memory Token Cache (Algorithm 4 Upgrade):
// Holds active and previous rotated tokens in memory (~18 MB RAM for 125k entries).
// Rejects bogus tokens in <1 µs with 0 SQL queries while supporting on-demand DB miss lookup.
export const heartbeatTokenCache = new Map(); // token -> { id, is_paused }
const negativeTokenCache = new Map(); // token -> timestamp
const MAX_NEGATIVE_CACHE_SIZE = 10_000;
const NEGATIVE_CACHE_TTL_MS = 30_000;
let cacheInitialized = false;
let notifyListenerClient = null;
let isListenerHealthy = false;
let reconnectTimer = null;
let reconnectAttempts = 0;

function isNegativeCached(token) {
  const ts = negativeTokenCache.get(token);
  if (!ts) return false;
  if (Date.now() - ts > NEGATIVE_CACHE_TTL_MS) {
    negativeTokenCache.delete(token);
    return false;
  }
  return true;
}

function setNegativeCache(token) {
  if (negativeTokenCache.size >= MAX_NEGATIVE_CACHE_SIZE) {
    const keysToDelete = Array.from(negativeTokenCache.keys()).slice(0, 2000);
    for (const k of keysToDelete) negativeTokenCache.delete(k);
  }
  negativeTokenCache.set(token, Date.now());
}

export async function reloadHeartbeatTokenCache() {
  try {
    const { rows } = await uptimeDb.query(`
      SELECT id, token, token_previous, is_paused FROM uptime_heartbeat_state
    `);
    heartbeatTokenCache.clear();
    negativeTokenCache.clear();
    for (const r of rows) {
      if (r.token) heartbeatTokenCache.set(r.token, { id: r.id, is_paused: r.is_paused });
      if (r.token_previous) heartbeatTokenCache.set(r.token_previous, { id: r.id, is_paused: r.is_paused });
    }
    cacheInitialized = true;
    console.log(`[HeartbeatCache] Loaded ${heartbeatTokenCache.size} heartbeat tokens into memory.`);
  } catch (err) {
    console.error("[HeartbeatCache] Failed to load token cache:", err);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const backoffMs = Math.min(30_000, 1000 * Math.pow(2, reconnectAttempts++));
  console.log(`[HeartbeatCache] Scheduling notify listener reconnect in ${backoffMs}ms...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await startTokenCacheListener();
    if (isListenerHealthy) {
      await reloadHeartbeatTokenCache();
    }
  }, backoffMs);
}

// Listen to Postgres pg_notify for instantaneous multi-node token cache invalidation
async function startTokenCacheListener() {
  if (notifyListenerClient) return;
  try {
    const client = await uptimeDb.connect();
    notifyListenerClient = client;

    client.on("notification", (msg) => {
      if (msg.channel === "heartbeat_token_updates" && msg.payload) {
        try {
          const payload = JSON.parse(msg.payload);
          if (payload.action === "DELETE") {
            if (payload.token) heartbeatTokenCache.delete(payload.token);
            if (payload.token_previous) heartbeatTokenCache.delete(payload.token_previous);
          } else if (payload.token) {
            heartbeatTokenCache.set(payload.token, { id: payload.id, is_paused: Boolean(payload.is_paused) });
            if (payload.token_previous) {
              heartbeatTokenCache.set(payload.token_previous, { id: payload.id, is_paused: Boolean(payload.is_paused) });
            }
            negativeTokenCache.delete(payload.token);
            if (payload.token_previous) negativeTokenCache.delete(payload.token_previous);
          }
        } catch (e) {}
      }
    });

    client.on("error", (err) => {
      console.error("[HeartbeatCache] Notify listener client error:", err.message);
      isListenerHealthy = false;
      try { client.release(true); } catch (_) {}
      notifyListenerClient = null;
      scheduleReconnect();
    });

    client.on("end", () => {
      isListenerHealthy = false;
      notifyListenerClient = null;
      scheduleReconnect();
    });

    await client.query("LISTEN heartbeat_token_updates");
    isListenerHealthy = true;
    reconnectAttempts = 0;
    console.log("[HeartbeatCache] LISTEN heartbeat_token_updates connected.");
  } catch (err) {
    console.error("[HeartbeatCache] Error starting notify listener:", err.message);
    isListenerHealthy = false;
    if (notifyListenerClient) {
      try { notifyListenerClient.release(true); } catch (_) {}
      notifyListenerClient = null;
    }
    scheduleReconnect();
  }
}

// Micro-batch accumulator & Drain Loop
const pendingPings = new Map();
let batchFlushTimer = null;
let fullReloadTimer = null;
let isFlushing = false;
const BATCH_FLUSH_INTERVAL_MS = 1000;
const CHUNK_SIZE = 20000;
const MAX_BUFFER_LIMIT = 100000;

export async function flushPendingHeartbeats() {
  if (isFlushing || pendingPings.size === 0) return;
  isFlushing = true;

  try {
    // Drain loop: drain up to 20,000 items per SQL statement until pendingPings is empty
    while (pendingPings.size > 0) {
      const entries = Array.from(pendingPings.entries()).slice(0, CHUNK_SIZE);
      for (const [id] of entries) {
        pendingPings.delete(id);
      }

      const ids = entries.map(e => e[0]);
      const timestamps = entries.map(e => e[1]);

      const client = await uptimeDb.connect();
      try {
        await client.query("BEGIN; SET LOCAL synchronous_commit = off;");

        // Algorithm 4 Tested Primary Key CTE:
        // - Uses LEAST(b.ping_time, NOW()) to protect against client/server clock skew
        // - Joins directly on h.id = b.id (Primary Key index: 27ms for 4,167 rows vs 19.4s OR join)
        // - Excludes paused monitors (WHERE NOT h.is_paused)
        // - Locks rows deterministically ORDER BY h.id to eliminate deadlocks
        // - Captures prev_status to only trigger incident resolution on true down/pending -> up recovery
        // - Inserts success check log rows in the same batched CTE
        const { rows: updated } = await client.query(`
          WITH batch AS (
            SELECT * FROM unnest($1::uuid[], $2::timestamptz[]) AS b(id, ping_time)
          ),
          old AS (
            SELECT h.id, h.status, b.ping_time
            FROM uptime_heartbeat_state h
            JOIN batch b ON h.id = b.id
            WHERE NOT h.is_paused
            ORDER BY h.id
            FOR UPDATE OF h
          ),
          upd AS (
            UPDATE uptime_heartbeat_state h
            SET last_ping_at = LEAST(old.ping_time, NOW()),
                next_expected_at = LEAST(old.ping_time, NOW()) + ((h.interval_seconds + h.grace_period_seconds) * INTERVAL '1 second'),
                status = 'up'
            FROM old
            WHERE h.id = old.id
            RETURNING h.id, old.status AS prev_status, LEAST(old.ping_time, NOW()) AS checked_at
          ),
          ins_log AS (
            INSERT INTO uptime_checks_log (monitor_id, success, status_code, response_time_ms, checked_at)
            SELECT id, true, 200, 0, checked_at
            FROM upd
          )
          SELECT id, prev_status FROM upd;
        `, [ids, timestamps]);

        // Recovery Detection: Cover both 'down' and 'pending' transitions INSIDE the same transaction (Item 3 & 7)
        const recoveredIds = updated.filter(r => r.prev_status === "down" || r.prev_status === "pending").map(r => r.id);
        if (recoveredIds.length > 0) {
          // Sync uptime_monitors status and timestamps for UI/API consistency
          await client.query(`
            UPDATE uptime_monitors m
            SET status = 'up',
                last_ping_at = s.last_ping_at,
                next_expected_at = s.next_expected_at,
                last_checked_at = s.last_ping_at,
                updated_at = NOW() 
            FROM uptime_heartbeat_state s
            WHERE m.id = s.id AND m.id = ANY($1::uuid[])
          `, [recoveredIds]);

          // Batch Resolve Incidents (single statement)
          const { rows: resolved } = await client.query(`
            UPDATE uptime_incidents
            SET resolved_at = NOW()
            WHERE monitor_id = ANY($1::uuid[]) AND resolved_at IS NULL AND cause != 'slow_response'
            RETURNING id, monitor_id;
          `, [recoveredIds]);

          // Batch Log Incident Activity (single statement)
          if (resolved.length > 0) {
            await client.query(`
              INSERT INTO uptime_incident_activity (incident_id, event_type, message, status_code, response_time_ms, occurred_at)
              SELECT id, 'resolved', 'Incident resolved — heartbeat ping received.', 200, 0, NOW()
              FROM unnest($1::uuid[]) AS id;
            `, [resolved.map(r => r.id)]);
          }
        }

        await client.query("COMMIT;");
      } catch (sqlError) {
        await client.query("ROLLBACK;").catch(() => {});
        // Keep and retry: put failed entries back into pending buffer
        for (const [id, ts] of entries) {
          if (!pendingPings.has(id)) pendingPings.set(id, ts);
        }
        console.error("[HeartbeatBatcher] Batch flush SQL error, re-queued for retry:", sqlError);
        break; // Break loop and retry on next tick
      } finally {
        client.release();
      }
    }
  } finally {
    isFlushing = false;
  }
}

let isBatcherStopped = false;

export async function startHeartbeatBatcher() {
  if (isBatcherStopped) return;
  if (!batchFlushTimer) {
    batchFlushTimer = setInterval(flushPendingHeartbeats, BATCH_FLUSH_INTERVAL_MS);
    // Reload full cache every 10 minutes (Fix 4: avoid 60s event loop spikes while NOTIFY is active)
    fullReloadTimer = setInterval(reloadHeartbeatTokenCache, 600_000);
    try {
      await startTokenCacheListener();
      await reloadHeartbeatTokenCache();
    } catch (err) {
      console.error("[HeartbeatCache] Startup error:", err);
    }
  }
}

export async function stopHeartbeatBatcher() {
  isBatcherStopped = true;
  if (batchFlushTimer) {
    clearInterval(batchFlushTimer);
    batchFlushTimer = null;
  }
  if (fullReloadTimer) {
    clearInterval(fullReloadTimer);
    fullReloadTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (notifyListenerClient) {
    try { notifyListenerClient.release(true); } catch (_) {}
    notifyListenerClient = null;
  }
  isListenerHealthy = false;
  try {
    await flushPendingHeartbeats();
  } catch (err) {
    console.error("[HeartbeatBatcher] Error during final shutdown flush:", err);
  }
  const remaining = pendingPings.size;
  return { success: remaining === 0, remaining };
}

/**
 * GET/POST /api/uptime-cron/ping/:token
 * Public endpoint for heartbeat ingestion.
 */
export async function ingestHeartbeatPing(req, res) {
  const token = req.params.token;
  if (!token) return res.status(400).json({ error: "Missing token" });

  if (isBatcherStopped) {
    return res.status(503).json({ error: "Server shutting down. Please retry." });
  }

  // Ensure background batch flusher is started
  if (!batchFlushTimer) {
    startHeartbeatBatcher();
  }

  // 1. Fast in-memory token validation (Item 8)
  let cached = heartbeatTokenCache.get(token);

  if (!cached) {
    // Check bounded negative cache
    if (isNegativeCached(token)) {
      return res.status(404).json({ error: "Invalid token or monitor not found." });
    }

    // If cache initialized and notify listener is healthy, miss is guaranteed non-existent (Item 8)
    if (cacheInitialized && isListenerHealthy) {
      setNegativeCache(token);
      return res.status(404).json({ error: "Invalid token or monitor not found." });
    }

    // Fallback DB lookup if cache not ready or listener disconnected
    try {
      const { rows } = await uptimeDb.query(
        "SELECT id, is_paused FROM uptime_heartbeat_state WHERE token = $1 OR token_previous = $1 LIMIT 1",
        [token]
      );
      if (rows.length === 0) {
        setNegativeCache(token);
        return res.status(404).json({ error: "Invalid token or monitor not found." });
      }
      cached = { id: rows[0].id, is_paused: rows[0].is_paused };
      heartbeatTokenCache.set(token, cached);
      negativeTokenCache.delete(token);
    } catch (e) {
      console.error("[HeartbeatPing] DB token lookup failed:", e);
      return res.status(500).json({ error: "Internal error looking up heartbeat token." });
    }
  }

  // If monitor is paused, accept ping but do not queue state update
  if (cached.is_paused) {
    return res.status(200).json({ ok: true, status: "paused" });
  }

  // 2. Queue ping into micro-batch map (bounded to prevent memory leaks during prolonged DB partitions)
  // Blocker 1 Fix: key by cached.id instead of token for fast PK join in PostgreSQL
  // Item 14 Fix: return 503 so client retries if buffer is full
  if (pendingPings.size >= MAX_BUFFER_LIMIT) {
    console.warn("[HeartbeatPing] Ingestion buffer limit reached (100k items). Returning 503.");
    return res.status(503).json({ error: "Server busy, heartbeat buffer full. Please retry." });
  }

  pendingPings.set(cached.id, new Date());

  // If buffer reaches chunk threshold, trigger immediate async flush
  if (pendingPings.size >= CHUNK_SIZE) {
    setImmediate(flushPendingHeartbeats);
  }

  // 3. Return immediate sub-millisecond response to caller
  return res.status(200).json({ status: "ok" });
}

function plan(hours) {
  if (hours <= 6)   return { table: 'uptime_telemetry', step: 'toStartOfInterval(toDateTime(ts), INTERVAL 1 MINUTE)',  kind: 'raw' };
  if (hours <= 168) return { table: 'telemetry_5m',     step: 'toStartOfInterval(bucket, INTERVAL 15 MINUTE)',          kind: 'roll' };
  return               { table: 'telemetry_5m',     step: 'toStartOfInterval(bucket, INTERVAL 6 HOUR)',             kind: 'roll' };
}

export async function getMonitorLatency(req, res) {
  try {
    const { monitorId } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(monitorId)) return res.status(400).end();

    const authCheck = await uptimeDb.query("SELECT id FROM uptime_monitors WHERE id = $1 AND user_id = $2", [monitorId, owner(req)]);
    if (!authCheck.rowCount) return res.status(404).end();

    const hours = Math.min(Number(req.query.hours) || 24, 24 * 90);
    const p = plan(hours);

    const query = p.kind === 'raw'
      ? `SELECT ${p.step} AS time,
                round(avgIf(latency_us, status IN (1, 2)) / 1000, 3)               AS avg_ms,
                round(quantileTDigestIf(0.95)(latency_us, status IN (1, 2)) / 1000, 3) AS p95_ms,
                round(maxIf(latency_us, status IN (1, 2)) / 1000, 3)               AS max_ms,
                round(100 * sumIf(interval_s, status IN (1, 2)) / nullIf(sumIf(interval_s, status != 3), 0), 3)  AS uptime_pct
         FROM uptime_telemetry
         WHERE monitor_id = {id:UUID} AND ts >= now() - INTERVAL {h:UInt32} HOUR
         GROUP BY time ORDER BY time ASC
         WITH FILL STEP INTERVAL 1 MINUTE`
      : `SELECT ${p.step} AS time,
                round(sum(lat_sum_us) / nullIf(sum(up_probes), 0) / 1000, 3) AS avg_ms,
                round(quantilesTDigestMerge(0.5, 0.95, 0.99)(lat_q)[2] / 1000, 3) AS p95_ms,
                round(max(lat_max_us) / 1000, 3)                              AS max_ms,
                round(100 * sum(up_s) / nullIf(sum(total_s), 0), 3)           AS uptime_pct
         FROM telemetry_5m
         WHERE monitor_id = {id:UUID} AND bucket >= now() - INTERVAL {h:UInt32} HOUR
         GROUP BY time ORDER BY time ASC`;

    const rs = await ch.query({ query, query_params: { id: monitorId, h: hours }, format: 'JSONEachRow' });
    res.set('Cache-Control', 'private, max-age=15').json(await rs.json());
  } catch (error) {
    console.error("Get monitor latency error:", error);
    res.status(500).json({ error: "Failed to get latency" });
  }
}

export async function getMonitorUptime(req, res) {
  try {
    const { monitorId } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(monitorId)) return res.status(400).end();

    const authCheck = await uptimeDb.query("SELECT id FROM uptime_monitors WHERE id = $1 AND user_id = $2", [monitorId, owner(req)]);
    if (!authCheck.rowCount) return res.status(404).end();

    const hours = Math.min(Number(req.query.hours) || 24, 24 * 90);

    const query = `
      SELECT
        sum(probes) AS total_probes,
        sum(up_probes) AS up_probes,
        sum(total_s) AS total_s,
        sum(up_s) AS up_s,
        round(100 * sum(up_s) / nullIf(sum(total_s), 0), 3) AS uptime_pct,
        round(quantilesTDigestMerge(0.5, 0.95, 0.99)(lat_q)[2] / 1000, 3) AS p95_ms
      FROM telemetry_5m
      WHERE monitor_id = {id:UUID} AND bucket >= now() - INTERVAL {h:UInt32} HOUR
    `;

    const rs = await ch.query({ query, query_params: { id: monitorId, h: hours }, format: 'JSONEachRow' });
    const data = await rs.json();
    res.set('Cache-Control', 'private, max-age=15').json({ success: true, uptime: data[0] || null });
  } catch (error) {
    console.error("Get monitor uptime error:", error);
    res.status(500).json({ error: "Failed to get uptime" });
  }
}

