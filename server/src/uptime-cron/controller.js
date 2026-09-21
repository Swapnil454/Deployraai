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

      -- Open incidents count
      COUNT(i.id) FILTER (WHERE i.resolved_at IS NULL) AS open_incidents,

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
    LEFT JOIN uptime_incidents i ON i.monitor_id = m.id AND i.resolved_at IS NULL
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
    const values = [userId, ...Object.values(monitor)];
    const { rows } = await uptimeDb.query(
      "INSERT INTO uptime_monitors (user_id, url, group_id, tags, interval_seconds, timeout_seconds, ip_version, follow_redirects, up_status_codes, auth_type, auth_username, auth_password, auth_bearer_token, http_method, request_body, send_as_json, request_headers, meta_fields, ssl_check_enabled, ssl_error_check_enabled, ssl_expiry_reminder_enabled, domain_expiry_reminder_enabled, slow_response_alert_enabled, slow_response_threshold_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, $19, $20, $21, $22, $23, $24) RETURNING *",
      values,
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

export async function deleteMonitor(req, res) {
  const { rowCount } = await uptimeDb.query(
    "DELETE FROM uptime_monitors WHERE id = $1 AND user_id = $2",
    [req.params.monitorId, owner(req)],
  );
  if (!rowCount) return res.status(404).json({ error: "Monitor not found." });
  res.json({ success: true });
}
