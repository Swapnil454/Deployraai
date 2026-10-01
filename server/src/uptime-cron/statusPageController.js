import { uptimeDb } from "./db.js";
import jwt from "jsonwebtoken";

// Helper for auth check
const owner = (req) => {
  if (!req.user || !req.user.userId) throw new Error("Unauthorized");
  return req.user.userId;
};

/**
 * GET /api/uptime-cron/status-pages
 * List all status pages for a user
 */
export async function getStatusPages(req, res) {
  try {
    const userId = owner(req);
    const result = await uptimeDb.query(
      `SELECT sp.*, 
        COALESCE(json_agg(
          json_build_object(
            'id', m.id,
            'monitor_id', spm.monitor_id,
            'monitor_type', m.monitor_type,
            'url', m.url,
            'target_host', m.target_host,
            'dns_hostname', m.dns_hostname,
            'status', m.status
          )
        ) FILTER (WHERE spm.monitor_id IS NOT NULL), '[]'::json) as monitors
       FROM uptime_status_pages sp
       LEFT JOIN uptime_status_page_monitors spm ON spm.status_page_id = sp.id
       LEFT JOIN uptime_monitors m ON m.id = spm.monitor_id
       WHERE sp.user_id = $1
       GROUP BY sp.id
       ORDER BY sp.created_at DESC`,
      [userId]
    );
    res.json({ status_pages: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/uptime-cron/status-pages/:id
 */
export async function getStatusPage(req, res) {
  try {
    const userId = owner(req);
    const { id } = req.params;
    
    const result = await uptimeDb.query(
      `SELECT sp.*, 
        COALESCE(json_agg(
          json_build_object(
            'id', m.id,
            'monitor_id', spm.monitor_id,
            'monitor_type', m.monitor_type,
            'url', m.url,
            'target_host', m.target_host,
            'dns_hostname', m.dns_hostname,
            'status', m.status,
            'sort_order', spm.sort_order
          )
        ) FILTER (WHERE spm.monitor_id IS NOT NULL), '[]'::json) as monitors
       FROM uptime_status_pages sp
       LEFT JOIN uptime_status_page_monitors spm ON spm.status_page_id = sp.id
       LEFT JOIN uptime_monitors m ON m.id = spm.monitor_id
       WHERE sp.id = $1 AND sp.user_id = $2
       GROUP BY sp.id`,
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Status page not found" });
    }
    
    res.json({ status_page: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/uptime-cron/status-pages
 */
export async function createStatusPage(req, res) {
  try {
    const userId = owner(req);
    const { title, slug, monitor_ids = [], is_public = true } = req.body;
    
    if (!title || !slug) {
      return res.status(400).json({ error: "Title and slug are required" });
    }

    // Insert status page
    const insertRes = await uptimeDb.query(
      `INSERT INTO uptime_status_pages (user_id, title, slug, is_public) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, title, slug, is_public]
    );
    const newPage = insertRes.rows[0];

    // Insert monitors
    for (let i = 0; i < monitor_ids.length; i++) {
      const monitorId = monitor_ids[i];
      await uptimeDb.query(
        `INSERT INTO uptime_status_page_monitors (status_page_id, monitor_id, sort_order)
         VALUES ($1, $2, $3)`,
        [newPage.id, monitorId, i]
      );
    }

    res.json({ status_page: newPage });
  } catch (error) {
    // Handle unique constraint error for slug
    if (error.code === '23505') {
      return res.status(400).json({ error: "That URL slug is already taken" });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/uptime-cron/status-pages/:id
 */
export async function updateStatusPage(req, res) {
  try {
    const userId = owner(req);
    const { id } = req.params;
    const { title, slug, monitor_ids = [], is_public } = req.body;

    // Verify ownership
    const checkRes = await uptimeDb.query(`SELECT id FROM uptime_status_pages WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (checkRes.rowCount === 0) return res.status(404).json({ error: "Status page not found" });

    // Update settings
    await uptimeDb.query(
      `UPDATE uptime_status_pages SET title = COALESCE($1, title), slug = COALESCE($2, slug), is_public = COALESCE($3, is_public), updated_at = NOW() WHERE id = $4`,
      [title, slug, is_public, id]
    );

    if (req.body.monitor_ids) {
      // Re-sync monitors: delete all existing, then insert new ones
      await uptimeDb.query(`DELETE FROM uptime_status_page_monitors WHERE status_page_id = $1`, [id]);
      
      for (let i = 0; i < monitor_ids.length; i++) {
        const monitorId = monitor_ids[i];
        await uptimeDb.query(
          `INSERT INTO uptime_status_page_monitors (status_page_id, monitor_id, sort_order)
           VALUES ($1, $2, $3)`,
          [id, monitorId, i]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: "That URL slug is already taken" });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/uptime-cron/status-pages/:id
 */
export async function deleteStatusPage(req, res) {
  try {
    const userId = owner(req);
    const { id } = req.params;
    await uptimeDb.query(`DELETE FROM uptime_status_pages WHERE id = $1 AND user_id = $2`, [id, userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/uptime-cron/status/:slug
 * PUBLIC ENDPOINT
 * Fetches status page info and current uptime stats for the monitors, sanitizing sensitive info.
 */
export async function getPublicStatusPage(req, res) {
  try {
    const { slug } = req.params;
    
    // 1. Get status page config
    const pageRes = await uptimeDb.query(
      `SELECT id, title, slug, logo_url, brand_color, is_public, user_id 
       FROM uptime_status_pages 
       WHERE slug = $1`,
      [slug]
    );

    if (pageRes.rows.length === 0) {
      return res.status(404).json({ error: "Status page not found" });
    }
    
    const page = pageRes.rows[0];
    if (!page.is_public) {
      let isOwner = false;
      try {
        const token = req.cookies[process.env.COOKIE_NAME || "deployai_token"];
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          if (decoded.userId === page.user_id) isOwner = true;
        }
      } catch (e) {
        // invalid token ignored
      }

      if (!isOwner) {
        return res.status(403).json({ error: "This status page is private." });
      }
    }

    // 2. Get monitors with current status (sanitized)
    const monitorsRes = await uptimeDb.query(
      `SELECT 
         m.id, 
         COALESCE(m.url, m.target_host, m.dns_hostname) AS target,
         m.monitor_type, 
         m.status,
         m.interval_seconds,
         m.last_checked_at,
         spm.sort_order
       FROM uptime_status_page_monitors spm
       JOIN uptime_monitors m ON m.id = spm.monitor_id
       WHERE spm.status_page_id = $1
       ORDER BY spm.sort_order ASC`,
      [page.id]
    );

    const monitors = monitorsRes.rows;

    const windowStr = req.query.window || '30d';
    let intervalStr = '30 days';
    let groupFormat = 'YYYY-MM-DD';
    let useDailyMetrics = false;

    switch (windowStr) {
      case '1h': intervalStr = '1 hour'; groupFormat = 'YYYY-MM-DD HH24:MI'; break;
      case '6h': intervalStr = '6 hours'; groupFormat = 'YYYY-MM-DD HH24:MI'; break;
      case '12h': intervalStr = '12 hours'; groupFormat = 'YYYY-MM-DD HH24:MI'; break;
      case '7d': intervalStr = '7 days'; useDailyMetrics = true; break;
      case '30d': default: intervalStr = '30 days'; useDailyMetrics = true; break;
    }

    // 3. Get history for each monitor based on window
    const monitorIds = monitors.map(m => m.id);
    let historyRows = [];
    if (monitorIds.length > 0) {
      const historyQuery = useDailyMetrics
        ? `SELECT monitor_id, TO_CHAR(date, 'YYYY-MM-DD') as date,
             SUM(successful_checks) * 100.0 / NULLIF(SUM(total_checks), 0) as uptime_percentage
           FROM uptime_daily_metrics
           WHERE monitor_id = ANY($1) AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '${intervalStr}'
           GROUP BY monitor_id, date ORDER BY date ASC`
        : `SELECT monitor_id, TO_CHAR(checked_at AT TIME ZONE 'UTC', '${groupFormat}') as date,
             COUNT(*) FILTER (WHERE success OR suppressed_by_window_id IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0) as uptime_percentage
           FROM uptime_checks_log
           WHERE monitor_id = ANY($1) AND checked_at >= NOW() - INTERVAL '${intervalStr}'
           GROUP BY monitor_id, TO_CHAR(checked_at AT TIME ZONE 'UTC', '${groupFormat}') ORDER BY date ASC`;
           
      const historyRes = await uptimeDb.query(historyQuery, [monitorIds]);
      historyRows = historyRes.rows;
    }

    // 3.5. Get overall uptime per monitor
    let monitorOverall = [];
    if (monitorIds.length > 0) {
      const overallQuery = useDailyMetrics
        ? `SELECT monitor_id, SUM(successful_checks) * 100.0 / NULLIF(SUM(total_checks), 0) as uptime_pct
           FROM uptime_daily_metrics
           WHERE monitor_id = ANY($1) AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '${intervalStr}'
           GROUP BY monitor_id`
        : `SELECT monitor_id, COUNT(*) FILTER (WHERE success OR suppressed_by_window_id IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0) as uptime_pct
           FROM uptime_checks_log
           WHERE monitor_id = ANY($1) AND checked_at >= NOW() - INTERVAL '${intervalStr}'
           GROUP BY monitor_id`;
           
      const monitorOverallRes = await uptimeDb.query(overallQuery, [monitorIds]);
      monitorOverall = monitorOverallRes.rows;
    }

    // Attach history and overall uptime to each monitor
    monitors.forEach(m => {
      m.history = historyRows.filter(h => h.monitor_id === m.id).map(h => ({
        date: h.date,
        uptime_percentage: parseFloat(h.uptime_percentage).toFixed(3)
      }));
      const overall = monitorOverall.find(o => o.monitor_id === m.id);
      m.uptime_overall = overall ? parseFloat(overall.uptime_pct).toFixed(3) : "100.000";
    });

    // 4. Global Aggregate Stats for the 4 Bottom Cards
    let global_metrics = {
      uptime_30d: 0,
      uptime_history: [],
      avg_response_ms: 0,
      response_history: [],
      incidents_30d: 0,
      incidents_history: []
    };

    if (monitorIds.length > 0) {
      // 30-day overall uptime & response time (grouped by day)
      const aggQuery = useDailyMetrics
        ? `SELECT TO_CHAR(date, 'YYYY-MM-DD') as date,
             SUM(successful_checks) * 100.0 / NULLIF(SUM(total_checks), 0) as uptime_pct,
             SUM(total_response_time_ms) / NULLIF(SUM(total_checks), 0) as avg_ms
           FROM uptime_daily_metrics
           WHERE monitor_id = ANY($1) AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '${intervalStr}'
           GROUP BY date ORDER BY date ASC`
        : `SELECT TO_CHAR(checked_at AT TIME ZONE 'UTC', '${groupFormat}') as date,
             COUNT(*) FILTER (WHERE success OR suppressed_by_window_id IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0) as uptime_pct,
             AVG(response_time_ms) as avg_ms
           FROM uptime_checks_log
           WHERE monitor_id = ANY($1) AND checked_at >= NOW() - INTERVAL '${intervalStr}'
           GROUP BY TO_CHAR(checked_at AT TIME ZONE 'UTC', '${groupFormat}') ORDER BY date ASC`;
           
      const aggRes = await uptimeDb.query(aggQuery, [monitorIds]);
      
      const aggRows = aggRes.rows;
      if (aggRows.length > 0) {
        global_metrics.uptime_history = aggRows.map(r => parseFloat(r.uptime_pct));
        global_metrics.response_history = aggRows.map(r => parseFloat(r.avg_ms));
      }

      const overallAggQuery = useDailyMetrics
        ? `SELECT SUM(successful_checks) * 100.0 / NULLIF(SUM(total_checks), 0) as uptime_pct,
             SUM(total_response_time_ms) / NULLIF(SUM(total_checks), 0) as avg_ms
           FROM uptime_daily_metrics
           WHERE monitor_id = ANY($1) AND date >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '${intervalStr}'`
        : `SELECT COUNT(*) FILTER (WHERE success OR suppressed_by_window_id IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0) as uptime_pct,
             AVG(response_time_ms) as avg_ms
           FROM uptime_checks_log
           WHERE monitor_id = ANY($1) AND checked_at >= NOW() - INTERVAL '${intervalStr}'`;
           
      const overallAggRes = await uptimeDb.query(overallAggQuery, [monitorIds]);

      if (overallAggRes.rows.length > 0 && overallAggRes.rows[0].uptime_pct !== null) {
        global_metrics.uptime_30d = parseFloat(overallAggRes.rows[0].uptime_pct);
        global_metrics.avg_response_ms = parseFloat(overallAggRes.rows[0].avg_ms);
      } else {
        global_metrics.uptime_30d = 100;
        global_metrics.avg_response_ms = 0;
      }

      // incidents in the window
      const incRes = await uptimeDb.query(
        `SELECT 
          TO_CHAR(started_at AT TIME ZONE 'UTC', '${groupFormat}') as date,
          COUNT(*) as count
         FROM uptime_incidents
         WHERE monitor_id = ANY($1) 
           AND started_at >= NOW() - INTERVAL '${intervalStr}'
         GROUP BY TO_CHAR(started_at AT TIME ZONE 'UTC', '${groupFormat}')
         ORDER BY date ASC`,
        [monitorIds]
      );

      global_metrics.incidents_30d = incRes.rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);
      global_metrics.incidents_history = incRes.rows.map(r => parseInt(r.count, 10));
    }

    res.set('Cache-Control', 'public, max-age=0');
    res.set('CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=59');
    res.json({
      status_page: page,
      monitors: monitors,
      global_metrics: global_metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
