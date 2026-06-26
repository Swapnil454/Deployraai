import { pool } from '../config/postgres.js';

async function getStatusConfig(identifier) {
  // identifier could be a project_id (UUID) or a slug
  const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(identifier);
  
  let query = `
    SELECT sp.*, p.name as project_name 
    FROM status_pages sp
    JOIN projects p ON p.id = sp.project_id
    WHERE sp.enabled = TRUE
  `;
  
  const params = [identifier];
  if (isUUID) {
    query += ` AND sp.project_id = $1`;
  } else {
    query += ` AND sp.slug = $1`;
  }

  const result = await pool.query(query, params);
  return result.rows[0];
}

export const getPublicStatus = async (req, res) => {
  try {
    const { identifier } = req.params;
    const config = await getStatusConfig(identifier);
    
    if (!config) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    const projectId = config.project_id;

    // 1. Synthetic Check Status (Last 5 mins)
    const checkRes = await pool.query(`
      SELECT
        COUNT(*) AS total_checks,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) AS up_checks,
        COUNT(*) FILTER (WHERE status_code >= 400 OR status_code IS NULL) AS down_checks,
        AVG(latency_ms) AS avg_response_time_ms
      FROM synthetic_checks
      WHERE project_id = $1
      AND checked_at >= NOW() - INTERVAL '5 minutes'
    `, [projectId]);

    const stats = checkRes.rows[0];
    const total = parseInt(stats.total_checks, 10) || 0;
    const down = parseInt(stats.down_checks, 10) || 0;
    const avgResponseTime = parseFloat(stats.avg_response_time_ms) || 0;

    let syntheticStatus = "operational";
    if (total === 0) syntheticStatus = "unknown";
    else if (down === total) syntheticStatus = "down";
    else if (down > 0 || avgResponseTime > 2000) syntheticStatus = "degraded";

    // 2. Components
    const compsRes = await pool.query(`
      SELECT id, name, description, current_status
      FROM status_page_components
      WHERE project_id = $1
      ORDER BY position ASC, created_at DESC
    `, [projectId]);
    const components = compsRes.rows;

    // 3. Active Incidents (with updates)
    const activeIncRes = await pool.query(`
      SELECT id, title, status, severity, started_at
      FROM incidents
      WHERE project_id = $1 AND status != 'resolved'
      ORDER BY started_at DESC
    `, [projectId]);
    
    const activeIncidents = [];
    for (const inc of activeIncRes.rows) {
      const updatesRes = await pool.query(`
        SELECT message, new_status as status, created_at
        FROM incident_updates
        WHERE incident_id = $1
        ORDER BY created_at DESC
      `, [inc.id]);
      inc.updates = updatesRes.rows;
      activeIncidents.push(inc);
    }

    // 4. Past Incidents
    const pastIncRes = await pool.query(`
      SELECT id, title, status, severity, started_at, resolved_at
      FROM incidents
      WHERE project_id = $1 AND status = 'resolved'
      ORDER BY resolved_at DESC
      LIMIT 5
    `, [projectId]);

    const pastIncidents = [];
    for (const inc of pastIncRes.rows) {
      const updatesRes = await pool.query(`
        SELECT message, new_status as status, created_at
        FROM incident_updates
        WHERE incident_id = $1
        ORDER BY created_at DESC
      `, [inc.id]);
      inc.updates = updatesRes.rows;
      pastIncidents.push(inc);
    }

    // 5. Combine Overall Status
    let status = syntheticStatus;
    if (activeIncidents.some(i => i.severity === 'critical')) {
      status = 'down';
    } else if (activeIncidents.some(i => i.severity === 'major' || i.severity === 'minor')) {
      status = 'degraded';
    }

    res.json({
      config: {
        title: config.title || config.project_name,
        description: config.description,
        show_uptime_history: config.show_uptime_history
      },
      status,
      components,
      activeIncidents,
      pastIncidents
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
};

export const getUptimeHistory = async (req, res) => {
  try {
    const { identifier } = req.params;
    const config = await getStatusConfig(identifier);
    
    if (!config || !config.show_uptime_history) {
      return res.status(404).json({ error: 'History not found' });
    }

    const historyRes = await pool.query(`
      SELECT
        DATE(checked_at) as date,
        COUNT(*) as total_checks,
        COUNT(*) FILTER (WHERE status_code >= 400 OR status_code IS NULL) as failed_checks,
        AVG(latency_ms) as avg_response_time_ms
      FROM synthetic_checks
      WHERE project_id = $1
      AND checked_at >= NOW() - INTERVAL '90 days'
      GROUP BY DATE(checked_at)
      ORDER BY date ASC
    `, [config.project_id]);

    const history = historyRes.rows.map(row => {
      const total = parseInt(row.total_checks, 10) || 0;
      const failed = parseInt(row.failed_checks, 10) || 0;
      const up = total - failed;
      const uptimePercentage = total > 0 ? (up / total) * 100 : 0;
      
      let status = "gray";
      if (total > 0) {
        if (uptimePercentage >= 99.9) status = "green";
        else if (uptimePercentage >= 95) status = "yellow";
        else status = "red";
      }

      return {
        date: row.date,
        uptimePercentage: Number(uptimePercentage.toFixed(2)),
        status,
        totalChecks: total,
        failedChecks: failed,
        avgResponseTimeMs: Math.round(row.avg_response_time_ms || 0)
      };
    });

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
};
