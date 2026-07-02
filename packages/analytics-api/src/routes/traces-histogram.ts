import { FastifyPluginAsync } from 'fastify';
import { clickhouse } from '../clickhouse.js';
import { requireAuth } from '../middleware/auth.js';

export const tracesHistogramRouter: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/histogram', async (req, reply) => {
    const { projectId } = req.query as any;

    try {
      // Group traces by 1-minute intervals over the last hour using ClickHouse
      const result = await clickhouse.query({
        query: `
          SELECT
            toStartOfMinute(start_time) as bucket,
            COUNT(*) as volume,
            avg(duration_ms) as avg_latency,
            quantile(0.5)(duration_ms) as p50,
            quantile(0.9)(duration_ms) as p90,
            quantile(0.99)(duration_ms) as p99,
            sum(if(status_code = 2, 1, 0)) as errors
          FROM spans
          WHERE project_id = {projectId: String} AND parent_span_id = '' AND start_time > now() - INTERVAL 1 HOUR
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
        query_params: { projectId },
        format: 'JSONEachRow'
      });
      
      const rows = await result.json<any>();

      return { histogram: rows };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch histogram');
      return reply.status(500).send({ error: 'Failed to fetch histogram' });
    }
  });
};
