import { pool } from '../config/postgres.js';

function severityToComponentStatus(severity) {
  if (severity === "critical") return "major_outage";
  if (severity === "major") return "partial_outage";
  return "degraded";
}

async function recalculateComponentStatuses(client, componentIds) {
  if (!componentIds || componentIds.length === 0) return;
  
  for (const compId of componentIds) {
    const res = await client.query(`
      SELECT i.id, i.severity
      FROM incidents i
      JOIN incident_components ic ON ic.incident_id = i.id
      WHERE ic.component_id = $1
      AND i.status != 'resolved'
      ORDER BY
        CASE i.severity
          WHEN 'critical' THEN 3
          WHEN 'major' THEN 2
          ELSE 1
        END DESC
      LIMIT 1
    `, [compId]);
    
    const newStatus = res.rows.length > 0 
      ? severityToComponentStatus(res.rows[0].severity)
      : 'operational';
      
    await client.query(`
      UPDATE status_page_components 
      SET current_status = $1, updated_at = NOW()
      WHERE id = $2
    `, [newStatus, compId]);
  }
}

export const getIncidents = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT i.*, 
             COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)) FILTER (WHERE c.id IS NOT NULL), '[]') as components
      FROM incidents i
      LEFT JOIN incident_components ic ON ic.incident_id = i.id
      LEFT JOIN status_page_components c ON c.id = ic.component_id
      WHERE i.project_id = $1
      GROUP BY i.id
      ORDER BY i.started_at DESC
      LIMIT $2 OFFSET $3
    `, [projectId, Math.min(parseInt(limit), 500), parseInt(offset) || 0]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
};

export const getIncidentById = async (req, res) => {
  try {
    const { projectId, incidentId } = req.params;
    const result = await pool.query(`
      SELECT i.*, 
             COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name)) FILTER (WHERE c.id IS NOT NULL), '[]') as components
      FROM incidents i
      LEFT JOIN incident_components ic ON ic.incident_id = i.id
      LEFT JOIN status_page_components c ON c.id = ic.component_id
      WHERE i.project_id = $1 AND i.id = $2
      GROUP BY i.id
    `, [projectId, incidentId]);
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
};

export const createIncident = async (req, res) => {
  const client = await pool.connect();
  try {
    const { projectId } = req.params;
    const { title, status, severity, initial_message, component_ids, started_at } = req.body;
    const userId = req.user.id;
    
    await client.query('BEGIN');
    
    const incRes = await client.query(`
      INSERT INTO incidents (project_id, title, status, severity, started_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [projectId, title, status || 'investigating', severity || 'minor', started_at || new Date(), userId]);
    
    const incident = incRes.rows[0];
    
    await client.query(`
      INSERT INTO incident_updates (incident_id, message, new_status, created_by)
      VALUES ($1, $2, $3, $4)
    `, [incident.id, initial_message || `Incident declared: ${incident.status}`, incident.status, userId]);
    
    if (component_ids && component_ids.length > 0) {
      for (const compId of component_ids) {
        await client.query(`
          INSERT INTO incident_components (incident_id, component_id)
          VALUES ($1, $2)
        `, [incident.id, compId]);
      }
      await recalculateComponentStatuses(client, component_ids);
    }
    
    await client.query('COMMIT');
    res.status(201).json(incident);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create incident' });
  } finally {
    client.release();
  }
};

export const updateIncidentStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { projectId, incidentId } = req.params;
    const { message, status } = req.body;
    const userId = req.user.id;
    
    await client.query('BEGIN');
    
    const existing = await client.query(`SELECT status FROM incidents WHERE id = $1 AND project_id = $2`, [incidentId, projectId]);
    if (existing.rows.length === 0) throw new Error('Not found');
    
    let resolvedAt = status === 'resolved' ? new Date() : null;
    
    const incRes = await client.query(`
      UPDATE incidents
      SET status = $1, resolved_at = COALESCE(resolved_at, $2), updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, resolvedAt, incidentId]);
    
    await client.query(`
      INSERT INTO incident_updates (incident_id, message, new_status, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [incidentId, message, status, userId]);
    
    // Check affected components
    const compRes = await client.query(`SELECT component_id FROM incident_components WHERE incident_id = $1`, [incidentId]);
    const compIds = compRes.rows.map(r => r.component_id);
    await recalculateComponentStatuses(client, compIds);
    
    await client.query('COMMIT');
    res.json(incRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update incident' });
  } finally {
    client.release();
  }
};

export const getIncidentUpdates = async (req, res) => {
  try {
    const { projectId, incidentId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    // Scope by project_id to prevent cross-tenant IDOR
    const result = await pool.query(`
      SELECT u.* FROM incident_updates u
      JOIN incidents i ON i.id = u.incident_id
      WHERE u.incident_id = $1 AND i.project_id = $2
      ORDER BY u.created_at ASC
      LIMIT $3 OFFSET $4
    `, [incidentId, projectId, Math.min(parseInt(limit), 500), parseInt(offset) || 0]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
};
