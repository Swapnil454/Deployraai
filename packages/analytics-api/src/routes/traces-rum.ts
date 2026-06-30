import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const tracesRumRouter: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  // Get Web Vitals aggregates (LCP, INP, CLS)
  app.get('/vitals', async (req, reply) => {
    const { projectId, window = '24h' } = req.query as { projectId: string; window?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let chInterval = '24 HOUR';
    if (window === '7d') chInterval = '168 HOUR';
    else if (window === '1h') chInterval = '1 HOUR';

    try {
      const res = await clickhouse.query({
        query: `
          SELECT 
            attributes['web.vital.name'] as metric,
            quantile(0.75)(toFloat64OrZero(attributes['web.vital.value'])) as p75_value,
            count() as sample_count
          FROM spans
          WHERE project_id = {projectId: String}
            AND name = 'web-vitals'
            AND start_time >= now() - INTERVAL ${chInterval}
          GROUP BY metric
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      const rows = await res.json<any>();
      return { vitals: rows };
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get Web Vitals route breakdown
  app.get('/vitals/routes', async (req, reply) => {
    const { projectId, window = '24h' } = req.query as { projectId: string; window?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let chInterval = '24 HOUR';
    if (window === '7d') chInterval = '168 HOUR';
    else if (window === '1h') chInterval = '1 HOUR';

    try {
      const res = await clickhouse.query({
        query: `
          SELECT 
            attributes['http.route'] as route,
            attributes['web.vital.name'] as metric,
            quantile(0.75)(toFloat64OrZero(attributes['web.vital.value'])) as p75_value,
            count() as sample_count
          FROM spans
          WHERE project_id = {projectId: String}
            AND name = 'web-vitals'
            AND attributes['http.route'] != ''
            AND start_time >= now() - INTERVAL ${chInterval}
          GROUP BY route, metric
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      const rows = await res.json<any>();

      // Transform rows into a nested structure by route
      const routesMap = new Map();
      rows.forEach((row: any) => {
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
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get Web Vitals Timeseries
  app.get('/vitals/timeseries', async (req, reply) => {
    const { projectId, window = '24h' } = req.query as { projectId: string; window?: string };
    if (!projectId) return reply.status(400).send({ error: 'Missing projectId' });

    let chInterval = '24 HOUR';
    let bucketSql = "toStartOfHour(start_time)";

    if (window === '7d') {
      chInterval = '168 HOUR';
      bucketSql = "toStartOfDay(start_time)";
    } else if (window === '1h') {
      chInterval = '1 HOUR';
      bucketSql = "toStartOfFiveMinutes(start_time)";
    }

    try {
      const res = await clickhouse.query({
        query: `
          SELECT 
            ${bucketSql} as bucket,
            attributes['web.vital.name'] as metric,
            quantile(0.75)(toFloat64OrZero(attributes['web.vital.value'])) as p75_value,
            count() as sample_count
          FROM spans
          WHERE project_id = {projectId: String}
            AND name = 'web-vitals'
            AND start_time >= now() - INTERVAL ${chInterval}
            AND attributes['web.vital.name'] IN ('LCP', 'INP', 'CLS')
          GROUP BY bucket, metric
          ORDER BY bucket ASC
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      const rows = await res.json<any>();

      // Transform rows into a nested structure by bucket
      const timeseriesMap = new Map();
      rows.forEach((row: any) => {
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
      // Use a dedicated client to safely enforce a statement timeout on this analytical query
      const client = await db.connect();
      try {
        await client.query(`SET LOCAL statement_timeout = '10000'`);
        const res = await client.query(`
          SELECT * FROM (
            SELECT 
              session_id,
              MAX(url) as url,
              MAX(user_agent) as user_agent,
              MAX(duration_ms) as duration_ms,
              SUM(error_count) as error_count,
              MIN(created_at) as start_time,
              MAX(created_at) as last_activity,
              SUM(event_count) as event_count
            FROM (
              SELECT * FROM rum_events 
              WHERE project_id = $1 AND ${timeFilter}
              ORDER BY created_at DESC
              LIMIT 10000
            ) as recent_events
            GROUP BY session_id
          ) as grouped_sessions
          ${cursorFilter}
          ORDER BY last_activity DESC
          LIMIT 50
        `, params);

        const nextCursor = res.rows.length === 50 ? res.rows[49].last_activity : null;
        return { sessions: res.rows, nextCursor };
      } finally {
        client.release();
      }
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
