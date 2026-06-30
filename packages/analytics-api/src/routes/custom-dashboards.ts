import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { redis } from '../redis.js';

const ALLOWED_AGGREGATIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const;
type Aggregation = typeof ALLOWED_AGGREGATIONS[number];

function getCacheKey(params: any) {
  return `${params.projectId}:${params.eventName}:${params.aggregation}:${params.property ?? ''}:${params.window}`;
}

const pendingQueries = new Map<string, Promise<any>>();

export const customDashboardsRouter: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  // List dashboards
  app.get('/', async (req, reply) => {
    const projectId = (req as any).user?.projectId;
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
    const projectId = (req as any).user?.projectId;
    
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    try {
      const res = await db.query(
        'SELECT * FROM custom_dashboards WHERE id = $1 AND project_id = $2', 
        [id, projectId]
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
    const { name, layout_json = [], widgets_json = [] } = req.body as any;
    const projectId = (req as any).user?.projectId;
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
    const projectId = (req as any).user?.projectId;
    const updates = req.body as any;
    
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });
    
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
      values.push(projectId);
      
      const res = await db.query(
        `UPDATE custom_dashboards SET ${fields.join(', ')} WHERE id = $${i} AND project_id = $${i+1} RETURNING *`,
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
    const projectId = (req as any).user?.projectId;
    
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });
    
    try {
      await db.query('DELETE FROM custom_dashboards WHERE id = $1 AND project_id = $2', [id, projectId]);
      return { success: true };
    } catch (err) {
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get distinct event names for autocomplete
  app.get('/events', async (req, reply) => {
    const projectId = (req as any).user?.projectId;
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    try {
      // Use a Recursive CTE for "Loose Index Scan" / Skip Scan over the B-Tree index.
      // This reduces a multi-second full table scan to ~1ms index lookup.
      const res = await db.query(
        `WITH RECURSIVE t AS (
           (SELECT event_name FROM custom_events WHERE project_id = $1 ORDER BY project_id, event_name LIMIT 1)
           UNION ALL
           SELECT (SELECT event_name FROM custom_events 
                   WHERE project_id = $1 AND event_name > t.event_name 
                   ORDER BY project_id, event_name LIMIT 1)
           FROM t
           WHERE t.event_name IS NOT NULL
        )
        SELECT event_name FROM t WHERE event_name IS NOT NULL LIMIT 100;`,
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
    const { eventName, aggregation, property, window = '24h' } = req.body as any;
    const projectId = (req as any).user?.projectId;
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });
    
    if (!eventName || !aggregation) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    if (!ALLOWED_AGGREGATIONS.includes(aggregation)) {
      return reply.status(400).send({ error: 'Invalid aggregation' });
    }

    if (property && !/^[a-zA-Z0-9_.]{1,64}$/.test(property)) {
      return reply.status(400).send({ error: 'Invalid property name' });
    }

    const cacheKey = `dashboard_query:${getCacheKey({ projectId, eventName, aggregation, property, window })}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return { data: JSON.parse(cached) };
    }

    if (pendingQueries.has(cacheKey)) {
      const result = await pendingQueries.get(cacheKey)!;
      return { data: result };
    }

    const queryPromise = (async () => {
      let bucketInterval = 'hour';
      let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
      
      if (window === '1h') {
        timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";
        bucketInterval = 'minute';
      } else if (window === '7d') {
        timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
        bucketInterval = 'day';
      }

      // Build the value expression safely.
      // For COUNT: no property needed. For others: use $4 parameter for the property key
      // to prevent SQL injection via direct string interpolation.
      const valueExpr = aggregation === 'COUNT' 
        ? 'COUNT(*)' 
        : `${aggregation}((NULLIF(properties->>$4, ''))::numeric)`;

      // Construct SQL Query against the new custom_events table
      // eventName is strictly parameterized ($3), property is parameterized ($4)
      const queryParams: any[] = [bucketInterval, projectId, eventName];
      if (aggregation !== 'COUNT' && property) queryParams.push(property);
      
      const propertyParamIdx = queryParams.length; // Either 3 (no prop) or 4 (with prop)
      
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

      let client;
      try {
        client = await db.connect();
        // Set statement timeout for this specific query to prevent locking up Postgres
        await client.query("SET statement_timeout = '5000'");
        
        const res = await client.query(sql, queryParams);
        
        const result = res.rows.map(r => ({
          timestamp: new Date(r.bucket).getTime(),
          value: parseFloat(r.value) || 0
        }));

        // Cache for 60 seconds
        await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);

        return result;
      } finally {
        if (client) {
          // Reset statement_timeout before returning to the pool
          await client.query("SET statement_timeout = 0").catch(e => console.error(e));
          client.release();
        }
        pendingQueries.delete(cacheKey);
      }
    })();

    pendingQueries.set(cacheKey, queryPromise);

    try {
      const result = await queryPromise;
      return { data: result };
    } catch (err: any) {
      if (err.code === '57014') { // PostgreSQL code for query_canceled (statement_timeout)
        req.log.warn({ projectId, eventName }, 'Dashboard query timed out (exceeded 5s)');
        return reply.status(504).send({ error: 'Query timed out. Try a shorter time window.' });
      }
      req.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
