import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

// Simple in-memory cache
const cache = new Map<string, { data: any, expiresAt: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await fetcher();
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export const metricsRouter: FastifyPluginAsync = async (app) => {

  // GET /metrics/overview?projectId=xxx&from=ISO&to=ISO
  app.get('/overview', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, from, to, deployId } = req.query as any;
    const fromDate = new Date(from ?? Date.now() - 24 * 60 * 60 * 1000);
    const toDate = new Date(to ?? Date.now());

    const cacheKey = `overview:${projectId}:${from}:${to}:${deployId || 'any'}`;

    return withCache(cacheKey, async () => {
      const [requestsRes, errorsRes, latencyRes, uptimeRes] = await Promise.all([
      // Total requests
      clickhouse.query({
        query: `
          SELECT toString(sum(request_count)) as count
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} AND bucket BETWEEN parseDateTimeBestEffort({from: String}) AND parseDateTimeBestEffort({to: String})
        `,
        query_params: { projectId, from: fromDate.toISOString(), to: toDate.toISOString() },
        format: 'JSONEachRow'
      }).then(r => r.json<{count: string}[]>()),

      // Error rate
      clickhouse.query({
        query: `
          SELECT toString(round(100.0 * sum(error_count) / nullIf(sum(request_count), 0), 2)) as error_rate
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} AND bucket BETWEEN parseDateTimeBestEffort({from: String}) AND parseDateTimeBestEffort({to: String})
        `,
        query_params: { projectId, from: fromDate.toISOString(), to: toDate.toISOString() },
        format: 'JSONEachRow'
      }).then(r => r.json<{error_rate: string}[]>()),

      // P99 latency across all routes
      clickhouse.query({
        query: `
          SELECT toString(quantile(0.99)(duration_ms)) as p99
          FROM spans
          WHERE project_id = {projectId: String}
            AND start_time BETWEEN parseDateTimeBestEffort({from: String}) AND parseDateTimeBestEffort({to: String})
            AND parent_span_id = ''
            AND http_method != ''
        `,
        query_params: { projectId, from: fromDate.toISOString(), to: toDate.toISOString() },
        format: 'JSONEachRow'
      }).then(r => r.json<{p99: string}[]>()),

      // Uptime (Still in Postgres for now since synthetic_checks wasn't migrated, or we can use Postgres for this one)
      db.query<{ uptime: string }>(`
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status_code BETWEEN 200 AND 399) / NULLIF(COUNT(*), 0), 2)::text as uptime
        FROM synthetic_checks
        WHERE project_id = $1 AND checked_at BETWEEN $2 AND $3
      `, [projectId, fromDate, toDate])
    ]);

      return {
        totalRequests: parseInt((requestsRes as any)[0]?.count || '0'),
        errorRate: parseFloat((errorsRes as any)[0]?.error_rate || '0'),
        p99LatencyMs: parseFloat((latencyRes as any)[0]?.p99 || '0'),
        uptime: parseFloat(uptimeRes.rows[0]?.uptime ?? '100'),
      };
    });
  });

  // GET /metrics/timeseries?projectId=xxx&metric=requests&interval=1h
  app.get('/timeseries', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, metric, interval, from, to, deployId } = req.query as any;
    const fromDate = new Date(from ?? Date.now() - 24 * 60 * 60 * 1000);
    const toDate = new Date(to ?? Date.now());

    // Map interval to ClickHouse date_trunc
    const trunc = { '1m': 'minute', '5m': 'minute', '1h': 'hour', '1d': 'day' }[interval as string] ?? 'hour';
    const cacheKey = `timeseries:${projectId}:${metric}:${interval}:${from}:${to}:${deployId || 'any'}`;

    return withCache(cacheKey, async () => {
      const res = await clickhouse.query({
        query: `
          SELECT
            dateTrunc({trunc: String}, bucket) as time,
            sum(request_count) as requests,
            sum(error_count) as errors,
            round(100.0 * sum(error_count) / nullIf(sum(request_count), 0), 2) as error_rate,
            max(p99_duration_ms) as max_ms,
            round(sum(total_duration_ms) / nullIf(sum(request_count), 0), 0) as avg_ms
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} AND bucket BETWEEN parseDateTimeBestEffort({from: String}) AND parseDateTimeBestEffort({to: String})
          GROUP BY time
          ORDER BY time
        `,
        query_params: { trunc, projectId, from: fromDate.toISOString(), to: toDate.toISOString() },
        format: 'JSONEachRow'
      });
      return await res.json<any[]>();
    });
  });

  // GET /metrics/routes?projectId=xxx — slowest + most erroring routes
  app.get('/routes', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, deployId } = req.query as any;

    const cacheKey = `routes:${projectId}:${deployId || 'any'}`;

    return withCache(cacheKey, async () => {
      const res = await clickhouse.query({
        query: `
          SELECT
            route,
            method,
            sum(request_count) as total_requests,
            sum(error_count) as total_errors,
            round(100.0 * sum(error_count) / nullIf(sum(request_count), 0), 2) as error_rate,
            max(p99_duration_ms) as max_ms,
            round(sum(total_duration_ms) / nullIf(sum(request_count), 0), 0) as avg_ms
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} AND bucket >= now() - INTERVAL 24 HOUR
          GROUP BY route, method
          ORDER BY total_requests DESC
          LIMIT 20
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      return await res.json<any[]>();
    });
  });

  // GET /metrics/deploy-diff?projectId=xxx&deployId=A&previousDeployId=B
  app.get('/deploy-diff', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, deployId, previousDeployId } = req.query as any;
    if (!projectId || !deployId || !previousDeployId) {
      return reply.status(400).send({ error: 'Missing parameters' });
    }

    const res = await clickhouse.query({
      query: `
        WITH d1 AS (
          SELECT route, method, 
                 sum(request_count) as req_count,
                 sum(error_count) as err_count,
                 max(p99_duration_ms) as p99_ms
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} AND deploy_id = {deployId: String}
          GROUP BY route, method
        ),
        d2 AS (
          SELECT route, method, 
                 sum(request_count) as req_count,
                 sum(error_count) as err_count,
                 max(p99_duration_ms) as p99_ms
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} AND deploy_id = {previousDeployId: String}
          GROUP BY route, method
        )
        SELECT 
          COALESCE(d1.route, d2.route) as route,
          COALESCE(d1.method, d2.method) as method,
          COALESCE(d1.req_count, 0) as current_req_count,
          COALESCE(d2.req_count, 0) as prev_req_count,
          round(100.0 * d1.err_count / nullIf(d1.req_count, 0), 2) as current_error_rate,
          round(100.0 * d2.err_count / nullIf(d2.req_count, 0), 2) as prev_error_rate,
          d1.p99_ms as current_max_ms,
          d2.p99_ms as prev_max_ms
        FROM d1
        FULL OUTER JOIN d2 ON d1.route = d2.route AND d1.method = d2.method
        ORDER BY COALESCE(d1.req_count, 0) DESC
      `,
      query_params: { projectId, deployId, previousDeployId },
      format: 'JSONEachRow'
    });
    return await res.json<any[]>();
  });

  // GET /metrics/deploys/:projectId
  app.get('/deploys/:projectId', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId } = req.params as any;
    const res = await clickhouse.query({
      query: `
        SELECT deploy_id, min(start_time) as deployed_at
        FROM spans
        WHERE project_id = {projectId: String}
        GROUP BY deploy_id
        ORDER BY deployed_at DESC
        LIMIT 50
      `,
      query_params: { projectId },
      format: 'JSONEachRow'
    });
    return await res.json<any[]>();
  });
};
