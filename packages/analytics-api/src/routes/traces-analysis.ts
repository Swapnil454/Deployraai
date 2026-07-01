import { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const tracesAnalysisRouter: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', { preHandler: requireAuth }, async (req, reply) => {
    const { projectId, window = '24h' } = req.query as any;

    // Determine interval based on window
    let trunc = 'hour';
    let chInterval = '24 HOUR';
    if (window === '1h') {
      trunc = 'minute';
      chInterval = '1 HOUR';
    } else if (window === '7d') {
      trunc = 'day';
      chInterval = '168 HOUR'; // 7 days
    }

    // Helper: run a ClickHouse query and return [] on any error instead of crashing
    const safeCH = async <T>(promise: Promise<T[]>): Promise<T[]> => {
      try {
        return await promise;
      } catch (err: any) {
        req.log.warn({ msg: err?.message }, 'ClickHouse query skipped (table may not exist yet)');
        return [];
      }
    };

    try {
      // 1. Traffic Timeseries (requires metrics_minutely_mv)
      const trafficP = safeCH(clickhouse.query({
        query: `
          SELECT 
            dateTrunc({trunc: String}, bucket) as bucket,
            'node' as runtime,
            sum(request_count) as volume
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} 
            AND bucket >= now() - INTERVAL ${chInterval}
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
        query_params: { trunc, projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>()));

      // 2. Status Code Distribution (hits spans table — less expensive)
      const statusP = safeCH(clickhouse.query({
        query: `
          SELECT 
            if(has(attributes, 'http.status_code'), attributes['http.status_code'], if(status_code = 2, '500', '200')) as code,
            count() as count
          FROM spans
          WHERE project_id = {projectId: String} 
            AND parent_span_id = ''
            AND start_time >= now() - INTERVAL ${chInterval}
          GROUP BY code
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>()));

      // 3. Latency Summary (P50, P90, P99) (hits spans table)
      const latencyP = safeCH(clickhouse.query({
        query: `
          SELECT 
            if(has(attributes, 'runtime'), attributes['runtime'], 'node') as runtime,
            quantile(0.5)(duration_ms) as p50,
            quantile(0.9)(duration_ms) as p90,
            quantile(0.99)(duration_ms) as p99,
            avg(duration_ms) as avg_latency
          FROM spans
          WHERE project_id = {projectId: String} 
            AND parent_span_id = ''
            AND start_time >= now() - INTERVAL ${chInterval}
          GROUP BY runtime
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>()));

      // 4. Top Slowest Endpoints (requires metrics_minutely_mv)
      const slowestP = safeCH(clickhouse.query({
        query: `
          SELECT 
            route as endpoint,
            method,
            sum(total_duration_ms) / sum(request_count) as avg_latency,
            max(p99_duration_ms) as p90_latency,
            sum(request_count) as hits
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} 
            AND bucket >= now() - INTERVAL ${chInterval}
          GROUP BY endpoint, method
          ORDER BY p90_latency DESC
          LIMIT 10
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>()));

      // 5. Most Errored Endpoints (requires metrics_minutely_mv)
      const errorsP = safeCH(clickhouse.query({
        query: `
          SELECT 
            route as endpoint,
            method,
            sum(error_count) as error_count
          FROM metrics_minutely_mv
          WHERE project_id = {projectId: String} 
            AND bucket >= now() - INTERVAL ${chInterval}
          GROUP BY endpoint, method
          HAVING sum(error_count) > 0
          ORDER BY error_count DESC
          LIMIT 10
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>()));

      const [trafficRes, statusRes, latencyRes, slowestRes, errorsRes] = await Promise.all([
        trafficP, statusP, latencyP, slowestP, errorsP
      ]);

      return {
        traffic: trafficRes,
        status: statusRes,
        latency: latencyRes,
        slowest: slowestRes,
        errors: errorsRes
      };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch analysis dashboard data');
      return reply.status(500).send({ error: 'Failed to fetch analysis data' });
    }
  });
};
