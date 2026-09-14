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

      // Ensure exactly 60 minutes of data, filling gaps with 0
      const now = new Date();
      now.setSeconds(0, 0); // truncate to start of minute
      
      const filledHistogram = [];
      const rowsMap = new Map(rows.map((r: any) => [new Date(r.bucket).getTime(), r]));
      
      for (let i = 59; i >= 0; i--) {
        const bucketTime = now.getTime() - i * 60000;
        if (rowsMap.has(bucketTime)) {
          filledHistogram.push(rowsMap.get(bucketTime));
        } else {
          filledHistogram.push({
            bucket: new Date(bucketTime).toISOString().replace('T', ' ').substring(0, 19),
            volume: 0,
            avg_latency: 0,
            p50: 0,
            p90: 0,
            p99: 0,
            errors: 0
          });
        }
      }

      return { histogram: filledHistogram };
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch histogram');
      return reply.status(500).send({ error: 'Failed to fetch histogram' });
    }
  });
};
