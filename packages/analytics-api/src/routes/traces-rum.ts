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
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (attributes->>'web.vital.value')::numeric) as p75_value,
          COUNT(*) as sample_count
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

  // Get Web Vitals route breakdown
  app.get('/vitals/routes', async (req, reply) => {
    const { projectId, window = '24h' } = req.query as { projectId: string; window?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    if (window === '7d') timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
    else if (window === '1h') timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";

    try {
      const res = await db.query(`
        SELECT 
          attributes->>'http.route' as route,
          attributes->>'web.vital.name' as metric,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (attributes->>'web.vital.value')::numeric) as p75_value,
          COUNT(*) as sample_count
        FROM spans
        WHERE project_id = $1 
          AND name = 'web-vitals'
          AND attributes->>'http.route' IS NOT NULL
          AND ${timeFilter}
        GROUP BY attributes->>'http.route', attributes->>'web.vital.name'
      `, [projectId]);

      // Transform rows into a nested structure by route
      const routesMap = new Map();
      res.rows.forEach(row => {
        if (!routesMap.has(row.route)) {
          routesMap.set(row.route, { route: row.route, metrics: {} });
        }
        routesMap.get(row.route).metrics[row.metric] = {
          p75_value: row.p75_value,
          sample_count: row.sample_count
        };
      });

      return { routes: Array.from(routesMap.values()) };
    } catch (error: any) {
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return { routes: [] };
      }
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get Web Vitals Timeseries
  app.get('/vitals/timeseries', async (req, reply) => {
    const { projectId, window = '24h' } = req.query as { projectId: string; window?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    let bucketSql = "date_trunc('hour', created_at)";

    if (window === '7d') {
      timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
      bucketSql = "date_trunc('day', created_at)"; // 1 day buckets
    } else if (window === '1h') {
      timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";
      // Fallback for date_bin in PG14+ or manual grouping for older versions
      bucketSql = "to_timestamp(floor((extract('epoch' from created_at) / 300 )) * 300)"; // 5 minute buckets
    }

    try {
      const res = await db.query(`
        SELECT 
          ${bucketSql} as bucket,
          attributes->>'web.vital.name' as metric,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (attributes->>'web.vital.value')::numeric) as p75_value,
          COUNT(*) as sample_count
        FROM spans
        WHERE project_id = $1 
          AND name = 'web-vitals'
          AND ${timeFilter}
          AND attributes->>'web.vital.name' IN ('LCP', 'INP', 'CLS')
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `, [projectId]);

      // Transform rows into a nested structure by bucket
      const timeseriesMap = new Map();
      res.rows.forEach(row => {
        const timeKey = new Date(row.bucket).getTime();
        if (!timeseriesMap.has(timeKey)) {
          timeseriesMap.set(timeKey, { timestamp: timeKey, timestampISO: row.bucket });
        }
        timeseriesMap.get(timeKey)[row.metric] = {
          p75_value: row.p75_value,
          sample_count: row.sample_count
        };
      });

      return { timeseries: Array.from(timeseriesMap.values()).sort((a: any, b: any) => a.timestamp - b.timestamp) };
    } catch (error: any) {
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return { timeseries: [] };
      }
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get RUM sessions metadata
  app.get('/sessions', async (req, reply) => {
    const { projectId, window = '24h', cursor } = req.query as { projectId: string; window?: string, cursor?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    if (window === '7d') timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
    else if (window === '1h') timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";
    
    let params: any[] = [projectId];
    let cursorFilter = "";
    if (cursor) {
      cursorFilter = "WHERE last_activity < $2";
      params.push(new Date(cursor));
    }
    
    try {
      const res = await db.query(`
        SELECT * FROM (
          SELECT 
            session_id,
            url,
            user_agent,
            MAX(duration_ms) as duration_ms,
            SUM(error_count) as error_count,
            MIN(created_at) as start_time,
            MAX(created_at) as last_activity,
            SUM(jsonb_array_length(events)) as event_count
          FROM rum_events
          WHERE project_id = $1 AND ${timeFilter}
          GROUP BY session_id, url, user_agent
        ) as grouped_sessions
        ${cursorFilter}
        ORDER BY last_activity DESC
        LIMIT 50
      `, params);

      const nextCursor = res.rows.length === 50 ? res.rows[49].last_activity : null;
      return { sessions: res.rows, nextCursor };
    } catch (error: any) {
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
        ORDER BY sequence_num ASC
        LIMIT 100
      `, [projectId, sessionId]);

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Session not found or expired' });
      }

      const events = res.rows.flatMap(r => r.events);
      return { events, totalBatches: res.rows.length };
    } catch (error: any) {
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        return { events: [] };
      }
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
