import { uptimeDb } from "./db.js";

const owner = (req) => String(req.user.userId);

export async function listMaintenanceWindows(req, res) {
  const userId = owner(req);
  const { rows } = await uptimeDb.query(
    `SELECT w.*, 
       COALESCE(json_agg(DISTINCT m.monitor_id) FILTER (WHERE m.monitor_id IS NOT NULL), '[]') as monitor_ids,
       (SELECT COUNT(*)::int FROM uptime_checks_log WHERE suppressed_by_window_id = w.id) as total_suppressed_checks,
       (SELECT COUNT(*)::int FROM uptime_checks_log WHERE suppressed_by_window_id = w.id AND success = false) as failed_suppressed_checks
     FROM uptime_maintenance_windows w
     LEFT JOIN uptime_maintenance_window_monitors m ON w.id = m.window_id
     WHERE w.user_id = $1
     GROUP BY w.id
     ORDER BY w.created_at DESC`,
    [userId]
  );
  res.json({ windows: rows });
}

export async function getMaintenanceWindow(req, res) {
  const userId = owner(req);
  const { id } = req.params;
  const { rows } = await uptimeDb.query(
    `SELECT w.*, 
       COALESCE(json_agg(DISTINCT m.monitor_id) FILTER (WHERE m.monitor_id IS NOT NULL), '[]') as monitor_ids,
       (SELECT COUNT(*)::int FROM uptime_checks_log WHERE suppressed_by_window_id = w.id) as total_suppressed_checks,
       (SELECT COUNT(*)::int FROM uptime_checks_log WHERE suppressed_by_window_id = w.id AND success = false) as failed_suppressed_checks
     FROM uptime_maintenance_windows w
     LEFT JOIN uptime_maintenance_window_monitors m ON w.id = m.window_id
     WHERE w.id = $1 AND w.user_id = $2
     GROUP BY w.id`,
    [id, userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Maintenance window not found" });
  res.json({ window: rows[0] });
}

export async function createMaintenanceWindow(req, res) {
  const userId = owner(req);
  const { name, timezone, recurrence_type, start_time, duration_minutes, days_of_week, one_time_start_at, monitor_ids } = req.body;

  if (!name || !timezone || !recurrence_type || !duration_minutes) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (duration_minutes <= 0 || duration_minutes > 1440) {
    return res.status(400).json({ error: "Duration must be between 1 and 1440 minutes" });
  }

  const client = await uptimeDb.connect();
  try {
    await client.query("BEGIN");
    
    const { rows } = await client.query(
      `INSERT INTO uptime_maintenance_windows 
       (user_id, name, timezone, recurrence_type, start_time, duration_minutes, days_of_week, one_time_start_at, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING *`,
      [userId, name, timezone, recurrence_type, start_time, duration_minutes, days_of_week, one_time_start_at]
    );
    
    const windowId = rows[0].id;
    
    if (monitor_ids && monitor_ids.length > 0) {
      // Apply to specific monitors
      const values = monitor_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO uptime_maintenance_window_monitors (window_id, monitor_id) VALUES ${values}`,
        [windowId, ...monitor_ids]
      );
    }
    // If monitor_ids is empty or undefined, it acts as a global window (applies to all)
    
    await client.query("COMMIT");
    res.status(201).json({ window: { ...rows[0], monitor_ids: monitor_ids || [] } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create maintenance window" });
  } finally {
    client.release();
  }
}

export async function updateMaintenanceWindow(req, res) {
  // Update omitted for brevity unless needed by user UI, but it's good practice.
  res.status(501).json({ error: "Not implemented yet" });
}

export async function deleteMaintenanceWindow(req, res) {
  const userId = owner(req);
  const { id } = req.params;
  const { rowCount } = await uptimeDb.query("DELETE FROM uptime_maintenance_windows WHERE id = $1 AND user_id = $2", [id, userId]);
  if (rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
}

export async function toggleMaintenanceWindow(req, res) {
  const userId = owner(req);
  const { id } = req.params;
  const { active } = req.body;
  const { rows } = await uptimeDb.query(
    "UPDATE uptime_maintenance_windows SET active = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
    [active, id, userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Not found" });
  res.json({ window: rows[0] });
}
