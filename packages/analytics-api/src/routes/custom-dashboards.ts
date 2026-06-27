import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

const ALLOWED_AGGREGATIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const;
type Aggregation = typeof ALLOWED_AGGREGATIONS[number];

const queryCache = new Map<string, { result: any; expiresAt: number }>();

function getCacheKey(params: any) {
  return `${params.projectId}:${params.eventName}:${params.aggregation}:${params.property ?? ''}:${params.window}`;
}

export const customDashboardsRouter: FastifyPluginAsync = async (app) => {
  
  // List dashboards
  app.get('/', async (req, reply) => {
    const { projectId } = req.query as { projectId: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    try {
      const res = await db.query(
        'SELECT id, name, created_at, updated_at FROM custom_dashboards WHERE project_id = $1 ORDER BY created_at DESC', 
        [projectId]
      );
      return { dashboards: res.rows };
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get a specific dashboard
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    
    try {
      const res = await db.query(
        'SELECT * FROM custom_dashboards WHERE id = $1', 
        [id]
      );
      if (res.rows.length === 0) return reply.status(404).send({ error: 'Not found' });
      return { dashboard: res.rows[0] };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Create dashboard
  app.post('/', async (req, reply) => {
    const { projectId, name, layout_json = [], widgets_json = [] } = req.body as any;
    if (!projectId || !name) return reply.status(400).send({ error: 'Missing required fields' });

    try {
      const res = await db.query(
        `INSERT INTO custom_dashboards (project_id, name, layout_json, widgets_json) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [projectId, name, JSON.stringify(layout_json), JSON.stringify(widgets_json)]
      );
      return { dashboard: res.rows[0] };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update dashboard (debounced saves from frontend)
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const updates = req.body as any;
    
    try {
      const fields = [];
      const values = [];
      let i = 1;
      
      if (updates.name !== undefined) { fields.push(`name = $${i++}`); values.push(updates.name); }
      if (updates.layout_json !== undefined) { fields.push(`layout_json = $${i++}`); values.push(JSON.stringify(updates.layout_json)); }
      if (updates.widgets_json !== undefined) { fields.push(`widgets_json = $${i++}`); values.push(JSON.stringify(updates.widgets_json)); }
      
      if (fields.length === 0) return reply.status(400).send({ error: 'No fields to update' });
      
      fields.push(`updated_at = NOW()`);
      values.push(id);
      
      const res = await db.query(
        `UPDATE custom_dashboards SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      
      if (res.rows.length === 0) return reply.status(404).send({ error: 'Not found' });
      return { dashboard: res.rows[0] };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete dashboard
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await db.query('DELETE FROM custom_dashboards WHERE id = $1', [id]);
      return { success: true };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get distinct event names for autocomplete
  app.get('/events', async (req, reply) => {
    const { projectId } = req.query as { projectId: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    try {
      const res = await db.query(
        'SELECT DISTINCT event_name FROM custom_events WHERE project_id = $1 ORDER BY event_name ASC',
        [projectId]
      );
      return { events: res.rows.map(r => r.event_name) };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Query Engine for Widgets
  app.post('/query', async (req, reply) => {
    const { projectId, eventName, aggregation, property, window = '24h' } = req.body as any;
    
    if (!projectId || !eventName || !aggregation) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    if (!ALLOWED_AGGREGATIONS.includes(aggregation)) {
      return reply.status(400).send({ error: 'Invalid aggregation' });
    }

    if (property && !/^[a-zA-Z0-9_.]{1,64}$/.test(property)) {
      return reply.status(400).send({ error: 'Invalid property name' });
    }

    const cacheKey = getCacheKey({ projectId, eventName, aggregation, property, window });
    const cached = queryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { data: cached.result };
    }

    let bucketInterval = 'hour';
    let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    
    if (window === '1h') {
      timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";
      bucketInterval = 'minute';
    } else if (window === '7d') {
      timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
      bucketInterval = 'day';
    }

    const valueExpr = aggregation === 'COUNT' 
      ? 'COUNT(*)' 
      : `${aggregation}((properties->>'${property}')::numeric)`;

    // Construct SQL Query against the new custom_events table
    // eventName is strictly parameterized
    const sql = `
      SELECT 
        date_trunc($1, created_at) as bucket,
        ${valueExpr} as value
      FROM custom_events
      WHERE project_id = $2
        AND event_name = $3
        AND ${timeFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    try {
      const res = await db.query(sql, [bucketInterval, projectId, eventName]);
      
      const result = res.rows.map(r => ({
        timestamp: new Date(r.bucket).getTime(),
        value: Number(r.value)
      }));

      // Set cache for 60 seconds
      queryCache.set(cacheKey, { result, expiresAt: Date.now() + 60000 });

      return { data: result };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
