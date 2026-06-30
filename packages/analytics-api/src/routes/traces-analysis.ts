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

    try {
      // 1. Traffic Timeseries (Edge vs Node)
      const trafficP = clickhouse.query({
        query: `
          SELECT 
            dateTrunc({trunc: String}, start_time) as bucket,
            if(has(attributes, 'runtime'), attributes['runtime'], 'node') as runtime,
            count() as volume
          FROM spans
          WHERE project_id = {projectId: String} 
            AND parent_span_id = ''
            AND start_time >= now() - INTERVAL ${chInterval}
          GROUP BY bucket, runtime
          ORDER BY bucket ASC
        `,
        query_params: { trunc, projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>());

      // 2. Status Code Distribution
      const statusP = clickhouse.query({
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
      }).then(r => r.json<any>());

      // 3. Latency Summary (P50, P90, P99)
      const latencyP = clickhouse.query({
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
      }).then(r => r.json<any>());

      // 4. Top Slowest Endpoints
      const slowestP = clickhouse.query({
        query: `
          SELECT 
            if(has(attributes, 'http.url'), attributes['http.url'], name) as endpoint,
            if(has(attributes, 'http.method'), attributes['http.method'], 'UNKNOWN') as method,
            avg(duration_ms) as avg_latency,
            quantile(0.9)(duration_ms) as p90_latency,
            count() as hits
          FROM spans
          WHERE project_id = {projectId: String} 
            AND parent_span_id = ''
            AND start_time >= now() - INTERVAL ${chInterval}
          GROUP BY endpoint, method
          ORDER BY p90_latency DESC
          LIMIT 10
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>());

      // 5. Most Errored Endpoints
      const errorsP = clickhouse.query({
        query: `
          SELECT 
            if(has(attributes, 'http.url'), attributes['http.url'], name) as endpoint,
            if(has(attributes, 'http.method'), attributes['http.method'], 'UNKNOWN') as method,
            count() as error_count
          FROM spans
          WHERE project_id = {projectId: String} 
            AND parent_span_id = ''
            AND start_time >= now() - INTERVAL ${chInterval}
            AND (status_code = 2 OR match(attributes['http.status_code'], '^5[0-9]{2}$'))
          GROUP BY endpoint, method
          ORDER BY error_count DESC
          LIMIT 10
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      }).then(r => r.json<any>());

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
