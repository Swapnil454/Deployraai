import { pool } from '../config/postgres.js';

export const getComponents = async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await pool.query(
      `SELECT * FROM status_page_components WHERE project_id = $1 ORDER BY position ASC, created_at DESC`,
      [projectId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch components' });
  }
};

export const createComponent = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, position } = req.body;
    
    const result = await pool.query(`
      INSERT INTO status_page_components (project_id, name, description, position)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [projectId, name, description || null, position || 0]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Component name already exists' });
    res.status(500).json({ error: 'Failed to create component' });
  }
};

export const updateComponent = async (req, res) => {
  try {
    const { projectId, componentId } = req.params;
    const { name, description, position, current_status } = req.body;
    
    const result = await pool.query(`
      UPDATE status_page_components
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          position = COALESCE($3, position),
          current_status = COALESCE($4, current_status),
          updated_at = NOW()
      WHERE project_id = $5 AND id = $6
      RETURNING *
    `, [name, description, position, current_status, projectId, componentId]);
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Component not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update component' });
  }
};

export const deleteComponent = async (req, res) => {
  try {
    const { projectId, componentId } = req.params;
    await pool.query(
      `DELETE FROM status_page_components WHERE project_id = $1 AND id = $2`,
      [projectId, componentId]
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete component' });
  }
};
