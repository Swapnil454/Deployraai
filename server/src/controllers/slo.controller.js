import { pool } from '../config/postgres.js';

export const getStatusPageConfig = async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(
      `SELECT * FROM status_pages WHERE project_id = $1`, 
      [projectId]
    );
    if (result.rows.length === 0) {
      // Return a default config representation if not created yet
      return res.json({
        enabled: false,
        slug: null,
        title: '',
        description: '',
        show_uptime_history: true,
        show_incidents: true
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status page config' });
  }
};

export const updateStatusPageConfig = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { enabled, slug, title, description, show_uptime_history, show_incidents } = req.body;
    
    // Check if it exists
    const existing = await pool.query(`SELECT id FROM status_pages WHERE project_id = $1`, [projectId]);
    
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(`
        INSERT INTO status_pages (project_id, enabled, slug, title, description, show_uptime_history, show_incidents)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [projectId, enabled, slug || null, title, description, show_uptime_history, show_incidents]);
    } else {
      result = await pool.query(`
        UPDATE status_pages 
        SET enabled = $2, slug = $3, title = $4, description = $5, 
            show_uptime_history = $6, show_incidents = $7, updated_at = NOW()
        WHERE project_id = $1
        RETURNING *
      `, [projectId, enabled, slug || null, title, description, show_uptime_history, show_incidents]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    // Unique violation for slug
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Slug is already taken' });
    }
    res.status(500).json({ error: 'Failed to update status page config' });
  }
};

export const getSLOs = async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(
      `SELECT * FROM service_level_objectives WHERE project_id = $1 ORDER BY created_at DESC`, 
      [projectId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getSLOs ERROR:', err);
    res.status(500).json({ error: 'Failed to fetch SLOs', details: err.message });
  }
};

export const createSLO = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, type, target_percentage, window_days, metric_source, latency_threshold_ms } = req.body;
    
    const result = await pool.query(`
      INSERT INTO service_level_objectives (
        project_id, name, type, target_percentage, window_days, metric_source, latency_threshold_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [projectId, name, type, target_percentage, window_days, metric_source || 'synthetic_checks', latency_threshold_ms]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create SLO' });
  }
};

export const deleteSLO = async (req, res) => {
  try {
    const { projectId, sloId } = req.params;
    await pool.query(
      `DELETE FROM service_level_objectives WHERE project_id = $1 AND id = $2`, 
      [projectId, sloId]
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete SLO' });
  }
};

export const getSLOStatus = async (req, res) => {
  try {
    const { projectId, sloId } = req.params;
    const sloRes = await pool.query(`SELECT * FROM service_level_objectives WHERE project_id = $1 AND id = $2`, [projectId, sloId]);
    if (sloRes.rows.length === 0) return res.status(404).json({ error: 'SLO not found' });
    
    const slo = sloRes.rows[0];
    const windowDays = slo.window_days;
    const targetPercentage = parseFloat(slo.target_percentage);
    
    // Total minutes in window
    const totalMinutes = windowDays * 24 * 60;
    const allowedDowntimeMinutes = totalMinutes * ((100 - targetPercentage) / 100);
    
    let actualSuccessPercentage = 100;
    
    if (slo.type === 'uptime' && slo.metric_source === 'synthetic_checks') {
      const checkRes = await pool.query(`
        SELECT
          COUNT(*) as total_checks,
          COUNT(*) FILTER (WHERE status_code >= 400 OR status_code IS NULL) as failed_checks
        FROM synthetic_checks
        WHERE project_id = $1
        AND checked_at >= NOW() - ($2::int * INTERVAL '1 day')
      `, [projectId, windowDays]);
      
      const total = parseInt(checkRes.rows[0].total_checks, 10) || 0;
      const failed = parseInt(checkRes.rows[0].failed_checks, 10) || 0;
      if (total > 0) {
        actualSuccessPercentage = ((total - failed) / total) * 100;
      }
    } else if (slo.type === 'success_rate' && slo.metric_source === 'metrics_minutely') {
      const checkRes = await pool.query(`
        SELECT
          SUM(request_count) as total_requests,
          SUM(error_count) as total_errors
        FROM metrics_minutely
        WHERE project_id = $1
        AND bucket >= NOW() - ($2::int * INTERVAL '1 day')
      `, [projectId, windowDays]);
      
      const total = parseInt(checkRes.rows[0].total_requests, 10) || 0;
      const errors = parseInt(checkRes.rows[0].total_errors, 10) || 0;
      if (total > 0) {
        actualSuccessPercentage = ((total - errors) / total) * 100;
      }
    } else if (slo.type === 'latency' && slo.metric_source === 'metrics_minutely') {
      const checkRes = await pool.query(`
        SELECT
          SUM(request_count) as total_requests,
          SUM(request_count) FILTER (WHERE p99_duration_ms > $3) as total_slow_requests
        FROM metrics_minutely
        WHERE project_id = $1
        AND bucket >= NOW() - ($2::int * INTERVAL '1 day')
      `, [projectId, windowDays, slo.latency_threshold_ms || 200]);
      
      const total = parseInt(checkRes.rows[0].total_requests, 10) || 0;
      const slow = parseInt(checkRes.rows[0].total_slow_requests, 10) || 0;
      if (total > 0) {
        actualSuccessPercentage = ((total - slow) / total) * 100;
      }
    }
    
    const actualFailurePercentage = 100 - actualSuccessPercentage;
    const allowedFailurePercentage = 100 - targetPercentage;
    
    let budgetUsed = 0;
    if (allowedFailurePercentage > 0) {
      budgetUsed = (actualFailurePercentage / allowedFailurePercentage) * 100;
    }
    
    let budgetRemaining = 100 - budgetUsed;
    
    const usedDowntimeMinutes = totalMinutes * (actualFailurePercentage / 100);
    const remainingDowntimeMinutes = allowedDowntimeMinutes - usedDowntimeMinutes;

    // Burn rate = actual error rate / allowed error rate
    const burnRate = allowedFailurePercentage > 0 ? (actualFailurePercentage / allowedFailurePercentage) : 0;
    let budgetExhaustionDays = null;
    if (burnRate > 0) {
      budgetExhaustionDays = Math.round(windowDays / burnRate);
    }
    
    res.json({
      slo,
      allowedDowntimeMinutes,
      usedDowntimeMinutes,
      remainingDowntimeMinutes,
      budgetRemainingPercentage: budgetRemaining,
      budgetUsedPercentage: budgetUsed,
      actualSuccessPercentage,
      burnRate,
      budgetExhaustionDays
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate SLO status' });
  }
};
