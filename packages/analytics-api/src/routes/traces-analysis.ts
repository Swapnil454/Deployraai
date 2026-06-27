import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const tracesAnalysisRouter: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, window = '24h' } = req.query as any;

    // Determine interval based on window
    let intervalStr = '1 hour';
    let pgInterval = '24 hours';
    if (window === '1h') {
      intervalStr = '1 minute';
      pgInterval = '1 hour';
    } else if (window === '7d') {
      intervalStr = '1 day';
      pgInterval = '7 days';
    }

    try {
      // 1. Traffic Timeseries (Edge vs Node)
      const trafficRes = await db.query(`
        SELECT 
          date_trunc($1, start_time) as bucket,
          COALESCE(attributes->>'runtime', 'node') as runtime,
          COUNT(*) as volume
        FROM spans
        WHERE project_id = $2 
          AND parent_span_id IS NULL 
          AND start_time >= NOW() - $3::interval
        GROUP BY bucket, runtime
        ORDER BY bucket ASC
      `, [intervalStr.split(' ')[1], projectId, pgInterval]);

      // 2. Status Code Distribution
      const statusRes = await db.query(`
        SELECT 
          COALESCE(attributes->>'http.status_code', CASE WHEN status_code = 2 THEN '500' ELSE '200' END) as code,
          COUNT(*) as count
        FROM spans
        WHERE project_id = $1 
          AND parent_span_id IS NULL 
          AND start_time >= NOW() - $2::interval
        GROUP BY code
      `, [projectId, pgInterval]);

      // 3. Latency Summary (P50, P90, P99)
      const latencyRes = await db.query(`
        SELECT 
          COALESCE(attributes->>'runtime', 'node') as runtime,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) as p90,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
          AVG(duration_ms) as avg_latency
        FROM spans
        WHERE project_id = $1 
          AND parent_span_id IS NULL 
          AND start_time >= NOW() - $2::interval
        GROUP BY runtime
      `, [projectId, pgInterval]);

      // 4. Top Slowest Endpoints
      const slowestRes = await db.query(`
        SELECT 
          COALESCE(attributes->>'http.url', name) as endpoint,
          COALESCE(attributes->>'http.method', 'UNKNOWN') as method,
          AVG(duration_ms) as avg_latency,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) as p90_latency,
          COUNT(*) as hits
        FROM spans
        WHERE project_id = $1 
          AND parent_span_id IS NULL 
          AND start_time >= NOW() - $2::interval
        GROUP BY endpoint, method
        ORDER BY p90_latency DESC NULLS LAST
        LIMIT 10
      `, [projectId, pgInterval]);

      // 5. Most Errored Endpoints
      const errorsRes = await db.query(`
        SELECT 
          COALESCE(attributes->>'http.url', name) as endpoint,
          COALESCE(attributes->>'http.method', 'UNKNOWN') as method,
          COUNT(*) as error_count
        FROM spans
        WHERE project_id = $1 
          AND parent_span_id IS NULL 
          AND start_time >= NOW() - $2::interval
          AND (status_code = 2 OR (attributes->>'http.status_code')::int >= 500)
        GROUP BY endpoint, method
        ORDER BY error_count DESC
        LIMIT 10
      `, [projectId, pgInterval]);

      return {
        traffic: trafficRes.rows,
        status: statusRes.rows,
        latency: latencyRes.rows,
        slowest: slowestRes.rows,
        errors: errorsRes.rows
      };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch analysis dashboard data');
      return reply.status(500).send({ error: 'Failed to fetch analysis data' });
    }
  });
};
