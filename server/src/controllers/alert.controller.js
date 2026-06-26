import { pool } from '../config/postgres.js';

export const getAlertRules = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Auth check should happen in middleware, but ensuring projectId belongs to user
    const result = await pool.query(
      'SELECT * FROM alert_rules WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
};

export const createAlertRule = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, event_type, severity, threshold, window_minutes, cooldown_minutes, route_type, route_target } = req.body;

    const result = await pool.query(
      `INSERT INTO alert_rules (
        project_id, name, event_type, severity, threshold, window_minutes, cooldown_minutes, route_type, route_target
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [projectId, name, event_type, severity, threshold, window_minutes, cooldown_minutes, route_type, route_target || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
};

export const updateAlertRule = async (req, res) => {
  try {
    const { projectId, ruleId } = req.params;
    const { name, enabled, event_type, severity, threshold, window_minutes, cooldown_minutes, route_type, route_target } = req.body;

    const result = await pool.query(
      `UPDATE alert_rules SET 
        name = $1, enabled = $2, event_type = $3, severity = $4, threshold = $5, 
        window_minutes = $6, cooldown_minutes = $7, route_type = $8, route_target = $9, updated_at = NOW()
      WHERE project_id = $10 AND id = $11 RETURNING *`,
      [name, enabled, event_type, severity, threshold, window_minutes, cooldown_minutes, route_type, route_target || null, projectId, ruleId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
};

export const deleteAlertRule = async (req, res) => {
  try {
    const { projectId, ruleId } = req.params;
    const result = await pool.query(
      'DELETE FROM alert_rules WHERE project_id = $1 AND id = $2 RETURNING *',
      [projectId, ruleId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
};

export const getAlertHistory = async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await pool.query(
      `SELECT e.*, r.name as rule_name 
       FROM alert_events e
       LEFT JOIN alert_rules r ON e.rule_id = r.id
       WHERE e.project_id = $1 
       ORDER BY e.triggered_at DESC 
       LIMIT $2`,
      [projectId, limit]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert history' });
  }
};
