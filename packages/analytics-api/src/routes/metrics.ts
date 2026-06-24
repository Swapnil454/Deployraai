import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const metricsRouter: FastifyPluginAsync = async (app) => {

  // GET /metrics/overview?projectId=xxx&from=ISO&to=ISO
  app.get('/overview', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, from, to } = req.query as any;
    const fromDate = new Date(from ?? Date.now() - 24 * 60 * 60 * 1000);
    const toDate = new Date(to ?? Date.now());

    const [requests, errors, latency, uptime] = await Promise.all([
      // Total requests
      db.query<{ count: string }>(`
        SELECT SUM(request_count)::text as count
        FROM metrics_minutely
        WHERE project_id = $1 AND bucket BETWEEN $2 AND $3
      `, [projectId, fromDate, toDate]),

      // Error rate
      db.query<{ error_rate: string }>(`
        SELECT ROUND(100.0 * SUM(error_count) / NULLIF(SUM(request_count), 0), 2)::text as error_rate
        FROM metrics_minutely
        WHERE project_id = $1 AND bucket BETWEEN $2 AND $3
      `, [projectId, fromDate, toDate]),

      // P99 latency across all routes
      db.query<{ p99: string }>(`
        SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms)::text as p99
        FROM spans
        WHERE project_id = $1
          AND start_time BETWEEN $2 AND $3
          AND parent_span_id IS NULL
          AND attributes->>'http.method' IS NOT NULL
      `, [projectId, fromDate, toDate]),

      // Uptime
      db.query<{ uptime: string }>(`
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399) / NULLIF(COUNT(*), 0), 2)::text as uptime
        FROM synthetic_checks
        WHERE project_id = $1 AND checked_at BETWEEN $2 AND $3
      `, [projectId, fromDate, toDate]),
    ]);

    return {
      totalRequests: parseInt(requests.rows[0]?.count ?? '0'),
      errorRate: parseFloat(errors.rows[0]?.error_rate ?? '0'),
      p99LatencyMs: parseFloat(latency.rows[0]?.p99 ?? '0'),
      uptime: parseFloat(uptime.rows[0]?.uptime ?? '100'),
    };
  });

  // GET /metrics/timeseries?projectId=xxx&metric=requests&interval=1h
  app.get('/timeseries', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, metric, interval, from, to } = req.query as any;
    const fromDate = new Date(from ?? Date.now() - 24 * 60 * 60 * 1000);
    const toDate = new Date(to ?? Date.now());

    // Map interval to Postgres date_trunc
    const trunc = { '1m': 'minute', '5m': 'minute', '1h': 'hour', '1d': 'day' }[interval as string] ?? 'hour';

    const rows = await db.query(`
      SELECT
        date_trunc($1, bucket) as time,
        SUM(request_count) as requests,
        SUM(error_count) as errors,
        ROUND(100.0 * SUM(error_count) / NULLIF(SUM(request_count), 0), 2) as error_rate,
        MAX(p99_duration_ms) as p99_ms,
        ROUND(SUM(total_duration_ms)::numeric / NULLIF(SUM(request_count), 0), 0) as avg_ms
      FROM metrics_minutely
      WHERE project_id = $2 AND bucket BETWEEN $3 AND $4
      GROUP BY 1
      ORDER BY 1
    `, [trunc, projectId, fromDate, toDate]);

    return rows.rows;
  });

  // GET /metrics/routes?projectId=xxx — slowest + most erroring routes
  app.get('/routes', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId } = req.query as any;

    const rows = await db.query(`
      SELECT
        route,
        method,
        SUM(request_count) as total_requests,
        SUM(error_count) as total_errors,
        ROUND(100.0 * SUM(error_count) / NULLIF(SUM(request_count), 0), 2) as error_rate,
        MAX(p99_duration_ms) as p99_ms,
        ROUND(SUM(total_duration_ms)::numeric / NULLIF(SUM(request_count), 0), 0) as avg_ms
      FROM metrics_minutely
      WHERE project_id = $1 AND bucket >= NOW() - INTERVAL '24 hours'
      GROUP BY route, method
      ORDER BY total_requests DESC
      LIMIT 20
    `, [projectId]);

    return rows.rows;
  });
};
