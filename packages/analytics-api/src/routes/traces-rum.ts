import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';

export const tracesRumRouter: FastifyPluginAsync = async (app) => {
  // Get Web Vitals aggregates (LCP, INP, CLS)
  app.get('/vitals', async (req, reply) => {
    const { projectId, window = '24h' } = req.query as { projectId: string; window?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    if (window === '7d') timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
    else if (window === '1h') timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";

    try {
      const res = await db.query(`
        SELECT 
          attributes->>'web.vital.name' as metric,
          AVG((attributes->>'web.vital.value')::numeric) as avg_value,
          COUNT(*) as count
        FROM spans
        WHERE project_id = $1 
          AND name = 'web-vitals'
          AND ${timeFilter}
        GROUP BY attributes->>'web.vital.name'
      `, [projectId]);

      return { vitals: res.rows };
    } catch (error: any) {
      // spans table lives in Clickhouse — return empty data gracefully when CH is offline
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return { vitals: [] };
      }
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get RUM sessions metadata
  app.get('/sessions', async (req, reply) => {
    const { projectId, window = '24h' } = req.query as { projectId: string; window?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    if (window === '7d') timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
    else if (window === '1h') timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";
    
    try {
      const res = await db.query(`
        SELECT 
          session_id,
          MIN(created_at) as start_time,
          MAX(created_at) as last_activity,
          SUM(jsonb_array_length(events)) as event_count
        FROM rum_events
        WHERE project_id = $1 AND ${timeFilter}
        GROUP BY session_id
        ORDER BY last_activity DESC
        LIMIT 50
      `, [projectId]);

      return { sessions: res.rows };
    } catch (error: any) {
      // rum_events table lives in Clickhouse — return empty data gracefully when CH is offline
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return { sessions: [] };
      }
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get exact rrweb events for a specific session
  app.get('/sessions/:sessionId/events', async (req, reply) => {
    const { projectId } = req.query as { projectId: string };
    const { sessionId } = req.params as { sessionId: string };

    if (!projectId || !sessionId) return reply.status(400).send({ error: 'Missing projectId or sessionId' });

    try {
      const res = await db.query(`
        SELECT events 
        FROM rum_events 
        WHERE project_id = $1 AND session_id = $2
        ORDER BY created_at ASC
      `, [projectId, sessionId]);

      let allEvents: any[] = [];
      res.rows.forEach(row => {
        if (Array.isArray(row.events)) {
          allEvents = allEvents.concat(row.events);
        }
      });

      return { events: allEvents };
    } catch (error: any) {
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return { events: [] };
      }
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
